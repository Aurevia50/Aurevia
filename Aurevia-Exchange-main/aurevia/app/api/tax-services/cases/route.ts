import {NextResponse} from 'next/server';
import {TaxCaseStatus,TaxServiceType} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {createCaseReference,getUserAllowedServices,userHasTaxAccess} from '@/lib/tax-services';
import {jsonSafe} from '@/lib/serializers';
import {rateLimit} from '@/lib/rate-limit';

const createSchema=z.object({
	serviceType:z.nativeEnum(TaxServiceType),
	taxYear:z.number().int().min(2015).max(new Date().getFullYear()+1),
	returnKind:z.enum(['ORIGINAL','AMENDED','PRIOR_YEAR','NOTICE']).default('ORIGINAL'),
	reason:z.string().trim().max(2000).optional(),
});

export async function GET(){
	try{
		const user=await requireUser();
		if(!(await userHasTaxAccess(user.id)))return NextResponse.json({error:'Tax services access is not enabled for this account.'},{status:403});
		const cases=await db.taxCase.findMany({
			where:{userId:user.id},
			select:{id:true,reference:true,status:true,serviceType:true,taxYear:true,returnKind:true,submittedAt:true,updatedAt:true,createdAt:true},
			orderBy:{updatedAt:'desc'},
			take:100,
		});
		return NextResponse.json(jsonSafe({cases}),{headers:{'Cache-Control':'private, no-store'}});
	}catch{
		return NextResponse.json({error:'Unauthorized'},{status:401});
	}
}

export async function POST(request:Request){
	try{
		const user=await requireUser();
		rateLimit(`tax-case-create:${user.id}`,10,3600000);
		if(!(await userHasTaxAccess(user.id)))return NextResponse.json({error:'Tax services access is not enabled for this account.'},{status:403});
		const input=createSchema.parse(await request.json());
		const allowed=await getUserAllowedServices(user.id);
		if(!allowed.includes(input.serviceType))return NextResponse.json({error:'This tax service is not enabled for your account.'},{status:403});
		const created=await db.$transaction(async tx=>{
			const taxCase=await tx.taxCase.create({
				data:{
					reference:createCaseReference(),
					userId:user.id,
					status:TaxCaseStatus.DRAFT,
					serviceType:input.serviceType,
					taxYear:input.taxYear,
					returnKind:input.returnKind,
					reason:input.reason||null,
					intakeJson:JSON.stringify({}),
				},
			});
			await tx.taxCaseStatusEvent.create({data:{caseId:taxCase.id,fromStatus:null,toStatus:TaxCaseStatus.DRAFT,actorId:user.id,reason:'Case created'}});
			await tx.auditLog.create({data:{actorId:user.id,action:'TAX_CASE_CREATED',entity:'TAX_CASE',entityId:taxCase.id,metadata:{reference:taxCase.reference,serviceType:taxCase.serviceType,taxYear:taxCase.taxYear}}});
			return taxCase;
		});
		return NextResponse.json(jsonSafe(created),{status:201,headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Invalid tax case details.'},{status:400});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many requests.'},{status:429});
		return NextResponse.json({error:'Unable to create tax case.'},{status:500});
	}
}
