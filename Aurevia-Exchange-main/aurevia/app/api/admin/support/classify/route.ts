import {NextResponse} from 'next/server';
import {SupportCategory,SupportPriority} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {runAiService} from '@/lib/ai-services';
import {AiGatewayError} from '@/lib/ai-gateway';
import {rateLimit} from '@/lib/rate-limit';

const requestSchema=z.object({conversationId:z.string().min(1).max(128)}).strict();
const outputSchema=z.object({
	category:z.nativeEnum(SupportCategory),
	priority:z.nativeEnum(SupportPriority),
	rationale:z.string().trim().min(1).max(300),
}).strict();

function classifySignals(subject:string,messages:string[]){
	const text=`${subject}\n${messages.join('\n')}`.toLowerCase();
	const signals:string[]=[];
	if(/\b(deposit|funding|receipt|payment|credit|transfer)\b/.test(text))signals.push('FUNDING');
	if(/\b(withdraw(?:al|als|ing)?|payout|cash out|refund)\b/.test(text))signals.push('WITHDRAWAL');
	if(/\b(account|login|password|profile|verification|kyc|access)\b/.test(text))signals.push('ACCOUNT');
	if(/\b(security|hacked|unauthori[sz]ed|compromised|fraud|stolen)\b/.test(text))signals.push('SECURITY');
	if(/\b(complaint|complain|unfair|escalate|grievance)\b/.test(text))signals.push('COMPLAINT');
	return {
		categorySignals:signals.length?signals:['GENERAL'],
		urgentLanguage:/\b(urgent|immediately|emergency|hacked|stolen|unauthori[sz]ed)\b/.test(text),
	};
}

export async function POST(request:Request){
	try{
		const admin=await requireAdmin();
		rateLimit(`admin-ai-ticket-classify:${admin.id}`,20,60_000);
		const {conversationId}=requestSchema.parse(await request.json());
		const conversation=await db.supportConversation.findUnique({
			where:{id:conversationId},
			select:{
				id:true,subject:true,isComplaint:true,
				messages:{where:{authorType:'USER'},orderBy:{createdAt:'desc'},take:4,select:{body:true}},
			},
		});
		if(!conversation)return NextResponse.json({error:'Support ticket not found.'},{status:404});
		const signals=classifySignals(conversation.subject,conversation.messages.map(message=>message.body));
		const result=await runAiService('support_ticket_classification',[
			{role:'system',content:`Suggest a support category and priority for administrator review from normalized keyword signals only. Return only JSON with exactly {"category":"GENERAL"|"FUNDING"|"WITHDRAWAL"|"ACCOUNT"|"SECURITY"|"COMPLAINT","priority":"LOW"|"NORMAL"|"HIGH"|"URGENT","rationale":"short explanation"}. An explicit complaint flag requires the COMPLAINT category. Security signals or urgent-language flag can warrant a higher suggested priority, but are not proof of fraud or account compromise. Never infer identity, payment receipt, fraud, KYC eligibility, or account status. Do not change any ticket fields and do not draft a reply.`},
			{role:'user',content:JSON.stringify({
				explicitComplaint:conversation.isComplaint,
				...signals,
			})},
		],{actorId:admin.id,temperature:0.1,maxTokens:250});
		let parsed:unknown;
		try{parsed=JSON.parse(result.content)}
		catch{return NextResponse.json({error:'The ticket classifier returned an invalid suggestion.'},{status:502,headers:{'Cache-Control':'private, no-store'}})}
		const suggestion=outputSchema.safeParse(parsed);
		if(!suggestion.success)return NextResponse.json({error:'The ticket classifier returned an unsupported suggestion.'},{status:502,headers:{'Cache-Control':'private, no-store'}});
		const category=conversation.isComplaint?SupportCategory.COMPLAINT:suggestion.data.category;
		await db.auditLog.create({data:{
			actorId:admin.id,
			action:'AI_SUPPORT_CLASSIFICATION_SUGGESTED',
			entity:'SUPPORT',
			entityId:conversation.id,
			metadata:{suggestedCategory:category,suggestedPriority:suggestion.data.priority,applied:false,messageExcerptCount:conversation.messages.length},
		}});
		return NextResponse.json({
			suggestion:{...suggestion.data,category},
			applied:false,
			message:'Suggestion only. Review the conversation and apply any ticket changes manually.',
			provider:result.provider,
			model:result.model,
		},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Choose a valid support ticket.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many ticket-classification requests. Try again shortly.'},{status:429});
		if(error instanceof Error&&error.message==='AI_FEATURE_DISABLED')return NextResponse.json({error:'AI ticket classification is disabled by an administrator.'},{status:503});
		if(error instanceof AiGatewayError)return NextResponse.json({error:'Ticket classification is temporarily unavailable.'},{status:error.status,headers:{'Cache-Control':'private, no-store'}});
		console.error('Administrator ticket classification failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Ticket classification is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}
