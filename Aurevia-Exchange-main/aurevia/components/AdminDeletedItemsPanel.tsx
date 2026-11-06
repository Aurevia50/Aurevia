'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {RefreshCw,RotateCcw,Search,Trash2,Undo2} from 'lucide-react';

type ItemType='WAITLIST_ENTRY'|'CLIENT_STORY'|'BROADCAST';
type DeletedItem={id:string;type:ItemType;displayName:string;details:string;deletedAt:string;deletedBy:{id:string;name:string|null;email:string}|null;originalLocation:string};
type Filter='ALL'|ItemType;

const typeLabels:Record<ItemType,string>={WAITLIST_ENTRY:'Waitlist entry',CLIENT_STORY:'Client story',BROADCAST:'Broadcast'};

export default function AdminDeletedItemsPanel(){
	const [items,setItems]=useState<DeletedItem[]>([]);
	const [search,setSearch]=useState('');
	const [filter,setFilter]=useState<Filter>('ALL');
	const [selected,setSelected]=useState<Set<string>>(new Set());
	const [loading,setLoading]=useState(true);
	const [busy,setBusy]=useState(false);
	const [error,setError]=useState('');
	const [notice,setNotice]=useState('');

	const load=useCallback(async()=>{
		setLoading(true);setError('');
		try{
			const params=new URLSearchParams();
			if(search.trim())params.set('search',search.trim());
			if(filter!=='ALL')params.set('type',filter);
			const response=await fetch(`/api/admin/deleted-items?${params.toString()}`,{cache:'no-store'});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to load Deleted Items.');
			setItems(result as DeletedItem[]);
			setSelected(new Set());
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load Deleted Items.');}
		finally{setLoading(false);}
	},[filter,search]);

	useEffect(()=>{const timer=window.setTimeout(()=>void load(),180);return()=>window.clearTimeout(timer)},[load]);

	const selectedItems=useMemo(()=>items.filter(item=>selected.has(`${item.type}:${item.id}`)),[items,selected]);

	function toggle(item:DeletedItem){
		const key=`${item.type}:${item.id}`;
		setSelected(current=>{const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next;});
	}

	function toggleVisible(){
		setSelected(current=>{
			const next=new Set(current);
			const visible=items.map(item=>`${item.type}:${item.id}`);
			if(visible.length&&visible.every(key=>next.has(key)))visible.forEach(key=>next.delete(key));
			else visible.forEach(key=>next.add(key));
			return next;
		});
	}

	async function act(action:'restore'|'permanently-delete',targets:DeletedItem[]){
		if(!targets.length||busy)return;
		if(action==='permanently-delete'&&!window.confirm(`Permanently delete ${targets.length} selected item${targets.length===1?'':'s'}? This cannot be undone.`))return;
		setBusy(true);setError('');setNotice('');
		try{
			const response=await fetch('/api/admin/deleted-items',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,items:targets.map(({type,id})=>({type,id}))})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to update Deleted Items.');
			setNotice(result.warning||`${result.affected} item${result.affected===1?'':'s'} ${action==='restore'?'restored':'permanently deleted'}.`);
			await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to update Deleted Items.');}
		finally{setBusy(false);}
	}

	return <div className="account-page">
		<header className="account-heading"><div><span className="account-kicker">WORKSPACE · RECORD RETENTION</span><h1>Deleted Items</h1><p>Restore content removed by an administrator or permanently delete it when retention rules allow.</p></div><button className="icon-action" type="button" aria-label="Refresh Deleted Items" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/></button></header>
		<section className="account-panel p-4 sm:p-5">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div><h2 className="font-semibold">Recycle Bin</h2><p className="mt-1 text-sm muted">{items.length} {items.length===1?'item':'items'} shown · Changes are recorded in the administrator audit log.</p></div>
				<div className="flex flex-wrap gap-2">
					<button className="btn min-h-11 bg-white/5" type="button" disabled={busy||selectedItems.length===0} onClick={()=>void act('restore',selectedItems)}><Undo2 size={15}/>Restore selected</button>
					<button className="btn min-h-11 bg-loss text-black" type="button" disabled={busy||selectedItems.length===0} onClick={()=>void act('permanently-delete',selectedItems)}><Trash2 size={15}/>Delete selected permanently</button>
				</div>
			</div>
			<div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
				<label className="relative"><Search size={15} className="absolute left-3 top-3.5 muted" aria-hidden="true"/><input className="input pl-9" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search deleted items" aria-label="Search deleted items" maxLength={120}/></label>
				<label className="sr-only" htmlFor="deleted-item-type">Filter by item type</label><select id="deleted-item-type" className="input" value={filter} onChange={event=>setFilter(event.target.value as Filter)}><option value="ALL">All item types</option>{Object.entries(typeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
			</div>
			{error&&<p className="mt-3 text-sm text-loss" role="alert">{error}</p>}{notice&&<p className="mt-3 text-sm text-profit" role="status">{notice}</p>}
			{loading?<p className="account-empty" role="status">Loading deleted items…</p>:items.length?<div className="mt-4 overflow-hidden rounded-md border border-white/10">
				<div className="hidden grid-cols-[36px_minmax(180px,1.4fr)_minmax(180px,1.6fr)_minmax(140px,1fr)_minmax(120px,.8fr)_auto] gap-3 border-b border-white/10 bg-white/[.03] px-4 py-3 text-[10px] font-semibold uppercase tracking-[.12em] muted lg:grid"><span><input type="checkbox" aria-label="Select all visible items" checked={items.length>0&&items.every(item=>selected.has(`${item.type}:${item.id}`))} onChange={toggleVisible}/></span><span>Item</span><span>Details</span><span>Deleted by</span><span>Deleted at</span><span>Actions</span></div>
				{items.map(item=>{
					const key=`${item.type}:${item.id}`;
					return <article className="grid gap-3 border-b border-white/10 p-4 last:border-b-0 lg:grid-cols-[36px_minmax(180px,1.4fr)_minmax(180px,1.6fr)_minmax(140px,1fr)_minmax(120px,.8fr)_auto] lg:items-center" key={key}>
						<label className="flex min-h-8 items-center gap-2 text-xs muted lg:justify-center"><input type="checkbox" checked={selected.has(key)} onChange={()=>toggle(item)} aria-label={`Select ${item.displayName}`}/><span className="lg:hidden">Select item</span></label>
						<div className="min-w-0"><span className="status-pill">{typeLabels[item.type]}</span><h3 className="mt-2 break-words font-semibold">{item.displayName}</h3><p className="mt-1 break-all text-[11px] muted">{item.id}</p></div>
						<div className="min-w-0"><p className="line-clamp-3 break-words text-sm muted">{item.details}</p><a className="mt-1 inline-block text-xs gold underline" href={item.originalLocation}>Original location: {item.originalLocation}</a></div>
						<div className="break-words text-sm">{item.deletedBy?.name||item.deletedBy?.email||'Administrator no longer active'}<p className="mt-1 text-xs muted">{item.deletedBy?.email||''}</p></div>
						<time className="text-sm muted" dateTime={item.deletedAt}>{new Date(item.deletedAt).toLocaleString()}</time>
						<div className="flex flex-wrap gap-2 lg:justify-end"><button className="btn min-h-10 bg-white/5" type="button" disabled={busy} onClick={()=>void act('restore',[item])}><RotateCcw size={14}/>Restore</button><button className="btn min-h-10 bg-loss text-black" type="button" disabled={busy} onClick={()=>void act('permanently-delete',[item])}><Trash2 size={14}/><span className="sr-only">Permanently delete </span>Delete</button></div>
					</article>;
				})}
			</div>:<div className="account-empty mt-4 rounded-md border border-dashed border-white/10">No deleted items match the current search or filter.</div>}
			<p className="mt-4 text-xs muted">Account erasure follows the privacy-preserving closure workflow. Financial ledger, trade, identity review, and audit history are retained under their record-retention rules and are not recyclable here.</p>
		</section>
	</div>;
}
