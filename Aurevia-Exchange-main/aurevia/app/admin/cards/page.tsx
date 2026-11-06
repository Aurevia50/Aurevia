'use client';

import {useCallback,useEffect,useState} from 'react';
import type {CardApplicationStatus,CardDesignTier,SimulatedCardStatus} from '@prisma/client';
import {CreditCard,RefreshCw} from 'lucide-react';
import AdminNav from '@/components/AdminNav';

type CatalogRow={id:string;displayName:string;designTier:CardDesignTier;enabled:boolean;orderPrice:string};
type ApplicationRow={id:string;reference:string;user:{email:string}|null;catalogItem:{displayName:string}|null;status:CardApplicationStatus;priceSnapshot:string;currencySnapshot:string;issuedCard:{id:string}|null};
type CardRow={id:string;displayName:string;user:{email:string}|null;referenceNumber:string;status:SimulatedCardStatus};
type AdminCardsResponse={catalog:CatalogRow[];applications:ApplicationRow[];cards:CardRow[]};

export default function AdminCardsPage(){
	const [catalog,setCatalog]=useState<CatalogRow[]>([]);
	const [applications,setApplications]=useState<ApplicationRow[]>([]);
	const [cards,setCards]=useState<CardRow[]>([]);
	const [error,setError]=useState('');
	const [message,setMessage]=useState('');
	const [loading,setLoading]=useState(true);
	const [busy,setBusy]=useState(false);

	const load=useCallback(async()=>{
		setLoading(true);
		try{
			const response=await fetch('/api/admin/cards',{cache:'no-store'});
			const result=await response.json() as AdminCardsResponse&{error?:string};
			if(!response.ok)throw new Error(result.error||'Forbidden');
			setCatalog(result.catalog||[]);setApplications(result.applications||[]);setCards(result.cards||[]);setError('');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load')}
		finally{setLoading(false)}
	},[]);

	useEffect(()=>{void load()},[load]);

	async function updatePrice(id:string,orderPrice:string){
		setBusy(true);setError('');setMessage('');
		try{
			const response=await fetch('/api/admin/cards/catalog',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id,orderPrice})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to update price');
			setMessage('Catalog updated.');await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to update price')}
		finally{setBusy(false)}
	}

	async function act(id:string,action:string,extra:Record<string,string>={}){
		setBusy(true);setError('');setMessage('');
		try{
			const response=await fetch(`/api/admin/cards/applications/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action,...extra})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Action failed');
			setMessage(`Action ${action} completed.`);await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Action failed')}
		finally{setBusy(false)}
	}

	return <>
		<AdminNav/>
		<main className="account-page">
			<header className="account-heading"><div><span className="account-kicker">ADMIN</span><h1>Card management</h1><p>Catalog pricing, applications, and issued platform cards.</p></div>
				<button type="button" className="btn bg-white/5" onClick={()=>void load()}><RefreshCw size={14}/>Refresh</button>
			</header>
			{error&&<p className="text-loss text-sm" role="alert">{error}</p>}
			{message&&<p className="text-profit text-sm" role="status">{message}</p>}
			{loading?<p className="muted">Loading…</p>:(
				<>
					<section className="card p-5">
						<h2 className="font-semibold">Catalog & pricing</h2>
						<ul className="mt-3 space-y-3">{catalog.map(item=>(
							<li key={item.id} className="flex flex-wrap items-end gap-2 border border-white/10 rounded-xl p-3">
								<div className="flex-1 min-w-[160px]"><b>{item.displayName}</b><p className="text-xs muted">{item.designTier} · {item.enabled?'enabled':'disabled'}</p></div>
								<label className="text-xs muted">Price<input className="input mt-1 w-28" defaultValue={item.orderPrice} id={`price-${item.id}`}/></label>
								<button type="button" className="btn bg-gold text-black" disabled={busy} onClick={()=>{
									const el=document.getElementById(`price-${item.id}`) as HTMLInputElement|null;
									if(el)void updatePrice(item.id,el.value);
								}}>Save</button>
								<button type="button" className="btn bg-white/10" disabled={busy} onClick={()=>void fetch('/api/admin/cards/catalog',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:item.id,enabled:!item.enabled})}).then(()=>load())}>{item.enabled?'Disable':'Enable'}</button>
							</li>
						))}</ul>
					</section>
					<section className="card p-5 mt-4">
						<h2 className="font-semibold flex items-center gap-2"><CreditCard size={16}/> Applications</h2>
						<ul className="mt-3 divide-y divide-white/10">{applications.map(app=>(
							<li key={app.id} className="py-3">
								<div className="flex flex-wrap justify-between gap-2 text-sm">
									<div><b>{app.reference}</b> · {app.user?.email}<p className="text-xs muted">{app.catalogItem?.displayName} · {app.status} · {app.priceSnapshot} {app.currencySnapshot}</p></div>
									<div className="flex flex-wrap gap-2">
										{!app.issuedCard&&<>
											<button type="button" className="btn bg-white/10" disabled={busy} onClick={()=>void act(app.id,'UNDER_REVIEW')}>Review</button>
											<button type="button" className="btn bg-profit text-black" disabled={busy} onClick={()=>void act(app.id,'APPROVE')}>Approve</button>
											<button type="button" className="btn bg-loss" disabled={busy} onClick={()=>void act(app.id,'DECLINE',{declineReason:'Declined by administrator'})}>Decline</button>
										</>}
										{app.issuedCard&&<>
											<button type="button" className="btn bg-white/10" disabled={busy} onClick={()=>void act(app.id,'SUSPEND')}>Suspend</button>
											<button type="button" className="btn bg-white/10" disabled={busy} onClick={()=>void act(app.id,'REACTIVATE')}>Reactivate</button>
											<button type="button" className="btn bg-loss" disabled={busy} onClick={()=>void act(app.id,'REVOKE')}>Revoke</button>
										</>}
									</div>
								</div>
							</li>
						))}</ul>
					</section>
					<section className="card p-5 mt-4">
						<h2 className="font-semibold">Issued cards</h2>
						<ul className="mt-3 divide-y divide-white/10">{cards.map(card=>(
							<li key={card.id} className="py-2 text-sm flex flex-wrap justify-between gap-2"><span>{card.displayName} · {card.user?.email}</span><span className="muted font-mono">{card.referenceNumber} · {card.status}</span></li>
						))}</ul>
					</section>
				</>
			)}
		</main>
	</>;
}
