'use client';

import {useEffect,useState} from 'react';
import {CalendarClock,Radio,RefreshCw,VideoOff} from 'lucide-react';
import {broadcastMediaSource} from '@/lib/broadcast-policy';

type Broadcast={id:string;title:string;description:string;streamUrl:string|null;startsAt:string|null;status:'SCHEDULED'|'PUBLISHED'|'ENDED';publishedAt:string|null;endedAt:string|null};

export default function BroadcastsExperience(){
	const [broadcasts,setBroadcasts]=useState<Broadcast[]>([]);
	const [loading,setLoading]=useState(true);
	const [error,setError]=useState('');
	const [updatedAt,setUpdatedAt]=useState('');

	async function load(){
		setError('');
		try{
			const response=await fetch('/api/broadcasts',{cache:'no-store'});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to load broadcasts.');
			setBroadcasts(result.broadcasts);setUpdatedAt(new Date().toISOString());
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load broadcasts.')}
		finally{setLoading(false)}
	}

	useEffect(()=>{void load()},[]);

	return <main className="account-page">
		<header className="account-heading"><div><span className="account-kicker">AUREVIA · LIVE PROGRAMMING</span><h1>Broadcasts</h1><p>Published sessions and scheduled recordings for all active Tier 1 accounts.</p></div><button className="icon-action" type="button" aria-label="Refresh broadcasts" onClick={()=>void load()}><RefreshCw size={15}/></button></header>
		{updatedAt&&<p className="mb-3 text-xs muted">Updated {new Date(updatedAt).toLocaleTimeString()}</p>}
		{error&&<div className="account-callout mb-3" role="alert">{error}<button className="text-link ml-2" type="button" onClick={()=>void load()}>Retry</button></div>}
		{loading?<p className="account-empty" role="status">Loading broadcasts…</p>:broadcasts.length?<div className="divide-y divide-white/10 border-y border-white/10">{broadcasts.map(item=>{
			const media=broadcastMediaSource(item.streamUrl);const upcoming=item.startsAt&&new Date(item.startsAt)>new Date();
			return <article className="grid gap-4 py-5 md:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]" key={item.id}>
				<div><div className="flex flex-wrap items-center gap-2"><span className={`status-pill ${item.status==='PUBLISHED'&&!upcoming?'text-profit':''}`}>{upcoming?'SCHEDULED':item.status.replaceAll('_',' ')}</span>{upcoming&&<span className="flex items-center gap-1 text-xs muted"><CalendarClock size={13}/>{new Date(item.startsAt!).toLocaleString()}</span>}</div><h2 className="mt-2 text-xl font-semibold">{item.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 muted">{item.description}</p>{item.status==='ENDED'&&item.endedAt&&<p className="mt-3 text-xs muted">Ended {new Date(item.endedAt).toLocaleString()}</p>}</div>
				<div className="min-w-0 self-start">{media?.kind==='video'?<video className="aspect-video w-full rounded-md bg-black" controls playsInline preload="metadata"><source src={media.url}/></video>:media?.kind==='embed'?<div className="aspect-video overflow-hidden rounded-md bg-black"><iframe className="h-full w-full" src={media.url} title={item.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>:item.streamUrl?<a className="btn min-h-11 bg-white/5" href={item.streamUrl} target="_blank" rel="noreferrer">Open configured stream source</a>:<div className="flex aspect-video items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.02] text-sm muted"><VideoOff size={16}/>No stream source configured</div>}</div>
			</article>;
		})}</div>:<div className="account-empty"><Radio size={18}/><p>No broadcasts are currently scheduled or published.</p></div>}
	</main>;
}