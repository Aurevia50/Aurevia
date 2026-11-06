'use client';

import {useCallback,useEffect,useState} from 'react';
import {ExternalLink,RefreshCw} from 'lucide-react';
import ReceiptGenerator from '@/components/ReceiptGenerator';
import {formatUsd} from '@/lib/currency-format';

type ReceiptRequest={id:string;type:string;status:string;accountMode:string;amount:string|number;creditedAmount:string|number|null;currency:string;hasReceipt:boolean;createdAt:string;reviewedAt:string|null;reviewedBy?:{name:string|null;email:string}|null;transactionReference:string|null;method:string;user:{email:string;name:string|null};paymentMethod:{name:string}|null};

export default function AdminReceiptReviewPanel(){
	const [requests,setRequests]=useState<ReceiptRequest[]>([]);
	const [loading,setLoading]=useState(true);
	const [error,setError]=useState('');
	const [opening,setOpening]=useState('');
	const load=useCallback(async()=>{
		setLoading(true);
		try{
			const response=await fetch('/api/admin/funding?history=true',{cache:'no-store'});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to load receipt queue.');
			setRequests((result as ReceiptRequest[]).filter(request=>request.type==='DEPOSIT').slice(0,50));setError('');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load receipt queue.')}
		finally{setLoading(false)}
	},[]);
	useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),15000);return ()=>window.clearInterval(timer)},[load]);
	async function open(requestId:string){
		setOpening(requestId);setError('');
		try{
			const response=await fetch(`/api/admin/funding/${encodeURIComponent(requestId)}/receipt`,{cache:'no-store'});
			const result=await response.json();if(!response.ok)throw new Error(result.error||'Receipt unavailable.');
			window.open(result.url,'_blank','noopener,noreferrer');
		}catch(exception){setError(exception instanceof Error?exception.message:'Receipt unavailable.')}
		finally{setOpening('')}
	}
	return <section className="card p-5"><header className="flex items-start justify-between gap-3"><div><h2 className="font-bold">Payment receipts</h2><p className="mt-1 text-sm muted">Generated receipts reflect ledger review status. Uploaded payment evidence remains private.</p></div><button className="btn min-h-11 bg-white/5" type="button" onClick={()=>void load()} disabled={loading} aria-label="Refresh receipt queue"><RefreshCw size={15}/></button></header>
		{error&&<p className="mt-3 text-sm text-loss" role="alert">{error}</p>}
		{loading?<p className="mt-4 muted" role="status">Loading receipt queue…</p>:requests.length?<div className="mt-3 divide-y divide-white/10">{requests.map(request=>{const method=(request.paymentMethod?.name||request.method||'').replace(/\bsimulated\b/gi,'').replace(/\s+/g,' ').trim();const adminCreatedCredit=request.method==='Admin configured simulated REAL deposit';const amount=request.currency.toUpperCase()==='USD'?formatUsd(request.amount):`${Number(request.amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:8})} ${request.currency}`;return <article key={request.id} className="grid min-w-0 gap-3 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><b>{request.type} · {request.accountMode==='REAL'?'CONFIGURED REAL':request.accountMode} · {amount}</b><p className="break-all text-xs muted">{request.user.name||request.user.email} · {method||'Payment method'} · {request.status.replaceAll('_',' ')}</p><small className="break-all muted">{request.id}</small></div>{request.hasReceipt&&<button type="button" className="btn min-h-11 bg-white/5" disabled={opening===request.id} onClick={()=>void open(request.id)}>{opening===request.id?'Opening…':<>View uploaded proof <ExternalLink size={14}/></>}</button>}</div><details><summary className="min-h-10 cursor-pointer py-2 text-sm gold">{request.status==='APPROVED'?adminCreatedCredit?'Approval receipt':'Pending and approval receipts':'Pending receipt'}</summary><div className="grid min-w-0 gap-4 pt-3 xl:grid-cols-2">{!adminCreatedCredit&&<ReceiptGenerator receipt={{id:request.id,reference:request.id,status:'PENDING',accountMode:request.accountMode as 'DEMO'|'REAL',createdAt:request.createdAt,name:request.user.name||'',email:request.user.email,amount:request.amount,currency:request.currency,method,externalReference:request.transactionReference}}/>}{request.status==='APPROVED'&&<ReceiptGenerator receipt={{id:request.id,reference:`FUNDING:${request.id}:APPROVED`,status:'APPROVED',accountMode:request.accountMode as 'DEMO'|'REAL',createdAt:request.createdAt,reviewedAt:request.reviewedAt,reviewedBy:request.reviewedBy,name:request.user.name||'',email:request.user.email,amount:request.amount,creditedAmount:request.creditedAmount??request.amount,currency:request.currency,method,externalReference:request.transactionReference}}/>}</div></details></article>})}</div>:<p className="mt-4 text-sm muted">No deposit receipts are available.</p>}
	</section>;
}