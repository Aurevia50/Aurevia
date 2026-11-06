import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireAdmin:vi.fn(),
	conversationFindUnique:vi.fn(),
	auditCreate:vi.fn(),
	runAiService:vi.fn(),
	rateLimit:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireAdmin:mocks.requireAdmin}));
vi.mock('@/lib/db',()=>({db:{supportConversation:{findUnique:mocks.conversationFindUnique},auditLog:{create:mocks.auditCreate}}}));
vi.mock('@/lib/ai-services',()=>({runAiService:mocks.runAiService}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:mocks.rateLimit}));

import {POST} from '@/app/api/admin/support/classify/route';

const request=(body:unknown)=>new Request('https://aurevia.test/api/admin/support/classify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
	mocks.conversationFindUnique.mockResolvedValue({
		id:'ticket-1',subject:'Urgent withdrawal help',category:'GENERAL',priority:'NORMAL',isComplaint:false,
		messages:[{body:'My phone is +1 (210) 555-0188; please help with a withdrawal.'}],
	});
	mocks.auditCreate.mockResolvedValue({});
	mocks.runAiService.mockResolvedValue({content:JSON.stringify({category:'WITHDRAWAL',priority:'HIGH',rationale:'The normalized signals indicate a withdrawal request with urgent language.'}),provider:'openrouter',model:'test/free-model'});
});

describe('administrator AI support-ticket classification',()=>{
	it('uses normalized signals, returns a suggestion only, and audits without message content',async()=>{
		const response=await POST(request({conversationId:'ticket-1'}));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({suggestion:{category:'WITHDRAWAL',priority:'HIGH'},applied:false});
		const messages=mocks.runAiService.mock.calls[0][1] as Array<{content:string}>;
		expect(mocks.runAiService.mock.calls[0][0]).toBe('support_ticket_classification');
		expect(messages[1].content).toContain('"WITHDRAWAL"');
		expect(messages[1].content).toContain('"urgentLanguage":true');
		expect(messages[1].content).not.toContain('555-0188');
		expect(messages[1].content).not.toContain('Urgent withdrawal help');
		expect(mocks.auditCreate).toHaveBeenCalledWith({data:expect.objectContaining({actorId:'admin-1',action:'AI_SUPPORT_CLASSIFICATION_SUGGESTED',entityId:'ticket-1',metadata:expect.objectContaining({applied:false,suggestedPriority:'HIGH'})})});
		expect(JSON.stringify(mocks.auditCreate.mock.calls)).not.toContain('withdrawal help');
	});

	it('forces explicit complaint tickets to the complaint category without changing the ticket',async()=>{
		mocks.conversationFindUnique.mockResolvedValue({id:'ticket-2',subject:'Issue',category:'GENERAL',priority:'LOW',isComplaint:true,messages:[]});
		const response=await POST(request({conversationId:'ticket-2'}));
		expect((await response.json()).suggestion.category).toBe('COMPLAINT');
		expect(mocks.conversationFindUnique).toHaveBeenCalledOnce();
		expect(mocks.auditCreate).toHaveBeenCalledOnce();
	});

	it('requires admin access and rejects unsupported AI output',async()=>{
		mocks.requireAdmin.mockRejectedValue(new Error('FORBIDDEN'));
		expect((await POST(request({conversationId:'ticket-1'}))).status).toBe(403);
		expect(mocks.runAiService).not.toHaveBeenCalled();
		mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
		mocks.runAiService.mockResolvedValue({content:'{"category":"APPROVE_KYC","priority":"URGENT","rationale":"Unsupported"}',provider:'openrouter',model:'test/free-model'});
		expect((await POST(request({conversationId:'ticket-1'}))).status).toBe(502);
	});
});
