import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {rateLimit} from '@/lib/rate-limit';
import {browserSubscriptionSchema,encryptBrowserSubscription,isSameOriginRequest,pushEndpointHash} from '@/lib/push-notifications';

export const dynamic='force-dynamic';

function errorResponse(error:unknown){
	if(error instanceof ZodError)return NextResponse.json({error:'Invalid browser push subscription.'},{status:400});
	if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
	if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
	if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many notification requests. Try again shortly.'},{status:429});
	if(error instanceof Error&&error.message==='PUSH_SUBSCRIPTION_ENCRYPTION_KEY_REQUIRED')return NextResponse.json({error:'Browser notification storage is not configured.'},{status:503});
	console.error('Browser push subscription request failed',error instanceof Error?error.name:'UnknownError');
	return NextResponse.json({error:'Unable to update browser notifications.'},{status:500});
}

function isUniqueConstraintError(error:unknown){
	return Boolean(error&&typeof error==='object'&&'code' in error&&error.code==='P2002');
}

export async function GET(){
	try{
		const user=await requireUser();
		rateLimit(`push-subscription-status:${user.id}`,60,60_000);
		const [preferences,subscriptionCount]=await Promise.all([
			db.pushPreference.upsert({where:{userId:user.id},update:{},create:{userId:user.id}}),
			db.pushSubscription.count({where:{userId:user.id}}),
		]);
		const configured=Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()&&process.env.VAPID_PRIVATE_KEY?.trim()&&process.env.VAPID_SUBJECT?.trim()&&process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY?.trim());
		return NextResponse.json({
			available:configured,
			publicKey:configured?process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim():null,
			subscriptionCount,
			preferences:{
				accountActivity:preferences.accountActivity,
				investmentUpdates:preferences.investmentUpdates,
				announcements:preferences.announcements,
			},
		},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){return errorResponse(error)}
}

export async function POST(request:Request){
	try{
		if(!isSameOriginRequest(request))return NextResponse.json({error:'Cross-origin request blocked.'},{status:403});
		const user=await requireUser();
		rateLimit(`push-subscribe:${user.id}`,10,60_000);
		if(Number(request.headers.get('content-length')||0)>16_384)return NextResponse.json({error:'Subscription request is too large.'},{status:413});
		if(!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()||!process.env.VAPID_PRIVATE_KEY?.trim()||!process.env.VAPID_SUBJECT?.trim())return NextResponse.json({error:'Browser notifications are not configured on this server.'},{status:503});
		const subscription=browserSubscriptionSchema.parse(await request.json());
		const encrypted=encryptBrowserSubscription(subscription);
		const endpointHash=pushEndpointHash(subscription.endpoint);
		const existing=await db.pushSubscription.findUnique({where:{endpointHash},select:{id:true,userId:true}});
		if(existing&&existing.userId!==user.id)return NextResponse.json({error:'This browser subscription is already associated with another account.'},{status:409});
		await db.$transaction(async tx=>{
			if(existing){
				await tx.pushSubscription.update({where:{id:existing.id,userId:user.id},data:{...encrypted,expiresAt:subscription.expirationTime?new Date(subscription.expirationTime):null}});
			}else{
				await tx.pushSubscription.create({data:{userId:user.id,endpointHash,...encrypted,expiresAt:subscription.expirationTime?new Date(subscription.expirationTime):null}});
			}
			await tx.pushPreference.upsert({where:{userId:user.id},update:{},create:{userId:user.id}});
		});
		return NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(isUniqueConstraintError(error))return NextResponse.json({error:'This browser subscription is already registered.'},{status:409});
		return errorResponse(error);
	}
}

export async function DELETE(request:Request){
	try{
		if(!isSameOriginRequest(request))return NextResponse.json({error:'Cross-origin request blocked.'},{status:403});
		const user=await requireUser();
		rateLimit(`push-unsubscribe:${user.id}`,20,60_000);
		const body=z.object({endpoint:z.string().url().max(8192).refine(value=>value.startsWith('https://'))}).strict().parse(await request.json());
		await db.pushSubscription.deleteMany({where:{userId:user.id,endpointHash:pushEndpointHash(body.endpoint)}});
		return NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){return errorResponse(error)}
}
