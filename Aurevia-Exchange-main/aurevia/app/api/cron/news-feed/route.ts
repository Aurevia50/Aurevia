import {NextResponse} from 'next/server';
import {syncAllEnabledNewsSources} from '@/lib/news-feed/sync';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

export async function GET(request:Request){
	const secret=process.env.CRON_SECRET;
	if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`){
		return NextResponse.json({error:'Unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
	}
	try{
		const results=await syncAllEnabledNewsSources();
		return NextResponse.json({ok:true,results},{headers:{'Cache-Control':'no-store'}});
	}catch(error){
		console.error('news-feed cron failed',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'News feed sync unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});
	}
}
