'use strict';

const fallback={title:'Aurevia Exchange',body:'There is a new update to your account.',url:'/dashboard'};

self.addEventListener('push',event=>{
	let payload=fallback;
	try{
		const parsed=event.data?.json();
		if(parsed&&typeof parsed==='object'){
			payload={
				title:typeof parsed.title==='string'?parsed.title.slice(0,80):fallback.title,
				body:typeof parsed.body==='string'?parsed.body.slice(0,180):fallback.body,
				url:typeof parsed.url==='string'&&parsed.url.startsWith('/')&&!parsed.url.startsWith('//')?parsed.url:fallback.url,
				tag:typeof parsed.tag==='string'&&/^aurevia-[a-f0-9]{16}$/.test(parsed.tag)?parsed.tag:undefined,
			};
		}
	}catch{
		payload=fallback;
	}
	event.waitUntil(self.registration.showNotification(payload.title,{
		body:payload.body,
		icon:'/aurevia-logo.png',
		badge:'/aurevia-logo.png',
		tag:payload.tag,
		renotify:false,
		data:{url:payload.url},
	}));
});

self.addEventListener('notificationclick',event=>{
	event.notification.close();
	const requested=event.notification.data?.url;
	const path=typeof requested==='string'&&requested.startsWith('/')&&!requested.startsWith('//')?requested:'/dashboard';
	const target=new URL(`/api/push/redirect?to=${encodeURIComponent(path)}`,self.location.origin).href;
	event.waitUntil((async()=>{
		const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
		for(const windowClient of windows){
			if(new URL(windowClient.url).origin!==self.location.origin)continue;
			const navigated=await windowClient.navigate(target);
			if(navigated){await navigated.focus();return}
		}
		await self.clients.openWindow(target);
	})());
});
