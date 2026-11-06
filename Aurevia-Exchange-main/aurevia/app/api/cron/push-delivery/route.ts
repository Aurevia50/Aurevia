import {NextResponse} from 'next/server';
import {processPushQueue,safeSecretEquals} from '@/lib/push-notifications';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

export async function GET(request:Request){
	if(!safeSecretEquals(request.headers.get('authorization')?.replace(/^Bearer\s+/i,''),process.env.PUSH_DELIVERY_CRON_SECRET)){
		return NextResponse.json({error:'Unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
	}
	try{
		const results=await processPushQueue(50);
		return NextResponse.json({ok:true,results},{headers:{'Cache-Control':'no-store'}});
	}catch(error){
		console.error('Push delivery worker failed',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Push delivery worker unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});
	}
}
