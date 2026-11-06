import {AccountMode,OrderSide} from '@prisma/client';
import {db} from '@/lib/db';
import {balance} from '@/lib/ledger';
import {getOpenAiConfig,openAiChat} from '@/lib/openai-client';
import {getDemoAiConfig,sizeDemoRecommendation} from '@/lib/demo-ai-config';
import {removeSimulatedLabels} from '@/lib/display-copy';

type RecommendationCandidate={
	instrumentId:string;
	symbol:string;
	name:string;
	price:number;
	observedAt:string;
	momentum:number;
	strategy:'momentum'|'mean_reversion';
	action:'BUY'|'SELL';
	availableQuantity?:number;
};

function parseDecision(content:string){
	const normalized=content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
	const value=JSON.parse(normalized) as unknown;
	if(!value||typeof value!=='object'||!('instrumentId'in value)||!('action'in value)||!('rationale'in value))throw new Error('INVALID_AI_DECISION');
	const decision=value as Record<string,unknown>;
	if(typeof decision.instrumentId!=='string'||(decision.action!=='BUY'&&decision.action!=='SELL'&&decision.action!=='HOLD')||typeof decision.rationale!=='string')throw new Error('INVALID_AI_DECISION');
	return {instrumentId:decision.instrumentId,action:decision.action,rationale:removeSimulatedLabels(decision.rationale.trim().slice(0,400))};
}

export async function getDemoAiRecommendations(userId:string){
	const activeUser=await db.user.findUnique({where:{id:userId},select:{accountMode:true,status:true}});
	if(!activeUser||activeUser.status!=='ACTIVE')throw new Error('ACCOUNT_UNAVAILABLE');
	if(activeUser.accountMode!==AccountMode.DEMO)throw new Error('DEMO_MODE_REQUIRED');
	const config=getDemoAiConfig();
	const aiConfig=await getOpenAiConfig();
	if(!config.enabled)return {status:'disabled' as const,message:'AI recommendations are disabled by server configuration.',evaluationIntervalSeconds:config.evaluationIntervalSeconds,recommendations:[]};
	if(!aiConfig.enabled)throw new Error('AI_PROVIDER_NOT_CONFIGURED');

	const modeCheck=await db.user.findUnique({where:{id:userId},select:{accountMode:true}});
	if(modeCheck?.accountMode!==AccountMode.DEMO)throw new Error('DEMO_MODE_REQUIRED');
	const instrumentFilter=config.supportedSymbols?{symbol:{in:config.supportedSymbols}}:{};
	const instruments=await db.instrument.findMany({
		where:{enabled:true,quoteAsset:'USD',...instrumentFilter},
		include:{candles:{orderBy:{ts:'desc'},take:2,select:{close:true,ts:true}}},
		orderBy:{symbol:'asc'},
		take:20,
	});
	const now=Date.now();
	const fresh=instruments.filter(instrument=>instrument.price.gt(0)&&now-instrument.updatedAt.getTime()<=config.maxQuoteAgeMs&&instrument.updatedAt.getTime()-now<=5_000);
	if(!fresh.length)throw new Error('MARKET_DATA_UNAVAILABLE');
	const openPositions=await db.position.findMany({where:{userId,accountMode:AccountMode.DEMO,status:'OPEN',side:OrderSide.BUY},select:{instrumentId:true,quantity:true}});
	const held=new Map(openPositions.map(position=>[position.instrumentId,position.quantity]));
	const candidates:RecommendationCandidate[]=[];
	for(const instrument of fresh){
		const [latest,previous]=instrument.candles;
		if(!latest||!previous||!previous.close.gt(0)||now-latest.ts.getTime()>5*60_000)continue;
		const price=Number(instrument.price);
		const momentum=Number(latest.close.minus(previous.close).div(previous.close));
		if(!Number.isFinite(momentum)||Math.abs(momentum)<config.entryThreshold)continue;
		const existing=held.get(instrument.id);
		for(const strategy of config.strategies){
			const buySignal=strategy==='momentum'?momentum>0:momentum<0;
			const action=buySignal?'BUY':'SELL';
			if(action==='SELL'&&!existing)continue;
			candidates.push({instrumentId:instrument.id,symbol:instrument.symbol,name:instrument.name,price,observedAt:instrument.updatedAt.toISOString(),momentum,strategy,action,availableQuantity:existing?Number(existing):undefined});
		}
	}
	if(!candidates.length)return {status:'no_signal' as const,message:'No configured strategy signal meets the entry threshold on fresh market data.',evaluationIntervalSeconds:config.evaluationIntervalSeconds,recommendations:[]};
	const content=await openAiChat([
		{role:'system',content:'You generate DEMO trading recommendations only, never execute trades. Select at most one candidate from the provided JSON or return {"instrumentId":"","action":"HOLD","rationale":"No suitable signal."}. Return one JSON object with instrumentId, action (BUY or SELL), rationale. Never invent prices, instruments, position sizes, or guarantees. Cite the strategy and observed momentum in a concise factual rationale.'},
		{role:'user',content:JSON.stringify({mode:'DEMO',simulationOnly:true,candidates:candidates.slice(0,40).map(({availableQuantity,...candidate})=>({ ...candidate,heldQuantity:availableQuantity??null})),risk:{riskPerTrade:config.riskPerTrade,maxPositionUsd:config.maxPositionUsd,stopLossPercent:config.stopLossPercent,takeProfitPercent:config.takeProfitPercent}})},
	],{temperature:0.1,maxTokens:220,service:'operational_recommendations',actorId:userId});
	if(!content)throw new Error('AI_RECOMMENDATION_UNAVAILABLE');
	let decision:{instrumentId:string;action:string;rationale:string};
	try{decision=parseDecision(content)}catch{throw new Error('AI_RECOMMENDATION_INVALID');}
	if(decision.action==='HOLD'||!decision.instrumentId)return {status:'no_signal' as const,message:decision.rationale||'The AI found no suitable candidate.',evaluationIntervalSeconds:config.evaluationIntervalSeconds,recommendations:[]};
	const candidate=candidates.find(item=>item.instrumentId===decision.instrumentId&&item.action===decision.action);
	if(!candidate)throw new Error('AI_RECOMMENDATION_INVALID');
	const currentUser=await db.user.findUnique({where:{id:userId},select:{accountMode:true,status:true}});
	if(!currentUser||currentUser.status!=='ACTIVE')throw new Error('ACCOUNT_UNAVAILABLE');
	if(currentUser.accountMode!==AccountMode.DEMO)throw new Error('DEMO_MODE_REQUIRED');
	const account=await db.ledgerAccount.findUnique({where:{code:`USER:${userId}:${AccountMode.DEMO}:USD`},select:{id:true}});
	const availableCash=account?Number(await balance(db,account.id)):0;
	const instrument=instruments.find(item=>item.id===candidate.instrumentId);
	if(!instrument||Date.now()-instrument.updatedAt.getTime()>config.maxQuoteAgeMs)throw new Error('MARKET_DATA_UNAVAILABLE');
	const quantity=sizeDemoRecommendation({
		price:candidate.price,
		balance:availableCash,
		takerFee:Math.max(Number(instrument.takerFee),config.feeRate),
		riskPerTrade:config.riskPerTrade,
		maxPositionUsd:config.maxPositionUsd,
		stopLossPercent:config.stopLossPercent,
		slippageBps:config.slippageBps+config.spreadBps/2,
		availableQuantity:candidate.action==='SELL'?candidate.availableQuantity:undefined,
	});
	if(quantity<=0)return {status:'no_signal' as const,message:'No recommendation fits current DEMO risk and cash limits.',evaluationIntervalSeconds:config.evaluationIntervalSeconds,recommendations:[]};
	return {
		status:'ready' as const,
		evaluationIntervalSeconds:config.evaluationIntervalSeconds,
		recommendations:[{
			instrumentId:candidate.instrumentId,symbol:candidate.symbol,name:candidate.name,action:candidate.action,
			quantity,entryPrice:candidate.price,observedAt:candidate.observedAt,
			stopLossPrice:candidate.action==='BUY'?candidate.price*(1-config.stopLossPercent):null,
			takeProfitPrice:candidate.action==='BUY'?candidate.price*(1+config.takeProfitPercent):null,
			rationale:decision.rationale,
			strategy:candidate.strategy,
			marketDataLabel:'Aurevia DEMO market data',
			risk:{riskPerTradePercent:config.riskPerTrade*100,maxPositionUsd:config.maxPositionUsd,stopLossPercent:config.stopLossPercent,takeProfitPercent:config.takeProfitPercent,feeRate:Math.max(Number(instrument.takerFee),config.feeRate),spreadBps:config.spreadBps,slippageBps:config.slippageBps},
		}],
	};
}
