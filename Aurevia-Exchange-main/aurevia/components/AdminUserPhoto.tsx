'use client';

import {useEffect,useRef,useState} from 'react';
import Image from 'next/image';
import {UserRound} from 'lucide-react';

export default function AdminUserPhoto({userId,name,hasAvatar,compact=false}:{userId:string;name:string|null;hasAvatar:boolean;compact?:boolean}){
	const container=useRef<HTMLDivElement>(null);
	const [url,setUrl]=useState('');
	const [requested,setRequested]=useState(false);
	const [loading,setLoading]=useState(false);
	const [error,setError]=useState('');
	const [retry,setRetry]=useState(0);
	useEffect(()=>{
		if(!hasAvatar||requested)return;
		const element=container.current;
		if(!element)return;
		if(!('IntersectionObserver' in window)){setRequested(true);return}
		const observer=new IntersectionObserver(entries=>{
			if(entries.some(entry=>entry.isIntersecting)){setRequested(true);observer.disconnect()}
		});
		observer.observe(element);
		return()=>observer.disconnect();
	},[hasAvatar,requested]);
	useEffect(()=>{
		if(!hasAvatar||!requested)return;
		let active=true;
		setLoading(true);setError('');
		void fetch(`/api/profile/avatar?userId=${encodeURIComponent(userId)}`,{cache:'no-store'}).then(async response=>{
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to load profile photo.');
			if(active)setUrl(typeof result.url==='string'?result.url:'');
		}).catch(exception=>{if(active)setError(exception instanceof Error?exception.message:'Unable to load profile photo.')}).finally(()=>{if(active)setLoading(false)});
		return()=>{active=false};
	},[hasAvatar,requested,retry,userId]);
	const label=error?'Photo unavailable':loading?'Loading profile photo…':url?'Profile photo displayed':hasAvatar&&requested?'Profile photo unavailable':hasAvatar?'Profile photo available':'No profile photo available';
	return <div className={`flex items-center gap-2 ${compact?'min-w-0':'min-w-36'}`} aria-label={`${name||'User'} profile photo`} ref={container}>
		<span className={`grid ${compact?'admin-user-avatar':'size-12'} aspect-square shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-white/5`} title={label}>{url&&!error?<Image src={url} alt={`${name||'User'} profile photo`} width={compact?28:48} height={compact?28:48} unoptimized className="profile-avatar-image" style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center',borderRadius:'50%',clipPath:'circle(50%)'}} onError={()=>{setUrl('');setError('The profile photo could not be displayed.')}}/>:<UserRound size={compact?15:20} className="muted" aria-hidden="true"/>}</span>
		{!compact&&<span className="text-xs muted" role={error?'status':undefined}>{label}{error&&<button type="button" className="ml-1 underline" onClick={()=>{setError('');setRequested(true);setRetry(value=>value+1)}}>Retry</button>}</span>}
	</div>;
}