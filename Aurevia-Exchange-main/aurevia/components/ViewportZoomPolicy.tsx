'use client';

import {useEffect} from 'react';
import {usePathname} from 'next/navigation';

export default function ViewportZoomPolicy(){
	const pathname=usePathname();
	useEffect(()=>{
		if(pathname==='/admin'||pathname.startsWith('/admin/'))return;
		const blockKeyboardZoom=(event:KeyboardEvent)=>{
			if(!(event.ctrlKey||event.metaKey))return;
			if(['+','=','-','_','0'].includes(event.key)||['NumpadAdd','NumpadSubtract'].includes(event.code))event.preventDefault();
		};
		const blockWheelZoom=(event:WheelEvent)=>{if(event.ctrlKey)event.preventDefault()};
		const blockTouchZoom=(event:TouchEvent)=>{if(event.touches.length>1)event.preventDefault()};
		const blockGestureZoom=(event:Event)=>event.preventDefault();
		document.addEventListener('keydown',blockKeyboardZoom,true);
		document.addEventListener('wheel',blockWheelZoom,{capture:true,passive:false});
		document.addEventListener('touchmove',blockTouchZoom,{capture:true,passive:false});
		document.addEventListener('gesturestart',blockGestureZoom,{capture:true,passive:false});
		document.addEventListener('gesturechange',blockGestureZoom,{capture:true,passive:false});
		return()=>{
			document.removeEventListener('keydown',blockKeyboardZoom,true);
			document.removeEventListener('wheel',blockWheelZoom,true);
			document.removeEventListener('touchmove',blockTouchZoom,true);
			document.removeEventListener('gesturestart',blockGestureZoom,true);
			document.removeEventListener('gesturechange',blockGestureZoom,true);
		};
	},[pathname]);
	return null;
}
