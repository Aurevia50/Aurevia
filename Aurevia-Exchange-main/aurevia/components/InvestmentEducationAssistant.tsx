'use client';

import {FormEvent,useState} from 'react';
import {BookOpen,LoaderCircle,Send} from 'lucide-react';

export default function InvestmentEducationAssistant(){
	const [question,setQuestion]=useState('');
	const [answer,setAnswer]=useState('');
	const [error,setError]=useState('');
	const [busy,setBusy]=useState(false);

	async function ask(event:FormEvent<HTMLFormElement>){
		event.preventDefault();
		const text=question.trim();
		if(text.length<3||busy)return;
		setBusy(true);setError('');setAnswer('');
		try{
			const response=await fetch('/api/education/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:text})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'The learning assistant is unavailable.');
			setAnswer(String(result.answer||''));
		}catch(exception){
			setError(exception instanceof Error?exception.message:'The learning assistant is unavailable.');
		}finally{setBusy(false)}
	}

	return <section className="account-panel card p-5" aria-labelledby="education-ai-heading">
		<div className="account-panel-title"><div><h2 id="education-ai-heading"><BookOpen size={17} className="gold"/> Learning assistant</h2><p className="account-panel-subtitle">Ask a general investing or market-terminology question. Replies are generated education, not personalized advice.</p></div></div>
		<form className="admin-ai-assistant-form" onSubmit={ask}>
			<label htmlFor="education-ai-question">Question</label>
			<div><input id="education-ai-question" value={question} onChange={event=>setQuestion(event.target.value)} minLength={3} maxLength={700} placeholder="What is diversification?" required/><button type="submit" disabled={busy||question.trim().length<3}>{busy?<LoaderCircle size={15} className="animate-spin"/>:<Send size={15}/>} {busy?'Explaining…':'Ask'}</button></div>
		</form>
		{error&&<p className="admin-command-center-message is-error" role="alert">{error}</p>}
		{answer&&<p className="admin-ai-assistant-answer" role="status">Generated education · {answer}</p>}
	</section>;
}
