'use client';

import {FormEvent,useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowDownLeft,ArrowRight,CheckCircle2,HeartHandshake,RefreshCw,ShieldCheck} from 'lucide-react';
import {formatUsd} from '@/lib/currency-format';

type Campaign={id:string;title:string;description:string;status:string;raisedAmount:string;donationCount:number};
type Donation={id:string;amount:string;createdAt:string;campaign:{title:string}};
type Installment={id:string;number:number;dueAt:string;principalAmount:string;interestAmount:string;totalAmount:string;lateFeeAmount:string;status:string;paidAt:string|null};
type Loan={id:string;principal:string;currency:string;aprPercent:string;processingFeePercent:string;processingFeeAmount:string|null;netDisbursedAmount:string|null;termMonths:number;monthlyPayment:string;status:string;createdAt:string;reviewNote:string|null;disbursementReference:string|null;disbursedAt:string|null;qualifyingMonths:string[];installments:Installment[]};
type Overview={accountMode:'DEMO'|'REAL';accountRestricted:boolean;walletBalance:string|null;eligibility:{eligible:boolean;qualifyingMonths:string[]|null;qualifyingActivityCount:number};campaigns:Campaign[];donations:Donation[];loans:Loan[];approvedDeposits:Array<{id:string;amount:string;feeAmount:string|null;creditedAmount:string|null;currency:string;reviewedAt:string|null;createdAt:string}>;policy:{currency:string;depositFeePercent:string;loanLimit:string;loanAprPercent:string;monthlyInterestPercent:string;processingFeePercent:string;maximumTermMonths:number;lateFee:string;gracePeriodDays:number}};

const usd=(amount:string|number|null|undefined)=>amount===null||amount===undefined?'—':formatUsd(amount);

export default function CommunityFinanceExperience(){
	const [data,setData]=useState<Overview|null>(null);
	const [loading,setLoading]=useState(true);
	const [saving,setSaving]=useState(false);
	const [error,setError]=useState('');
	const [message,setMessage]=useState('');
	const [donationAmounts,setDonationAmounts]=useState<Record<string,string>>({});
	const [principal,setPrincipal]=useState('');
	const [termMonths,setTermMonths]=useState('12');
	const [acceptedTerms,setAcceptedTerms]=useState(false);

	const load=useCallback(async()=>{
		setLoading(true);setError('');
		try{
			const response=await fetch('/api/community',{cache:'no-store'});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to load community finance.');
			setData(result);
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load community finance.')}
		finally{setLoading(false)}
	},[]);

	useEffect(()=>{void load()},[load]);

	async function contribute(event:FormEvent<HTMLFormElement>,campaignId:string){
		event.preventDefault();
		if(!data||saving)return;
		const amount=donationAmounts[campaignId]?.trim()||'';
		setSaving(true);setError('');setMessage('');
		try{
			const response=await fetch('/api/community/donations',{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({campaignId,amount})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to record the contribution.');
			setMessage(`Your ${usd(amount)} contribution was recorded.`);
			setDonationAmounts(current=>({...current,[campaignId]:''}));
			await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to record the contribution.')}
		finally{setSaving(false)}
	}

	async function applyForLoan(event:FormEvent<HTMLFormElement>){
		event.preventDefault();
		if(!data||saving)return;
		setSaving(true);setError('');setMessage('');
		try{
			const response=await fetch('/api/community/loans',{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({principal,termMonths:Number(termMonths),acceptedTerms})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to submit the loan application.');
			setMessage('Your loan application was submitted for administrator review. No funds have been disbursed.');
			setPrincipal('');setAcceptedTerms(false);
			await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to submit the loan application.')}
		finally{setSaving(false)}
	}

	const amount=Number(principal);
	const months=Number(termMonths);
	const paymentEstimate=amount>0&&months>0?amount*.01*Math.pow(1.01,months)/(Math.pow(1.01,months)-1):0;

	return <main className="account-page community-finance-page">
		<header className="community-finance-heading"><div><span className="account-kicker">AUREVIA · COMMUNITY</span><h1>Community Finance</h1><p>Support community campaigns and review your eligibility and repayment details in one place.</p></div><button className="icon-action" type="button" aria-label="Refresh community finance" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/></button></header>
		{error&&<div className="account-callout community-feedback" role="alert">{error}</div>}
		{message&&<div className="community-feedback community-feedback--success" role="status"><CheckCircle2 size={17}/>{message}</div>}
		{loading&&!data?<div className="account-panel card p-5" role="status">Loading your community finance information…</div>:data&&<>
			<section className="community-summary-grid" aria-label="Community finance overview">
				<article className="community-summary-card community-summary-card--balance"><span>REAL USD WALLET</span><strong>{data.walletBalance===null?'Switch to REAL Mode':usd(data.walletBalance)}</strong><small>{data.accountMode==='REAL'?<Link href="/wallet">Wallet and deposits <ArrowRight size={13}/></Link>:'Financial actions are disabled in DEMO mode.'}</small></article>
				<article className="community-summary-card"><span>LOAN ELIGIBILITY</span><strong className={data.eligibility.eligible?'is-eligible':'is-pending'}>{data.eligibility.eligible?'Eligible to apply':'Not eligible yet'}</strong><small>{data.eligibility.qualifyingMonths?.join(' · ')||'Needs activity in 3 consecutive calendar months'}</small></article>
				<article className="community-summary-card"><span>ACCOUNT STATUS</span><strong>{data.accountRestricted?'Restricted':'Active'}</strong><small>{data.accountRestricted?'Financial requests are unavailable.':'Amounts are tracked in USD.'}</small></article>
			</section>

			<section className="community-section" aria-labelledby="community-campaigns-title">
				<div className="community-section-heading"><div><span className="account-kicker">GIVE WITH PURPOSE</span><h2 id="community-campaigns-title">Community campaigns</h2></div><HeartHandshake size={21}/></div>
				<p className="community-section-copy">Contributions are transferred from your REAL USD wallet into the selected campaign ledger. No external payout or campaign settlement is represented here.</p>
				{data.accountMode!=='REAL'&&<div className="community-inline-note">Switch to REAL Mode to contribute from your wallet.</div>}
				{data.campaigns.length?<div className="community-campaign-grid">{data.campaigns.map(campaign=><article className="community-card" key={campaign.id}>
					<div className="community-card-heading"><span className="community-card-icon"><HeartHandshake size={19}/></span><span className="community-status">ACTIVE</span></div>
					<h3>{campaign.title}</h3><p>{campaign.description}</p>
					<div className="community-campaign-total"><strong>{usd(campaign.raisedAmount)}</strong><small>{campaign.donationCount} recorded {campaign.donationCount===1?'contribution':'contributions'}</small></div>
					<form className="community-donation-form" onSubmit={event=>void contribute(event,campaign.id)}>
						<label>Contribution amount (USD)<input className="input" type="number" min="0.01" max="100000000" step="0.01" required value={donationAmounts[campaign.id]||''} onChange={event=>setDonationAmounts(current=>({...current,[campaign.id]:event.target.value}))} disabled={saving||data.accountMode!=='REAL'||data.accountRestricted}/></label>
						<button className="btn bg-gold" type="submit" disabled={saving||data.accountMode!=='REAL'||data.accountRestricted}>{saving?'Recording…':'Contribute'}</button>
					</form>
				</article>)}</div>:<p className="community-empty">There are no active community campaigns right now.</p>}
			</section>

			<section className="community-section" aria-labelledby="community-loan-title">
				<div className="community-section-heading"><div><span className="account-kicker">BORROW RESPONSIBLY</span><h2 id="community-loan-title">Loan management</h2></div><ShieldCheck size={21}/></div>
				<div className={`community-eligibility-card ${data.eligibility.eligible?'is-eligible':'is-ineligible'}`}><span>{data.eligibility.eligible?'Eligibility met':'Not eligible now'}</span><p>{data.eligibility.eligible?`Qualifying activity recorded in ${data.eligibility.qualifyingMonths?.join(', ')}.`:'A positive approved deposit or posted community donation is required in each of 3 consecutive calendar months.'}</p><small>Only approved deposits and posted REAL-wallet donations count. Pending or rejected requests do not qualify.</small></div>
				{data.accountMode!=='REAL'&&<div className="community-inline-note">Loan applications are available in REAL Mode only.</div>}
				{data.eligibility.eligible&&!data.accountRestricted&&data.accountMode==='REAL'&&<form className="community-loan-form" onSubmit={event=>void applyForLoan(event)}>
					<div className="community-loan-form-heading"><h3>Request a loan</h3><small>Maximum principal {usd(data.policy.loanLimit)} USD</small></div>
					<div className="community-loan-inputs"><label>Principal (USD)<input className="input" type="number" min="1" max={data.policy.loanLimit} step="0.01" required value={principal} onChange={event=>setPrincipal(event.target.value)} disabled={saving}/></label><label>Repayment term<select className="input" value={termMonths} onChange={event=>setTermMonths(event.target.value)} disabled={saving}>{Array.from({length:data.policy.maximumTermMonths},(_,index)=>index+1).map(value=><option key={value} value={value}>{value} {value===1?'month':'months'}</option>)}</select></label></div>
					{amount>0&&months>0&&<div className="community-loan-estimate"><span>Estimated fixed monthly installment</span><strong>{formatUsd(paymentEstimate)}</strong></div>}
					<div className="community-loan-terms"><strong>Terms disclosed before submission</strong><ul><li>12% APR (1% monthly interest on outstanding principal), amortized into equal monthly installments.</li><li>2% one-time processing fee is deducted at external disbursement; it does not reduce principal owed.</li><li>Up to 12 monthly installments, due on the disbursement calendar date.</li><li>$25 late fee applies once per overdue installment after a 5-day grace period.</li><li>Admin review is required. Submission is not approval or a promise to disburse funds.</li></ul></div>
					<label className="community-terms-accept"><input type="checkbox" checked={acceptedTerms} onChange={event=>setAcceptedTerms(event.target.checked)} required disabled={saving}/><span>I have reviewed and accept the disclosed loan terms. The final schedule will be confirmed if approved.</span></label>
					<button className="btn bg-gold" type="submit" disabled={saving||!acceptedTerms}>{saving?'Submitting…':'Submit for review'}</button>
				</form>}
				{data.loans.length>0&&<div className="community-loan-list">{data.loans.map(loan=><article className="community-card community-loan-card" key={loan.id}>
					<header><div><span className="account-kicker">LOAN APPLICATION</span><h3>{usd(loan.principal)} USD · {loan.termMonths} months</h3></div><span className={`community-status community-status--${loan.status.toLowerCase()}`}>{loan.status.replaceAll('_',' ')}</span></header>
					<p>{loan.aprPercent}% APR · {usd(loan.monthlyPayment)} estimated monthly installment · Submitted {new Date(loan.createdAt).toLocaleDateString()}</p>
					{loan.status==='REJECTED'&&loan.reviewNote&&<p className="community-inline-note">{loan.reviewNote}</p>}
					{loan.netDisbursedAmount&&<p className="community-loan-disbursed">Net disbursed: {usd(loan.netDisbursedAmount)} after {usd(loan.processingFeeAmount)} processing fee.</p>}
					{loan.installments.length>0&&<div className="community-installments"><h4>Repayment schedule</h4>{loan.installments.map(installment=><div className="community-installment" key={installment.id}><span><b>Installment {installment.number}</b><small>Due {new Date(installment.dueAt).toLocaleDateString()} · Principal {usd(installment.principalAmount)} · Interest {usd(installment.interestAmount)}</small></span><strong>{installment.status==='PAID'?`Paid · ${usd(installment.totalAmount)}`:usd(installment.totalAmount)}</strong></div>)}</div>}
				</article>)}</div>}
			</section>

			<section className="community-section" aria-labelledby="community-history-title">
				<div className="community-section-heading"><div><span className="account-kicker">ACCOUNT RECORD</span><h2 id="community-history-title">Recent activity</h2></div><Link href="/wallet/transactions">Wallet history <ArrowRight size={14}/></Link></div>
				<div className="community-history-list">
					{data.donations.map(donation=><div className="community-history-row" key={`donation-${donation.id}`}><span className="community-history-icon"><HeartHandshake size={16}/></span><span><b>Community donation · {donation.campaign.title}</b><small>{new Date(donation.createdAt).toLocaleString()}</small></span><strong>−{usd(donation.amount)}</strong></div>)}
					{data.approvedDeposits.map(deposit=><div className="community-history-row" key={`deposit-${deposit.id}`}><span className="community-history-icon"><ArrowDownLeft size={16}/></span><span><b>Approved deposit</b><small>{new Date(deposit.reviewedAt||deposit.createdAt).toLocaleString()} · 10% fee {usd(deposit.feeAmount)}</small></span><strong>{usd(deposit.creditedAmount)} credited</strong></div>)}
					{!data.donations.length&&!data.approvedDeposits.length&&<p className="community-empty">No community contributions or approved deposits are recorded yet.</p>}
				</div>
			</section>
			<p className="community-disclosure">External loan disbursements and repayments are performed outside Aurevia and only enter the ledger after an administrator verifies the transfer reference and exact amount. This page does not initiate a bank transfer.</p>
		</>}
	</main>;
}
