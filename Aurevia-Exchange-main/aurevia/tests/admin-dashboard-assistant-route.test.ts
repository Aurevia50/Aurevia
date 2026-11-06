import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireAdmin:vi.fn(),
	openAiChat:vi.fn(),
	getOpenAiConfig:vi.fn(),
	rateLimit:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireAdmin:mocks.requireAdmin}));
vi.mock('@/lib/openai-client',()=>({openAiChat:mocks.openAiChat,getOpenAiConfig:mocks.getOpenAiConfig}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:mocks.rateLimit}));

import {POST} from '@/app/api/admin/dashboard/assistant/route';

function request(body:unknown){
	return new Request('http://localhost/api/admin/dashboard/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
	mocks.openAiChat.mockResolvedValue(JSON.stringify({
		status:'success',
		interpretation:'Compare REAL funding over the last seven days.',
		clarification_question:null,
		visualizations:[
			{id:'daily_funding',type:'timeseries',title:'Daily REAL funding'},
			{id:'deposits_7d_usd',type:'stat',title:'Approved deposits'},
		],
	}));
	mocks.getOpenAiConfig.mockReturnValue({enabled:true,model:'test-model'});
});

describe('admin dashboard AI configuration endpoint',()=>{
	it('requires admin authorization before calling OpenAI',async()=>{
		mocks.requireAdmin.mockRejectedValue(new Error('FORBIDDEN'));

		const response=await POST(request({question:'Show funding activity'}));

		expect(response.status).toBe(403);
		expect(mocks.openAiChat).not.toHaveBeenCalled();
	});

	it('returns only validated dashboard configuration with no generated query execution',async()=>{
		const response=await POST(request({question:'Compare deposits and withdrawals this week'}));
		const result=await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		expect(result.configuration.visualizations).toEqual([
			{id:'daily_funding',type:'timeseries',title:'Daily REAL funding'},
			{id:'deposits_7d_usd',type:'stat',title:'Approved deposits'},
		]);
		expect(JSON.stringify(result)).not.toContain('sql');
		expect(mocks.openAiChat.mock.calls[0][0][0].content).toContain('Never generate SQL');
	});

	it('rejects model output containing unsupported metrics or query fields',async()=>{
		mocks.openAiChat.mockResolvedValue(JSON.stringify({
			status:'success',
			interpretation:'Show the active customer count.',
			clarification_question:null,
			visualizations:[{id:'users_total',type:'stat',title:'Active customers'}],
			query:{type:'sql',raw:'SELECT * FROM "User"'},
		}));

		const response=await POST(request({question:'Show all private user details'}));

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({error:'The dashboard assistant returned an unsupported configuration.'});
		mocks.openAiChat.mockResolvedValue(JSON.stringify({
			status:'success',interpretation:'Run arbitrary query.',clarification_question:null,
			visualizations:[{id:'raw_sql',type:'stat',title:'All records'}],
		}));
		const unsupportedMetric=await POST(request({question:'Show all private user details'}));
		expect(unsupportedMetric.status).toBe(502);
	});

	it('reports when OpenAI is not configured',async()=>{
		mocks.getOpenAiConfig.mockReturnValue({enabled:false,model:'test-model'});

		const response=await POST(request({question:'Show current users'}));

		expect(response.status).toBe(503);
		expect(mocks.openAiChat).not.toHaveBeenCalled();
	});
});
