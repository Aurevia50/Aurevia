'use client';

import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {MouseEvent,ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {useSession} from 'next-auth/react';
import {AureviaStartupLoader} from '@/components/AureviaStartup';
import AureviaLoading from '@/components/AureviaLoading';

const startupKey='aurevia-startup-complete';
const exitDurationMs=180;
const maximumStartupWaitMs=1200;
const navigationLoaderDelayMs=100;
const navigationLoaderTimeoutMs=15_000;
type StartupMode='loading'|'hidden';

export default function StartupShell({children}:{children:ReactNode}){
	const {status}=useSession();
	const pathname=usePathname();
	const currentPath=useRef(pathname);
	const startupInitialized=useRef(false);
	const navigationLoaderTimer=useRef<number|undefined>(undefined);
	const navigationTimeoutTimer=useRef<number|undefined>(undefined);
	const [ready,setReady]=useState(false);
	const [startupMode,setStartupMode]=useState<StartupMode>(pathname==='/'?'hidden':'loading');
	const [isExiting,setIsExiting]=useState(false);
	const [showPageTransition,setShowPageTransition]=useState(false);
	const showStartup=startupMode!=='hidden';

	const clearNavigationTimers=useCallback(()=>{
		if(navigationLoaderTimer.current!==undefined)window.clearTimeout(navigationLoaderTimer.current);
		if(navigationTimeoutTimer.current!==undefined)window.clearTimeout(navigationTimeoutTimer.current);
		navigationLoaderTimer.current=undefined;
		navigationTimeoutTimer.current=undefined;
	},[]);

	const startNavigation=useCallback(()=>{
		if(!ready||startupMode!=='hidden'||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
		clearNavigationTimers();
		navigationLoaderTimer.current=window.setTimeout(()=>setShowPageTransition(true),navigationLoaderDelayMs);
		navigationTimeoutTimer.current=window.setTimeout(()=>{
			setShowPageTransition(false);
			clearNavigationTimers();
		},navigationLoaderTimeoutMs);
	},[clearNavigationTimers,ready,startupMode]);

	const handleNavigationClick=useCallback((event:MouseEvent<HTMLDivElement>)=>{
		if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
		if(!(event.target instanceof Element))return;
		const anchor=event.target.closest('a');
		if(!anchor||anchor.target&&anchor.target!=='_self'||anchor.hasAttribute('download'))return;
		const destination=new URL(anchor.href,window.location.href);
		if(destination.origin!==window.location.origin||destination.pathname===window.location.pathname)return;
		startNavigation();
	},[startNavigation]);

	const markStartupComplete=useCallback(()=>{
		try{sessionStorage.setItem(startupKey,'1')}catch{}
		document.documentElement.dataset.aureviaStartupComplete='true';
		setStartupMode('hidden');
	},[]);

	useEffect(()=>{
		if(startupInitialized.current){
			setReady(true);
			return;
		}
		startupInitialized.current=true;
		let startupSeen=false;
		try{
			startupSeen=sessionStorage.getItem(startupKey)==='1';
		}catch{}
		if(pathname==='/'||startupSeen){
			try{sessionStorage.setItem(startupKey,'1')}catch{}
			document.documentElement.dataset.aureviaStartupComplete='true';
			setStartupMode('hidden');
		}
		setReady(true);
	},[pathname]);

	useLayoutEffect(()=>{
		if(currentPath.current===pathname)return;
		currentPath.current=pathname;
		clearNavigationTimers();
		setShowPageTransition(false);
	},[clearNavigationTimers,pathname]);

	useEffect(()=>{
		window.addEventListener('popstate',startNavigation);
		return()=>{
			window.removeEventListener('popstate',startNavigation);
			clearNavigationTimers();
		};
	},[clearNavigationTimers,startNavigation]);

	useEffect(()=>{
		if(!ready||startupMode!=='loading')return;
		if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
			markStartupComplete();
			return;
		}
		let exitTimer:number|undefined;
		const timer=window.setTimeout(()=>{
			setIsExiting(true);
			exitTimer=window.setTimeout(markStartupComplete,exitDurationMs);
		},status==='loading'?maximumStartupWaitMs:0);
		return()=>{
			window.clearTimeout(timer);
			if(exitTimer!==undefined)window.clearTimeout(exitTimer);
		};
	},[markStartupComplete,ready,startupMode,status]);

	return <div className="app-shell" onClickCapture={handleNavigationClick}>
		<div className="scene-depth" aria-hidden="true"/>
		<div className="scene-content"><div inert={showStartup||showPageTransition} aria-hidden={showStartup||showPageTransition}>{children}</div>
			{startupMode==='loading'&&<AureviaStartupLoader isExiting={isExiting}/>}
			{showPageTransition&&<AureviaLoading label="Loading the next page" detail="Moving securely through Aurevia Exchange"/>}
		</div>
	</div>;
}
