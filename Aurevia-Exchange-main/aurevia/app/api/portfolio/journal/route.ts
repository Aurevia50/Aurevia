import {NextResponse} from 'next/server';
import {UserStatus} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {runAiService} from '@/lib/ai-services';
import {AiGatewayError} from '@/lib/ai-gateway';
import {rateLimit} from '@/lib/rate-limit';
import {instrumentAssetCategory} from '@/lib/portfolio-metrics';

const requestSchema=z.object({question:z.string().trim().min(3).max(500)}).strict();
const outputSchema=z.object({
	reflection:z.string().trim().min(1).max(500),
	observations:z.array(z.string().trim().min(1).max(180)).max(4),
	questions:z.array(z.string().trim().min(1).max(180)).max(3),
	caveat:z.string().trim().min(1).max(250),
}).strict();
export async function POST(request:Request){
	try{
		const user=await requireUser();
		rateLimit(`trading-journal:${user.id}`,8,60_000);
		const input=requestSchema.parse(await request.json());
		const activeUser=await db.user.findUnique({where:{id:user.id},select:{accountMode:true,status:true}});
		if(!activeUser||activeUser.status!==UserStatus.ACTIVE)return NextResponse.json({error:'This account is unavailable.'},{status:403});
		const since=new Date(Date.now()-90*24*60*60_000);
		const trades=await db.position.findMany({
			where:{userId:user.id,accountMode:activeUser.accountMode,status:'CLOSED',closedAt:{gte:since}},
			select:{side:true,realizedPnl:true,instrument:{select:{symbol:true,baseAsset:true,quoteAsset:true}}},
			orderBy:{closedAt:'desc'},
			take:100,
		});
		if(!trades.length)return NextResponse.json({error:'No closed trades from the last 90 days are available for a journal reflection.'},{status:404,headers:{'Cache-Control':'private, no-store'}});

		const groups=new Map<string,{trades:number;wins:number;losses:number;breakEven:number;longTrades:number;shortTrades:number}>();
		for(const trade of trades){
			const category=instrumentAssetCategory(trade.instrument);
			const group=groups.get(category)||{trades:0,wins:0,losses:0,breakEven:0,longTrades:0,shortTrades:0};
			group.trades++;
			if(trade.realizedPnl.gt(0))group.wins++;
			else if(trade.realizedPnl.lt(0))group.losses++;
			else group.breakEven++;
			if(trade.side==='BUY')group.longTrades++;
			else group.shortTrades++;
			groups.set(category,group);
		}
		const aggregates={
			accountMode:activeUser.accountMode,
			period:'last 90 days',
			includedTradeCount:trades.length,
			disclosure:trades.length===100?'The sample is capped at the latest 100 closed positions.':'The sample includes all available closed positions in the period.',
			byAssetClass:[...groups].map(([assetClass,group])=>({
				assetClass,
				closedTrades:group.trades,
				winRatePercent:Number(((group.wins/group.trades)*100).toFixed(1)),
				winningTradeCount:group.wins,
				losingTradeCount:group.losses,
				breakEvenTradeCount:group.breakEven,
				longTradeCount:group.longTrades,
				shortTradeCount:group.shortTrades,
			})),
		};
		const result=await runAiService('trading_journal',[
			{role:'system',content:'You are a neutral trading-journal reflection assistant. Use only supplied aggregate historical data to identify descriptive patterns and propose reflective questions. Do not prescribe actions, strategies, positions, risk levels, or future trades; do not make predictions. Do not infer causation. Make clear realized outcomes are historical and do not predict future results. Return only JSON with exactly {"reflection":"string","observations":["string"],"questions":["string"],"caveat":"string"}.'},
			{role:'user',content:JSON.stringify({question:input.question,tradeJournalAggregates:aggregates})},
		],{actorId:user.id,temperature:0.2,maxTokens:500});
		let parsed:unknown;
		try{parsed=JSON.parse(result.content)}
		catch{return NextResponse.json({error:'The journal assistant returned an invalid reflection.'},{status:502,headers:{'Cache-Control':'private, no-store'}})}
		const output=outputSchema.safeParse(parsed);
		if(!output.success)return NextResponse.json({error:'The journal assistant returned an unsupported reflection.'},{status:502,headers:{'Cache-Control':'private, no-store'}});
		await db.auditLog.create({data:{
			actorId:user.id,
			action:'AI_TRADING_JOURNAL_REFLECTION',
			entity:'AI_ACTIVITY',
			metadata:{accountMode:activeUser.accountMode,periodDays:90,closedTradeCount:trades.length,externalAction:false,generatedAnalysis:true},
		}});
		return NextResponse.json({reflection:output.data,accountMode:activeUser.accountMode,generatedAt:new Date().toISOString(),provider:result.provider,model:result.model},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Enter a journal question between 3 and 500 characters.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many journal requests. Try again shortly.'},{status:429});
		if(error instanceof Error&&error.message==='AI_FEATURE_DISABLED')return NextResponse.json({error:'Trading journal reflections are disabled by an administrator.'},{status:503});
		if(error instanceof AiGatewayError)return NextResponse.json({error:'The journal assistant is temporarily unavailable.'},{status:error.status,headers:{'Cache-Control':'private, no-store'}});
		console.error('Trading journal reflection failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Journal reflections are temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}
