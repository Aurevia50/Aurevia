'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import Nav from '@/components/Nav';
import AureviaCardVisual from '@/components/AureviaCardVisual';

type CatalogItem={id:string;key:string;displayName:string;description:string|null;designTier:'SIGNATURE'|'GOLD'|'BLACK';orderPrice:string;currency:string};

export default function CardApplyPage(){
	const router=useRouter();
	const [items,setItems]=useState<CatalogItem[]>([]);
	const [selected,setSelected]=useState('');
	const [accepted,setAccepted]=useState(false);
	const [busy,setBusy]=useState(false);
	const [error,setError]=useState('');
	const [name,setName]=useState('Cardholder');

	useEffect(()=>{
		void fetch('/api/cards/catalog',{cache:'no-store'}).then(async r=>{
			const j=await r.json();
			if(r.ok){setItems(j.items||[]);if(j.items?.[0])setSelected(j.items[0].id)}
		});
		void fetch('/api/profile',{cache:'no-store'}).then(async r=>{
			const j=await r.json();
			if(r.ok&&j.name)setName(j.name);
		}).catch(()=>{});
	},[]);

	const current=items.find(i=>i.id===selected);

	async function submit(){
		if(!selected||!accepted||busy)return;
		setBusy(true);setError('');
		try{
			const response=await fetch('/api/cards/applications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({catalogItemId:selected,disclosureAccepted:true})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to submit.');
			router.push('/cards');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to submit.');setBusy(false)}
	}

	return <>
		<Nav/>
		<main className="account-page mobile-card-page">
			<header className="account-heading"><div><span className="account-kicker">APPLY</span><h1>Choose a card</h1><p>Select a design. Order price is set by administrators and confirmed at submission.</p></div>
				<Link href="/cards" className="text-link">Back</Link>
			</header>
			{error&&<p className="text-loss text-sm" role="alert">{error}</p>}
			<div className="grid gap-4 lg:grid-cols-2">
				<section className="card p-5 mobile-card-item">
					{items.map(item=>(
						<label key={item.id} className={`flex gap-3 p-3 rounded-xl border mb-2 cursor-pointer ${selected===item.id?'border-[rgba(212,167,44,.45)] bg-[rgba(212,167,44,.08)]':'border-white/10'}`}>
							<input type="radio" name="card" checked={selected===item.id} onChange={()=>setSelected(item.id)}/>
							<span><b>{item.displayName}</b><br/><span className="text-xs muted">{item.description}</span><br/><span className="text-sm gold">{item.orderPrice} {item.currency}</span></span>
						</label>
					))}
					<label className="flex items-start gap-2 text-sm mt-4"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>I understand this is an internal Aurevia platform card feature and is not valid for real-world payments or external card networks.</span></label>
					<button type="button" className="btn bg-gold text-black mt-4" disabled={!accepted||!selected||busy} onClick={()=>void submit()}>{busy?'Submitting…':'Submit application'}</button>
				</section>
				<section className="card p-5 mobile-card-item">
					{current&&<AureviaCardVisual designTier={current.designTier} cardholderName={name} displayName={current.displayName}/>}
					<p className="card-disclosure">Design preview. Administrator approval required before issuance.</p>
				</section>
			</div>
		</main>
	</>;
}
