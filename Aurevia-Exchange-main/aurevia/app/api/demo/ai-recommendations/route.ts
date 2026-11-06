import {NextResponse} from 'next/server';
import {AccountMode} from '@prisma/client';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {getDemoAiRecommendations} from '@/lib/demo-ai-recommendations';
import {rateLimit} from '@/lib/rate-limit';

export const dynamic='force-dynamic';

export async function GET(){
	try{
		const user=await requireUser();
		const activeUser=await db.user.findUnique({where:{id:user.id},select:{accountMode:true,status:true}});
		if(!activeUser||activeUser.status!=='ACTIVE')return NextResponse.json({error:'This account is unavailable.'},{status:403});
		if(activeUser.accountMode!==AccountMode.DEMO)return NextResponse.json({error:'AI recommendations are available in DEMO mode only.'},{status:403});
		rateLimit(`demo-ai-recommendations:${user.id}`,2,60_000);
		const result=await getDemoAiRecommendations(user.id);
		return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'AI evaluations are temporarily limited. Try again shortly.'},{status:429});
		if(error instanceof Error&&error.message==='DEMO_MODE_REQUIRED')return NextResponse.json({error:'AI recommendations are available in DEMO mode only.'},{status:403});
		if(error instanceof Error&&error.message==='ACCOUNT_UNAVAILABLE')return NextResponse.json({error:'This account is unavailable.'},{status:403});
		if(error instanceof Error&&error.message==='AI_PROVIDER_NOT_CONFIGURED')return NextResponse.json({error:'AI recommendations are unavailable because the server AI provider is not configured.'},{status:503});
		if(error instanceof Error&&error.message==='MARKET_DATA_UNAVAILABLE')return NextResponse.json({error:'Fresh DEMO market data is unavailable. No recommendation was generated and no trade was placed.'},{status:503});
		if(error instanceof Error&&error.message==='AI_RECOMMENDATION_UNAVAILABLE')return NextResponse.json({error:'The AI provider did not return a recommendation. No trade was placed.'},{status:503});
		if(error instanceof Error&&error.message==='AI_RECOMMENDATION_INVALID')return NextResponse.json({error:'The AI response could not be validated. No trade was placed.'},{status:503});
		console.error('DEMO AI recommendation evaluation failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'AI recommendations are temporarily unavailable. No trade was placed.'},{status:503});
	}
}
