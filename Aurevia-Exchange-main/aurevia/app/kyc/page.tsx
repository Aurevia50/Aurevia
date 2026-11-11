'use client';

import {useCallback,useEffect,useState} from 'react';
import {useSession} from 'next-auth/react';
import {ShieldCheck} from 'lucide-react';
import Link from 'next/link';
import Nav from '@/components/Nav';

type DiditStatus='PENDING'|'IN_PROGRESS'|'APPROVED'|'REJECTED'|'EXPIRED'|'FAILED';
type DiditVerification={sessionId:string|null;status:DiditStatus;environment:'sandbox'|'live';createdAt:string;completedAt:string|null};
type KycDocument={id:string;kind:string;filename:string;status:string;uploadedAt:string;reviewedAt:string|null;reviewNote:string|null};
type PageState={kycStatus:string;diditVerification:DiditVerification|null;phone:string;phoneVerified:boolean;address:string;currentTier:number;documents:KycDocument[]};

const stateCopy:Record<DiditStatus,{label:string;description:string}>={
	PENDING:{label:'Pending',description:'Your Didit session is ready or waiting for you to start.'},
	IN_PROGRESS:{label:'In progress',description:'Didit is reviewing your identity verification.'},
	APPROVED:{label:'Approved',description:'Didit confirmed your identity verification.'},
	REJECTED:{label:'Rejected',description:'Didit declined the verification. Start a new session if your account permits it.'},
	EXPIRED:{label:'Expired',description:'This Didit session expired. Start a new session to continue.'},
	FAILED:{label:'Failed',description:'A previous session could not be started. You can try again when Didit is available.'},
};

export default function Kyc(){
	const {data:session,status:sessionStatus}=useSession();
	const [page,setPage]=useState<PageState>({kycStatus:'PENDING',diditVerification:null,phone:'',phoneVerified:false,address:'',currentTier:1,documents:[]});
	const [loading,setLoading]=useState(true);
	const [starting,setStarting]=useState(false);
	const [sendingCode,setSendingCode]=useState(false);
	const [verifyingCode,setVerifyingCode]=useState(false);
	const [uploadingProof,setUploadingProof]=useState(false);
	const [phoneCode,setPhoneCode]=useState('');
	const [proofFile,setProofFile]=useState<File|null>(null);
	const [diditConsent,setDiditConsent]=useState(false);
	const [message,setMessage]=useState('');
	const [error,setError]=useState('');

	const load=useCallback(async()=>{
		if(sessionStatus==='loading')return;
		if(sessionStatus!=='authenticated'){setLoading(false);return}
		if(session?.user?.accountMode!=='REAL'){setLoading(false);setError('');return}
		setLoading(true);
		try{
			const [kycResponse,profileResponse,tierResponse,documentsResponse]=await Promise.all([
				fetch('/api/kyc',{cache:'no-store'}),
				fetch('/api/profile',{cache:'no-store'}),
				fetch('/api/tier-requests',{cache:'no-store'}),
				fetch('/api/kyc/documents',{cache:'no-store'}),
			]);
			const [kyc,profile,tier,documents]=await Promise.all([kycResponse.json(),profileResponse.json(),tierResponse.json(),documentsResponse.json()]);
			if(!kycResponse.ok||!profileResponse.ok||!tierResponse.ok||!documentsResponse.ok)throw new Error(kyc.error||profile.error||tier.error||documents.error||'Unable to load verification status.');
			setPage({
				kycStatus:profile.kycStatus||'PENDING',
				diditVerification:kyc.diditVerification||null,
				phone:profile.phone||'',
				phoneVerified:Boolean(profile.phoneVerified),
				address:profile.address||'',
				currentTier:typeof tier.currentTier==='number'?tier.currentTier:1,
				documents,
			});
			setError('');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load verification status.')}
		finally{setLoading(false)}
	},[session?.user?.accountMode,sessionStatus]);

	useEffect(()=>{void load()},[load]);

	async function startVerification(){
		if(starting)return;
		setStarting(true);setError('');setMessage('');
		try{
			const response=await fetch('/api/kyc/didit/session',{method:'POST'});
			const result:{url?:string;error?:string}=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to start Didit identity verification.');
			const redirect=new URL(result.url||'');
			if(redirect.protocol!=='https:'||redirect.hostname!=='verify.didit.me')throw new Error('Didit returned an invalid verification redirect.');
			window.location.assign(redirect.toString());
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to start Didit identity verification.')}
		finally{setStarting(false)}
	}

	async function sendPhoneCode(){
		if(sendingCode||!page.phone.trim())return;
		setSendingCode(true);setError('');setMessage('');
		try{
			const response=await fetch('/api/kyc/phone/send',{
				method:'POST',
				headers:{'content-type':'application/json'},
				body:JSON.stringify({phone:page.phone.trim(),delivery:'sms'}),
			});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to send a verification code.');
			setPage(current=>({...current,phone:page.phone.trim(),phoneVerified:false}));
			setPhoneCode('');
			setMessage(result.message||'A verification code was sent.');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to send a verification code.')}
		finally{setSendingCode(false)}
	}

	async function verifyPhoneCode(){
		if(verifyingCode||phoneCode.length!==6)return;
		setVerifyingCode(true);setError('');setMessage('');
		try{
			const response=await fetch('/api/kyc/phone/verify',{
				method:'POST',
				headers:{'content-type':'application/json'},
				body:JSON.stringify({code:phoneCode}),
			});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to verify this phone number.');
			setPage(current=>({...current,phoneVerified:true}));
			setMessage(result.message||'Your phone number is verified.');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to verify this phone number.')}
		finally{setVerifyingCode(false)}
	}

	async function uploadProofOfAddress(){
		if(!proofFile||uploadingProof)return;
		setUploadingProof(true);setError('');setMessage('');
		try{
			const form=new FormData();
			form.append('file',proofFile);
			form.append('kind','PROOF_OF_ADDRESS');
			const response=await fetch('/api/kyc/documents',{method:'POST',body:form});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to upload proof of address.');
			setProofFile(null);
			setMessage('Your proof of address was submitted for administrator review.');
			await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to upload proof of address.')}
		finally{setUploadingProof(false)}
	}

	const verification=page.diditVerification;
	const diditStatus=verification?.status||'PENDING';
	const isSandboxResult=verification?.environment==='sandbox'&&diditStatus==='APPROVED';
	const isLiveDiditApproval=page.kycStatus==='APPROVED'&&verification?.environment==='live'&&diditStatus==='APPROVED';
	const status=page.kycStatus==='APPROVED'&&!isLiveDiditApproval
		?{label:'Approved',description:'Your existing identity verification is approved.'}
		:isSandboxResult
		?{label:'Sandbox result · not verified',description:'This simulated Didit sandbox outcome is test-only and does not approve your Aurevia account.'}
		:stateCopy[diditStatus];
	const isRealAccount=session?.user?.accountMode==='REAL';
	const canStart=page.kycStatus!=='APPROVED';
	const proofDocuments=page.documents.filter(document=>document.kind==='PROOF_OF_ADDRESS');
	const proofAlreadySubmitted=proofDocuments.some(document=>!['REJECTED','RESUBMISSION_REQUIRED'].includes(document.status));
	const canUploadProof=page.currentTier>=2&&page.kycStatus==='APPROVED'&&page.phoneVerified&&Boolean(page.address.trim())&&!proofAlreadySubmitted;

	return <><Nav/><main className="account-page">
		<header className="account-heading"><div><span className="account-kicker">Account verification</span><h1>Identity verification</h1><p>Verify your identity through Didit’s secure hosted flow.</p></div>{isLiveDiditApproval?<span className="verified-badge"><ShieldCheck size={14} aria-hidden="true"/> Verified</span>:<span className="status-pill">{loading?'Loading status':status.label}</span>}</header>
		{sessionStatus==='authenticated'&&!isRealAccount?<section className="account-panel card p-5" role="status"><h2 className="font-semibold">REAL mode required</h2><p className="mt-2 text-sm leading-6 muted">Identity verification is available only in REAL mode. Switch account mode from the navigation to continue.</p></section>:<>
			{error&&<div className="account-callout mb-4" role="alert"><span>{error}</span><button type="button" className="text-link" disabled={loading||starting} onClick={()=>void load()}>Retry</button></div>}
			{message&&<p className="mb-4 text-sm text-profit" role="status">{message}</p>}
			<section className="account-panel card p-5">
				<div className="account-panel-title"><div><h2>Didit identity verification</h2><p className="account-panel-subtitle">{status.description}</p></div><ShieldCheck size={20} className="gold" aria-hidden="true"/></div>
				<p className="mt-3 text-sm leading-6 muted">Aurevia creates a private Didit verification session for your account. Your browser is redirected only to Didit’s hosted verification URL. The callback is checked against Didit, and approval is recorded only from a confirmed provider result.</p>
				<label className="mt-4 flex items-start gap-2 text-sm leading-6 muted"><input className="mt-1" type="checkbox" checked={diditConsent} onChange={event=>setDiditConsent(event.target.checked)}/><span>I consent to Didit processing the identity information and, where required, biometric data I submit for verification and sharing the verification result with Aurevia. <Link className="text-link" href="/privacy">Review the privacy overview</Link>.</span></label>
				{verification&&<p className="mt-3 text-xs muted">Provider: Didit · Environment: {verification.environment} · Started {new Date(verification.createdAt).toLocaleString()}{verification.completedAt?` · Completed ${new Date(verification.completedAt).toLocaleString()}`:''}</p>}
				<button className="btn mt-5 bg-gold text-black" type="button" disabled={loading||starting||!canStart||!diditConsent||sessionStatus!=='authenticated'} onClick={()=>void startVerification()}>{starting?'Connecting to Didit…':verification&&['PENDING','IN_PROGRESS'].includes(diditStatus)?'Continue with Didit':'Start Didit verification'}</button>
			</section>
			<section className="account-panel card mt-4 p-5">
				<h2 className="text-lg font-semibold">Verification tiers</h2>
				<div className="mt-3 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b border-white/10"><th className="py-2 pr-4">Tier</th><th className="py-2 pr-4">Verification</th><th className="py-2">Limits / benefits</th></tr></thead><tbody>
					<tr className="border-b border-white/10"><th className="py-3 pr-4">Tier 1</th><td className="py-3 pr-4">No identity verification</td><td className="py-3">Basic access; lower configured withdrawal limits</td></tr>
					<tr className="border-b border-white/10"><th className="py-3 pr-4">Tier 2</th><td className="py-3 pr-4">Didit identity verification</td><td className="py-3">Medium configured withdrawal limits</td></tr>
					<tr><th className="py-3 pr-4">Tier 3</th><td className="py-3 pr-4">Didit identity verification and verified phone number</td><td className="py-3">Highest configured limits and full account access</td></tr>
				</tbody></table></div>
				<p className="mt-3 text-xs leading-5 muted">REAL trading and deposits are available before KYC. Withdrawals remain subject to approved KYC and existing account controls.</p>
			</section>
			{page.currentTier>=2&&<section className="account-panel card mt-4 p-5">
				<h2 className="text-lg font-semibold">Tier 3 phone verification</h2>
				<p className="mt-2 text-sm leading-6 muted">Phone verification is separate from identity verification and uses the configured SMS provider.</p>
				<div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
					<label className="account-label">Phone number<input className="input" type="tel" autoComplete="tel" inputMode="tel" value={page.phone} onChange={event=>setPage(current=>({...current,phone:event.target.value,phoneVerified:false}))} placeholder="+12125550123"/></label>
					<button className="btn bg-gold text-black self-end" type="button" disabled={sendingCode||loading||!page.phone.trim()||page.phoneVerified} onClick={()=>void sendPhoneCode()}>{sendingCode?'Sending…':page.phoneVerified?'Phone verified':'Send SMS code'}</button>
				</div>
				{!page.phoneVerified&&<div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
					<label className="account-label">Six-digit code<input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={phoneCode} onChange={event=>setPhoneCode(event.target.value.replace(/\D/g,'').slice(0,6))}/></label>
					<button className="btn bg-gold text-black self-end" type="button" disabled={verifyingCode||loading||phoneCode.length!==6} onClick={()=>void verifyPhoneCode()}>{verifyingCode?'Verifying…':'Verify phone'}</button>
				</div>}
			</section>}
			{page.currentTier>=2&&page.kycStatus==='APPROVED'&&<section className="account-panel card mt-4 p-5">
				<h2 className="text-lg font-semibold">Tier 3 proof of address</h2>
				<p className="mt-2 text-sm leading-6 muted">Didit verifies your identity. Tier 3 also requires a residential address in your profile, phone verification, proof of address, and administrator review.</p>
				{!page.address.trim()&&<p className="mt-3 text-sm muted">Add your residential address in <Link className="text-link" href="/settings#profile">Profile settings</Link> before uploading evidence.</p>}
				{proofDocuments.map(document=><div className="mt-3 rounded-lg border border-white/10 p-3 text-sm" key={document.id}><p>{document.filename} · {document.status.replaceAll('_',' ')}</p>{document.reviewNote&&<p className="mt-1 muted">{document.reviewNote}</p>}</div>)}
				{canUploadProof&&<div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><label className="account-label">Proof-of-address file<input className="input" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={event=>setProofFile(event.target.files?.[0]||null)}/><small className="muted">PDF or image · maximum 8 MB</small></label><button className="btn bg-gold text-black self-end" type="button" disabled={!proofFile||uploadingProof} onClick={()=>void uploadProofOfAddress()}>{uploadingProof?'Uploading…':'Upload proof of address'}</button></div>}
				{!canUploadProof&&!proofAlreadySubmitted&&page.address.trim()&&page.kycStatus==='APPROVED'&&<p className="mt-3 text-sm muted">Verify your phone number before uploading proof of address.</p>}
			</section>}
		</>}
	</main></>;
}
