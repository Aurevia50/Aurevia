import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {getOpenAiConfig,openAiChat} from '@/lib/openai-client';
import {rateLimit} from '@/lib/rate-limit';
import {jsonSafe} from '@/lib/serializers';
import {removeSimulatedLabels} from '@/lib/display-copy';

export const dynamic='force-dynamic';

const marketActions=['SIMULATED_MARKET_TICK','INSTRUMENT_CREATE','INSTRUMENT_UPDATE'];
const responseSchema=z.object({
	summary:z.string().trim().min(1).max(500),
	highlights:z.array(z.object({
		activityId:z.string().min(1).max(128),
		observation:z.string().trim().min(1).max(180),
	}).strict()).max(4),
}).strict();

async function getMarketReviewData(){
	const now=new Date();
	const cutoff=new Date(now.getTime()-24*60*60*1000);
	const [instruments,records]=await Promise.all([
		db.instrument.findMany({
			where:{symbol:{in:['NVDA','BTC/USD','XAU/USD']}},
			select:{id:true,symbol:true,name:true,price:true,enabled:true,updatedAt:true},
			orderBy:{symbol:'asc'},
		}),
		db.auditLog.findMany({
			where:{action:{in:marketActions},createdAt:{gte:cutoff}},
			select:{id:true,action:true,entityId:true,metadata:true,createdAt:true},
			orderBy:{createdAt:'desc'},
			take:50,
		}),
	]);
	const activities=records.map(record=>{
		const metadata=record.metadata&&typeof record.metadata==='object'&&!Array.isArray(record.metadata)
			?record.metadata as Record<string,unknown>
			:{};
		const symbol=typeof metadata.symbol==='string'?metadata.symbol.slice(0,20):null;
		const dataMode=metadata.dataMode==='SIMULATED'?'SIMULATED':null;
		return {
			id:record.id,
			action:record.action,
			entityId:record.entityId,
			symbol,
			direction:metadata.direction==='UP'||metadata.direction==='DOWN'?metadata.direction:null,
			previousPrice:typeof metadata.previousPrice==='string'?metadata.previousPrice.slice(0,40):null,
			newPrice:typeof metadata.newPrice==='string'?metadata.newPrice.slice(0,40):null,
			volatilityPercent:typeof metadata.volatilityPercent==='number'||typeof metadata.volatilityPercent==='string'?String(metadata.volatilityPercent).slice(0,20):null,
			dataMode,
			createdAt:record.createdAt,
		};
	});
	return {generatedAt:now,instruments,activities};
}

export async function GET(){
	try{
		await requireAdmin();
		return NextResponse.json(jsonSafe(await getMarketReviewData()),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		console.error(`Market review data unavailable (${error instanceof Error?error.name:'UnknownError'}).`);
		return NextResponse.json({error:'Market review data is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}

export async function POST(){
	try{
		const admin=await requireAdmin();
		rateLimit(`admin-market-review:${admin.id}`,10,60_000);
		const {enabled,model}=await getOpenAiConfig();
		if(!enabled)return NextResponse.json({error:'AI is not configured. Set OPENROUTER_API_KEY on the server.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
		const data=await getMarketReviewData();
		const output=await openAiChat([
			{role:'system',content:`Review the supplied Aurevia market snapshot and activity records.
Return only JSON: {"summary":"string","highlights":[{"activityId":"one supplied activity id","observation":"string"}]}.
Use only facts explicitly present in the supplied snapshot. Do not invent market moves, events, causes, or activity. Do not forecast, give trading advice, or describe simulated marks as live quotes. If there are no activity records, say so and return an empty highlights array. Any highlight must refer to an activityId present in the supplied records. Keep the summary concise and neutral.`},
			{role:'user',content:JSON.stringify(data)},
		],{temperature:0.1,maxTokens:500,service:'market_information_summary',actorId:admin.id});
		if(!output)return NextResponse.json({error:'AI market review is temporarily unavailable.'},{status:502,headers:{'Cache-Control':'private, no-store'}});
		let parsed:unknown;
		try{parsed=JSON.parse(output)}
		catch{return NextResponse.json({error:'AI returned an invalid market review.'},{status:502,headers:{'Cache-Control':'private, no-store'}})}
		const validation=responseSchema.safeParse(parsed);
		const activityIds=new Set(data.activities.map(activity=>activity.id));
		if(!validation.success||validation.data.highlights.some(highlight=>!activityIds.has(highlight.activityId))){
			return NextResponse.json({error:'AI returned an unsupported market review.'},{status:502,headers:{'Cache-Control':'private, no-store'}});
		}
		const review={...validation.data,summary:removeSimulatedLabels(validation.data.summary),highlights:validation.data.highlights.map(highlight=>({...highlight,observation:removeSimulatedLabels(highlight.observation)}))};
		return NextResponse.json(jsonSafe({review,model,generatedAt:data.generatedAt}),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many AI market reviews. Try again shortly.'},{status:429});
		console.error(`AI market review failed (${error instanceof Error?error.name:'UnknownError'}).`);
		return NextResponse.json({error:'AI market review is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}
