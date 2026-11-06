'use client';

import {useCallback,useEffect,useState} from 'react';
import {Activity,RefreshCw,Sparkles,TrendingDown,TrendingUp} from 'lucide-react';
import AdminNav from '@/components/AdminNav';

type Instrument={id:string;symbol:string;name:string;price:string|number;enabled:boolean;updatedAt:string};
type MarketActivity={id:string;action:string;entityId:string|null;symbol:string|null;direction:'UP'|'DOWN'|null;previousPrice:string|null;newPrice:string|null;volatilityPercent:string|null;dataMode:'SIMULATED'|null;createdAt:string};
type MarketReviewData={generatedAt:string;instruments:Instrument[];activities:MarketActivity[]};
type AiReview={summary:string;highlights:Array<{activityId:string;observation:string}>};
type Direction='UP'|'DOWN';

export default function AdminMarkets(){
	const [marketData,setMarketData]=useState<MarketReviewData|null>(null);
	const [symbol,setSymbol]=useState('BTC/USD');
	const [direction,setDirection]=useState<Direction>('UP');
	const [volatilityPercent,setVolatilityPercent]=useState('0.5');
	const [busy,setBusy]=useState(false);
	const [reviewBusy,setReviewBusy]=useState(false);
	const [error,setError]=useState('');
	const [reviewError,setReviewError]=useState('');
	const [review,setReview]=useState<{review:AiReview;model:string;generatedAt:string}|null>(null);
	const [message,setMessage]=useState('');
	const load=useCallback(async()=>{
		try{
			const response=await fetch('/api/admin/market/review',{cache:'no-store'});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to load market activity.');
			setMarketData(result);
			setError('');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load market activity.')}
	},[]);
	useEffect(()=>{void load()},[load]);

	async function runReview(){
		if(reviewBusy)return;
		setReviewBusy(true);setReviewError('');
		try{
			const response=await fetch('/api/admin/market/review',{method:'POST',cache:'no-store'});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to generate AI market review.');
			setReview(result);
		}catch(exception){setReviewError(exception instanceof Error?exception.message:'Unable to generate AI market review.')}
		finally{setReviewBusy(false)}
	}

	async function updateMarket(){
		if(busy)return;
		setBusy(true);setError('');setMessage('');
		try{
			const response=await fetch('/api/admin/market/tick',{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({symbol,direction,volatilityPercent:Number(volatilityPercent)})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to update DEMO prices.');
			setMessage(`${result.symbol} DEMO price updated from ${result.previousPrice} to ${result.price}. Source: ${result.source}.`);
			await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to update DEMO prices.')}
		finally{setBusy(false)}
	}

	return <><AdminNav/><main className="account-page">
		<header className="account-heading"><div><span className="account-kicker">ADMINISTRATION · MARKET OPERATIONS</span><h1>Market management</h1><p>Manage supported instruments and explicitly generated DEMO price changes.</p></div><button type="button" className="icon-action" aria-label="Refresh market instruments" onClick={()=>void load()}><RefreshCw size={15}/></button></header>
		{message&&<p className="mb-3 text-sm text-profit" role="status">{message}</p>}{error&&<p className="mb-3 text-sm text-loss" role="alert">{error}</p>}
		<section className="account-panel card p-5">
			<div className="account-panel-title"><div><h2>Generate DEMO price update</h2><p className="account-panel-subtitle">Updates only the supported DEMO instrument, records a candle and audit event, and processes eligible DEMO orders. It never writes a live provider quote.</p></div><span className="status-pill mode-demo">DEMO</span></div>
			<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<label className="account-label">Instrument<select className="input min-h-11" value={symbol} onChange={event=>setSymbol(event.target.value)}>{['NVDA','BTC/USD','XAU/USD'].map(value=><option key={value}>{value}</option>)}</select></label>
				<label className="account-label">Direction<select className="input min-h-11" value={direction} onChange={event=>setDirection(event.target.value as Direction)}><option value="UP">UP</option><option value="DOWN">DOWN</option></select></label>
				<label className="account-label">Volatility (%)<input className="input min-h-11" type="number" min="0.01" max="25" step="0.01" value={volatilityPercent} onChange={event=>setVolatilityPercent(event.target.value)}/></label>
				<div className="flex items-end"><button type="button" disabled={busy} className="btn min-h-11 w-full bg-gold text-black disabled:opacity-50" onClick={()=>void updateMarket()}>{direction==='UP'?<TrendingUp size={15}/>:<TrendingDown size={15}/>} {busy?'Updating…':'Generate price update'}</button></div>
			</div>
		</section>
		<section className="account-panel card mt-4 p-5">
			<div className="account-panel-title"><div><h2><Sparkles size={16} className="gold"/> Market Review</h2><p className="account-panel-subtitle">AI reviews the current stored instrument snapshot and actual market-operation audit events. Generated review is informational and not a forecast.</p></div><button type="button" className="btn min-h-10 bg-white/5" disabled={reviewBusy||!marketData} onClick={()=>void runReview()}><Sparkles size={14}/>{reviewBusy?'Reviewing…':'Generate AI review'}</button></div>
			{reviewError&&<p className="mt-3 text-sm text-loss" role="alert">{reviewError}</p>}
			{review&&<div className="market-ai-review" aria-live="polite"><p>{review.review.summary}</p>{review.review.highlights.length>0&&<ul>{review.review.highlights.map(highlight=><li key={highlight.activityId}>{highlight.observation}</li>)}</ul>}<small>AI configuration: {review.model} · generated {new Date(review.generatedAt).toLocaleString()}</small></div>}
			{marketData&&<div className="market-review-source"><Activity size={14}/><span>AI input is limited to the current instrument snapshot and {marketData.activities.length} actual audit events from the last 24 hours. DEMO records are labeled; no live quote is implied.</span></div>}
		</section>
		<section className="account-panel card mt-4 p-5"><div className="account-panel-title"><div><h2>Supported instruments</h2><p className="account-panel-subtitle">Current stored DEMO prices; not current market quotations.</p></div><button type="button" className="icon-action" aria-label="Refresh market activity" onClick={()=>void load()}><RefreshCw size={15}/></button></div>
		{marketData?.instruments.length?<div className="account-table-wrap"><table className="account-table"><thead><tr><th>Symbol</th><th>Instrument</th><th>Stored DEMO price</th><th>Status</th><th>Last changed</th></tr></thead><tbody>{marketData.instruments.map(item=><tr key={item.id}><td>{item.symbol}</td><td>{item.name}</td><td>{Number(item.price).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:8})}</td><td>{item.enabled?'Enabled':'Disabled'}</td><td>{new Date(item.updatedAt).toLocaleString()}</td></tr>)}</tbody></table></div>:<p className="account-empty">{marketData?'No supported instruments are configured.':'Loading supported instruments…'}</p>}
		</section>
		<section className="account-panel card mt-4 p-5"><div className="account-panel-title"><div><h2>Recent market activity</h2><p className="account-panel-subtitle">Stored instrument and DEMO audit events from the last 24 hours. This is not a live-provider execution feed.</p></div><span className="status-pill">{marketData?.activities.length??0} EVENTS</span></div>
			{marketData?.activities.length?<div className="account-table-wrap"><table className="account-table"><thead><tr><th>Time</th><th>Activity</th><th>Instrument</th><th>Price change</th><th>Source</th></tr></thead><tbody>{marketData.activities.map(activity=><tr key={activity.id}><td>{new Date(activity.createdAt).toLocaleString()}</td><td>{activity.action==='SIMULATED_MARKET_TICK'?'DEMO PRICE UPDATE':activity.action.replaceAll('_',' ')}</td><td>{activity.symbol||activity.entityId||'—'}</td><td>{activity.previousPrice&&activity.newPrice?`${activity.previousPrice} → ${activity.newPrice}`:'—'}</td><td>{activity.dataMode==='SIMULATED'?'DEMO':activity.dataMode||'Internal audit'}</td></tr>)}</tbody></table></div>:<p className="account-empty">{marketData?'No market audit events were recorded in the last 24 hours.':'Loading market activity…'}</p>}
		</section>
	</main></>;
}
