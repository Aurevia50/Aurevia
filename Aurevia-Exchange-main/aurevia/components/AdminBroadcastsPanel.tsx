'use client';

import {FormEvent,useCallback,useEffect,useState} from 'react';
import {CalendarClock,Check,Edit3,Plus,Radio,RefreshCw,Trash2} from 'lucide-react';

type Broadcast={id:string;title:string;description:string;streamUrl:string|null;startsAt:string|null;status:string;publishedAt:string|null;endedAt:string|null;archivedAt:string|null;createdAt:string;createdBy:{id:string;name:string|null;email:string}};
type Draft={title:string;description:string;streamUrl:string;startsAt:string;status:'DRAFT'|'SCHEDULED'};
const emptyDraft:Draft={title:'',description:'',streamUrl:'',startsAt:'',status:'DRAFT'};

function dateInput(value:string|null){
	if(!value)return '';
	const date=new Date(value);date.setMinutes(date.getMinutes()-date.getTimezoneOffset());
	return date.toISOString().slice(0,16);
}

export default function AdminBroadcastsPanel(){
	const [broadcasts,setBroadcasts]=useState<Broadcast[]>([]);
	const [draft,setDraft]=useState<Draft>(emptyDraft);
	const [editingId,setEditingId]=useState('');
	const [loading,setLoading]=useState(true);
	const [busy,setBusy]=useState('');
	const [error,setError]=useState('');
	const [notice,setNotice]=useState('');

	const load=useCallback(async(showLoading=false)=>{
		if(showLoading)setLoading(true);
		try{
			const response=await fetch('/api/admin/broadcasts',{cache:'no-store'});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to load broadcasts.');
			setBroadcasts(result);setError('');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load broadcasts.')}
		finally{setLoading(false)}
	},[]);

	useEffect(()=>{void load(true)},[load]);

	function edit(item:Broadcast){
		setEditingId(item.id);setDraft({title:item.title,description:item.description,streamUrl:item.streamUrl||'',startsAt:dateInput(item.startsAt),status:item.status==='SCHEDULED'?'SCHEDULED':'DRAFT'});setNotice('');
	}

	async function save(event:FormEvent<HTMLFormElement>){
		event.preventDefault();if(busy)return;
		setBusy('save');setError('');setNotice('');
		const startsAt=draft.startsAt?new Date(draft.startsAt).toISOString():null;
		const payload={title:draft.title,description:draft.description,streamUrl:draft.streamUrl.trim()||null,startsAt,...(!editingId?{status:draft.status}:{})};
		try{
			const response=await fetch('/api/admin/broadcasts',{method:editingId?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(editingId?{action:'update',id:editingId,...payload}:payload)});
			const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to save broadcast.');
			setNotice(editingId?'Broadcast updated.':'Broadcast created.');setDraft(emptyDraft);setEditingId('');await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to save broadcast.')}
		finally{setBusy('')}
	}

	async function transition(item:Broadcast,action:string){
		if(busy)return;setBusy(`${item.id}:${action}`);setError('');setNotice('');
		try{
			const response=await fetch('/api/admin/broadcasts',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:item.id,action})});
			const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to update broadcast status.');
			setNotice(`Broadcast status updated to ${result.status.toLowerCase()}.`);await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to update broadcast status.')}
		finally{setBusy('')}
	}

	async function remove(item:Broadcast){
		if(!window.confirm(`Move "${item.title}" to Deleted Items? Its public listing will be removed immediately and the record can be restored later.`))return;
		if(busy)return;setBusy(`${item.id}:delete`);setError('');setNotice('');
		try{
			const response=await fetch('/api/admin/broadcasts',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id:item.id})});
			const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to move this broadcast to Deleted Items.');
			setNotice('Broadcast moved to Deleted Items.');await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to move this broadcast to Deleted Items.');}
		finally{setBusy('')}
	}

	function actions(status:string){
		if(status==='DRAFT')return ['schedule','publish','archive'];
		if(status==='SCHEDULED')return ['publish','archive'];
		if(status==='PUBLISHED')return ['end','archive'];
		if(status==='ENDED')return ['archive'];
		return [];
	}

	return <div className="account-page">
		<header className="account-heading"><div><span className="account-kicker">WORKSPACE · BROADCASTS</span><h1>Broadcast management</h1><p>Publish configured streams or recordings to all active Tier 1 accounts.</p></div><button type="button" className="icon-action" aria-label="Refresh broadcasts" onClick={()=>void load(true)}><RefreshCw size={15}/></button></header>
		{error&&<div className="account-callout mb-3" role="alert">{error}</div>}{notice&&<p className="mb-3 text-sm text-profit" role="status">{notice}</p>}
		<section className="account-panel p-5"><div className="account-panel-title"><div><h2>{editingId?'Edit broadcast':'Create broadcast'}</h2><p className="account-panel-subtitle">A stream URL is optional. No video is shown unless a supported source is configured.</p></div><Radio size={18} className="gold"/></div>
			<form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event=>void save(event)}>
				<label className="account-label">Title<input className="input" required minLength={3} maxLength={120} value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/></label>
				<label className="account-label">Schedule time<input className="input" type="datetime-local" value={draft.startsAt} onChange={event=>setDraft({...draft,startsAt:event.target.value})}/></label>
				<label className="account-label sm:col-span-2">Description<textarea className="input min-h-24" required minLength={5} maxLength={3000} value={draft.description} onChange={event=>setDraft({...draft,description:event.target.value})}/></label>
				<label className="account-label sm:col-span-2">HTTPS stream or recording URL (optional)<input className="input" type="url" inputMode="url" maxLength={2048} placeholder="https://…" value={draft.streamUrl} onChange={event=>setDraft({...draft,streamUrl:event.target.value})}/></label>
				{!editingId&&<label className="account-label">Initial state<select className="input" value={draft.status} onChange={event=>setDraft({...draft,status:event.target.value as Draft['status']})}><option value="DRAFT">Draft</option><option value="SCHEDULED">Scheduled</option></select></label>}
				<div className="flex flex-wrap items-end gap-2 sm:col-span-2"><button className="btn bg-gold text-black" disabled={busy==='save'}>{busy==='save'?'Saving…':editingId?<><Check size={15}/> Save changes</>:<><Plus size={15}/> Create broadcast</>}</button>{editingId&&<button type="button" className="btn bg-white/5" onClick={()=>{setEditingId('');setDraft(emptyDraft)}}>Cancel edit</button>}</div>
			</form>
		</section>
		<section className="mt-5"><div className="account-panel-title mb-3"><div><h2>Broadcast history</h2><p className="account-panel-subtitle">Status changes are retained; ended and archived items remain searchable here.</p></div></div>
			{loading&&!broadcasts.length?<p className="account-empty" role="status">Loading broadcasts…</p>:broadcasts.length?<div className="divide-y divide-white/10 rounded-md border border-white/10">{broadcasts.map(item=><article className="p-4" key={item.id}>
				<header className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><span className="account-kicker">{item.status}</span><h3 className="mt-1 text-lg font-semibold">{item.title}</h3><p className="mt-1 break-words text-sm muted">{item.description}</p><small className="mt-2 block break-all muted">{item.startsAt?`Scheduled ${new Date(item.startsAt).toLocaleString()} · `:''}{item.streamUrl?'Source configured':'No stream source'} · Ref {item.id}</small></div>
					{item.status==='DRAFT'||item.status==='SCHEDULED'?<button type="button" className="icon-action" aria-label={`Edit ${item.title}`} onClick={()=>edit(item)}><Edit3 size={15}/></button>:null}</header>
				<div className="mt-3 flex flex-wrap gap-2">{actions(item.status).map(action=><button className={`btn min-h-10 ${action==='archive'||action==='end'?'bg-white/5':'bg-gold text-black'}`} type="button" key={action} disabled={Boolean(busy)} onClick={()=>void transition(item,action)}>{busy===`${item.id}:${action}`?'Saving…':action==='schedule'?<><CalendarClock size={14}/> Schedule</>:action==='publish'?<><Check size={14}/> Publish</>:action.replaceAll('_',' ')}</button>)}<button className="btn min-h-10 bg-white/5" type="button" disabled={Boolean(busy)} onClick={()=>void remove(item)}><Trash2 size={14}/>Move to Deleted Items</button></div>
				</article>)}</div>:<p className="account-empty">No broadcasts have been created.</p>}
		</section>
	</div>;
}