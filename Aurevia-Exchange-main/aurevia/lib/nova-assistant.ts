export type TradePlanInput={risk:number;entry:number;stop:number;target?:number;side?:'LONG'|'SHORT'};
export type DemoOrderIntent={side:'BUY'|'SELL';quantity:number;symbol:string};
export type TradePlan={
	side:'LONG'|'SHORT'|null;
	quantity:number;
	risk:number;
	entry:number;
	stop:number;
	target:number|null;
	potentialReward:number|null;
	rewardRiskRatio:number|null;
};

export function parseDemoOrderIntent(question:string):DemoOrderIntent|null{
	const match=question.match(/\b(?:buy|sell)\s+([\d,]+(?:\.\d+)?)\s+([A-Z0-9][A-Z0-9./_-]{0,19})\b/i);
	if(!match)return null;
	const quantity=Number(match[1].replaceAll(',',''));
	if(!Number.isFinite(quantity)||quantity<=0||quantity>1_000_000_000)return null;
	return {side:/\bbuy\b/i.test(match[0])?'BUY':'SELL',quantity,symbol:match[2].toUpperCase()};
}

export function hasDemoOrderIntent(question:string):boolean{
	return /\b(?:buy|sell)\b/i.test(question)&&/\b(?:order|trade|prepare|submit|buy|sell)\b/i.test(question);
}

export function requestsUnsupportedOrderType(question:string):boolean{
	return /\b(?:limit|stop(?:\s*[- ]?\s*loss)?)\b/i.test(question);
}

function readAmount(question:string,label:RegExp):number|undefined{
	const match=label.exec(question);
	if(!match)return undefined;
	const value=Number(match[1].replaceAll(',',''));
	return Number.isFinite(value)&&value>0?value:undefined;
}

function formatAmount(value:number):string{
	return new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(value);
}

export function parseTradePlan(question:string):TradePlanInput|null{
	const risk=readAmount(question,/\b(?:risk|risk budget|risking)\b(?:\s+(?:of|is))?\s*[:=]?\s*\$?([\d,]+(?:\.\d+)?)/i);
	const entry=readAmount(question,/\bentry\b(?:\s+(?:price|at|of|is))?\s*[:=]?\s*\$?([\d,]+(?:\.\d+)?)/i);
	const stop=readAmount(question,/\bstop(?:\s*[- ]?\s*loss)?\b(?:\s+(?:price|at|of|is))?\s*[:=]?\s*\$?([\d,]+(?:\.\d+)?)/i);
	const target=readAmount(question,/\btarget\b(?:\s+(?:price|at|of|is))?\s*[:=]?\s*\$?([\d,]+(?:\.\d+)?)/i);
	const direction=question.match(/\b(?:side\s*[:=]?\s*)?(long|short|buy|sell)\b/i)?.[1]?.toUpperCase();
	if(!risk||!entry||!stop||entry===stop)return null;
	const side=direction==='LONG'||direction==='BUY'?'LONG':direction==='SHORT'||direction==='SELL'?'SHORT':undefined;
	return {risk,entry,stop,...(target?{target}:{}),...(side?{side}:{})};
}

export function calculateTradePlan(input:TradePlanInput):TradePlan|null{
	if(!Number.isFinite(input.risk)||!Number.isFinite(input.entry)||!Number.isFinite(input.stop)||input.risk<=0||input.entry<=0||input.stop<=0||input.entry===input.stop)return null;
	if(input.target!==undefined&&(!Number.isFinite(input.target)||input.target<=0))return null;
	if(input.side==='LONG'&&input.stop>=input.entry||input.side==='SHORT'&&input.stop<=input.entry)return null;
	if(input.target!==undefined&&(!input.side||(input.side==='LONG'&&input.target<=input.entry)||(input.side==='SHORT'&&input.target>=input.entry)))return null;
	const quantity=input.risk/Math.abs(input.entry-input.stop);
	if(!Number.isFinite(quantity)||quantity>1_000_000_000)return null;
	const potentialReward=input.target===undefined?null:quantity*Math.abs(input.target-input.entry);
	if(potentialReward!==null&&!Number.isFinite(potentialReward))return null;
	return {
		side:input.side||null,
		quantity:Number(quantity.toFixed(6)),
		risk:input.risk,
		entry:input.entry,
		stop:input.stop,
		target:input.target??null,
		potentialReward:potentialReward===null?null:Number(potentialReward.toFixed(6)),
		rewardRiskRatio:potentialReward===null?null:Number((potentialReward/input.risk).toFixed(4)),
	};
}

export function formatTradePlan(plan:TradePlan):string{
	const stopDistance=Math.abs(plan.entry-plan.stop);
	const targetSummary=plan.target===null?'':` At the supplied target of ${formatAmount(plan.target)}, the gross price-distance reward would be about ${formatAmount(plan.potentialReward??0)} and the reward-to-risk ratio ${formatAmount(plan.rewardRiskRatio??0)}:1.`;
	const sideSummary=plan.side?` Direction: ${plan.side}.`:'';
	return `Using only the values you supplied (risk budget ${formatAmount(plan.risk)}, entry ${formatAmount(plan.entry)}, stop ${formatAmount(plan.stop)}), the arithmetic position size is ${formatAmount(plan.quantity)} units: risk budget divided by ${formatAmount(stopDistance)} entry-to-stop distance.${sideSummary}${targetSummary} This excludes fees, slippage, gaps, liquidity, and instrument-specific constraints. This is an educational estimate, not a recommendation or guaranteed outcome. No order was prepared or submitted; review all details in Trade.`;
}

export function missingTradePlanInputs(question:string):string{
	const missing=[
		!/\brisk(?: budget|ing)?\b/i.test(question)&&'a maximum risk amount',
		!/\bentry\b/i.test(question)&&'an entry price',
		!/\bstop(?:\s*[- ]?\s*loss)?\b/i.test(question)&&'a stop price',
		/\btarget\b|\brisk.reward\b|\brisk to reward\b/i.test(question)&&!/\b(?:side\s*[:=]?\s*)?(?:long|short|buy|sell)\b/i.test(question)&&'a direction (LONG or SHORT) when providing a target',
	].filter((value):value is string=>typeof value==='string');
	const request=missing.length?`provide ${missing.join(', ')}`:'provide valid positive values for risk, entry, and stop, with entry different from stop';
	return `To estimate position size, ${request}. For example: “calculate size: risk $100, entry $50, stop $45”. For a reward estimate, also provide a correctly oriented LONG or SHORT target. I will only calculate the estimate and will not submit an order.`;
}
