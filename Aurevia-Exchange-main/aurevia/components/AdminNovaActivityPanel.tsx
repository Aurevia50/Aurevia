'use client';

import {useCallback,useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';

type NovaActivity={
	id:string;
	userId:string|null;
	conversationId:string|null;
	action:string;
	eventTypes:string[];
	accountMode:'DEMO'|'REAL'|null;
	symbol:string|null;
	source:string|null;
	freshness:string|null;
	externalAction:boolean;
	providerResult:string|null;
	createdAt:string;
};

export default function AdminNovaActivityPanel(){
	const [events,setEvents]=useState<NovaActivity[]>([]);
	const [error,setError]=useState('');
	const [loading,setLoading]=useState(true);

	const load=useCallback(async()=>{
		setLoading(true);
		try{
			const response=await fetch('/api/admin/nova-activity',{cache:'no-store'});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to load Nova activity.');
			setEvents(result);setError('');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load Nova activity.');}
		finally{setLoading(false);}
	},[]);

	useEffect(()=>{void load()},[load]);

	return <section id="nova-activity" className="card p-4 sm:p-5">
		<header className="flex flex-wrap items-start justify-between gap-3">
			<div><h2 className="font-bold">Nova activity</h2><p className="mt-1 text-sm muted">Redacted action metadata from the last 30 days. Private questions and conversation text are not included.</p></div>
			<button className="btn min-h-11 bg-white/5" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/>Refresh</button>
		</header>
		{error&&<p className="mt-3 text-sm text-loss" role="alert">{error}</p>}
		{loading&&!events.length?<p className="mt-4 muted" role="status">Loading Nova activity…</p>:events.length?<div className="mt-3 divide-y divide-white/10">{events.map(event=><article key={event.id} className="py-3">
			<div className="flex flex-wrap justify-between gap-2"><b>{event.eventTypes.length?event.eventTypes.join(' · '):event.action.replaceAll('_',' ')}</b><time className="muted text-xs">{new Date(event.createdAt).toLocaleString()}</time></div>
			<p className="mt-1 break-all text-sm muted">User {event.userId||'unavailable'}{event.accountMode?` · ${event.accountMode}`:''}{event.conversationId?` · Conversation ${event.conversationId}`:''}</p>
			{(event.symbol||event.source||event.freshness||event.providerResult)&&<p className="mt-1 break-all text-xs muted">{[event.symbol&&`Symbol ${event.symbol}`,event.source&&`Source ${event.source}`,event.freshness&&`Freshness ${event.freshness}`,event.providerResult&&`Provider result ${event.providerResult}`].filter(Boolean).join(' · ')}</p>}
			<p className="mt-1 text-xs muted">External action: {event.externalAction?'recorded':'none'}</p>
		</article>)}</div>:<p className="mt-4 muted">No Nova activity recorded in the last 30 days.</p>}
	</section>;
}
