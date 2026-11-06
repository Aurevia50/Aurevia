'use client';

import {FormEvent,useState} from 'react';
import {BriefcaseBusiness,LoaderCircle,Send} from 'lucide-react';

type Analysis={summary:string;riskFactors:string[];caveat:string};

export default function PortfolioAssistant(){
	const [question,setQuestion]=useState('');
	const [analysis,setAnalysis]=useState<Analysis|null>(null);
	const [error,setError]=useState('');
	const [busy,setBusy]=useState(false);

	async function ask(event:FormEvent<HTMLFormElement>){
		event.preventDefault();
		const text=question.trim();
		if(text.length<3||busy)return;
		setBusy(true);setError('');setAnalysis(null);
		try{
			const response=await fetch('/api/portfolio/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:text})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Portfolio analysis is unavailable.');
			setAnalysis(result.analysis as Analysis);
		}catch(exception){
			setError(exception instanceof Error?exception.message:'Portfolio analysis is unavailable.');
		}finally{setBusy(false)}
	}

	return <section className="account-panel card mt-4 p-5" aria-labelledby="portfolio-assistant-heading">
		<div className="account-panel-title"><div><h2 id="portfolio-assistant-heading"><BriefcaseBusiness size={17} className="gold"/> Portfolio intelligence</h2><p className="account-panel-subtitle">Ask about exposure concentration in your open positions. Cash, investments and pending orders are excluded; this is educational analysis, not a trade recommendation.</p></div></div>
		<form className="admin-ai-assistant-form" onSubmit={ask}>
			<label htmlFor="portfolio-ai-question">Question</label>
			<div><input id="portfolio-ai-question" value={question} onChange={event=>setQuestion(event.target.value)} minLength={3} maxLength={500} placeholder="How concentrated are my open positions?" required/><button type="submit" disabled={busy||question.trim().length<3}>{busy?<LoaderCircle size={15} className="animate-spin"/>:<Send size={15}/>} {busy?'Analyzing…':'Ask'}</button></div>
		</form>
		{error&&<p className="admin-command-center-message is-error" role="alert">{error}</p>}
		{analysis&&<div className="admin-ai-assistant-answer" role="status"><p><strong>Generated analysis</strong> · {analysis.summary}</p>{analysis.riskFactors.length>0&&<ul>{analysis.riskFactors.map((factor,index)=><li key={`${index}-${factor}`}>{factor}</li>)}</ul>}<p>{analysis.caveat}</p></div>}
	</section>;
}
