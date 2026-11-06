import {NextResponse} from 'next/server';
import {NotificationType,TaxCaseStatus} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {createNotification,notifyActiveAdmins} from '@/lib/notifications';
import {assertStatusTransition,canUserEditCase,sanitizeIntakeForStorage,userHasTaxAccess} from '@/lib/tax-services';
import {jsonSafe} from '@/lib/serializers';

type Params={params:Promise<{id:string}>};

const patchSchema=z.object({
	intake:z.record(z.string(),z.unknown()).optional(),
	reason:z.string().trim().max(2000).optional(),
	priorReturnFiled:z.boolean().optional(),
	receivedIrsNotice:z.boolean().optional(),
	specialCircumstances:z.string().trim().max(4000).optional(),
	submit:z.boolean().optional(),
	acknowledgment:z.literal(true).optional(),
});

export async function GET(_request:Request,{params}:Params){
	try{
		const user=await requireUser();
		const {id}=await params;
		if(!(await userHasTaxAccess(user.id)))return NextResponse.json({error:'Forbidden'},{status:403});
		const taxCase=await db.taxCase.findFirst({
			where:{id,userId:user.id},
			include:{
				documents:{where:{deletedAt:null},orderBy:{uploadedAt:'desc'}},
				messages:{where:{visibility:'USER'},orderBy:{createdAt:'asc'}},
				statusHistory:{orderBy:{createdAt:'asc'}},
			},
		});
		if(!taxCase)return NextResponse.json({error:'Not found'},{status:404});
		const intake=JSON.parse(taxCase.intakeJson||'{}');
		return NextResponse.json(jsonSafe({...taxCase,intake}),{headers:{'Cache-Control':'private, no-store'}});
	}catch{
		return NextResponse.json({error:'Unauthorized'},{status:401});
	}
}

export async function PATCH(request:Request,{params}:Params){
	try{
		const user=await requireUser();
		const {id}=await params;
		if(!(await userHasTaxAccess(user.id)))return NextResponse.json({error:'Forbidden'},{status:403});
		const input=patchSchema.parse(await request.json());
		const current=await db.taxCase.findFirst({where:{id,userId:user.id}});
		if(!current)return NextResponse.json({error:'Not found'},{status:404});
		if(input.submit){
			if(!input.acknowledgment)return NextResponse.json({error:'Acknowledgment is required before submission.'},{status:400});
			if(!canUserEditCase(current.status)&&current.status!==TaxCaseStatus.DRAFT){
				// allow resubmit path from awaiting info via INFORMATION_RECEIVED
			}
			const next=current.status===TaxCaseStatus.AWAITING_TAXPAYER_INFO?TaxCaseStatus.INFORMATION_RECEIVED:TaxCaseStatus.SUBMITTED;
			if(current.status===TaxCaseStatus.DRAFT)assertStatusTransition(TaxCaseStatus.DRAFT,TaxCaseStatus.SUBMITTED);
			else if(current.status===TaxCaseStatus.AWAITING_TAXPAYER_INFO)assertStatusTransition(TaxCaseStatus.AWAITING_TAXPAYER_INFO,TaxCaseStatus.INFORMATION_RECEIVED);
			else return NextResponse.json({error:'This case cannot be submitted in its current status.'},{status:409});
			const updated=await db.$transaction(async tx=>{
				const taxCase=await tx.taxCase.update({
					where:{id:current.id},
					data:{
						status:next,
						submittedAt:current.submittedAt||new Date(),
						acknowledgmentAt:new Date(),
						acknowledgmentText:'I confirm the information is accurate to the best of my knowledge. This is a request for preparation or review, not an IRS filing.',
						...(input.intake?{intakeJson:JSON.stringify(sanitizeIntakeForStorage(input.intake))}:{}),
						reason:input.reason??current.reason,
						priorReturnFiled:input.priorReturnFiled??current.priorReturnFiled,
						receivedIrsNotice:input.receivedIrsNotice??current.receivedIrsNotice,
						specialCircumstances:input.specialCircumstances??current.specialCircumstances,
					},
				});
				await tx.taxCaseStatusEvent.create({data:{caseId:taxCase.id,fromStatus:current.status,toStatus:next,actorId:user.id,reason:'Taxpayer submission'}});
				await tx.auditLog.create({data:{actorId:user.id,action:'TAX_CASE_SUBMITTED',entity:'TAX_CASE',entityId:taxCase.id,metadata:{reference:taxCase.reference,status:next}}});
				await createNotification(tx,{userId:user.id,type:NotificationType.TAX,title:'Tax request submitted',message:`Your tax request ${taxCase.reference} was submitted for administrator review.`,dedupeKey:`tax:${taxCase.id}:submitted:${next}`,actionUrl:`/tax-services/request/${taxCase.id}`});
				await notifyActiveAdmins(tx,{type:NotificationType.TAX,title:'Tax intake submitted',message:`A tax preparation request was submitted (${taxCase.reference}).`,dedupeKey:`tax:${taxCase.id}:admin:${next}`,relatedEntity:'TAX_CASE',relatedId:taxCase.id,actionUrl:'/admin/tax-services'});
				return taxCase;
			});
			return NextResponse.json(jsonSafe(updated),{headers:{'Cache-Control':'private, no-store'}});
		}
		if(!canUserEditCase(current.status))return NextResponse.json({error:'This case is locked for editing.'},{status:409});
		const updated=await db.taxCase.update({
			where:{id:current.id},
			data:{
				...(input.intake?{intakeJson:JSON.stringify(sanitizeIntakeForStorage(input.intake))}:{}),
				reason:input.reason??undefined,
				priorReturnFiled:input.priorReturnFiled??undefined,
				receivedIrsNotice:input.receivedIrsNotice??undefined,
				specialCircumstances:input.specialCircumstances??undefined,
			},
		});
		return NextResponse.json(jsonSafe(updated),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Invalid update.'},{status:400});
		if(error instanceof Error&&error.message==='INVALID_STATUS_TRANSITION')return NextResponse.json({error:'Invalid status transition.'},{status:409});
		return NextResponse.json({error:'Unable to update tax case.'},{status:500});
	}
}
