'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowRight,BrainCircuit,RefreshCw,ShieldCheck} from 'lucide-react';
import {formatUsd} from '@/lib/currency-format';

type Recommendation={
	instrumentId:string;
	symbol:string;
	name:string;
	action:'BUY'|'SELL';
	quantity:number;
	entryPrice:number;
	observedAt:string;
	stopLossPrice:number|null;
	takeProfitPrice:number|null;
	rationale:string;
	strategy:string;
	marketDataLabel:string;
	risk:{riskPerTradePercent:number;maxPositionUsd:number;stopLossPercent:number;takeProfitPercent:number;feeRate:number;spreadBps:number;slippageBps:number};
};
type ResponseData={status:'ready'|'disabled'|'no_signal';message?:string;evaluationIntervalSeconds:number;recommendations:Recommendation[]};

export default function DemoAiTradingPanel(){
	const [data,setData]=useState<ResponseData|null>(null);
	const [error,setError]=useState('');
	const [loading,setLoading]=useState(false);
	const evaluationInterval=useRef(300);
	const load=useCallback(async()=>{
		setLoading(true);
		try{
			const response=await fetch('/api/demo/ai-recommendations',{cache:'no-store'});
			const result=await response.json() as ResponseData|{error?:string};
			if(!response.ok)throw new Error('error'in result?result.error||'AI recommendations are unavailable.':'AI recommendations are unavailable.');
			const payload=result as ResponseData;
			setData(payload);evaluationInterval.current=Math.max(60,payload.evaluationIntervalSeconds);setError('');
		}catch(exception){setData(null);setError(exception instanceof Error?exception.message:'AI recommendations are unavailable.');}
		finally{setLoading(false);}
	},[]);

	useEffect(()=>{
		let cancelled=false;
		let timer:number|undefined;
		const poll=async()=>{
			await load();
			if(!cancelled)timer=window.setTimeout(()=>void poll(),evaluationInterval.current*1000);
		};
		void poll();
		return()=>{cancelled=true;if(timer!==undefined)window.clearTimeout(timer);};
	},[load]);

	return <section className="demo-ai-panel" aria-labelledby="demo-ai-heading">
		<header><div><span className="demo-ai-kicker"><BrainCircuit size={14}/> DEMO-ONLY ASSISTANCE</span><h2 id="demo-ai-heading">AI trade ideas</h2><p>Recommendations only. Review and submit any trade yourself.</p></div><button type="button" className="demo-ai-refresh" onClick={()=>void load()} disabled={loading} aria-label="Refresh AI recommendations"><RefreshCw size={14} className={loading?'is-spinning':''}/></button></header>
		{error&&<p className="demo-ai-message" role="status">{error}</p>}
		{!error&&data&&data.recommendations.length===0&&<p className="demo-ai-message" role="status">{data.message||'No recommendation is currently available.'}</p>}
		{data?.recommendations.map(item=><article className="demo-ai-recommendation" key={`${item.instrumentId}:${item.action}`}>
			<div className="demo-ai-recommendation-title"><div><span>{item.strategy.replaceAll('_',' ').toUpperCase()} · {item.marketDataLabel}</span><h3>{item.action} {item.symbol}</h3></div><span className={`demo-ai-side ${item.action.toLowerCase()}`}>{item.action}</span></div>
			<p>{item.rationale}</p>
			<dl><div><dt>Reference entry</dt><dd>{formatUsd(item.entryPrice)}</dd></div><div><dt>Suggested size</dt><dd>{item.quantity.toLocaleString(undefined,{maximumFractionDigits:8})}</dd></div><div><dt>Stop-loss estimate</dt><dd>{item.stopLossPrice===null?'Position exit only':formatUsd(item.stopLossPrice)}</dd></div><div><dt>Take-profit estimate</dt><dd>{item.takeProfitPrice===null?'Position exit only':formatUsd(item.takeProfitPrice)}</dd></div></dl>
			<small><ShieldCheck size={12}/> Risk cap {item.risk.riskPerTradePercent.toFixed(2)}% · max position {formatUsd(item.risk.maxPositionUsd)} · fee {((item.risk.feeRate)*100).toFixed(3)}% · spread/slippage {item.risk.spreadBps.toFixed(1)}/{item.risk.slippageBps.toFixed(1)} bps. Market quote captured {new Date(item.observedAt).toLocaleTimeString()}.</small>
			<Link href={`/trade?instrumentId=${encodeURIComponent(item.instrumentId)}&side=${item.action}&quantity=${encodeURIComponent(String(item.quantity))}`}>Review in trade terminal <ArrowRight size={14}/></Link>
		</article>)}
		<footer>Uses timestamped Aurevia DEMO prices. Recommendations are not orders, are not guaranteed, and may be stale; order submission rechecks price, cash, mode and risk limits.</footer>
	</section>;
}
