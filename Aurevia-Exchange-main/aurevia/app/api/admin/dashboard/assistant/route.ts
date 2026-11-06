import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {getOpenAiConfig,openAiChat} from '@/lib/openai-client';
import {rateLimit} from '@/lib/rate-limit';

const requestSchema=z.object({question:z.string().trim().min(3).max(1000)});
const visualizationIds=[
	'users_total','users_new_7d','deposits_total_usd','deposits_7d_usd',
	'withdrawals_total_usd','withdrawals_7d_usd','investments_total_usd',
	'investments_activated_7d_usd','daily_funding','kyc_status','account_modes',
] as const;
const visualizationSchema=z.object({
	id:z.enum(visualizationIds),
	type:z.enum(['stat','timeseries','bar']),
	title:z.string().trim().min(1).max(80),
}).strict();
const responseSchema=z.object({
	status:z.enum(['success','clarification_needed']),
	interpretation:z.string().trim().min(1).max(200),
	clarification_question:z.string().trim().max(300).nullable(),
	visualizations:z.array(visualizationSchema).max(6),
}).strict().superRefine((value,context)=>{
	if(value.status==='success'&&value.visualizations.length===0){
		context.addIssue({code:'custom',message:'Successful configurations must include at least one visualization.'});
	}
	if(value.status==='clarification_needed'&&!value.clarification_question){
		context.addIssue({code:'custom',message:'Clarification requests must include a question.'});
	}
	if(new Set(value.visualizations.map(item=>item.id)).size!==value.visualizations.length){
		context.addIssue({code:'custom',message:'Visualization IDs must be unique.'});
	}
	for(const visualization of value.visualizations){
		const expectedType=visualization.id==='daily_funding'?'timeseries'
			:visualization.id==='kyc_status'||visualization.id==='account_modes'?'bar':'stat';
		if(visualization.type!==expectedType){
			context.addIssue({code:'custom',message:`${visualization.id} must use ${expectedType}.`});
		}
	}
});

const SYSTEM_PROMPT=`Convert an administrator's natural-language question into a dashboard view configuration.
Return only valid JSON with exactly these fields:
{"status":"success"|"clarification_needed","interpretation":"short summary","clarification_question":string|null,"visualizations":[{"id":string,"type":"stat"|"timeseries"|"bar","title":string}]}
Allowed visualization IDs and types:
- users_total (stat): active customer account count
- users_new_7d (stat): customers created in current 7-day window
- deposits_total_usd (stat): approved/completed REAL USD deposits total
- deposits_7d_usd (stat): approved/completed REAL USD deposits in current 7-day window
- withdrawals_total_usd (stat): settled REAL USD withdrawals total
- withdrawals_7d_usd (stat): settled REAL USD withdrawals in current 7-day window
- investments_total_usd (stat): included REAL investment principal total
- investments_activated_7d_usd (stat): REAL investment principal activated in current 7-day window
- daily_funding (timeseries): daily approved deposits and settled withdrawals for the available last 7 days
- kyc_status (bar): verified, pending, rejected profile counts
- account_modes (bar): active customer counts by current DEMO/REAL mode
Return up to six unique visualizations. Successful responses require at least one visualization.
If the request cannot be answered from these metrics, use clarification_needed and ask one clear question.
Never generate SQL, Prometheus, Elasticsearch, raw queries, additional data, metric values, or insights.`;

export async function POST(request:Request){
	try{
		const admin=await requireAdmin();
		rateLimit(`admin-dashboard-assistant:${admin.id}`,20,60_000);
		const {question}=requestSchema.parse(await request.json());
		const {enabled,model}=await getOpenAiConfig();
		if(!enabled)return NextResponse.json({error:'AI is not configured. Set OPENROUTER_API_KEY on the server.'},{status:503,headers:{'Cache-Control':'private, no-store'}});

		const output=await openAiChat([
			{role:'system',content:SYSTEM_PROMPT},
			{role:'user',content:question},
		],{temperature:0.1,maxTokens:800,service:'administrative_assistance',actorId:admin.id});
		if(!output)return NextResponse.json({error:'The dashboard assistant is temporarily unavailable.'},{status:502,headers:{'Cache-Control':'private, no-store'}});

		let parsed:unknown;
		try{parsed=JSON.parse(output)}
		catch{return NextResponse.json({error:'The dashboard assistant returned an invalid configuration.'},{status:502,headers:{'Cache-Control':'private, no-store'}})}
		const configuration=responseSchema.safeParse(parsed);
		if(!configuration.success)return NextResponse.json({error:'The dashboard assistant returned an unsupported configuration.'},{status:502,headers:{'Cache-Control':'private, no-store'}});

		return NextResponse.json({configuration:configuration.data,model},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Enter a question between 3 and 1,000 characters.'},{status:400,headers:{'Cache-Control':'private, no-store'}});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401,headers:{'Cache-Control':'private, no-store'}});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403,headers:{'Cache-Control':'private, no-store'}});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many dashboard assistant requests. Try again shortly.'},{status:429,headers:{'Cache-Control':'private, no-store'}});
		console.error('Admin dashboard assistant failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Dashboard assistant service unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}
