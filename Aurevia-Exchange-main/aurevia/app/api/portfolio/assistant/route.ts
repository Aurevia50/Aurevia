import {NextResponse} from 'next/server';
import {AccountMode,Prisma,UserStatus} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {runAiService} from '@/lib/ai-services';
import {AiGatewayError} from '@/lib/ai-gateway';
import {rateLimit} from '@/lib/rate-limit';
import {getServerConfiguration} from '@/lib/config/env';
import {getAlpacaMarketDataOptions,getMarketQuoteWithFallback} from '@/lib/market-data-service';
import {getMarketAssetForTradingSymbol,isExternalMarketDataSource} from '@/lib/live-market';
import {instrumentAssetCategory} from '@/lib/portfolio-metrics';

const requestSchema=z.object({question:z.string().trim().min(3).max(500)}).strict();
const outputSchema=z.object({
	summary:z.string().trim().min(1).max(500),
	riskFactors:z.array(z.string().trim().min(1).max(180)).max(4),
	caveat:z.string().trim().min(1).max(300),
}).strict();
const zero=()=>new Prisma.Decimal(0);

async function getExposure(userId:string,mode:AccountMode){
	const positions=await db.position.findMany({
		where:{userId,accountMode:mode,status:'OPEN'},
		select:{side:true,quantity:true,instrument:{select:{symbol:true,baseAsset:true,quoteAsset:true,price:true,updatedAt:true}}},
		orderBy:{openedAt:'asc'},
	});
	const categories=new Map<string,{gross:Prisma.Decimal;long:Prisma.Decimal;short:Prisma.Decimal;count:number}>();
	let unvalued=0;
	let quoteSource=mode===AccountMode.DEMO?'Aurevia DEMO simulated marks':'verified external providers only';
	let configuration:ReturnType<typeof getServerConfiguration>|undefined;
	if(mode===AccountMode.REAL&&positions.length)configuration=getServerConfiguration();

	for(const position of positions){
		let price:Prisma.Decimal|null=null;
		if(mode===AccountMode.DEMO){
			if(position.instrument.price.gt(0)&&Date.now()-position.instrument.updatedAt.getTime()<=5*60_000)price=position.instrument.price;
		}else{
			const asset=getMarketAssetForTradingSymbol(position.instrument.symbol);
			if(asset&&configuration){
				try{
					const quote=await getMarketQuoteWithFallback(asset,configuration.marketData.finnhubApiKey,getAlpacaMarketDataOptions(configuration.execution));
					const age=Date.now()-Date.parse(quote.updatedAt);
					if(isExternalMarketDataSource(quote.source)&&!quote.isStale&&Number.isFinite(age)&&age>=0&&age<=5*60_000&&Number.isFinite(quote.price)&&quote.price>0){
						price=new Prisma.Decimal(quote.price);
						quoteSource=quote.source;
					}
				}catch{
					unvalued++;
					continue;
				}
			}
		}
		if(!price){unvalued++;continue;}
		const exposure=price.mul(position.quantity).abs();
		const category=instrumentAssetCategory(position.instrument);
		const current=categories.get(category)||{gross:zero(),long:zero(),short:zero(),count:0};
		current.gross=current.gross.plus(exposure);
		if(position.side==='BUY')current.long=current.long.plus(exposure);
		else current.short=current.short.plus(exposure);
		current.count++;
		categories.set(category,current);
	}

	const grossTotal=[...categories.values()].reduce((sum,item)=>sum.plus(item.gross),zero());
	return {
		accountMode:mode,
		scope:'open positions only; excludes cash, pending orders, investments, and closed positions',
		markSource:quoteSource,
		unvaluedOpenPositions:unvalued,
		openPositionCount:positions.length,
		valuedPositionCount:positions.length-unvalued,
		grossExposureByAssetClass:[...categories].map(([assetClass,values])=>({
			assetClass,
			positionCount:values.count,
			grossExposureSharePercent:grossTotal.gt(0)?Number(values.gross.div(grossTotal).mul(100).toFixed(1)):0,
			longSharePercent:grossTotal.gt(0)?Number(values.long.div(grossTotal).mul(100).toFixed(1)):0,
			shortSharePercent:grossTotal.gt(0)?Number(values.short.div(grossTotal).mul(100).toFixed(1)):0,
		})),
		generatedAt:new Date().toISOString(),
	};
}

export async function POST(request:Request){
	try{
		const user=await requireUser();
		rateLimit(`portfolio-ai:${user.id}`,10,60_000);
		const input=requestSchema.parse(await request.json());
		const activeUser=await db.user.findUnique({where:{id:user.id},select:{accountMode:true,status:true}});
		if(!activeUser||activeUser.status!==UserStatus.ACTIVE)return NextResponse.json({error:'This account is unavailable.'},{status:403});
		const exposure=await getExposure(user.id,activeUser.accountMode);
		const result=await runAiService('investment_research',[
			{role:'system',content:'You are an Aurevia portfolio education assistant. Explain possible asset-class concentration and data coverage using only the supplied aggregate open-position exposure. Do not recommend, buy, sell, rebalance, predict returns, or give personalized financial, tax, or legal advice. Do not infer holdings or account values not supplied. Clearly distinguish long and short exposure, state when marks are unavailable, and say this snapshot excludes cash, pending orders, investments, and closed positions. Return only JSON with exactly: {"summary":"string","riskFactors":["string"],"caveat":"string"}. Keep the explanation neutral and educational.'},
			{role:'user',content:JSON.stringify({question:input.question,portfolioExposure:exposure})},
		],{actorId:user.id,temperature:0.2,maxTokens:500});
		let parsed:unknown;
		try{parsed=JSON.parse(result.content)}
		catch{return NextResponse.json({error:'The portfolio assistant returned an invalid explanation.'},{status:502,headers:{'Cache-Control':'private, no-store'}})}
		const output=outputSchema.safeParse(parsed);
		if(!output.success)return NextResponse.json({error:'The portfolio assistant returned an unsupported explanation.'},{status:502,headers:{'Cache-Control':'private, no-store'}});
		await db.auditLog.create({data:{
			actorId:user.id,
			action:'AI_PORTFOLIO_ANALYSIS',
			entity:'AI_ACTIVITY',
			metadata:{accountMode:activeUser.accountMode,openPositionCount:exposure.openPositionCount,valuedPositionCount:exposure.valuedPositionCount,externalAction:false,generatedAnalysis:true},
		}});
		return NextResponse.json({analysis:output.data,accountMode:activeUser.accountMode,generatedAt:exposure.generatedAt,provider:result.provider,model:result.model},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Enter a portfolio question between 3 and 500 characters.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many portfolio assistant requests. Try again shortly.'},{status:429});
		if(error instanceof Error&&error.message==='AI_FEATURE_DISABLED')return NextResponse.json({error:'The portfolio education assistant is disabled by an administrator.'},{status:503});
		if(error instanceof AiGatewayError)return NextResponse.json({error:'The portfolio assistant is temporarily unavailable.'},{status:error.status,headers:{'Cache-Control':'private, no-store'}});
		console.error('Portfolio education assistant failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Portfolio assistance is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}
