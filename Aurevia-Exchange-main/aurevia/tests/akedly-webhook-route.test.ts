import {describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({complete:vi.fn(),reconcile:vi.fn()}));
vi.mock('@/lib/akedly-verification',()=>({completeAkedlyVerification:mocks.complete,reconcileAkedlyAttempt:mocks.reconcile}));

import {POST} from '@/app/api/webhooks/akedly/route';

describe('retired Akedly webhook route',()=>{
	it('rejects legacy events without processing or changing verification state',async()=>{
		const response=await POST();

		expect(response.status).toBe(410);
		expect(mocks.complete).not.toHaveBeenCalled();
		expect(mocks.reconcile).not.toHaveBeenCalled();
	});
});
