'use client';

import {FormEvent,useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,ExternalLink,RefreshCw,Search,ShieldCheck} from 'lucide-react';
import AdminNav from '@/components/AdminNav';

type VerifiedAccount={
	id:string;email:string;name:string|null;status:'ACTIVE'|'FROZEN'|'SUSPENDED'|'CLOSED';accountMode:'DEMO'|'REAL';approvedTier:number;createdAt:string;
	kyc:{legalName:string|null;dob:string|null;address:string|null;idType:string|null;idNumber:string|null;submittedAt:string|null;reviewedAt:string|null;reviewNote:string|null}|null;
	kycDocuments:Array<{id:string;kind:string;filename:string;mimeType:string;size:number;status:string;uploadedAt:string;reviewedAt:string|null;reviewNote:string|null}>;
	approval:{at:string;reviewedBy:{name:string|null;email:string}|null}|null;
};
type Results={items:VerifiedAccount[];total:number;page:number;pageSize:number;totalPages:number};

export default function VerifiedAccounts(){
	const [results,setResults]=useState<Results>({items:[],total:0,page:1,pageSize:25,totalPages:0});
	const [search,setSearch]=useState('');
	const [tier,setTier]=useState('');
	const [status,setStatus]=useState('');
	const [page,setPage]=useState(1);
	const [loading,setLoading]=useState(true);
	const [busyUser,setBusyUser]=useState('');
	const [busyDocument,setBusyDocument]=useState('');
	const [error,setError]=useState('');
	const [message,setMessage]=useState('');

	const load=useCallback(async()=>{
		setLoading(true);setError('');
		const params=new URLSearchParams({page:String(page)});
		if(search.trim())params.set('search',search.trim());
		if(tier)params.set('tier',tier);
		if(status)params.set('status',status);
		try{
			const response=await fetch(`/api/admin/verified-accounts?${params}`,{cache:'no-store'});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to load verified accounts.');
			setResults(result);
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load verified accounts.')}
		finally{setLoading(false)}
	},[page,search,tier,status]);

	useEffect(()=>{void load()},[load]);

	function submitSearch(event:FormEvent<HTMLFormElement>){event.preventDefault();setPage(1);void load()}

	async function openDocument(documentId:string){
		setBusyDocument(documentId);setError('');
		try{
			const response=await fetch(`/api/admin/kyc/documents/${encodeURIComponent(documentId)}`,{cache:'no-store'});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to open this document.');
			window.open(result.url,'_blank','noopener,noreferrer');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to open this document.')}
		finally{setBusyDocument('')}
	}

	async function changeStatus(account:VerifiedAccount){
		const nextStatus=account.status==='ACTIVE'?'FROZEN':'ACTIVE';
		if(!window.confirm(`${nextStatus==='FROZEN'?'Freeze':'Reactivate'} ${account.name||account.email}?`))return;
		setBusyUser(account.id);setError('');setMessage('');
		try{
			const response=await fetch('/api/admin/users',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({userId:account.id,status:nextStatus})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to update account status.');
			setMessage(`${account.email} is now ${nextStatus.toLowerCase()}.`);await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to update account status.')}
		finally{setBusyUser('')}
	}

	return <><AdminNav/><main className="account-page">
		<header className="account-heading"><div><span className="account-kicker">ADMINISTRATION · ACCOUNT ACCESS</span><h1>Verified Accounts</h1><p>Approved identity reviews from the account database.</p></div><div className="flex gap-2"><Link className="button-secondary" href="/admin"><ArrowLeft size={14}/> Admin home</Link><button className="icon-action" type="button" aria-label="Refresh verified accounts" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/></button></div></header>
		{message&&<p className="mb-3 text-sm text-profit" role="status">{message}</p>}{error&&<div className="account-callout mb-3" role="alert"><span>{error}</span><button className="text-link" type="button" disabled={loading} onClick={()=>void load()}>Retry</button></div>}
		<section className="account-panel card p-4 sm:p-5">
			<div className="account-panel-title"><div><h2>Approved users</h2><p className="account-panel-subtitle">{results.total} accounts · approval requires administrator review and approved identity evidence.</p></div><ShieldCheck size={18} className="gold"/></div>
			<form className="mt-4 grid gap-3 sm:grid-cols-[minmax(220px,1fr)_140px_160px_auto]" onSubmit={submitSearch}>
				<label className="account-label">Search<input className="input min-h-11" value={search} maxLength={120} onChange={event=>{setSearch(event.target.value);setPage(1)}} placeholder="Name, email, or account reference"/></label>
				<label className="account-label">Tier<select className="input min-h-11" value={tier} onChange={event=>{setTier(event.target.value);setPage(1)}}><option value="">All tiers</option><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option></select></label>
				<label className="account-label">Account status<select className="input min-h-11" value={status} onChange={event=>{setStatus(event.target.value);setPage(1)}}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="FROZEN">Frozen</option><option value="SUSPENDED">Suspended</option><option value="CLOSED">Closed</option></select></label>
				<button className="btn min-h-11 self-end bg-gold px-4 text-black" type="submit"><Search size={15}/>Search</button>
			</form>
			{loading?<p className="account-empty" role="status">Loading verified accounts…</p>:results.items.length?<div className="mt-3 divide-y divide-white/10">
				{results.items.map(account=><details className="py-3" key={account.id}>
					<summary className="grid cursor-pointer list-none gap-2 rounded px-2 py-2 text-sm hover:bg-white/5 md:grid-cols-[minmax(180px,1.4fr)_minmax(180px,1.2fr)_90px_100px_110px_130px] md:items-center">
						<span className="min-w-0"><b className="block truncate">{account.name||account.kyc?.legalName||'Account holder'}</b><small className="block truncate muted">{account.email}</small></span>
						<span className="break-all font-mono text-xs muted">{account.id}</span><span>Tier {account.approvedTier}</span><span>{account.accountMode}</span><span>{account.status}</span><span className="text-xs muted">{account.approval?new Date(account.approval.at).toLocaleDateString():'Date unavailable'}</span>
					</summary>
					<div className="mt-2 grid gap-4 rounded border border-white/10 bg-black/10 p-3 lg:grid-cols-[1fr_auto]">
						<div><dl className="grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2"><div><dt className="text-xs muted">Approved</dt><dd>{account.approval?new Date(account.approval.at).toLocaleString():'Review date not recorded'}</dd></div><div><dt className="text-xs muted">Reviewed by</dt><dd>{account.approval?.reviewedBy?.name?`${account.approval.reviewedBy.name} · ${account.approval.reviewedBy.email}`:account.approval?.reviewedBy?.email||'Administrator not recorded'}</dd></div><div><dt className="text-xs muted">Registered</dt><dd>{new Date(account.createdAt).toLocaleDateString()}</dd></div><div><dt className="text-xs muted">Identity profile</dt><dd>{account.kyc?.legalName||'Not provided'} · {account.kyc?.idType||'No document type'}</dd></div>{account.kyc?.dob&&<div><dt className="text-xs muted">Date of birth</dt><dd>{account.kyc.dob.slice(0,10)}</dd></div>}{account.kyc?.address&&<div className="sm:col-span-2"><dt className="text-xs muted">Submitted address</dt><dd className="break-words">{account.kyc.address}</dd></div>}{account.kyc?.idNumber&&<div><dt className="text-xs muted">Identity number</dt><dd>••••{account.kyc.idNumber.slice(-4)}</dd></div>}{account.kyc?.reviewNote&&<div className="sm:col-span-2"><dt className="text-xs muted">Review note</dt><dd>{account.kyc.reviewNote}</dd></div>}</dl>
							<div className="mt-4"><h3 className="text-sm font-semibold">Identity documents</h3>{account.kycDocuments.length?<ul className="divide-y divide-white/10">{account.kycDocuments.map(document=><li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" key={document.id}><span className="min-w-0"><b className="break-all">{document.filename}</b><small className="block muted">{document.kind.replaceAll('_',' ')} · {document.status.replaceAll('_',' ')} · {new Date(document.uploadedAt).toLocaleDateString()}</small></span><button className="text-link min-h-10" type="button" disabled={busyDocument===document.id} onClick={()=>void openDocument(document.id)}>{busyDocument===document.id?'Opening…':<>View private file <ExternalLink size={13}/></>}</button></li>)}</ul>:<p className="mt-2 text-sm muted">No documents are currently available.</p>}</div>
						</div><button className="btn min-h-10 self-start bg-white/5" type="button" disabled={busyUser===account.id||!['ACTIVE','FROZEN'].includes(account.status)} onClick={()=>void changeStatus(account)}>{busyUser===account.id?'Saving…':account.status==='ACTIVE'?'Freeze account':'Reactivate account'}</button>
					</div>
				</details>)}
			</div>:<p className="account-empty">No approved accounts match these filters.</p>}
			<footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 text-sm"><span className="muted">Page {Math.max(page,1)} of {Math.max(results.totalPages,1)}</span><div className="flex gap-2"><button className="btn min-h-10 bg-white/5" type="button" disabled={loading||page<=1} onClick={()=>setPage(value=>Math.max(1,value-1))}>Previous</button><button className="btn min-h-10 bg-white/5" type="button" disabled={loading||page>=results.totalPages} onClick={()=>setPage(value=>value+1)}>Next</button></div></footer>
		</section>
	</main></>;
}