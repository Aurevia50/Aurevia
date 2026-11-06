'use client';

import {FormEvent,useState} from 'react';
import {BookOpenCheck,LoaderCircle,Send} from 'lucide-react';

type Reflection={reflection:string;observations:string[];questions:string[];caveat:string};

export default function TradingJournalAssistant(){
	const [question,setQuestion]=useState('');
	const [reflection,setReflection]=useState<Reflection|null>(null);
	const [error,setError]=useState('');
	const [busy,setBusy]=useState(false);

	async function ask(event:FormEvent<HTMLFormElement>){
		event.preventDefault();
		const text=question.trim();
		if(text.length<3||busy)return;
		setBusy(true);setError('');setReflection(null);
		try{
			const response=await fetch('/api/portfolio/journal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:text})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Journal reflection is unavailable.');
			setReflection(result.reflection as Reflection);
		}catch(exception){
			setError(exception instanceof Error?exception.message:'Journal reflection is unavailable.');
		}finally{setBusy(false)}
	}

	return <section className="account-panel card mt-4 p-5" aria-labelledby="trading-journal-heading">
		<div className="account-panel-title"><div><h2 id="trading-journal-heading"><BookOpenCheck size={17} className="gold"/> AI trading journal</h2><p className="account-panel-subtitle">A neutral reflection on aggregated closed-trade outcomes from the last 90 days. Historical results do not predict future outcomes.</p></div></div>
		<form className="admin-ai-assistant-form" onSubmit={ask}>
			<label htmlFor="trading-journal-question">Reflection prompt</label>
			<div><input id="trading-journal-question" value={question} onChange={event=>setQuestion(event.target.value)} minLength={3} maxLength={500} placeholder="What patterns appear in my recent closed trades?" required/><button type="submit" disabled={busy||question.trim().length<3}>{busy?<LoaderCircle size={15} className="animate-spin"/>:<Send size={15}/>} {busy?'Reflecting…':'Reflect'}</button></div>
		</form>
		{error&&<p className="admin-command-center-message is-error" role="alert">{error}</p>}
		{reflection&&<div className="admin-ai-assistant-answer" role="status"><p><strong>Generated reflection</strong> · {reflection.reflection}</p>{reflection.observations.length>0&&<ul>{reflection.observations.map((item,index)=><li key={`${index}-${item}`}>{item}</li>)}</ul>}{reflection.questions.length>0&&<><strong>Questions for your journal</strong><ul>{reflection.questions.map((item,index)=><li key={`${index}-${item}`}>{item}</li>)}</ul></>}<p>{reflection.caveat}</p></div>}
	</section>;
}
