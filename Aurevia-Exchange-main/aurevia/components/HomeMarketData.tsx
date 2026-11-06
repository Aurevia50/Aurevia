'use client';

import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import type {MarketQuote} from '@/lib/live-market';

export type HomeMarketItem={id:string;symbol:string;name:string;price:number;change?:number;quote:MarketQuote};
export type HomeMarketDataStatus='LIVE'|'PARTIAL'|'INTERNAL'|'UNAVAILABLE';
type HomeMarketDataValue={
	markets:HomeMarketItem[];
	status:'loading'|'ready'|'error';
	marketDataStatus:HomeMarketDataStatus;
	updatedAt:number|null;
};

const marketSymbols=['DJI','SPX','NASDAQ','BTC','AAPL','MSFT','NVDA','AMZN','GOOGL','TSLA','EURGBP'].join(',');
const refreshIntervalMs=15_000;
const HomeMarketDataContext=createContext<HomeMarketDataValue|null>(null);

export function HomeMarketDataProvider({children}:{children:ReactNode}){
	const [data,setData]=useState<HomeMarketDataValue>({
		markets:[],
		status:'loading',
		marketDataStatus:'UNAVAILABLE',
		updatedAt:null,
	});

	useEffect(()=>{
		let active=true;
		let refreshing=false;
		async function refresh(){
			if(refreshing)return;
			refreshing=true;
			try{
				const response=await fetch(`/api/live-markets?symbols=${encodeURIComponent(marketSymbols)}`,{cache:'no-store'});
				const payload=await response.json() as {quotes?:Array<MarketQuote|{asset?:{id?:string};error?:string}>;marketDataStatus?:string};
				const quotes=(payload.quotes??[]).filter((item):item is MarketQuote=>'price'in item&&Number.isFinite(item.price)&&typeof item.asset?.id==='string');
				if(!response.ok||!quotes.length)throw new Error('Market data unavailable');
				if(!active)return;
				setData({
					markets:quotes.map(item=>({
						id:item.asset.id,
						symbol:item.asset.id,
						name:item.asset.name||item.asset.id,
						price:Number(item.price),
						change:Number(item.changePercent)/100,
						quote:item,
					})),
					status:'ready',
					marketDataStatus:payload.marketDataStatus==='LIVE'||payload.marketDataStatus==='PARTIAL'||payload.marketDataStatus==='INTERNAL'?payload.marketDataStatus:'UNAVAILABLE',
					updatedAt:Date.now(),
				});
			}catch{
				if(active)setData(current=>current.status==='ready'?current:{...current,status:'error'});
			}finally{
				refreshing=false;
			}
		}

		void refresh();
		const timer=window.setInterval(()=>void refresh(),refreshIntervalMs);
		return()=>{
			active=false;
			window.clearInterval(timer);
		};
	},[]);

	return <HomeMarketDataContext.Provider value={data}>{children}</HomeMarketDataContext.Provider>;
}

export function useHomeMarketData(){
	const data=useContext(HomeMarketDataContext);
	if(!data)throw new Error('useHomeMarketData must be used within HomeMarketDataProvider.');
	return data;
}
