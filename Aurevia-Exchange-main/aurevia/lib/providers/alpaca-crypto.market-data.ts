import type {MarketBar,MarketQuote} from './contracts';

export type AlpacaCryptoMarketDataOptions={baseUrl:string;apiKey:string;fetcher?:typeof fetch};

type DataRecord=Record<string,unknown>;

function record(value:unknown):DataRecord|null{
	return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as DataRecord:null;
}

function finitePositive(value:unknown):number|null{
	const parsed=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN;
	return Number.isFinite(parsed)&&parsed>0?parsed:null;
}

function finiteNumber(value:unknown):number|null{
	const parsed=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN;
	return Number.isFinite(parsed)?parsed:null;
}

function timestamp(value:unknown):string|null{
	if(typeof value!=='string'&&typeof value!=='number')return null;
	const parsed=typeof value==='number'?new Date(value>1_000_000_000_000?value:value*1000):new Date(value);
	return Number.isFinite(parsed.getTime())?parsed.toISOString():null;
}

function quoteFromResponse(payload:unknown,symbol:string):MarketQuote{
	const root=record(payload);
	const quotes=record(root?.quotes);
	const item=record(quotes?.[symbol])||(Array.isArray(payload)?record(payload[0]):null);
	if(!item)throw new Error('ALPACA_MARKET_DATA_INVALID_QUOTE');
	const bid=finitePositive(item.bp??item.bid_price??item.bid);
	const ask=finitePositive(item.ap??item.ask_price??item.ask);
	const price=finitePositive(item.price);
	const asOf=timestamp(item.t??item.timestamp??item.time);
	if(!asOf||(!price&&bid===null&&ask===null))throw new Error('ALPACA_MARKET_DATA_INVALID_QUOTE');
	return {
		symbol,
		price,
		bid,
		ask,
		open:finitePositive(item.open),
		high:finitePositive(item.high),
		low:finitePositive(item.low),
		previousClose:finitePositive(item.previous_close??item.previousClose),
		volume:finiteNumber(item.volume),
		marketStatus:'UNKNOWN',
		source:'Alpaca Crypto',
		asOf,
	};
}

export class AlpacaCryptoMarketDataProvider {
	readonly name='alpaca-crypto-market-data';
	private readonly options:AlpacaCryptoMarketDataOptions;
	constructor(options:AlpacaCryptoMarketDataOptions){this.options=options}
	async getQuote(symbol:string):Promise<MarketQuote>{
		const response=await this.request(`/v1beta3/crypto/us/latest/quotes?symbols=${encodeURIComponent(symbol)}`);
		return quoteFromResponse(response,symbol);
	}
	async getLatestTrade(symbol:string):Promise<{price:number;asOf:string}>{
		const response=await this.request(`/v1beta3/crypto/us/latest/trades?symbols=${encodeURIComponent(symbol)}`);
		const trades=record(record(response)?.trades);
		const trade=record(trades?.[symbol]);
		const price=finitePositive(trade?.p??trade?.price);
		const asOf=timestamp(trade?.t??trade?.timestamp??trade?.time);
		if(price===null||!asOf)throw new Error('ALPACA_MARKET_DATA_INVALID_TRADE');
		return {price,asOf};
	}
	async getBars(symbol:string,from:string,to:string,interval:string):Promise<MarketBar[]>{
		const response=await this.request(`/v1beta3/crypto/us/historical/bars?symbols=${encodeURIComponent(symbol)}&start=${encodeURIComponent(from)}&end=${encodeURIComponent(to)}&timeframe=${encodeURIComponent(interval)}`);
		const bars=record(record(response)?.bars);
		const rows=Array.isArray(bars?.[symbol])?bars[symbol]:Array.isArray(response)?response:[];
		return rows.flatMap(value=>{
			const item=record(value);
			if(!item)return [];
			const open=finitePositive(item.o??item.open);
			const high=finitePositive(item.h??item.high);
			const low=finitePositive(item.l??item.low);
			const close=finitePositive(item.c??item.close);
			const time=timestamp(item.t??item.timestamp??item.time);
			if(open===null||high===null||low===null||close===null||!time)return [];
			const volume=finiteNumber(item.v??item.volume);
			return [{time,open,high,low,close,volume}];
		});
	}
	async healthCheck(){
		await this.getQuote('BTC/USD');
		return {connected:true,checkedAt:new Date().toISOString()};
	}
	private async request(path:string){
		const response=await (this.options.fetcher??fetch)(`${this.options.baseUrl.replace(/\/$/,'')}${path}`,{headers:{'x-api-key':this.options.apiKey}});
		if(!response.ok)throw new Error(`ALPACA_MARKET_DATA_ERROR:${response.status}`);
		try{return await response.json() as unknown}
		catch{throw new Error('ALPACA_MARKET_DATA_INVALID_RESPONSE')}
	}
}
