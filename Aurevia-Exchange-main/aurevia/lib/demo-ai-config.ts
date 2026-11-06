const strategies=['momentum','mean_reversion'] as const;
export type DemoAiStrategy=(typeof strategies)[number];

function boundedNumber(name:string,fallback:number,min:number,max:number){
	const raw=process.env[name];
	if(raw===undefined||raw.trim()==='')return fallback;
	const value=Number(raw);
	if(!Number.isFinite(value)||value<min||value>max)throw new Error(`INVALID_${name}`);
	return value;
}

function selectedStrategies():DemoAiStrategy[]{
	const raw=process.env.DEMO_AI_STRATEGIES?.trim();
	if(!raw)return ['momentum','mean_reversion'];
	const values=raw.split(',').map(value=>value.trim()).filter(Boolean);
	if(!values.length||values.some(value=>!strategies.includes(value as DemoAiStrategy)))throw new Error('INVALID_DEMO_AI_STRATEGIES');
	return [...new Set(values as DemoAiStrategy[])];
}

function supportedSymbols():string[]|null{
	const raw=process.env.DEMO_AI_SUPPORTED_SYMBOLS?.trim();
	if(!raw)return null;
	const values=raw.split(',').map(value=>value.trim().toUpperCase()).filter(Boolean);
	if(values.some(value=>!/^[A-Z0-9._/-]{1,24}$/.test(value)))throw new Error('INVALID_DEMO_AI_SUPPORTED_SYMBOLS');
	return [...new Set(values)];
}

export function getDemoAiConfig(){
	const enabled=process.env.DEMO_AI_ENABLED==='true';
	return {
		enabled,
		strategies:selectedStrategies(),
		supportedSymbols:supportedSymbols(),
		riskPerTrade:boundedNumber('DEMO_AI_RISK_PER_TRADE',0.01,0.001,0.05),
		maxPositionUsd:boundedNumber('DEMO_AI_MAX_POSITION_USD',500,10,5_000),
		entryThreshold:boundedNumber('DEMO_AI_ENTRY_THRESHOLD',0.005,0.0001,0.2),
		stopLossPercent:boundedNumber('DEMO_AI_STOP_LOSS_PERCENT',0.02,0.001,0.25),
		takeProfitPercent:boundedNumber('DEMO_AI_TAKE_PROFIT_PERCENT',0.04,0.001,0.5),
		feeRate:boundedNumber('DEMO_AI_FEE_RATE',0.0015,0,0.05),
		spreadBps:boundedNumber('DEMO_AI_SPREAD_BPS',2,0,500),
		slippageBps:boundedNumber('DEMO_AI_SLIPPAGE_BPS',5,0,500),
		evaluationIntervalSeconds:boundedNumber('DEMO_AI_EVALUATION_INTERVAL_SECONDS',300,60,3600),
		maxQuoteAgeMs:30_000,
	};
}

export type DemoAiConfig=ReturnType<typeof getDemoAiConfig>;

export function sizeDemoRecommendation(input:{
	price:number;
	balance:number;
	takerFee:number;
	riskPerTrade:number;
	maxPositionUsd:number;
	stopLossPercent:number;
	slippageBps:number;
	availableQuantity?:number;
}){
	const {price,balance,takerFee,riskPerTrade,maxPositionUsd,stopLossPercent,slippageBps,availableQuantity}=input;
	if(![price,balance,takerFee,riskPerTrade,maxPositionUsd,stopLossPercent,slippageBps].every(Number.isFinite)||price<=0||balance<=0||takerFee<0||stopLossPercent<=0)return 0;
	const riskBudget=balance*riskPerTrade;
	const riskQuantity=riskBudget/(price*stopLossPercent);
	const maxNotionalQuantity=maxPositionUsd/price;
	const cashQuantity=balance/(price*(1+takerFee+slippageBps/10_000));
	const limits=[riskQuantity,maxNotionalQuantity,cashQuantity];
	if(availableQuantity!==undefined)limits.push(availableQuantity);
	const quantity=Math.min(...limits);
	return Number.isFinite(quantity)&&quantity>0?Number(quantity.toFixed(8)):0;
}
