import {NextResponse} from 'next/server';
import {NotificationType,TaxCaseStatus} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {createNotification} from '@/lib/notifications';
import {assertStatusTransition,isTerminalStatus} from '@/lib/tax-services';
import {createPrivateSignedUrl,PrivateStorageError} from '@/lib/private-storage';
import {jsonSafe} from '@/lib/serializers';

type Params={params:Promise<{id:string}>};

const patchSchema=z.object({
	status:z.nativeEnum(TaxCaseStatus).optional(),
	reason:z.string().trim().max(1000).optional(),
	assigneeId:z.string().min(1).nullable().optional(),
	internalNote:z.string().trim().min(1).max(4000).optional(),
	userMessage:z.string().trim().min(1).max(4000).optional(),
	documentId:z.string().min(1).optional(),
});

export async function GET(_request:Request,{params}:Params){
	try{
		await requireAdmin();
		const {id}=await params;
		const taxCase=await db.taxCase.findUnique({
			where:{id},
			include:{
				user:{select:{id:true,email:true,name:true,country:true,phone:true}},
				documents:{where:{deletedAt:null},orderBy:{uploadedAt:'desc'}},
				messages:{orderBy:{createdAt:'asc'},include:{author:{select:{email:true,name:true,role:true}}}},
				statusHistory:{orderBy:{createdAt:'asc'}},
				assignee:{select:{id:true,email:true,name:true}},
			},
		});
		if(!taxCase)return NextResponse.json({error:'Not found'},{status:404});
		const intake=JSON.parse(taxCase.intakeJson||'{}');
		return NextResponse.json(jsonSafe({...taxCase,intake}),{headers:{'Cache-Control':'private, no-store'}});
	}catch{
		return NextResponse.json({error:'Forbidden'},{status:403});
	}
}

export async function PATCH(request:Request,{params}:Params){
	try{
		const admin=await requireAdmin();
		const {id}=await params;
		const input=patchSchema.parse(await request.json());
		const current=await db.taxCase.findUnique({where:{id}});
		if(!current)return NextResponse.json({error:'Not found'},{status:404});

		if(input.documentId){
			const doc=await db.taxCaseDocument.findFirst({where:{id:input.documentId,caseId:current.id,deletedAt:null}});
			if(!doc)return NextResponse.json({error:'Document not found'},{status:404});
			const url=await createPrivateSignedUrl('tax',doc.userId,doc.storageKey,120);
			await db.auditLog.create({data:{actorId:admin.id,action:'TAX_DOCUMENT_VIEWED',entity:'TAX_CASE',entityId:current.id,metadata:{documentId:doc.id}}});
			return NextResponse.json({url},{headers:{'Cache-Control':'private, no-store'}});
		}

		const updated=await db.$transaction(async tx=>{
			let status=current.status;
			if(input.status&&input.status!==current.status){
				assertStatusTransition(current.status,input.status);
				status=input.status;
			}
			const taxCase=await tx.taxCase.update({
				where:{id:current.id},
				data:{
					status,
					assigneeId:input.assigneeId===undefined?undefined:input.assigneeId,
					closedAt:isTerminalStatus(status)?new Date():current.closedAt,
				},
			});
			if(input.status&&input.status!==current.status){
				await tx.taxCaseStatusEvent.create({data:{caseId:taxCase.id,fromStatus:current.status,toStatus:input.status,actorId:admin.id,reason:input.reason||null}});
			}
			if(input.internalNote){
				await tx.taxCaseMessage.create({data:{caseId:taxCase.id,authorId:admin.id,visibility:'INTERNAL',body:input.internalNote}});
			}
			if(input.userMessage){
				await tx.taxCaseMessage.create({data:{caseId:taxCase.id,authorId:admin.id,visibility:'USER',body:input.userMessage}});
				await createNotification(tx,{userId:current.userId,type:NotificationType.TAX,title:'Update on your tax request',message:`There is a new message on tax request ${current.reference}.`,dedupeKey:`tax:${current.id}:msg:${Date.now()}`,actionUrl:`/tax-services/request/${current.id}`});
			}
			if(input.status===TaxCaseStatus.AWAITING_TAXPAYER_INFO){
				await createNotification(tx,{userId:current.userId,type:NotificationType.TAX,title:'Additional tax information needed',message:`Additional information was requested for ${current.reference}.`,dedupeKey:`tax:${current.id}:awaiting-info`,actionUrl:`/tax-services/request/${current.id}`});
			}
			await tx.auditLog.create({data:{actorId:admin.id,action:'TAX_CASE_ADMIN_UPDATE',entity:'TAX_CASE',entityId:taxCase.id,metadata:{status:taxCase.status,hasInternalNote:Boolean(input.internalNote),hasUserMessage:Boolean(input.userMessage)}}});
			return taxCase;
		});
		return NextResponse.json(jsonSafe(updated),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Invalid request.'},{status:400});
		if(error instanceof PrivateStorageError)return NextResponse.json({error:error.message},{status:error.status});
		if(error instanceof Error&&error.message==='INVALID_STATUS_TRANSITION')return NextResponse.json({error:'Invalid status transition.'},{status:409});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		return NextResponse.json({error:'Unable to update tax case.'},{status:500});
	}
}
