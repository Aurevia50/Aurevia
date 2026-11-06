import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {openAiChat,ADMIN_DRAFT_SYSTEM_PROMPT,getOpenAiConfig} from '@/lib/openai-client';
import {rateLimit} from '@/lib/rate-limit';

const schema=z.object({
	purpose:z.enum(['support_reply','kyc_note','funding_note','general']).default('support_reply'),
	context:z.string().trim().min(3).max(4000),
	tone:z.enum(['neutral','firm','empathetic']).optional(),
});

export async function POST(request:Request){
	try{
		const admin=await requireAdmin();
		rateLimit(`admin-ai-draft:${admin.id}`,30,60_000);
		const input=schema.parse(await request.json());
		const {enabled,model}=await getOpenAiConfig();
		if(!enabled){
			return NextResponse.json({
				 error:'AI is not configured. Set OPENROUTER_API_KEY on the server.',
				enabled:false,
			},{status:503,headers:{'Cache-Control':'private, no-store'}});
		}
		const tone=input.tone?`Tone: ${input.tone}.`:'';
		const draft=await openAiChat([
			{role:'system',content:ADMIN_DRAFT_SYSTEM_PROMPT},
			{role:'user',content:`Purpose: ${input.purpose}. ${tone}\n\nContext from administrator:\n${input.context}`},
		],{temperature:0.35,maxTokens:600,service:'administrative_assistance',actorId:admin.id});
		if(!draft){
			return NextResponse.json({error:'Unable to generate a draft right now.',enabled:true,model},{status:502,headers:{'Cache-Control':'private, no-store'}});
		}
		return NextResponse.json({draft,model,enabled:true},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Provide context between 3 and 4,000 characters.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many draft requests. Try again shortly.'},{status:429});
		console.error('Admin AI draft failed');
		return NextResponse.json({error:'Draft service unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}
