'use client';

import {FormEvent,useEffect,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useSession} from 'next-auth/react';

type ConsentState='checking'|'required'|'accepted'|'error'|'inactive';
type ConsentResponse={accepted?:boolean;version?:string;error?:string};
const policyPaths=new Set(['/terms','/privacy','/risk-disclosure']);

export default function PolicyConsentGate({children,initialUserId}:{children:ReactNode;initialUserId:string|null}){
	const pathname=usePathname();
	const {data:session,status}=useSession();
	const dialogRef=useRef<HTMLDialogElement>(null);
	const [state,setState]=useState<ConsentState>('inactive');
	const [checked,setChecked]=useState(false);
	const [version,setVersion]=useState('');
	const [busy,setBusy]=useState(false);
	const [error,setError]=useState('');
	const [retryKey,setRetryKey]=useState(0);
	const userId=session?.user?.id;
	const eligible=status==='authenticated'&&(session?.user?.role==='USER'||session?.user?.role==='ADMIN')&&Boolean(userId)&&!policyPaths.has(pathname);
	const checkingSession=status==='loading'&&Boolean(initialUserId)&&!policyPaths.has(pathname);
	const visible=checkingSession||eligible&&(state==='checking'||state==='required'||state==='error');
	const blockContent=checkingSession||eligible&&state!=='accepted';

	useEffect(()=>{
		if(!eligible||!userId){
			setState('inactive');
			setChecked(false);
			setVersion('');
			setError('');
			return;
		}
		const controller=new AbortController();
		setState('checking');
		setChecked(false);
		setVersion('');
		setError('');
		void fetch('/api/policy-consent',{cache:'no-store',signal:controller.signal})
			.then(async response=>{
				const result=await response.json() as ConsentResponse;
				if(!response.ok)throw new Error(result.error||'Terms acceptance status is temporarily unavailable.');
				if(!result.version)throw new Error('Current Terms & Conditions version is unavailable.');
				setVersion(result.version);
				setState(result.accepted?'accepted':'required');
			})
			.catch(exception=>{
				if(controller.signal.aborted)return;
				setError(exception instanceof Error?exception.message:'Terms acceptance status is temporarily unavailable.');
				setState('error');
			});
		return()=>controller.abort();
	},[eligible,userId,pathname,retryKey]);

	useEffect(()=>{
		const dialog=dialogRef.current;
		if(!dialog)return;
		if(visible&&!dialog.open)dialog.showModal();
		if(!visible&&dialog.open)dialog.close();
	},[visible]);

	async function acceptTerms(event:FormEvent<HTMLFormElement>){
		event.preventDefault();
		if(!checked||busy||!version)return;
		setBusy(true);
		setError('');
		try{
			const response=await fetch('/api/policy-consent',{
				method:'POST',
				headers:{'content-type':'application/json'},
				body:JSON.stringify({version,accepted:true}),
			});
			const result=await response.json() as ConsentResponse;
			if(!response.ok)throw new Error(result.error||'We could not save your acceptance. Please try again.');
			setState('accepted');
			setChecked(false);
			window.location.reload();
		}catch(exception){
			setError(exception instanceof Error?exception.message:'We could not save your acceptance. Please try again.');
			setState('error');
		}finally{
			setBusy(false);
		}
	}

	return <>
		{!blockContent&&children}
		<dialog
		ref={dialogRef}
		className="policy-consent-dialog"
		aria-labelledby="policy-consent-title"
		aria-describedby="policy-consent-description"
		onCancel={event=>event.preventDefault()}
	>
		<div className="policy-consent-content">
			<p className="policy-consent-eyebrow">AUREVIA EXCHANGE</p>
			<h2 id="policy-consent-title">Terms &amp; Conditions</h2>
			<p id="policy-consent-description">Please review and accept Aurevia’s Terms &amp; Conditions before continuing.</p>
			{(checkingSession||state==='checking')&&<p role="status">Checking your current acceptance…</p>}
			<div className="policy-consent-links">
				<Link href="/terms">Read the complete Terms &amp; Conditions</Link>
				<Link href="/privacy">Privacy Policy</Link>
			</div>
			{state==='error'&&<p className="policy-consent-error" role="alert">{error}</p>}
			{state==='required'&&error&&<p className="policy-consent-error" role="alert">{error}</p>}
			{state==='error'?<button className="policy-consent-retry" type="button" onClick={()=>{setState('checking');setRetryKey(value=>value+1)}}>Retry</button>:state==='checking'||checkingSession?null:<form onSubmit={acceptTerms}>
				<label className="policy-consent-check">
					<input type="checkbox" checked={checked} onChange={event=>setChecked(event.target.checked)}/>
					<span>I have read and agree to the Terms &amp; Conditions.</span>
				</label>
				{state==='required'&&<button className="policy-consent-accept" type="submit" disabled={!checked||busy}>{busy?'Saving…':'Accept & Continue'}</button>}
			</form>}
		</div>
		</dialog>
	</>;
}
