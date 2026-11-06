'use client';

import {useState} from 'react';
import Link from 'next/link';
import {LoaderCircle,Sparkles} from 'lucide-react';

type Step={id:string;title:string;href:string};
type OnboardingResult={
	guidance:{summary:string;caveat:string};
	steps:Step[];
};

export default function OnboardingAssistant(){
	const [result,setResult]=useState<OnboardingResult|null>(null);
	const [error,setError]=useState('');
	const [busy,setBusy]=useState(false);

	async function explainNextSteps(){
		setBusy(true);
		setError('');
		setResult(null);
		try{
			const response=await fetch('/api/onboarding/assistant',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
			const body=await response.json();
			if(!response.ok)throw new Error(body.error||'Onboarding guidance is unavailable.');
			setResult(body as OnboardingResult);
		}catch(exception){
			setError(exception instanceof Error?exception.message:'Onboarding guidance is unavailable.');
		}finally{
			setBusy(false);
		}
	}

	return <section className="account-callout mt-4" aria-label="Smart onboarding guidance" aria-live="polite">
		<div className="flex flex-wrap items-center justify-between gap-3">
			<div><strong>Need help with your next steps?</strong><p className="mt-1 text-sm muted">Get a generated explanation of your existing checklist. KYC and tier reviews remain manual.</p></div>
			<button className="button-secondary" type="button" onClick={()=>void explainNextSteps()} disabled={busy}>
				{busy?<LoaderCircle size={14} className="animate-spin"/>:<Sparkles size={14}/>}
				{busy?'Preparing guidance…':'Explain my checklist'}
			</button>
		</div>
		{error&&<p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
		{result&&<div className="mt-3">
			<p>{result.guidance.summary}</p>
			{result.steps.length>0&&<ul className="mt-2 grid gap-2">{result.steps.map(step=><li key={step.id}><Link className="text-link" href={step.href}>{step.title}</Link></li>)}</ul>}
			<p className="mt-2 text-xs muted">{result.guidance.caveat}</p>
		</div>}
	</section>;
}
