import {AccountMode} from '@prisma/client';
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireUser:vi.fn(),
	userFindUnique:vi.fn(),
	getRecommendations:vi.fn(),
	rateLimit:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireUser:mocks.requireUser}));
vi.mock('@/lib/db',()=>({db:{user:{findUnique:mocks.userFindUnique}}}));
vi.mock('@/lib/demo-ai-recommendations',()=>({getDemoAiRecommendations:mocks.getRecommendations}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:mocks.rateLimit}));

import {GET} from '@/app/api/demo/ai-recommendations/route';

describe('DEMO AI recommendation route',()=>{
	beforeEach(()=>{
		vi.clearAllMocks();
		mocks.requireUser.mockResolvedValue({id:'user-1'});
		mocks.userFindUnique.mockResolvedValue({accountMode:AccountMode.DEMO,status:'ACTIVE'});
		mocks.getRecommendations.mockResolvedValue({status:'no_signal',recommendations:[],evaluationIntervalSeconds:300});
	});

	it('refuses REAL mode before requesting an AI recommendation',async()=>{
		mocks.userFindUnique.mockResolvedValue({accountMode:AccountMode.REAL,status:'ACTIVE'});

		const response=await GET();

		expect(response.status).toBe(403);
		expect(mocks.getRecommendations).not.toHaveBeenCalled();
	});

	it('returns advisory DEMO recommendations without placing orders',async()=>{
		const response=await GET();
		const result=await response.json();

		expect(response.status).toBe(200);
		expect(result.status).toBe('no_signal');
		expect(mocks.getRecommendations).toHaveBeenCalledWith('user-1');
		expect(mocks.rateLimit).toHaveBeenCalledWith('demo-ai-recommendations:user-1',2,60_000);
	});

	it('refuses inactive accounts',async()=>{
		mocks.userFindUnique.mockResolvedValue({accountMode:AccountMode.DEMO,status:'SUSPENDED'});

		const response=await GET();

		expect(response.status).toBe(403);
		expect(mocks.getRecommendations).not.toHaveBeenCalled();
	});

	it('reports unavailable market data without implying a recommendation or order',async()=>{
		mocks.getRecommendations.mockRejectedValue(new Error('MARKET_DATA_UNAVAILABLE'));

		const response=await GET();
		const result=await response.json();

		expect(response.status).toBe(503);
		expect(result.error).toContain('No recommendation was generated');
		expect(result.error.toLowerCase()).toContain('no trade was placed');
	});
});
