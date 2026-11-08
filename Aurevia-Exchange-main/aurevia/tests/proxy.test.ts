import {describe,expect,it,vi} from 'vitest';

vi.mock('next-auth/middleware',()=>({withAuth:(handler:unknown)=>handler}));

import middleware from '../proxy';

function request(pathname:string,role?:'USER'|'ADMIN',search=''){
	return {
		nextauth:{token:role?{role}:null},
		nextUrl:{pathname,search},
		url:`https://aurevia.test${pathname}${search}`,
	} as never;
}

describe('admin route middleware',()=>{
	it('allows a signed-in user to open the administrator sign-in page',async()=>{
		const response=await middleware(request('/admin/login','USER'),{} as never);

		expect(response?.status).toBe(200);
		expect(response?.headers.get('location')).toBeNull();
	});

	it('continues to keep regular users out of the admin dashboard',async()=>{
		const response=await middleware(request('/admin','USER'),{} as never);

		expect(response?.status).toBe(307);
		expect(response?.headers.get('location')).toBe('https://aurevia.test/dashboard');
	});

	it('sends unauthenticated admin routes to the administrator login with the requested page',async()=>{
		const response=await middleware(request('/admin/command-center'),{} as never);

		expect(response?.status).toBe(307);
		expect(response?.headers.get('location')).toBe('https://aurevia.test/admin/login?callbackUrl=%2Fadmin%2Fcommand-center');
	});

	it('preserves the requested user destination when requiring sign-in',async()=>{
		const response=await middleware(request('/broadcasts',undefined,'?filter=unread'),{} as never);

		expect(response?.status).toBe(307);
		expect(response?.headers.get('location')).toBe('https://aurevia.test/login?callbackUrl=%2Fbroadcasts%3Ffilter%3Dunread');
	});

	it('sends an administrator away from the user sign-in page',async()=>{
		const response=await middleware(request('/login','ADMIN'),{} as never);

		expect(response?.status).toBe(307);
		expect(response?.headers.get('location')).toBe('https://aurevia.test/admin');
	});
});
