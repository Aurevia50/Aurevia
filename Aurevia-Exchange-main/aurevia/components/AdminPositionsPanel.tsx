'use client';

import {useCallback,useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';

type Position={id:string;quantity:string;entryPrice:string;openedAt:string;user:{email:string};instrument:{symbol:string};};

export default function AdminPositionsPanel(){
	const [positions,setPositions]=useState<Position[]>([]);
	const [loading,setLoading]=useState(true);
	const [busyId,setBusyId]=useState('');
	const [error,setError]=useState('');
	const [notice,setNotice]=useState('');
	const load=useCallback(async()=>{
		setLoading(true);
		try{
			const response=await fetch('/api/admin/positions',{cache:'no-store'});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to load open positions.');
			setPositions(result);setError('');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load open positions.')}
		finally{setLoading(false)}
	},[]);
	useEffect(()=>{void load()},[load]);

	async function closePosition(position:Position){
		if(busyId)return;
		setBusyId(position.id);setError('');setNotice('');
		try{
			const response=await fetch('/api/admin/positions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({positionId:position.id})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to close this position.');
			setPositions(current=>current.filter(item=>item.id!==position.id));
			setNotice(`Closed ${position.instrument.symbol} for ${position.user.email}.`);
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to close this position.')}
		finally{setBusyId('')}
	}

	return <section className="account-panel card p-5">
		<header className="account-panel-title"><div><h2>Open positions</h2><p className="account-panel-subtitle">Administrator force-close settles the position through its owner’s internal ledger.</p></div><button type="button" className="btn min-h-11 bg-white/5" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/>Refresh</button></header>
		{notice&&<p className="mt-3 text-sm text-profit" role="status">{notice}</p>}{error&&<p className="mt-3 text-sm text-loss" role="alert">{error}</p>}
		{loading&&!positions.length?<p className="account-empty" role="status">Loading open positions…</p>:positions.length?<div className="mt-3 divide-y divide-white/10">{positions.map(position=><article className="flex flex-wrap items-center justify-between gap-3 py-3" key={position.id}><div className="min-w-0"><b>{position.instrument.symbol} · {position.user.email}</b><p className="break-all text-xs muted">{position.id} · {Number(position.quantity).toLocaleString()} units · entry {Number(position.entryPrice).toLocaleString()} · opened {new Date(position.openedAt).toLocaleString()}</p></div><button className="btn min-h-11 bg-loss text-black" type="button" disabled={Boolean(busyId)} onClick={()=>void closePosition(position)}>{busyId===position.id?'Closing…':'Force close'}</button></article>)}</div>:<p className="account-empty">No open positions.</p>}
	</section>;
}
