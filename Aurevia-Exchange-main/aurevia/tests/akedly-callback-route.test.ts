import {describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({reconcile:vi.fn()}));
vi.mock('@/lib/akedly-verification',()=>({reconcileAkedlyAttempt:mocks.reconcile}));

import {POST} from '@/app/api/auth/akedly/callback/route';

describe('retired Akedly callback route',()=>{
	it('rejects legacy redirects and never reconciles them as active verification',async()=>{
		const response=await POST();

		expect(response.status).toBe(410);
		expect(mocks.reconcile).not.toHaveBeenCalled();
	});
});
