'use client';

import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';

type CallbackState='checking'|'approved'|'pending'|'rejected'|'expired'|'sandbox'|'failed'|'invalid';

export default function DiditCallbackPage(){
	const [state,setState]=useState<CallbackState>('checking');
	const started=useRef(false);

	useEffect(()=>{
		if(started.current)return;
		started.current=true;
		const sessionId=new URLSearchParams(window.location.search).get('verificationSessionId');
		if(!sessionId){
			setState('invalid');
			return;
		}
		void fetch('/api/auth/didit/callback',{
			method:'POST',
			headers:{'content-type':'application/json'},
			body:JSON.stringify({sessionId}),
		}).then(async response=>{
			if(!response.ok)throw new Error('DIDIT_CALLBACK_UNAVAILABLE');
			const result:{status:string;environment:'sandbox'|'live';applied:boolean}=await response.json();
			if(result.environment==='sandbox'||!result.applied)setState('sandbox');
			else if(result.status==='APPROVED')setState('approved');
			else if(result.status==='REJECTED')setState('rejected');
			else if(result.status==='EXPIRED')setState('expired');
			else setState('pending');
		}).catch(()=>setState('failed'));
	},[]);

	const content:Record<CallbackState,{title:string;description:string}>={
		checking:{title:'Confirming your identity verification',description:'Aurevia is confirming the result directly with Didit. The redirect status is not treated as proof of approval.'},
		approved:{title:'Identity verification approved',description:'Didit confirmed your identity verification. Return to your account to see the updated status.'},
		pending:{title:'Verification is still in progress',description:'Didit has not returned a final decision yet. Your account will update when Didit sends its signed result.'},
		rejected:{title:'Verification was not approved',description:'Didit returned a declined decision. Review the KYC page for the current status and next steps.'},
		expired:{title:'Verification session expired',description:'This Didit session expired. Start a new verification session from your KYC page.'},
		sandbox:{title:'Didit sandbox result received',description:'This is a test-only verification result. Aurevia records sandbox results for testing but does not apply them to your account’s identity status.'},
		failed:{title:'Result not confirmed',description:'Aurevia could not confirm this result with Didit. The redirect alone cannot approve your account.'},
		invalid:{title:'Invalid verification callback',description:'This callback is missing its Didit session identifier.'},
	};
	const message=content[state];

	return <><Nav/><main className="auth-scene"><section className="auth-card auth-register-card" aria-labelledby="didit-callback-title">
		<div className="gold text-sm font-semibold">Aurevia identity verification</div>
		<h1 id="didit-callback-title" className="auth-heading mt-3">{message.title}</h1>
		<p className="mt-3 text-sm leading-6 muted" role="status">{message.description}</p>
		<Link className="auth-submit mt-5 block w-full text-center" href="/kyc">Return to KYC</Link>
	</section></main></>;
}
