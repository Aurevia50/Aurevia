import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {runAiService} from '@/lib/ai-services';
import {AiGatewayError} from '@/lib/ai-gateway';
import {rateLimit} from '@/lib/rate-limit';
import {getServerConfiguration} from '@/lib/config/env';
import {getAlpacaMarketDataOptions,getMarketQuoteWithFallback} from '@/lib/market-data-service';
import {getMarketAsset,isExternalMarketDataSource} from '@/lib/live-market';

const requestSchema=z.object({symbols:z.array(z.string().trim().min(1).max(16)).min(1).max(6)}).strict().superRefine((value,context)=>{
	if(new Set(value.symbols.map(symbol=>symbol.toUpperCase())).size!==value.symbols.length){
		context.addIssue({code:'custom',message:'Symbols must be unique.'});
	}
});
const outputSchema=z.object({
	summary:z.string().trim().min(1).max(500),
	observations:z.array(z.object({
		symbol:z.string().trim().min(1).max(16),
		observation:z.string().trim().min(1).max(180),
	}).strict()).max(6),
	caveat:z.string().trim().min(1).max(300),
}).strict();
const maxQuoteAgeMs=5*60_000;

export async function POST(request:Request){
	try{
		const user=await requireUser();
		rateLimit(`market-ai:${user.id}`,8,60_000);
		const input=requestSchema.parse(await request.json());
		const symbols=input.symbols.map(symbol=>symbol.toUpperCase());
		const assets=symbols.map(symbol=>getMarketAsset(symbol));
		if(assets.some(asset=>!asset))return NextResponse.json({error:'One or more market symbols are unsupported.'},{status:400});
		const account=await db.user.findUnique({where:{id:user.id},select:{status:true}});
		if(!account||account.status!=='ACTIVE')return NextResponse.json({error:'This account is unavailable.'},{status:403});

		const configuration=getServerConfiguration();
		const quoteResults=await Promise.all(assets.map(async asset=>{
			if(!asset)return null;
			try{
				const quote=await getMarketQuoteWithFallback(asset,configuration.marketData.finnhubApiKey,getAlpacaMarketDataOptions(configuration.execution));
				const age=Date.now()-Date.parse(quote.updatedAt);
				if(!isExternalMarketDataSource(quote.source)||quote.isStale||!Number.isFinite(age)||age<0||age>maxQuoteAgeMs||!Number.isFinite(quote.price)||quote.price<=0||!Number.isFinite(quote.change)||!Number.isFinite(quote.changePercent)){
					return null;
				}
				return {
					symbol:asset.id,
					name:asset.name,
					type:asset.type,
					currency:asset.currency,
					price:quote.price,
					dailyChange:quote.change,
					dailyChangePercent:quote.changePercent,
					dayLow:quote.dayLow,
					dayHigh:quote.dayHigh,
					provider:quote.source,
					quotedAt:quote.updatedAt,
				};
			}catch(error){
				console.warn(`Market analysis quote unavailable (${asset.id}, ${error instanceof Error?error.name:'UnknownError'}).`);
				return null;
			}
		}));
		const quotes=quoteResults.filter((quote):quote is NonNullable<typeof quote>=>quote!==null);
		if(!quotes.length)return NextResponse.json({error:'Fresh external provider quotes are unavailable. Internal reference prices are not used for AI market analysis.'},{status:503,headers:{'Cache-Control':'private, no-store'}});

		const result=await runAiService('market_information_summary',[
			{role:'system',content:'Explain the supplied current market quote snapshot in plain language. Use only its quote facts; do not infer causes, events, forecasts, or missing data. Do not recommend buying, selling, holding, or placing an order. Do not call a positive or negative day change a prediction or verified sentiment. Return only JSON with exactly {"summary":"string","observations":[{"symbol":"one supplied symbol","observation":"string"}],"caveat":"string"}. Include only directly supported observations, and keep the summary concise. State that quotes can be delayed and the explanation is informational, not investment advice.'},
			{role:'user',content:JSON.stringify({quotes})},
		],{actorId:user.id,temperature:0.1,maxTokens:500});
		let parsed:unknown;
		try{parsed=JSON.parse(result.content)}
		catch{return NextResponse.json({error:'The market assistant returned an invalid explanation.'},{status:502,headers:{'Cache-Control':'private, no-store'}})}
		const validated=outputSchema.safeParse(parsed);
		const allowedSymbols=new Set(quotes.map(quote=>quote.symbol));
		if(!validated.success||validated.data.observations.some(observation=>!allowedSymbols.has(observation.symbol))||new Set(validated.data.observations.map(observation=>observation.symbol)).size!==validated.data.observations.length){
			return NextResponse.json({error:'The market assistant returned an unsupported explanation.'},{status:502,headers:{'Cache-Control':'private, no-store'}});
		}

		await db.auditLog.create({data:{
			actorId:user.id,
			action:'AI_MARKET_ANALYSIS',
			entity:'AI_ACTIVITY',
			metadata:{requestedSymbols:symbols,quotedSymbols:quotes.map(quote=>quote.symbol),providers:[...new Set(quotes.map(quote=>quote.provider))],externalAction:false,generatedAnalysis:true},
		}});
		return NextResponse.json({
			analysis:validated.data,
			quotes:quotes.map(({symbol,name,provider,quotedAt})=>({symbol,name,provider,quotedAt})),
			generatedAt:new Date().toISOString(),
			provider:result.provider,
			model:result.model,
		},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Choose between 1 and 6 unique supported market symbols.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Sign in to use market analysis.'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many market analysis requests. Try again shortly.'},{status:429});
		if(error instanceof Error&&error.message==='AI_FEATURE_DISABLED')return NextResponse.json({error:'AI market analysis is disabled by an administrator.'},{status:503});
		if(error instanceof AiGatewayError)return NextResponse.json({error:'The market assistant is temporarily unavailable.'},{status:error.status,headers:{'Cache-Control':'private, no-store'}});
		console.error('Market analysis failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Market analysis is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}
