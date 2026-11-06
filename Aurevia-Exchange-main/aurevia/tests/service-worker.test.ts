import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it,vi} from 'vitest';

function loadServiceWorker(){
	const listeners=new Map<string,(event:Record<string,unknown>)=>void>();
	const showNotification=vi.fn().mockResolvedValue(undefined);
	const self={
		location:{origin:'https://aurevia.test'},
		registration:{showNotification},
		addEventListener:(name:string,callback:(event:Record<string,unknown>)=>void)=>listeners.set(name,callback),
	};
	runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL,Promise});
	return {listeners,showNotification};
}

describe('Aurevia browser push service worker',()=>{
	it('shows concise branded notifications and safely falls back on malformed payloads',async()=>{
		const {listeners,showNotification}=loadServiceWorker();
		const validWait=vi.fn();
		listeners.get('push')!({data:{json:()=>({title:'Aurevia Exchange',body:'An account update.',url:'/wallet',tag:'aurevia-0123456789abcdef'})},waitUntil:validWait});
		await validWait.mock.calls[0][0];
		expect(showNotification).toHaveBeenCalledWith('Aurevia Exchange',expect.objectContaining({body:'An account update.',data:{url:'/wallet'},tag:'aurevia-0123456789abcdef',renotify:false,icon:'/aurevia-logo.png'}));
		const invalidWait=vi.fn();
		listeners.get('push')!({data:{json:()=>{throw new Error('bad payload')}},waitUntil:invalidWait});
		await invalidWait.mock.calls[0][0];
		expect(showNotification).toHaveBeenLastCalledWith('Aurevia Exchange',expect.objectContaining({body:'There is a new update to your account.'}));
	});

	it('routes notification clicks through the authenticated redirect endpoint',async()=>{
		const navigate=vi.fn().mockResolvedValue({focus:vi.fn()});
		const openWindow=vi.fn();
		const matchAll=vi.fn().mockResolvedValue([{url:'https://aurevia.test/dashboard',navigate}]);
		const listeners=new Map<string,(event:Record<string,unknown>)=>void>();
		const self={
			location:{origin:'https://aurevia.test'},
			registration:{showNotification:vi.fn()},
			clients:{matchAll,openWindow},
			addEventListener:(name:string,callback:(event:Record<string,unknown>)=>void)=>listeners.set(name,callback),
		};
		runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL,Promise});
		const close=vi.fn(),waitUntil=vi.fn();
		listeners.get('notificationclick')!({notification:{data:{url:'/wallet/transactions'},close},waitUntil});
		await waitUntil.mock.calls[0][0];
		expect(close).toHaveBeenCalledOnce();
		expect(navigate).toHaveBeenCalledWith('https://aurevia.test/api/push/redirect?to=%2Fwallet%2Ftransactions');
		expect(openWindow).not.toHaveBeenCalled();
	});
});
