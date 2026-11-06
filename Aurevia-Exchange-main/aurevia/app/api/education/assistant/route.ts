import {NextResponse} from 'next/server';
import {isIP} from 'node:net';
import {z,ZodError} from 'zod';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth-options';
import {runAiService} from '@/lib/ai-services';
import {AiGatewayError} from '@/lib/ai-gateway';
import {rateLimit} from '@/lib/rate-limit';

const schema=z.object({question:z.string().trim().min(3).max(700)}).strict();

function clientIp(request:Request){
	const forwarded=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'';
	const real=request.headers.get('x-real-ip')?.trim()||'';
	return forwarded&&isIP(forwarded)?forwarded:real&&isIP(real)?real:'unknown';
}

export async function POST(request:Request){
	try{
		const input=schema.parse(await request.json());
		const session=await getServerSession(authOptions);
		const actorId=session?.user?.id;
		rateLimit(actorId?`education-ai:${actorId}`:`education-ai-ip:${clientIp(request)}`,10,60_000);
		const result=await runAiService('investment_research',[
			{role:'system',content:'You are Aurevia Exchange’s investment education tutor. Explain general financial concepts clearly for a beginner and respond in the language used by the learner when supported. Do not provide personalized financial, tax, or legal advice, recommend specific trades or assets, forecast prices, promise returns, or claim external facts are verified. Explain material risks and uncertainty. If a question asks for a personal recommendation, explain the concept neutrally instead.'},
			{role:'user',content:input.question},
		],{actorId,temperature:0.3,maxTokens:500});
		return NextResponse.json({answer:result.content,provider:result.provider,model:result.model,generatedAnalysis:true},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Enter an education question between 3 and 700 characters.'},{status:400});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many learning assistant requests. Try again shortly.'},{status:429});
		if(error instanceof Error&&error.message==='AI_FEATURE_DISABLED')return NextResponse.json({error:'The learning assistant is disabled by an administrator.'},{status:503});
		if(error instanceof AiGatewayError)return NextResponse.json({error:'The learning assistant is temporarily unavailable.'},{status:error.status,headers:{'Cache-Control':'private, no-store'}});
		console.error('Investment education assistant failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'The learning assistant is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}
