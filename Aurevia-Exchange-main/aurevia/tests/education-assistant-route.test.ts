import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	getServerSession:vi.fn(),
	runAiService:vi.fn(),
	rateLimit:vi.fn(),
}));

vi.mock('next-auth',()=>({getServerSession:mocks.getServerSession}));
vi.mock('@/lib/auth-options',()=>({authOptions:{}}));
vi.mock('@/lib/ai-services',()=>({runAiService:mocks.runAiService}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:mocks.rateLimit}));

import {POST} from '@/app/api/education/assistant/route';

const request=(body:unknown)=>new Request('https://aurevia.test/api/education/assistant',{method:'POST',headers:{'content-type':'application/json','x-real-ip':'192.0.2.10'},body:JSON.stringify(body)});

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.getServerSession.mockResolvedValue({user:{id:'user-1'}});
	mocks.runAiService.mockResolvedValue({content:'Diversification spreads risk.',provider:'openrouter',model:'test/free-model'});
});

describe('investment education assistant',()=>{
	it('uses the central educational service and avoids personal recommendations',async()=>{
		const response=await POST(request({question:'Explain diversification in Spanish'}));
		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		expect(await response.json()).toMatchObject({answer:'Diversification spreads risk.',provider:'openrouter',generatedAnalysis:true});
		expect(mocks.runAiService).toHaveBeenCalledWith('investment_research',expect.arrayContaining([
			expect.objectContaining({role:'system',content:expect.stringContaining('Do not provide personalized financial')}),
			expect.objectContaining({role:'user',content:'Explain diversification in Spanish'}),
		]),expect.objectContaining({actorId:'user-1',maxTokens:500}));
	});

	it('rejects invalid questions and surfaces administrator-disabled state',async()=>{
		expect((await POST(request({question:'x'}))).status).toBe(400);
		mocks.runAiService.mockRejectedValue(new Error('AI_FEATURE_DISABLED'));
		const disabled=await POST(request({question:'Explain diversification'}));
		expect(disabled.status).toBe(503);
		expect((await disabled.json()).error).toContain('disabled by an administrator');
	});
});
