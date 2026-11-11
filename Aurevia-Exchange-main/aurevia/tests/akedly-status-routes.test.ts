import {describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({reconcile:vi.fn(),getState:vi.fn()}));
vi.mock('@/lib/akedly-verification',()=>({getAkedlyVerificationState:mocks.getState,reconcileAkedlyAttempt:mocks.reconcile}));

import {POST} from '@/app/api/kyc/phone/status/route';

describe('retired Akedly phone status route',()=>{
	it('does not query Akedly or treat an old attempt as current phone verification',async()=>{
		const response=await POST();

		expect(response.status).toBe(410);
		expect(mocks.getState).not.toHaveBeenCalled();
		expect(mocks.reconcile).not.toHaveBeenCalled();
	});
});
