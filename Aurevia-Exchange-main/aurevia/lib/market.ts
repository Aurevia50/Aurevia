import type {Instrument} from '@prisma/client';
import {db} from './db';
import {processOpenOrders} from './orders';

export type MarketDataMode='SIMULATED'|'LIVE';
export type MarketUpdate={symbol:string;price:number;change:number;source:string;dataMode:MarketDataMode;lastUpdatedAt:string};
export interface MarketDataProvider{
	source:string;
	dataMode:MarketDataMode;
	getInstruments():Promise<Instrument[]>;
	tick():Promise<MarketUpdate[]>;
}

const simulatedDatabaseProvider:MarketDataProvider={
	source:'Aurevia DEMO market feed',
	dataMode:'SIMULATED',
	getInstruments(){return db.instrument.findMany({where:{enabled:true},orderBy:{symbol:'asc'}});},
	async tick(){
		const instruments=await db.instrument.findMany({where:{enabled:true}});
		const timestamp=new Date();
		const updates:MarketUpdate[]=[];
		for(const instrument of instruments){
			const previous=Number(instrument.price);
			const price=nextPrice(previous);
			const volume=Math.max(0.01,Math.abs(price-previous)*100);
			const candleTime=new Date(Math.floor(timestamp.getTime()/60000)*60000);
			await db.instrument.update({where:{id:instrument.id},data:{price}});
			await db.candle.upsert({
				where:{instrumentId_ts:{instrumentId:instrument.id,ts:candleTime}},
				update:{close:price,high:Math.max(previous,price),low:Math.min(previous,price),volume:{increment:volume}},
				create:{instrumentId:instrument.id,ts:candleTime,open:previous,high:Math.max(previous,price),low:Math.min(previous,price),close:price,volume},
			});
			updates.push({symbol:instrument.symbol,price,change:(price-previous)/previous,source:this.source,dataMode:this.dataMode,lastUpdatedAt:timestamp.toISOString()});
		}
		await processOpenOrders();
		return updates;
	},
};

let activeProvider:MarketDataProvider=simulatedDatabaseProvider;

export function setMarketDataProvider(provider:MarketDataProvider){activeProvider=provider;}
export function getMarketDataProvider(){return activeProvider;}
export function nextPrice(price:number){
	if(!Number.isFinite(price)||price<=0)throw new Error('INVALID_SIMULATED_PRICE');
	let state=Math.floor(price*1_000_000)>>>0;
	state^=state<<13;state^=state>>>17;state^=state<<5;
	state>>>=0;
	const movement=(state/0x1_0000_0000-.5)*0.006;
	return Math.max(0.000001,price*(1+movement));
}

export async function getMarket(){
	const provider=getMarketDataProvider();
	const instruments=await provider.getInstruments();
	return instruments.map(instrument=>({...instrument,source:provider.source,dataMode:provider.dataMode,marketStatus:provider.dataMode==='SIMULATED'?'SIMULATED':'PROVIDER REPORTED',lastUpdatedAt:instrument.updatedAt}));
}

export async function tickMarkets(){return getMarketDataProvider().tick();}
