'use client';

import {FormEvent,useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {ArrowLeft,ArrowRight,Save,Send,Upload} from 'lucide-react';
import Nav from '@/components/Nav';

type TaxCase={
	id:string;reference:string;status:string;serviceType:string;taxYear:number;returnKind:string;
	reason:string|null;priorReturnFiled:boolean|null;receivedIrsNotice:boolean|null;specialCircumstances:string|null;
	intake:Record<string,unknown>;
	documents:Array<{id:string;category:string;filename:string;uploadedAt:string;description:string|null}>;
	messages:Array<{id:string;body:string;createdAt:string;visibility:string}>;
};

const steps=['Request','Taxpayer','Household','Income','Deductions','Additional','Documents','Review'];

export default function TaxRequestPage(){
	const params=useParams<{id:string}>();
	const id=params.id;
	const [data,setData]=useState<TaxCase|null>(null);
	const [step,setStep]=useState(0);
	const [intake,setIntake]=useState<Record<string,unknown>>({});
	const [reason,setReason]=useState('');
	const [ack,setAck]=useState(false);
	const [error,setError]=useState('');
	const [notice,setNotice]=useState('');
	const [busy,setBusy]=useState(false);
	const [file,setFile]=useState<File|null>(null);
	const [category,setCategory]=useState('W2');

	const load=useCallback(async()=>{
		try{
			const response=await fetch(`/api/tax-services/cases/${id}`,{cache:'no-store'});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to load case.');
			setData(result);
			setIntake(result.intake||{});
			setReason(result.reason||'');
			setError('');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load case.')}
	},[id]);

	useEffect(()=>{void load()},[load]);

	function setField(path:string,value:unknown){
		setIntake(current=>({...current,[path]:value}));
	}

	async function save(submit=false){
		if(busy)return;
		setBusy(true);setError('');setNotice('');
		try{
			const response=await fetch(`/api/tax-services/cases/${id}`,{
				method:'PATCH',
				headers:{'content-type':'application/json'},
				body:JSON.stringify({intake,reason,submit,acknowledgment:submit?true:undefined}),
			});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to save.');
			setNotice(submit?'Request submitted for administrator review.':'Draft saved.');
			await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to save.')}
		finally{setBusy(false)}
	}

	async function upload(event:FormEvent){
		event.preventDefault();
		if(!file||busy)return;
		setBusy(true);setError('');setNotice('');
		try{
			const body=new FormData();
			body.append('file',file);
			body.append('category',category);
			const response=await fetch(`/api/tax-services/cases/${id}/documents`,{method:'POST',body});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Upload failed.');
			setFile(null);setNotice('Document uploaded.');
			await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Upload failed.')}
		finally{setBusy(false)}
	}

	const locked=useMemo(()=>data? !['DRAFT','AWAITING_TAXPAYER_INFO'].includes(data.status):true,[data]);

	if(error&&!data)return <><Nav/><main className="account-page"><p className="text-loss">{error}</p><Link href="/tax-services" className="text-link">Back</Link></main></>;
	if(!data)return <><Nav/><main className="account-page"><p className="muted">Loading case…</p></main></>;

	return <>
		<Nav/>
		<main className="account-page">
			<header className="account-heading">
				<div>
					<span className="account-kicker">{data.reference}</span>
					<h1>Tax intake</h1>
					<p>{data.serviceType.replaceAll('_',' ')} · Tax year {data.taxYear} · {data.status.replaceAll('_',' ')}</p>
				</div>
				<Link href="/tax-services" className="text-link"><ArrowLeft size={14}/> All requests</Link>
			</header>

			<ol className="tax-stepper" aria-label="Intake steps">{steps.map((label,index)=>(
				<li key={label} className={index===step?'is-current':index<step?'is-done':''}><button type="button" onClick={()=>setStep(index)}>{index+1}. {label}</button></li>
			))}</ol>

			{error&&<p className="text-loss text-sm" role="alert">{error}</p>}
			{notice&&<p className="text-profit text-sm" role="status">{notice}</p>}

			<section className="card p-5 tax-intake-panel">
				{step===0&&(
					<div className="grid gap-3">
						<label className="text-xs muted">Reason for requesting assistance<textarea className="input min-h-24" disabled={locked} value={reason} onChange={e=>setReason(e.target.value)}/></label>
						<label className="text-xs muted">Prior return already filed?
							<select className="input mt-1" disabled={locked} value={String(intake.priorReturnFiled??'')} onChange={e=>setField('priorReturnFiled',e.target.value===''?null:e.target.value==='true')}>
								<option value="">Select</option><option value="true">Yes</option><option value="false">No</option>
							</select>
						</label>
						<label className="text-xs muted">Received an IRS notice?
							<select className="input mt-1" disabled={locked} value={String(intake.receivedIrsNotice??'')} onChange={e=>setField('receivedIrsNotice',e.target.value===''?null:e.target.value==='true')}>
								<option value="">Select</option><option value="true">Yes</option><option value="false">No</option>
							</select>
						</label>
					</div>
				)}
				{step===1&&(
					<div className="grid gap-3 sm:grid-cols-2">
						<label className="text-xs muted">Legal name<input className="input mt-1" disabled={locked} value={String(intake.legalName||'')} onChange={e=>setField('legalName',e.target.value)}/></label>
						<label className="text-xs muted">Date of birth<input className="input mt-1" type="date" disabled={locked} value={String(intake.dob||'')} onChange={e=>setField('dob',e.target.value)}/></label>
						<label className="text-xs muted sm:col-span-2">Mailing address<textarea className="input mt-1 min-h-20" disabled={locked} value={String(intake.address||'')} onChange={e=>setField('address',e.target.value)}/></label>
						<label className="text-xs muted">Country of residence<input className="input mt-1" disabled={locked} value={String(intake.residenceCountry||'')} onChange={e=>setField('residenceCountry',e.target.value)}/></label>
						<label className="text-xs muted">Preferred contact<input className="input mt-1" disabled={locked} value={String(intake.preferredContact||'')} onChange={e=>setField('preferredContact',e.target.value)}/></label>
						<label className="text-xs muted sm:col-span-2">Taxpayer ID last 4 only (optional)<input className="input mt-1" inputMode="numeric" maxLength={4} disabled={locked} value={String(intake.tinLast4||'')} onChange={e=>setField('tinLast4',e.target.value.replace(/\D/g,'').slice(0,4))}/></label>
					</div>
				)}
				{step===2&&(
					<div className="grid gap-3">
						<label className="text-xs muted">Potential filing status
							<select className="input mt-1" disabled={locked} value={String(intake.filingStatus||'')} onChange={e=>setField('filingStatus',e.target.value)}>
								<option value="">Select</option>
								<option>Single</option><option>Married filing jointly</option><option>Married filing separately</option>
								<option>Head of household</option><option>Qualifying surviving spouse</option>
							</select>
						</label>
						<label className="text-xs muted">Dependents (names / relationships)<textarea className="input mt-1 min-h-20" disabled={locked} value={String(intake.dependents||'')} onChange={e=>setField('dependents',e.target.value)}/></label>
						<label className="text-xs muted">Household changes during the tax year<textarea className="input mt-1 min-h-20" disabled={locked} value={String(intake.householdChanges||'')} onChange={e=>setField('householdChanges',e.target.value)}/></label>
					</div>
				)}
				{step===3&&(
					<div className="grid gap-3">
						<p className="text-sm muted">Mark categories that apply and provide amounts or notes. Use N/A where a category does not apply.</p>
						{['w2','selfEmployment','form1099','interestDividends','capitalGains','retirement','socialSecurity','rental','unemployment','otherIncome'].map(key=>(
							<label key={key} className="text-xs muted">{key.replace(/([A-Z])/g,' $1')}<input className="input mt-1" disabled={locked} value={String(intake[`income_${key}`]||'')} onChange={e=>setField(`income_${key}`,e.target.value)} placeholder="Amount or N/A"/></label>
						))}
					</div>
				)}
				{step===4&&(
					<div className="grid gap-3">
						{['standardOrItemized','mortgageCharity','medical','studentLoan','education','childCredits','retirementContributions','hsa','childcare','estimatedPayments','withholding','energyCredits','otherDeductions'].map(key=>(
							<label key={key} className="text-xs muted">{key.replace(/([A-Z])/g,' $1')}<input className="input mt-1" disabled={locked} value={String(intake[`deduction_${key}`]||'')} onChange={e=>setField(`deduction_${key}`,e.target.value)} placeholder="Details or N/A"/></label>
						))}
					</div>
				)}
				{step===5&&(
					<div className="grid gap-3">
						{['digitalAssets','foreignAccounts','selfEmploymentExpenses','businessAssets','lifeChanges','irsNotices','amendedReason','otherIssues'].map(key=>(
							<label key={key} className="text-xs muted">{key.replace(/([A-Z])/g,' $1')}<textarea className="input mt-1 min-h-16" disabled={locked} value={String(intake[`extra_${key}`]||'')} onChange={e=>setField(`extra_${key}`,e.target.value)}/></label>
						))}
					</div>
				)}
				{step===6&&(
					<div className="grid gap-4">
						<form className="grid gap-3" onSubmit={event=>void upload(event)}>
							<label className="text-xs muted">Category
								<select className="input mt-1" disabled={locked} value={category} onChange={e=>setCategory(e.target.value)}>
									{['W2','FORM_1099','PRIOR_YEAR_RETURN','IDENTITY','DEPENDENT_SUPPORT','DEDUCTION_EVIDENCE','ESTIMATED_TAX_PAYMENT','IRS_NOTICE','INVESTMENT_RECORDS','OTHER'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}
								</select>
							</label>
							<label className="text-xs muted">File (PDF, JPG, PNG, WEBP · max 12 MB)<input className="input mt-1" type="file" disabled={locked} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
							<button className="btn bg-gold text-black" disabled={locked||busy||!file} type="submit"><Upload size={14}/>{busy?'Uploading…':'Upload document'}</button>
						</form>
						<ul className="divide-y divide-white/10">{data.documents.map(doc=>(
							<li key={doc.id} className="py-2 text-sm"><b>{doc.filename}</b><span className="muted"> · {doc.category.replaceAll('_',' ')} · {new Date(doc.uploadedAt).toLocaleString()}</span></li>
						))}</ul>
					</div>
				)}
				{step===7&&(
					<div className="grid gap-3">
						<p className="text-sm">Review your answers before submitting. Submission requests preparation or review assistance only and does <b>not</b> file a return with the IRS.</p>
						<pre className="tax-review-box text-xs whitespace-pre-wrap">{JSON.stringify({reason,intake,documents:data.documents.map(d=>d.filename)},null,2)}</pre>
						<label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={locked} checked={ack} onChange={e=>setAck(e.target.checked)}/><span>I confirm the information is accurate to the best of my knowledge. I understand this is not an IRS filing and documents will be handled under Aurevia’s private review workflow.</span></label>
					</div>
				)}

				<div className="mt-5 flex flex-wrap gap-2">
					<button type="button" className="btn bg-white/5" disabled={step===0} onClick={()=>setStep(s=>Math.max(0,s-1))}><ArrowLeft size={14}/> Back</button>
					{step<steps.length-1&&<button type="button" className="btn bg-white/10" onClick={()=>setStep(s=>Math.min(steps.length-1,s+1))}>Next <ArrowRight size={14}/></button>}
					{!locked&&<button type="button" className="btn bg-white/10" disabled={busy} onClick={()=>void save(false)}><Save size={14}/>{busy?'Saving…':'Save draft'}</button>}
					{!locked&&step===steps.length-1&&<button type="button" className="btn bg-gold text-black" disabled={busy||!ack} onClick={()=>void save(true)}><Send size={14}/>{busy?'Submitting…':'Submit request'}</button>}
				</div>
			</section>

			{data.messages.length>0&&(
				<section className="card p-5 mt-4">
					<h2 className="font-semibold">Messages</h2>
					<ul className="mt-3 space-y-2">{data.messages.map(message=>(
						<li key={message.id} className="text-sm border border-white/10 rounded-lg p-3"><time className="text-xs muted">{new Date(message.createdAt).toLocaleString()}</time><p className="mt-1">{message.body}</p></li>
					))}</ul>
				</section>
			)}
		</main>
	</>;
}
