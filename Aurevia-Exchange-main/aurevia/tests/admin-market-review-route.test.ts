import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireAdmin:vi.fn(),
	getOpenAiConfig:vi.fn(),
	openAiChat:vi.fn(),
	rateLimit:vi.fn(),
	instrumentFindMany:vi.fn(),
	auditLogFindMany:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireAdmin:mocks.requireAdmin}));
vi.mock('@/lib/openai-client',()=>({getOpenAiConfig:mocks.getOpenAiConfig,openAiChat:mocks.openAiChat}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:mocks.rateLimit}));
vi.mock('@/lib/db',()=>({
	db:{
		instrument:{findMany:mocks.instrumentFindMany},
		auditLog:{findMany:mocks.auditLogFindMany},
	},
}));

import {GET,POST} from '@/app/api/admin/market/review/route';

const activity={id:'event-1',action:'SIMULATED_MARKET_TICK',entityId:'instrument-1',metadata:{
	symbol:'BTC/USD',direction:'UP',previousPrice:'60000',newPrice:'60300',volatilityPercent:0.5,dataMode:'SIMULATED',
},createdAt:new Date('2026-10-25T12:00:00.000Z')};

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
	mocks.getOpenAiConfig.mockReturnValue({enabled:true,model:'test-model'});
	mocks.instrumentFindMany.mockResolvedValue([{
		id:'instrument-1',symbol:'BTC/USD',name:'Bitcoin',price:'60300',enabled:true,updatedAt:new Date('2026-10-25T12:00:00.000Z'),
	}]);
	mocks.auditLogFindMany.mockResolvedValue([activity]);
	mocks.openAiChat.mockResolvedValue(JSON.stringify({
		summary:'One DEMO BTC/USD price update was recorded.',
		highlights:[{activityId:'event-1',observation:'BTC/USD moved from 60000 to 60300 in a DEMO update.'}],
	}));
});

describe('admin market review API',()=>{
	it('returns actual instrument snapshots and recent audit events',async()=>{
		const response=await GET();
		const result=await response.json();

		expect(response.status).toBe(200);
		expect(result.instruments[0]).toMatchObject({symbol:'BTC/USD',price:'60300'});
		expect(result.activities[0]).toMatchObject({id:'event-1',symbol:'BTC/USD',dataMode:'SIMULATED'});
		expect(mocks.auditLogFindMany).toHaveBeenCalledWith(expect.objectContaining({
			where:expect.objectContaining({action:{in:['SIMULATED_MARKET_TICK','INSTRUMENT_CREATE','INSTRUMENT_UPDATE']}}),
		}));
	});

	it('uses the configured AI model to review only actual market records',async()=>{
		const response=await POST();
		const result=await response.json();

		expect(response.status).toBe(200);
		expect(result.model).toBe('test-model');
		expect(result.review.summary).toContain('DEMO BTC/USD');
		expect(mocks.openAiChat.mock.calls[0][0][0].content).toContain('Do not invent market moves');
		expect(JSON.parse(mocks.openAiChat.mock.calls[0][0][1].content).activities[0].id).toBe('event-1');
	});

	it('rejects AI highlights that refer to activity not in the audit records',async()=>{
		mocks.openAiChat.mockResolvedValue(JSON.stringify({
			summary:'Review',
			highlights:[{activityId:'fabricated-event',observation:'An unsupported event occurred.'}],
		}));

		const response=await POST();

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({error:'AI returned an unsupported market review.'});
	});

	it('reports missing AI configuration without inventing a review',async()=>{
		mocks.getOpenAiConfig.mockReturnValue({enabled:false,model:'test-model'});

		const response=await POST();

		expect(response.status).toBe(503);
		expect(mocks.openAiChat).not.toHaveBeenCalled();
		expect(mocks.auditLogFindMany).not.toHaveBeenCalled();
	});

	it('requires administrator authorization',async()=>{
		mocks.requireAdmin.mockRejectedValue(new Error('FORBIDDEN'));

		const response=await GET();

		expect(response.status).toBe(403);
		expect(mocks.instrumentFindMany).not.toHaveBeenCalled();
	});
});
