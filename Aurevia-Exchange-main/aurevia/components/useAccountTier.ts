'use client';

import {useCallback,useEffect,useState} from 'react';

export function useAccountTier(enabled=true){
	const [tier,setTier]=useState('');
	const refresh=useCallback(async()=>{
		if(!enabled)return;
		try{
			const response=await fetch('/api/profile',{cache:'no-store'});
			const profile=await response.json();
			if(!response.ok)throw new Error(typeof profile?.error==='string'?profile.error:'Unable to load account tier.');
			if(typeof profile.label!=='string')throw new Error('Account tier is unavailable.');
			setTier(profile.label);
		}catch(error){
			console.error('Unable to refresh the account tier.',error instanceof Error?error.name:'UnknownError');
		}
	},[enabled]);

	useEffect(()=>{
		if(!enabled){setTier('');return}
		void refresh();
		const interval=window.setInterval(()=>void refresh(),30_000);
		const onVisibilityChange=()=>{if(document.visibilityState==='visible')void refresh()};
		window.addEventListener('focus',refresh);
		window.addEventListener('aurevia:tier-updated',refresh);
		document.addEventListener('visibilitychange',onVisibilityChange);
		return()=>{
			window.clearInterval(interval);
			window.removeEventListener('focus',refresh);
			window.removeEventListener('aurevia:tier-updated',refresh);
			document.removeEventListener('visibilitychange',onVisibilityChange);
		};
	},[enabled,refresh]);

	return tier;
}
