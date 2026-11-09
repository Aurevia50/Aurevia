'use client';

import {useEffect,useState} from 'react';

type Rate={rate:string|number|null;source:string|null;observedAt:string|null;status:'CURRENT'|'STALE'|'INTERNAL'|'UNAVAILABLE'};
type Props={values:Array<{label:string;amount:string|null}>};
const currencies=['USD','EUR','GBP','NGN','CAD','AUD','CHF','JPY'];
const money=(amount:number,currency:string)=>new Intl.NumberFormat(undefined,{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(amount);

export default function DisplayCurrencyPanel({values}:Props){
	const [currency,setCurrency]=useState('USD');
	const [rate,setRate]=useState<Rate|null>(null);
	const [error,setError]=useState('');
	const [ready,setReady]=useState(false);
	const currentRate=rate?.rate!==null&&rate?.rate!==undefined&&Number.isFinite(Number(rate.rate))&&Number(rate.rate)>0?Number(rate.rate):null;
	useEffect(()=>{
		let active=true;
		void fetch('/api/currency-preference',{cache:'no-store'}).then(async response=>{
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Display currency preference unavailable.');
			if(active&&typeof result.currency==='string'&&currencies.includes(result.currency))setCurrency(result.currency);
		}).catch(exception=>{if(active)setError(exception instanceof Error?exception.message:'Display currency preference unavailable.')}).finally(()=>{if(active)setReady(true)});
		return()=>{active=false};
	},[]);
	useEffect(()=>{
		if(currency==='USD'){setRate(null);setError('');return}
		let active=true;
		setRate(null);setError('');
		void fetch(`/api/currency-rates?to=${encodeURIComponent(currency)}`,{cache:'no-store'}).then(async response=>{
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Exchange rate unavailable.');
			if(active)setRate(result as Rate);
		}).catch(exception=>{if(active)setError(exception instanceof Error?exception.message:'Exchange rate unavailable.')});
		return()=>{active=false};
	},[currency]);

	async function changeCurrency(value:string){
		const previous=currency;
		setError('');
		setCurrency(value);
		try{
			const response=await fetch('/api/currency-preference',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({currency:value})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to save display currency.');
			setCurrency(result.currency);
		}catch(exception){setCurrency(previous);setError(exception instanceof Error?exception.message:'Unable to save currency.')}
	}

	return <section className="account-panel card p-4" aria-label="Display currency">
		<div className="grid gap-3 sm:grid-cols-[minmax(170px,220px)_1fr] sm:items-start">
			<label className="account-label">Display currency<select aria-label="Preferred display currency" className="input mt-1 min-h-11" value={currency} disabled={!ready} onChange={event=>void changeCurrency(event.target.value)}>{currencies.map(code=><option key={code}>{code}</option>)}</select></label>
			<div className="text-sm" aria-live="polite">
				{currency==='USD'
					?<p>USD ledger values.</p>
					:currentRate!==null
						?<><p>Approximate · 1 USD = {currentRate.toLocaleString(undefined,{maximumSignificantDigits:8})} {currency}{rate?.status==='STALE'?' · rate may be outdated':''}</p><div className="grid gap-1 sm:grid-cols-2">{values.map(({label,amount})=><p key={label}><span className="muted">{label}: </span>{amount===null?'Unavailable':money(Number(amount)*currentRate,currency)}</p>)}</div></>
						:!error?<p className="text-xs text-amber-200">Loading {currency} rate…</p>:null}
				{error&&currency!=='USD'&&<p className="mt-1 text-xs text-loss" role="alert">{error}</p>}
			</div>
		</div>
	</section>;
}
