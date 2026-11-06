import {randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {NotificationType} from '@prisma/client';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {createNotification} from '@/lib/notifications';
import {isSameOriginRequest,processPushQueue} from '@/lib/push-notifications';
import {rateLimit} from '@/lib/rate-limit';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function POST(request:Request){
	try{
		if(!isSameOriginRequest(request))return NextResponse.json({error:'Cross-origin request blocked.'},{status:403});
		const user=await requireUser();
		rateLimit(`push-test:${user.id}`,2,60_000);
		const [subscriptions,preferences]=await Promise.all([
			db.pushSubscription.count({where:{userId:user.id}}),
			db.pushPreference.findUnique({where:{userId:user.id},select:{accountActivity:true}}),
		]);
		if(!subscriptions)return NextResponse.json({error:'Enable browser notifications on this device before sending a test.'},{status:409});
		if(!preferences?.accountActivity)return NextResponse.json({error:'Enable account activity notifications to receive the test notification.'},{status:409});
		const dedupeKey=`push-test:${user.id}:${randomUUID()}`;
		const notification=await db.$transaction(tx=>createNotification(tx,{
			userId:user.id,
			type:NotificationType.SECURITY,
			title:'Browser notification test',
			message:'This is a test of Aurevia browser notifications.',
			dedupeKey,
			relatedEntity:'PUSH_TEST',
			actionUrl:'/settings#preferences',
		}));
		const outbox=await db.pushOutbox.findUniqueOrThrow({where:{notificationId:notification.id},select:{id:true}});
		await processPushQueue(1,outbox.id);
		return NextResponse.json({ok:true,message:'Test notification queued. Delivery may take a short time.'},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Wait before sending another test notification.'},{status:429});
		if(error instanceof Error&&error.message==='PUSH_VAPID_CONFIGURATION_REQUIRED')return NextResponse.json({error:'Browser notifications are not configured on this server.'},{status:503});
		console.error('Browser push test failed',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to send a test notification.'},{status:503});
	}
}
