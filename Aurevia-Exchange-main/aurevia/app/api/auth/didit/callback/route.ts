import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireUser} from '@/lib/auth';
import {getDiditDecision,diditIsConfigured} from '@/lib/didit';
import {applyDiditDecision} from '@/lib/didit-persistence';
import {rateLimit} from '@/lib/rate-limit';

export const runtime='nodejs';

const schema=z.object({sessionId:z.string().uuid()});

export async function POST(request:Request){
	try{
		const user=await requireUser();
		try{
			rateLimit(`didit-callback:${user.id}`,20,60_000);
		}catch(error){
			if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many result confirmation attempts. Try again shortly.'},{status:429});
			throw error;
		}
		const {sessionId}=schema.parse(await request.json());
		if(!diditIsConfigured())return NextResponse.json({error:'Didit result confirmation is not configured.'},{status:503});
		const decision=await getDiditDecision(sessionId);
		const result=await applyDiditDecision({userId:user.id,decision});
		return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Invalid verification callback.'},{status:400});
		if(error instanceof SyntaxError)return NextResponse.json({error:'Callback body must contain valid JSON.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Sign in to confirm your verification result.'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='DIDIT_SESSION_NOT_FOUND')return NextResponse.json({error:'This Didit session does not belong to your account.'},{status:404});
		if(error instanceof Error&&error.message.startsWith('DIDIT_'))return NextResponse.json({error:'Didit could not confirm this result yet.'},{status:503});
		console.error('[didit-callback] Unable to confirm verification result.',{errorType:error instanceof Error?error.name:'UnknownError'});
		return NextResponse.json({error:'Unable to confirm Didit result right now.'},{status:503});
	}
}
