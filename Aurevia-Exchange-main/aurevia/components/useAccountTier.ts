'use client';

import {useCallback,useEffect,useState} from 'react';

export function useAccountTier(enabled=true){
	const [tier,setTier]=useState('');
	const refresh=useCallback(async(signal?:AbortSignal)=>{
		if(!enabled)return;
		try{
			const response=await fetch('/api/profile',{cache:'no-store',signal});
			const profile=await response.json();
			if(!response.ok)throw new Error(typeof profile?.error==='string'?profile.error:'Unable to load account tier.');
			if(typeof profile.label!=='string')throw new Error('Account tier is unavailable.');
			setTier(profile.label);
		}catch(error){
			if(!signal?.aborted)console.error('Unable to refresh the account tier.',error instanceof Error?error.name:'UnknownError');
		}
	},[enabled]);

	useEffect(()=>{
		if(!enabled){setTier('');return}
		const controller=new AbortController();
		const refreshActive=()=>void refresh(controller.signal);
		refreshActive();
		const interval=window.setInterval(refreshActive,30_000);
		const onVisibilityChange=()=>{if(document.visibilityState==='visible')refreshActive()};
		window.addEventListener('focus',refreshActive);
		window.addEventListener('aurevia:tier-updated',refreshActive);
		document.addEventListener('visibilitychange',onVisibilityChange);
		return()=>{
			controller.abort();
			window.clearInterval(interval);
			window.removeEventListener('focus',refreshActive);
			window.removeEventListener('aurevia:tier-updated',refreshActive);
			document.removeEventListener('visibilitychange',onVisibilityChange);
		};
	},[enabled,refresh]);

	return tier;
}
