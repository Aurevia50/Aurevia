'use client';

import {FormEvent,useCallback,useEffect,useState} from 'react';
import {Check,RefreshCw,ShieldCheck} from 'lucide-react';
import {formatUsd} from '@/lib/currency-format';

type Campaign={id:string;title:string;description:string;status:'DRAFT'|'ACTIVE'|'CLOSED';raisedAmount:string;donationCount:number;createdAt:string};
type Installment={id:string;number:number;dueAt:string;totalAmount:string;lateFeeAmount:string;status:string};
type Loan={id:string;principal:string;processingFeePercent:string;processingFeeAmount:string|null;netDisbursedAmount:string|null;termMonths:number;monthlyPayment:string;status:'PENDING_REVIEW'|'APPROVED'|'REJECTED'|'ACTIVE'|'PAID_OFF';createdAt:string;reviewNote:string|null;user:{id:string;name:string|null;email:string;status:string;accountMode:string};installments:Installment[]};
type ActionDraft={externalAmount:string;externalReference:string;note:string;attest:boolean};
const emptyDraft=():ActionDraft=>({externalAmount:'',externalReference:'',note:'',attest:false});
const format=(value:string|number|null)=>value===null?'-':formatUsd(value);

export default function AdminCommunityFinancePanel(){
	const [campaigns,setCampaigns]=useState<Campaign[]>([]);
	const [loans,setLoans]=useState<Loan[]>([]);
	const [title,setTitle]=useState('');
	const [description,setDescription]=useState('');
	const [campaignStatus,setCampaignStatus]=useState<'DRAFT'|'ACTIVE'>('DRAFT');
	const [drafts,setDrafts]=useState<Record<string,ActionDraft>>({});
	const [loading,setLoading]=useState(true);
	const [busy,setBusy]=useState('');
	const [error,setError]=useState('');
	const [message,setMessage]=useState('');

	const load=useCallback(async()=>{
		setLoading(true);setError('');
		try{
			const [campaignResponse,loanResponse]=await Promise.all([
				fetch('/api/admin/community',{cache:'no-store'}),
				fetch('/api/admin/community/loans',{cache:'no-store'}),
			]);
			const [campaignData,loanData]=await Promise.all([campaignResponse.json(),loanResponse.json()]);
			if(!campaignResponse.ok||!loanResponse.ok)throw new Error(campaignData.error||loanData.error||'Unable to load community finance records.');
			setCampaigns(campaignData);setLoans(loanData);
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load community finance records.')}
		finally{setLoading(false)}
	},[]);

	useEffect(()=>{void load()},[load]);

	async function createCampaign(event:FormEvent<HTMLFormElement>){
		event.preventDefault();
		if(busy)return;
		setBusy('campaign');setError('');setMessage('');
		try{
			const response=await fetch('/api/admin/community',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title,description,status:campaignStatus})});
			const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to create campaign.');
			setTitle('');setDescription('');setCampaignStatus('DRAFT');setMessage('Campaign created.');await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to create campaign.')}
		finally{setBusy('')}
	}

	async function updateCampaign(campaign:Campaign,status:Campaign['status']){
		if(busy)return;
		setBusy(campaign.id);setError('');setMessage('');
		try{
			const response=await fetch('/api/admin/community',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:campaign.id,status})});
			const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to update campaign.');
			setMessage(`${campaign.title} updated.`);await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to update campaign.')}
		finally{setBusy('')}
	}

	function updateDraft(key:string,changes:Partial<ActionDraft>){
		setDrafts(current=>({...current,[key]:{...emptyDraft(),...current[key],...changes}}));
	}

	async function loanAction(loanId:string,action:'APPROVE'|'REJECT'|'DISBURSE'|'RECORD_REPAYMENT',installmentId?:string){
		const key=installmentId?`${loanId}:${installmentId}`:loanId;
		const draft=drafts[key]||emptyDraft();
		if(busy)return;
		setBusy(key);setError('');setMessage('');
		try{
			const response=await fetch('/api/admin/community/loans',{method:'PATCH',headers:{'content-type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({
				id:loanId,action,
				note:draft.note||undefined,
				externalReference:draft.externalReference||undefined,
				externalAmount:draft.externalAmount||undefined,
				installmentId,
				attestVerified:draft.attest||undefined,
			})});
			const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to update loan.');
			setMessage(action==='APPROVE'?'Application approved; external disbursement is still required.':action==='REJECT'?'Application rejected.':action==='DISBURSE'?'Verified external disbursement recorded.':'Verified external repayment recorded.');
			setDrafts(current=>({...current,[key]:emptyDraft()}));await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to update loan.')}
		finally{setBusy('')}
	}

	return <main className="account-page admin-community-page">
		<header className="account-heading"><div><span className="account-kicker">ADMINISTRATION · COMMUNITY FINANCE</span><h1>Community Finance</h1><p>Manage campaigns and review loan requests. External transfers must be verified before ledger entries are posted.</p></div><button className="icon-action" type="button" aria-label="Refresh community records" disabled={loading} onClick={()=>void load()}><RefreshCw size={16}/></button></header>
		{error&&<div className="account-callout mb-4" role="alert">{error}</div>}
		{message&&<div className="admin-community-message" role="status">{message}</div>}
		<section className="account-panel card p-5 admin-community-campaign-create">
			<div className="account-panel-title"><div><h2>New community campaign</h2><p className="account-panel-subtitle">Create a named campaign before members can contribute.</p></div><ShieldCheck size={18} className="gold"/></div>
			<form onSubmit={event=>void createCampaign(event)} className="admin-community-form">
				<label className="account-label">Campaign name<input className="input" required minLength={3} maxLength={120} value={title} onChange={event=>setTitle(event.target.value)} disabled={busy==='campaign'}/></label>
				<label className="account-label">Description<textarea className="input" required minLength={10} maxLength={3000} rows={3} value={description} onChange={event=>setDescription(event.target.value)} disabled={busy==='campaign'}/></label>
				<label className="account-label">Visibility<select className="input" value={campaignStatus} onChange={event=>setCampaignStatus(event.target.value as 'DRAFT'|'ACTIVE')} disabled={busy==='campaign'}><option value="DRAFT">Draft</option><option value="ACTIVE">Active · accepting contributions</option></select></label>
				<button className="btn bg-gold" type="submit" disabled={busy==='campaign'}>{busy==='campaign'?'Creating…':'Create campaign'}</button>
			</form>
		</section>

		<section className="admin-community-section">
			<div className="account-panel-title"><div><h2>Campaigns</h2><p className="account-panel-subtitle">Posted member contributions and campaign status.</p></div></div>
			<div className="admin-community-campaigns">{campaigns.map(campaign=><article className="account-panel card p-4" key={campaign.id}>
				<header><div><h3>{campaign.title}</h3><span className={`community-status community-status--${campaign.status.toLowerCase()}`}>{campaign.status}</span></div><strong>{format(campaign.raisedAmount)}</strong></header>
				<p>{campaign.description}</p><small>{campaign.donationCount} contributions · Created {new Date(campaign.createdAt).toLocaleDateString()}</small>
				{campaign.status!=='CLOSED'&&<label className="account-label mt-3">Campaign status<select className="input mt-1" value={campaign.status} disabled={busy===campaign.id} onChange={event=>void updateCampaign(campaign,event.target.value as Campaign['status'])}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="CLOSED">Closed</option></select></label>}
			</article>)}
			{!loading&&!campaigns.length&&<p className="account-empty">No community campaigns created yet.</p>}</div>
		</section>

		<section className="admin-community-section">
			<div className="account-panel-title"><div><h2>Loan applications &amp; servicing</h2><p className="account-panel-subtitle">Policy: up to $150,000 principal · 12% APR · 2% fee · admin-attested disbursement and repayments.</p></div></div>
			<div className="admin-community-loans">{loans.map(loan=>{
				const net=Number(loan.principal)*(1-Number(loan.processingFeePercent)/100);
				const borrower=loan.user.name||loan.user.email;
				return <article className="account-panel card p-5 admin-community-loan" key={loan.id}>
					<header className="admin-community-loan-heading"><div><span className="account-kicker">{loan.user.accountMode} ACCOUNT · {loan.user.status}</span><h3>{format(loan.principal)} USD · {loan.termMonths} months</h3><p>{borrower} · {loan.user.email} · Applied {new Date(loan.createdAt).toLocaleString()}</p></div><span className={`community-status community-status--${loan.status.toLowerCase()}`}>{loan.status.replaceAll('_',' ')}</span></header>
					<p className="admin-community-loan-terms">{loan.monthlyPayment} USD estimated monthly installment · {loan.processingFeePercent}% processing fee · {loan.reviewNote||'No review note.'}</p>
					{loan.status==='PENDING_REVIEW'&&<div className="admin-community-actions"><textarea className="input" aria-label={`Review note for ${borrower}`} placeholder="Optional approval note; required when rejecting" maxLength={500} value={drafts[loan.id]?.note||''} onChange={event=>updateDraft(loan.id,{note:event.target.value})}/><div><button className="btn bg-gold" type="button" disabled={Boolean(busy)} onClick={()=>void loanAction(loan.id,'APPROVE')}>Approve for disbursement</button><button className="btn admin-community-reject" type="button" disabled={Boolean(busy)} onClick={()=>void loanAction(loan.id,'REJECT')}>Reject</button></div></div>}
					{loan.status==='APPROVED'&&<div className="admin-community-transfer">
						<strong>External disbursement attestation</strong><small>Verify that exactly {format(net)} USD was sent to the member. Approval alone does not credit a wallet.</small>
						<input className="input" aria-label={`Verified disbursement amount for ${borrower}`} inputMode="decimal" placeholder={`Amount · ${net.toFixed(2)}`} value={drafts[loan.id]?.externalAmount||''} onChange={event=>updateDraft(loan.id,{externalAmount:event.target.value})}/>
						<input className="input" aria-label={`External disbursement reference for ${borrower}`} placeholder="External transfer reference" maxLength={180} value={drafts[loan.id]?.externalReference||''} onChange={event=>updateDraft(loan.id,{externalReference:event.target.value})}/>
						<textarea className="input" aria-label={`Disbursement notes for ${borrower}`} placeholder="Verification notes" maxLength={500} value={drafts[loan.id]?.note||''} onChange={event=>updateDraft(loan.id,{note:event.target.value})}/>
						<label><input type="checkbox" checked={drafts[loan.id]?.attest||false} onChange={event=>updateDraft(loan.id,{attest:event.target.checked})}/> I verified the external transfer and exact amount.</label>
						<button className="btn bg-gold" type="button" disabled={Boolean(busy)} onClick={()=>void loanAction(loan.id,'DISBURSE')}>Record verified disbursement</button>
					</div>}
					{loan.status==='ACTIVE'&&<div className="admin-community-installments">{loan.installments.map(installment=>{
						if(installment.status==='PAID')return <div className="admin-community-installment is-paid" key={installment.id}><span><Check size={15}/> Installment {installment.number} · Paid</span><strong>{format(installment.totalAmount)}</strong></div>;
						const late=Date.now()>new Date(installment.dueAt).getTime()+5*24*60*60*1000;
						const amount=Number(installment.totalAmount)+(late?25:0);
						const key=`${loan.id}:${installment.id}`;
						const draft=drafts[key]||emptyDraft();
						return <div className="admin-community-installment" key={installment.id}>
							<div><b>Installment {installment.number} · Due {new Date(installment.dueAt).toLocaleDateString()}</b><small>{format(installment.totalAmount)}{late?' + $25.00 late fee':''} · Expected external payment {format(amount)}</small></div>
							<div className="admin-community-transfer">
								<input className="input" aria-label={`Verified repayment amount for installment ${installment.number}`} inputMode="decimal" placeholder={`Amount · ${amount.toFixed(2)}`} value={draft.externalAmount} onChange={event=>updateDraft(key,{externalAmount:event.target.value})}/>
								<input className="input" aria-label={`External repayment reference for installment ${installment.number}`} placeholder="External payment reference" maxLength={180} value={draft.externalReference} onChange={event=>updateDraft(key,{externalReference:event.target.value})}/>
								<textarea className="input" aria-label={`Repayment notes for installment ${installment.number}`} placeholder="Verification notes" maxLength={500} value={draft.note} onChange={event=>updateDraft(key,{note:event.target.value})}/>
								<label><input type="checkbox" checked={draft.attest} onChange={event=>updateDraft(key,{attest:event.target.checked})}/> I verified the external payment and exact amount.</label>
								<button className="btn bg-gold" type="button" disabled={Boolean(busy)} onClick={()=>void loanAction(loan.id,'RECORD_REPAYMENT',installment.id)}>Record repayment</button>
							</div>
						</div>;
					})}</div>}
				</article>;
			})}
			{!loading&&!loans.length&&<p className="account-empty">No loan applications have been submitted.</p>}</div>
		</section>
		{loading&&<p className="muted" role="status">Refreshing finance records…</p>}
	</main>;
}
