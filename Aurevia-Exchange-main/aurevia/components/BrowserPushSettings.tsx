'use client';

import {useEffect,useState} from 'react';
import {Bell,Check,LoaderCircle,ShieldCheck} from 'lucide-react';
import {requestPushPermission,supportsBrowserPush} from '@/lib/push-browser';

type Preferences={accountActivity:boolean;investmentUpdates:boolean;announcements:boolean};
type PushStatus={
	available:boolean;
	publicKey:string|null;
	subscriptionCount:number;
	preferences:Preferences;
};

const defaultPreferences:Preferences={accountActivity:true,investmentUpdates:true,announcements:false};

function decodePublicKey(value:string){
	const base64=value.replaceAll('-','+').replaceAll('_','/');
	const padded=base64.padEnd(Math.ceil(base64.length/4)*4,'=');
	return Uint8Array.from(atob(padded),character=>character.charCodeAt(0));
}

async function readResponse(response:Response){
	const result=await response.json();
	if(!response.ok)throw new Error(typeof result.error==='string'?result.error:'Unable to update browser notifications.');
	return result;
}

export default function BrowserPushSettings(){
	const [status,setStatus]=useState<PushStatus|null>(null);
	const [supported,setSupported]=useState(false);
	const [permission,setPermission]=useState<NotificationPermission|'unsupported'>('default');
	const [localSubscription,setLocalSubscription]=useState<PushSubscription|null>(null);
	const [loading,setLoading]=useState(true);
	const [busy,setBusy]=useState(false);
	const [error,setError]=useState('');
	const [message,setMessage]=useState('');

	useEffect(()=>{
		let active=true;
		const initialize=async()=>{
			const available=typeof window!=='undefined'&&supportsBrowserPush({
				secureContext:window.isSecureContext,
				serviceWorker:'serviceWorker' in navigator,
				pushManager:'PushManager' in window,
				notifications:'Notification' in window,
			});
			if(!active)return;
			setSupported(available);
			if(available)setPermission(Notification.permission);
			else setPermission('unsupported');
			try{
				const response=await fetch('/api/push/subscriptions',{cache:'no-store'});
				const data=await readResponse(response) as PushStatus;
				let subscription:PushSubscription|null=null;
				if(available){
					const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
					subscription=await registration.pushManager.getSubscription();
				}
				if(!active)return;
				setStatus(data);
				setLocalSubscription(subscription);
			}catch(exception){
				if(active)setError(exception instanceof Error?exception.message:'Unable to load browser notification settings.');
			}finally{if(active)setLoading(false)}
		};
		void initialize();
		return()=>{active=false};
	},[]);

	async function updatePreferences(next:Partial<Preferences>){
		if(!status)return;
		setBusy(true);setError('');setMessage('');
		try{
			const response=await fetch('/api/push/preferences',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(next)});
			const result=await readResponse(response) as {preferences:Preferences};
			setStatus({...status,preferences:result.preferences});
			setMessage('Notification preferences saved.');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to save notification preferences.')}
		finally{setBusy(false)}
	}

	async function enable(){
		if(!status?.available||!status.publicKey||busy)return;
		setBusy(true);setError('');setMessage('');
		try{
			let nextPermission=Notification.permission;
			if(nextPermission==='default')nextPermission=await requestPushPermission(Notification);
			setPermission(nextPermission);
			if(nextPermission==='denied'){
				setError('Notifications are blocked by your browser. Open this site’s browser or device settings, allow notifications, then try again.');
				return;
			}
			if(nextPermission!=='granted')return;
			const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
			let subscription=await registration.pushManager.getSubscription();
			if(!subscription){
				subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodePublicKey(status.publicKey)});
			}
			const saved=await fetch('/api/push/subscriptions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(subscription.toJSON())});
			await readResponse(saved);
			const preferences=await fetch('/api/push/preferences',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({accountActivity:true,investmentUpdates:true})});
			const preferenceResult=await readResponse(preferences) as {preferences:Preferences};
			setLocalSubscription(subscription);
			setStatus({...status,subscriptionCount:Math.max(1,status.subscriptionCount),preferences:preferenceResult.preferences});
			setMessage('Browser notifications are enabled on this device.');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to enable browser notifications.')}
		finally{setBusy(false)}
	}

	async function disable(){
		if(!status||busy)return;
		setBusy(true);setError('');setMessage('');
		try{
			const preferences=await fetch('/api/push/preferences',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({accountActivity:false,investmentUpdates:false,announcements:false})});
			const preferenceResult=await readResponse(preferences) as {preferences:Preferences};
			if(localSubscription){
				const removed=await fetch('/api/push/subscriptions',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint:localSubscription.endpoint})});
				await readResponse(removed);
				await localSubscription.unsubscribe();
			}
			setStatus({...status,subscriptionCount:Math.max(0,status.subscriptionCount-(localSubscription?1:0)),preferences:preferenceResult.preferences});
			setLocalSubscription(null);
			setMessage('Browser notifications are disabled for this account.');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to disable browser notifications.')}
		finally{setBusy(false)}
	}

	async function sendTest(){
		if(busy)return;
		setBusy(true);setError('');setMessage('');
		try{
			const response=await fetch('/api/push/test',{method:'POST'});
			const result=await readResponse(response) as {message:string};
			setMessage(result.message);
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to send a test notification.')}
		finally{setBusy(false)}
	}

	const permissionLabel=permission==='unsupported'?'Unavailable':permission==='granted'?'Allowed':permission==='denied'?'Blocked':'Not requested';
	const enabled=status?.preferences.accountActivity||status?.preferences.investmentUpdates||status?.preferences.announcements;

	return <section className="account-panel browser-push-settings" role="tabpanel">
		<div className="account-panel-title"><div><h3>Browser notifications</h3><p className="account-panel-subtitle">Receive secure account updates even when Aurevia is not open, subject to your browser and device support.</p></div><Bell size={18} className="gold" aria-hidden="true"/></div>
		<div className="browser-push-status" aria-live="polite">
			<span className="status-pill">Permission: {loading?'Checking…':permissionLabel}</span>
			<span className="status-pill">{loading?'Checking subscription…':localSubscription?'This device is subscribed':`${status?.subscriptionCount||0} subscribed device${status?.subscriptionCount===1?'':'s'}`}</span>
			{enabled&&<span className="status-pill"><Check size={13} aria-hidden="true"/> Preferences enabled</span>}
		</div>
		{!supported&&<p className="account-callout" role="status">This browser or device does not support Web Push, or this page is not using a secure HTTPS connection. Try a current browser on HTTPS. On iPhone or iPad, install the site on the Home Screen and use a supported iOS version.</p>}
		{supported&&status&&!status.available&&<p className="account-callout" role="status">Browser notifications are not configured by the Aurevia server yet.</p>}
		{permission==='denied'&&<p className="account-callout" role="status">Permission is blocked. Aurevia cannot prompt again; change notification permission in your browser or device settings first.</p>}
		{error&&<p className="account-callout" role="alert">{error}</p>}
		{message&&<p className="account-callout browser-push-success" role="status"><ShieldCheck size={15} aria-hidden="true"/>{message}</p>}
		<div className="browser-push-actions">
			<button type="button" className="btn bg-gold text-black" disabled={loading||busy||!supported||!status?.available||permission==='denied'} onClick={()=>void enable()}>{busy?<LoaderCircle size={16} className="animate-spin" aria-hidden="true"/>:null}Enable notifications</button>
			<button type="button" className="btn bg-white/5" disabled={loading||busy||!status} onClick={()=>void disable()}>Disable notifications</button>
			<button type="button" className="btn bg-white/5" disabled={loading||busy||!localSubscription||permission!=='granted'} onClick={()=>void sendTest()}>Send test notification</button>
		</div>
		<fieldset className="browser-push-preferences" disabled={loading||busy||!status}>
			<legend>Notification preferences</legend>
			<label><input type="checkbox" checked={status?.preferences.accountActivity??defaultPreferences.accountActivity} onChange={event=>void updatePreferences({accountActivity:event.target.checked})}/><span><b>Account activity</b><small>Funding, verification, card and security updates.</small></span></label>
			<label><input type="checkbox" checked={status?.preferences.investmentUpdates??defaultPreferences.investmentUpdates} onChange={event=>void updatePreferences({investmentUpdates:event.target.checked})}/><span><b>Investment updates</b><small>Investment and trading activity.</small></span></label>
			<label><input type="checkbox" checked={status?.preferences.announcements??defaultPreferences.announcements} onChange={event=>void updatePreferences({announcements:event.target.checked})}/><span><b>Optional announcements</b><small>Important updates published by Aurevia administrators.</small></span></label>
		</fieldset>
	</section>;
}
