export type ChartCandle = {
	time:number;
	open:number;
	high:number;
	low:number;
	close:number;
	volume:number|null;
};

export function chartIntervalSeconds(interval:string|undefined,fallback=60){
	const match=interval?.match(/^(\d+)(m|h|d|w|mo)$/);
	if(!match)return fallback;
	const amount=Number(match[1]);
	const unitSeconds:Record<string,number>={m:60,h:3_600,d:86_400,w:604_800,mo:2_592_000};
	const unit=match[2];
	if(!Number.isFinite(amount)||amount<1||!(unit in unitSeconds))return fallback;
	return amount*unitSeconds[unit];
}

export function updateChartCandle(candles:ChartCandle[],price:number,timestamp:number,limit:number,intervalSeconds=60):ChartCandle[]{
	if(!Number.isFinite(price)||price<=0||!Number.isFinite(timestamp)||!Number.isInteger(limit)||limit<1||!Number.isFinite(intervalSeconds)||intervalSeconds<1)return candles;
	const time=Math.floor(timestamp/1000/intervalSeconds)*intervalSeconds;
	const latest=candles[candles.length-1];
	if(latest&&time<latest.time)return candles;
	if(latest&&time===latest.time){
		return [
			...candles.slice(0,-1),
			{...latest,high:Math.max(latest.high,price),low:Math.min(latest.low,price),close:price},
		].slice(-limit);
	}
	return [
		...candles,
		{time,open:price,high:price,low:price,close:price,volume:null},
	].slice(-limit);
}
