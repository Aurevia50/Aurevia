'use client';

import {useEffect,useState} from 'react';
import {MARKET_UI_REFRESH_INTERVAL_MS} from '@/lib/live-market';

type MarketTickerItem={symbol:string;price:number;change?:number};

type LiveQuotePayload={asset:{id:string;name:string};price:number;changePercent:number};

export default function MarketTicker({initial}:{initial:MarketTickerItem[]}){
	const [markets,setMarkets]=useState(initial);
	useEffect(()=>{
		let active=true;
		async function refresh(){
			try{
				const symbols=['DJI','SPX','NASDAQ','BTC','AAPL','MSFT','NVDA','AMZN','GOOGL','TSLA','EURGBP'].join(',');
				const response=await fetch(`/api/live-markets?symbols=${encodeURIComponent(symbols)}`,{cache:'no-store'});
				const payload=await response.json() as {quotes?:LiveQuotePayload[]};
				const updates=(payload.quotes??[]).filter((item):item is LiveQuotePayload=>Boolean(item)&&typeof item.price==='number'&&typeof item.asset?.id==='string');
				if(!response.ok||!updates.length)return;
				if(active)setMarkets(updates.map(item=>({symbol:item.asset.id,price:Number(item.price),change:Number(item.changePercent)/100})));
			}catch{}
		}
		const timer=window.setInterval(()=>void refresh(),MARKET_UI_REFRESH_INTERVAL_MS);
		return()=>{active=false;window.clearInterval(timer)};
	},[]);
	return <div className="market-ticker-track" aria-label="Configured DEMO market instruments">{markets.map(market=><article key={market.symbol} className="market-ticker-card"><div className="market-ticker-head"><span>{market.symbol}</span><small>DEMO</small></div><b>{market.price.toLocaleString(undefined,{maximumFractionDigits:4})}</b>{market.change===undefined?<span className="market-ticker-source">In-app price</span>:<span className={`market-ticker-change ${market.change>=0?'is-up':'is-down'}`}>Last update {market.change>=0?'+':''}{(market.change*100).toFixed(2)}%</span>}</article>)}</div>;
}
