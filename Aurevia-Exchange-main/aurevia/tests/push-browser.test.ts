import {describe,expect,it,vi} from 'vitest';
import {requestPushPermission,supportsBrowserPush} from '@/lib/push-browser';

describe('browser push capability and permission behavior',()=>{
	it('requires HTTPS and all browser push APIs',()=>{
		expect(supportsBrowserPush({secureContext:true,serviceWorker:true,pushManager:true,notifications:true})).toBe(true);
		expect(supportsBrowserPush({secureContext:false,serviceWorker:true,pushManager:true,notifications:true})).toBe(false);
		expect(supportsBrowserPush({secureContext:true,serviceWorker:false,pushManager:true,notifications:true})).toBe(false);
		expect(supportsBrowserPush({secureContext:true,serviceWorker:true,pushManager:false,notifications:true})).toBe(false);
		expect(supportsBrowserPush({secureContext:true,serviceWorker:true,pushManager:true,notifications:false})).toBe(false);
	});

	it('requests permission only from the default state and never reprompts after denial',async()=>{
		const requestPermission=vi.fn().mockResolvedValue('granted');
		await expect(requestPushPermission({permission:'default',requestPermission})).resolves.toBe('granted');
		expect(requestPermission).toHaveBeenCalledOnce();
		await expect(requestPushPermission({permission:'denied',requestPermission})).resolves.toBe('denied');
		await expect(requestPushPermission({permission:'granted',requestPermission})).resolves.toBe('granted');
		expect(requestPermission).toHaveBeenCalledOnce();
	});
});
