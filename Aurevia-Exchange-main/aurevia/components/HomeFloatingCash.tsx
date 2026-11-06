'use client';

import {useEffect,useState} from 'react';
import {X} from 'lucide-react';

const storageKey='aurevia.homeCashSession';
const motifs=['coin-stack','coin-orbit','gold-token','green-token'] as const;
type Motif=typeof motifs[number];
type SessionState={items:Motif[];dismissed:Motif[]};

function createSessionState():SessionState{
	const shuffled=[...motifs];
	for(let index=shuffled.length-1;index>0;index--){
		const swapIndex=Math.floor(Math.random()*(index+1));
		[shuffled[index],shuffled[swapIndex]]=[shuffled[swapIndex],shuffled[index]];
	}
	return {items:shuffled.slice(0,3),dismissed:[]};
}

export default function HomeFloatingCash(){
	const [session,setSession]=useState<SessionState|null>(null);

	useEffect(()=>{
		try{
			const stored=sessionStorage.getItem(storageKey);
			if(stored){
				const parsed=JSON.parse(stored) as Partial<SessionState>;
				if(Array.isArray(parsed.items)&&Array.isArray(parsed.dismissed)&&parsed.items.every(item=>motifs.includes(item as Motif))&&parsed.dismissed.every(item=>motifs.includes(item as Motif))){
					setSession({items:parsed.items as Motif[],dismissed:parsed.dismissed as Motif[]});
					return;
				}
			}
			const initial=createSessionState();
			sessionStorage.setItem(storageKey,JSON.stringify(initial));
			setSession(initial);
		}catch(error){
			console.error('Unable to initialize session-only home decorations.',error instanceof Error?error.name:'UnknownError');
			setSession(createSessionState());
		}
	},[]);

	function dismiss(motif:Motif){
		if(!session)return;
		const next={...session,dismissed:[...new Set([...session.dismissed,motif])]};
		try{sessionStorage.setItem(storageKey,JSON.stringify(next));}
		catch(error){console.error('Unable to save a home decoration dismissal for this session.',error instanceof Error?error.name:'UnknownError');}
		setSession(next);
	}

	if(!session)return null;
	const visible=session.items.filter(item=>!session.dismissed.includes(item));
	if(!visible.length)return null;

	return <aside className="home-floating-cash" aria-label="Decorative Aurevia coin visuals">
		{visible.map(motif=><div className={`home-cash-item ${motif}`} key={motif}>
			<div className="home-cash-art" aria-hidden="true"><span>A</span><i/><i/><i/></div>
			<button type="button" className="home-cash-dismiss" aria-label="Dismiss decorative coin" onClick={()=>dismiss(motif)}><X size={13}/></button>
		</div>)}
	</aside>;
}
