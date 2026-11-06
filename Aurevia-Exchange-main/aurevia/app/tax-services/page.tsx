'use client';

import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {FileText,LockKeyhole,Plus,RefreshCw} from 'lucide-react';
import Nav from '@/components/Nav';

type Access={moduleEnabled:boolean;hasAccess:boolean;services:Array<{value:string;label:string}>};
type CaseRow={id:string;reference:string;status:string;serviceType:string;taxYear:number;updatedAt:string};

export default function TaxServicesPage(){
	const router=useRouter();
	const [access,setAccess]=useState<Access|null>(null);
	const [cases,setCases]=useState<CaseRow[]>([]);
	const [error,setError]=useState('');
	const [loading,setLoading]=useState(true);
	const [serviceType,setServiceType]=useState('');
	const [taxYear,setTaxYear]=useState(new Date().getFullYear()-1);
	const [busy,setBusy]=useState(false);

	const load=useCallback(async()=>{
		setLoading(true);
		try{
			const accessRes=await fetch('/api/tax-services/access',{cache:'no-store'});
			const accessJson=await accessRes.json();
			if(!accessRes.ok)throw new Error(accessJson.error||'Unable to load access.');
			setAccess(accessJson);
			if(accessJson.hasAccess){
				const casesRes=await fetch('/api/tax-services/cases',{cache:'no-store'});
				const casesJson=await casesRes.json();
				if(casesRes.ok)setCases(casesJson.cases||[]);
				if(accessJson.services?.[0]&&!serviceType)setServiceType(accessJson.services[0].value);
			}
			setError('');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load tax services.');}
		finally{setLoading(false)}
	},[serviceType]);

	useEffect(()=>{void load()},[load]);

	useEffect(()=>{
		if(access?.hasAccess!==false)return;
		const refresh=()=>{if(document.visibilityState==='visible')void load()};
		const interval=window.setInterval(refresh,30_000);
		window.addEventListener('focus',refresh);
		return ()=>{
			window.clearInterval(interval);
			window.removeEventListener('focus',refresh);
		};
	},[access?.hasAccess,load]);

	async function startCase(){
		if(busy||!serviceType)return;
		setBusy(true);setError('');
		try{
			const response=await fetch('/api/tax-services/cases',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serviceType,taxYear,returnKind:'ORIGINAL'})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to start request.');
			router.push(`/tax-services/request/${result.id}`);
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to start request.');setBusy(false)}
	}

	return <>
		<Nav/>
		<main className="account-page">
			<header className="account-heading"><div><span className="account-kicker">TAX SERVICES</span><h1>Tax preparation requests</h1><p>Private intake for authorized federal tax preparation or review assistance. Submission is not an IRS filing.</p></div></header>
			{loading&&<p className="muted">Loading…</p>}
			{error&&<p className="text-loss text-sm" role="alert">{error}</p>}
			{access&&!access.hasAccess&&(
				<section className="card p-5">
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="flex items-start gap-3"><LockKeyhole className="gold" size={20}/><div>
							<h2 className="font-semibold">Access required</h2>
							<p className="mt-2 text-sm muted">This module is available only when an authorized administrator enables it for your account{access.moduleEnabled?'':', and when the tax module is turned on'}.</p>
							<p className="mt-2 text-xs muted">Access is checked again automatically while this page is open.</p>
						</div></div>
						<button type="button" className="btn bg-white/5" disabled={loading} onClick={()=>void load()}><RefreshCw size={14}/>{loading?'Checking…':'Check access'}</button>
					</div>
				</section>
			)}
			{access?.hasAccess&&(
				<>
					<section className="card p-5">
						<h2 className="font-semibold">Start a request</h2>
						<div className="mt-4 grid gap-3 sm:grid-cols-2">
							<label className="text-xs muted">Service<select className="input mt-1" value={serviceType} onChange={e=>setServiceType(e.target.value)}>{access.services.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
							<label className="text-xs muted">Tax year<input className="input mt-1" type="number" value={taxYear} onChange={e=>setTaxYear(Number(e.target.value))}/></label>
						</div>
						<button type="button" className="btn bg-gold text-black mt-4" disabled={busy||!serviceType} onClick={()=>void startCase()}><Plus size={14}/>{busy?'Creating…':'Continue intake'}</button>
					</section>
					<section className="mt-4 card p-5">
						<h2 className="font-semibold">Your requests</h2>
						{cases.length===0?<p className="mt-3 text-sm muted">No tax requests yet.</p>:(
							<ul className="mt-3 divide-y divide-white/10">{cases.map(item=>(
								<li key={item.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
									<div><b>{item.reference}</b><p className="text-xs muted">{item.serviceType.replaceAll('_',' ')} · {item.taxYear} · {item.status.replaceAll('_',' ')}</p></div>
									<Link className="text-link" href={`/tax-services/request/${item.id}`}><FileText size={14}/> Open</Link>
								</li>
							))}</ul>
						)}
					</section>
				</>
			)}
		</main>
	</>;
}
