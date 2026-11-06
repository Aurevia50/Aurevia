import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {AI_FEATURE_NAMES,AI_SERVICE_FEATURES} from '@/lib/ai-services';
import {rateLimit} from '@/lib/rate-limit';

const schema=z.object({feature:z.enum(AI_FEATURE_NAMES),enabled:z.boolean()}).strict();
const settingPrefix='aurevia.ai.feature.';

export async function PUT(request:Request){
	try{
		const admin=await requireAdmin();
		rateLimit(`admin-ai-feature:${admin.id}`,30,60_000);
		const input=schema.parse(await request.json());
		const key=`${settingPrefix}${input.feature}`;
		await db.$transaction(async tx=>{
			await tx.systemSetting.upsert({
				where:{key},
				create:{key,value:String(input.enabled)},
				update:{value:String(input.enabled)},
			});
			await tx.auditLog.create({data:{
				actorId:admin.id,
				action:'AI_FEATURE_UPDATED',
				entity:'AI_FEATURE',
				entityId:input.feature,
				metadata:{feature:input.feature,enabled:input.enabled},
			}});
		});
		return NextResponse.json({feature:{id:input.feature,...AI_SERVICE_FEATURES[input.feature],enabled:input.enabled}},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Choose a supported AI feature and enabled state.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many AI feature changes. Try again shortly.'},{status:429});
		console.error('Administrator AI feature update failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to update the AI feature.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}
