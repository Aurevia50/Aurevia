import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireAdmin:vi.fn(),
	rateLimit:vi.fn(),
	transaction:vi.fn(),
	upsert:vi.fn(),
	auditCreate:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireAdmin:mocks.requireAdmin}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:mocks.rateLimit}));
vi.mock('@/lib/db',()=>({db:{$transaction:mocks.transaction}}));

import {PUT} from '@/app/api/admin/command-center/ai-features/route';

const request=(body:unknown)=>new Request('https://aurevia.test/api/admin/command-center/ai-features',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
	mocks.upsert.mockResolvedValue({});
	mocks.auditCreate.mockResolvedValue({});
	mocks.transaction.mockImplementation(async(callback:(transaction:unknown)=>Promise<unknown>)=>callback({systemSetting:{upsert:mocks.upsert},auditLog:{create:mocks.auditCreate}}));
});

describe('administrator AI feature controls',()=>{
	it('persists and audits service changes',async()=>{
		const response=await PUT(request({feature:'customer_support',enabled:false}));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({feature:{id:'customer_support',enabled:false}});
		expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({where:{key:'aurevia.ai.feature.customer_support'},create:{key:'aurevia.ai.feature.customer_support',value:'false'},update:{value:'false'}}));
		expect(mocks.auditCreate).toHaveBeenCalledWith({data:expect.objectContaining({actorId:'admin-1',action:'AI_FEATURE_UPDATED',entity:'AI_FEATURE',entityId:'customer_support',metadata:{feature:'customer_support',enabled:false}})});
	});

	it('requires an administrator and accepts only known feature identifiers',async()=>{
		mocks.requireAdmin.mockRejectedValue(new Error('FORBIDDEN'));
		expect((await PUT(request({feature:'customer_support',enabled:false}))).status).toBe(403);
		mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
		expect((await PUT(request({feature:'arbitrary_sql',enabled:false}))).status).toBe(400);
		expect(mocks.transaction).not.toHaveBeenCalled();
	});
});
