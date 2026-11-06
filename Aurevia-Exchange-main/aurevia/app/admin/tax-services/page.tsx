'use client';

import {useCallback,useEffect,useState} from 'react';
import {Eye,RefreshCw,ShieldCheck} from 'lucide-react';
import AdminNav from '@/components/AdminNav';

type AccessRow={id:string;userId:string;enabled:boolean;allowedServices:string;note:string|null;user:{email:string;name:string|null}};
type CaseRow={id:string;reference:string;status:string;serviceType:string;taxYear:number;submittedAt:string|null;user:{email:string;name:string|null}};
type TaxDocumentRow={id:string;filename:string;category:string};
type TaxCaseReview={id:string;reference:string;status:string;serviceType:string;taxYear:number;intake:unknown;user:{email:string}|null;documents:TaxDocumentRow[]};
type AdminTaxResponse={settings:{enabled:boolean}|null;access:AccessRow[];cases:CaseRow[]};

export default function AdminTaxServicesPage(){
	const [enabled,setEnabled]=useState(false);
	const [access,setAccess]=useState<AccessRow[]>([]);
	const [cases,setCases]=useState<CaseRow[]>([]);
	const [userId,setUserId]=useState('');
	const [selectedCase,setSelectedCase]=useState<TaxCaseReview|null>(null);
	const [status,setStatus]=useState('');
	const [userMessage,setUserMessage]=useState('');
	const [internalNote,setInternalNote]=useState('');
	const [error,setError]=useState('');
	const [message,setMessage]=useState('');
	const [loading,setLoading]=useState(true);
	const [busy,setBusy]=useState(false);

	const load=useCallback(async()=>{
		setLoading(true);
		try{
			const response=await fetch('/api/admin/tax-services',{cache:'no-store'});
			const result=await response.json() as AdminTaxResponse&{error?:string};
			if(!response.ok)throw new Error(result.error||'Forbidden');
			setEnabled(Boolean(result.settings?.enabled));
			setAccess(result.access||[]);
			setCases(result.cases||[]);
			setError('');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load tax admin.')}
		finally{setLoading(false)}
	},[]);

	useEffect(()=>{void load()},[load]);

	async function setModule(next:boolean){
		setBusy(true);setError('');setMessage('');
		try{
			const response=await fetch('/api/admin/tax-services',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:next})});
			const result=await response.json() as {error?:string};
			if(!response.ok)throw new Error(result.error||'Unable to update module.');
			setEnabled(next);setMessage(next?'Tax module enabled.':'Tax module disabled.');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to update module.')}
		finally{setBusy(false)}
	}

	async function grant(enabledFlag:boolean){
		if(!userId.trim())return;
		setBusy(true);setError('');setMessage('');
		try{
			const response=await fetch('/api/admin/tax-services',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({userId:userId.trim(),enabled:enabledFlag})});
			const result=await response.json() as TaxCaseReview&{error?:string};
			if(!response.ok)throw new Error(result.error||'Unable to update access.');
			setMessage(enabledFlag?'Access granted.':'Access revoked.');
			setUserId('');
			await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to update access.')}
		finally{setBusy(false)}
	}

	async function openCase(id:string){
		setBusy(true);setError('');
		try{
			const response=await fetch(`/api/admin/tax-services/cases/${id}`,{cache:'no-store'});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to open case.');
			setSelectedCase(result);setStatus(result.status);
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to open case.')}
		finally{setBusy(false)}
	}

	async function updateCase(){
		if(!selectedCase)return;
		setBusy(true);setError('');setMessage('');
		try{
			const response=await fetch(`/api/admin/tax-services/cases/${selectedCase.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:status||undefined,userMessage:userMessage||undefined,internalNote:internalNote||undefined})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to update case.');
			setMessage('Case updated.');setUserMessage('');setInternalNote('');
			await openCase(selectedCase.id);await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to update case.')}
		finally{setBusy(false)}
	}

	async function viewDoc(documentId:string){
		if(!selectedCase)return;
		try{
			const response=await fetch(`/api/admin/tax-services/cases/${selectedCase.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({documentId})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to open document.');
			if(result.url)window.open(result.url,'_blank','noopener,noreferrer');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to open document.')}
	}

	return <>
		<AdminNav/>
		<main className="account-page">
			<header className="account-heading"><div><span className="account-kicker">ADMIN</span><h1>Tax services</h1><p>Module access, intake review, private documents, and case workflow. Not an IRS portal.</p></div>
				<button type="button" className="btn bg-white/5" onClick={()=>void load()}><RefreshCw size={14}/>Refresh</button>
			</header>
			{error&&<p className="text-loss text-sm" role="alert">{error}</p>}
			{message&&<p className="text-profit text-sm" role="status">{message}</p>}
			{loading?<p className="muted">Loading…</p>:(
				<>
					<section className="card p-5">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div><h2 className="font-semibold">Module</h2><p className="text-sm muted">Global enablement for tax intake.</p></div>
							<button type="button" className={`btn ${enabled?'bg-profit text-black':'bg-gold text-black'}`} disabled={busy} onClick={()=>void setModule(!enabled)}>{enabled?'Disable module':'Enable module'}</button>
						</div>
					</section>
					<section className="card p-5 mt-4">
						<h2 className="font-semibold">User access</h2>
						<div className="mt-3 flex flex-wrap gap-2">
							<input className="input min-w-[240px]" placeholder="User ID" value={userId} onChange={e=>setUserId(e.target.value)}/>
							<button type="button" className="btn bg-gold text-black" disabled={busy} onClick={()=>void grant(true)}>Grant access</button>
							<button type="button" className="btn bg-white/10" disabled={busy} onClick={()=>void grant(false)}>Revoke</button>
						</div>
						<ul className="mt-4 divide-y divide-white/10">{access.map(row=>(
							<li key={row.id} className="py-2 text-sm flex flex-wrap justify-between gap-2"><span>{row.user.email} · {row.enabled?'enabled':'revoked'}</span><span className="muted font-mono text-xs">{row.userId}</span></li>
						))}</ul>
					</section>
					<section className="card p-5 mt-4">
						<h2 className="font-semibold">Cases</h2>
						<ul className="mt-3 divide-y divide-white/10">{cases.map(item=>(
							<li key={item.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
								<div><b>{item.reference}</b><p className="text-xs muted">{item.user.email} · {item.taxYear} · {item.status.replaceAll('_',' ')}</p></div>
								<button type="button" className="text-link" onClick={()=>void openCase(item.id)}><Eye size={14}/> Review</button>
							</li>
						))}</ul>
					</section>
					{selectedCase&&(
						<section className="card p-5 mt-4">
							<h2 className="font-semibold flex items-center gap-2"><ShieldCheck size={16} className="gold"/> {selectedCase.reference}</h2>
							<p className="text-sm muted mt-1">{selectedCase.user?.email} · {selectedCase.serviceType} · {selectedCase.taxYear}</p>
							<pre className="tax-review-box mt-3 text-xs whitespace-pre-wrap">{JSON.stringify(selectedCase.intake,null,2)}</pre>
							<div className="mt-3">
								<h3 className="text-sm font-semibold">Documents</h3>
								<ul className="mt-2 space-y-1">{selectedCase.documents.map(doc=>(
									<li key={doc.id} className="text-sm flex justify-between gap-2"><span>{doc.filename} · {doc.category}</span><button type="button" className="text-link" onClick={()=>void viewDoc(doc.id)}>Open</button></li>
								))}</ul>
							</div>
							<div className="mt-4 grid gap-3 sm:grid-cols-2">
								<label className="text-xs muted">Status
									<select className="input mt-1" value={status} onChange={e=>setStatus(e.target.value)}>
										{['SUBMITTED','AWAITING_INITIAL_REVIEW','UNDER_REVIEW','AWAITING_TAXPAYER_INFO','INFORMATION_RECEIVED','REVIEW_COMPLETED','PREPARATION_COMPLETED','CLOSED','CANCELLED','DECLINED'].map(v=><option key={v} value={v}>{v}</option>)}
									</select>
								</label>
								<label className="text-xs muted sm:col-span-2">Message to taxpayer<textarea className="input mt-1 min-h-20" value={userMessage} onChange={e=>setUserMessage(e.target.value)}/></label>
								<label className="text-xs muted sm:col-span-2">Internal note<textarea className="input mt-1 min-h-20" value={internalNote} onChange={e=>setInternalNote(e.target.value)}/></label>
							</div>
							<button type="button" className="btn bg-gold text-black mt-3" disabled={busy} onClick={()=>void updateCase()}>{busy?'Saving…':'Update case'}</button>
						</section>
					)}
				</>
			)}
		</main>
	</>;
}
