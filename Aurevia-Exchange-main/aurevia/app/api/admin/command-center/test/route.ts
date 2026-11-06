import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {checkIntegration,isIntegrationId} from '@/lib/integration-manager';
import {rateLimit} from '@/lib/rate-limit';

const schema=z.object({integration:z.string().min(1).max(40).refine(isIntegrationId)});

export async function POST(request:Request){
	try{
		const admin=await requireAdmin();
		rateLimit(`admin-integration-check:${admin.id}`,10,60_000);
		const input=schema.parse(await request.json());
		const result=await checkIntegration(input.integration);
		await db.auditLog.create({data:{actorId:admin.id,action:'INTEGRATION_HEALTH_CHECK',entity:'INTEGRATION_HEALTH',entityId:result.id,metadata:{integration:result.id,status:result.status,detail:result.detail,checkedAt:result.checkedAt}}});
		return NextResponse.json({integration:result},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Choose a supported integration.'},{status:400});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many integration checks. Try again shortly.'},{status:429});
		const status=error instanceof Error&&error.message==='UNAUTHORIZED'?401:error instanceof Error&&error.message==='FORBIDDEN'?403:503;
		return NextResponse.json({error:status===401?'Unauthorized':status===403?'Forbidden':'Integration check failed.'},{status,headers:{'Cache-Control':'private, no-store'}});
	}
}