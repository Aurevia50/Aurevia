import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {rateLimit} from '@/lib/rate-limit';
import {isSameOriginRequest} from '@/lib/push-notifications';

export const dynamic='force-dynamic';

const preferencesSchema=z.object({
	accountActivity:z.boolean().optional(),
	investmentUpdates:z.boolean().optional(),
	announcements:z.boolean().optional(),
}).strict().refine(value=>Object.keys(value).length>0);

export async function PATCH(request:Request){
	try{
		if(!isSameOriginRequest(request))return NextResponse.json({error:'Cross-origin request blocked.'},{status:403});
		const user=await requireUser();
		rateLimit(`push-preferences:${user.id}`,30,60_000);
		const input=preferencesSchema.parse(await request.json());
		const preferences=await db.pushPreference.upsert({
			where:{userId:user.id},
			update:input,
			create:{userId:user.id,...input},
			select:{accountActivity:true,investmentUpdates:true,announcements:true},
		});
		return NextResponse.json({ok:true,preferences},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Invalid notification preferences.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many preference updates. Try again shortly.'},{status:429});
		console.error('Browser push preference update failed',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to update notification preferences.'},{status:500});
	}
}
