import {afterEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	aiChat:vi.fn(),
	findMany:vi.fn(),
	findUnique:vi.fn(),
	rateLimit:vi.fn(),
}));

vi.mock('@/lib/ai-gateway',()=>({aiChat:mocks.aiChat}));
vi.mock('@/lib/db',()=>({db:{systemSetting:{findMany:mocks.findMany,findUnique:mocks.findUnique}}}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:mocks.rateLimit}));

afterEach(()=>{
	vi.resetModules();
	vi.clearAllMocks();
});

describe('central AI service controls',()=>{
	it('defaults to enabled services and exposes labels without revealing prompts',async()=>{
		mocks.findMany.mockResolvedValue([{key:'aurevia.ai.feature.customer_support',value:'false'}]);
		const {getAiServiceFeatures}=await import('@/lib/ai-services');
		const features=await getAiServiceFeatures();
		expect(features.find(feature=>feature.id==='customer_support')).toMatchObject({label:'Customer support',enabled:false});
		expect(JSON.stringify(features)).not.toContain('system');
	});

	it('blocks disabled services before rate limiting or provider access',async()=>{
		mocks.findUnique.mockResolvedValue({value:'false'});
		const {runAiService}=await import('@/lib/ai-services');
		await expect(runAiService('platform_help',[{role:'user',content:'help'}])).rejects.toThrow('AI_FEATURE_DISABLED');
		expect(mocks.rateLimit).not.toHaveBeenCalled();
		expect(mocks.aiChat).not.toHaveBeenCalled();
	});

	it('applies centralized user-and-service rate limits before provider access',async()=>{
		mocks.findUnique.mockResolvedValue(null);
		mocks.aiChat.mockResolvedValue({content:'help',provider:'openrouter',model:'free',usage:{}});
		const {runAiService}=await import('@/lib/ai-services');
		await runAiService('platform_help',[{role:'user',content:'help'}],{actorId:'user-1'});
		expect(mocks.rateLimit).toHaveBeenCalledWith('ai-service:user-1:platform_help',60,60_000);
		expect(mocks.aiChat).toHaveBeenCalledOnce();
	});

	it('redacts credentials, contact details, and payment numbers before sending prompts',async()=>{
		mocks.findUnique.mockResolvedValue(null);
		mocks.aiChat.mockResolvedValue({content:'help',provider:'openrouter',model:'free',usage:{}});
		const {runAiService}=await import('@/lib/ai-services');
		await runAiService('platform_help',[{role:'user',content:'Email me at member@example.com; phone +1 (210) 555-0199; password=secret-pass; card 4242 4242 4242 4242'}]);
		const prompt=mocks.aiChat.mock.calls[0][0].map((message:{content:string})=>message.content).join('\n');
		expect(prompt).not.toContain('member@example.com');
		expect(prompt).not.toContain('555-0199');
		expect(prompt).not.toContain('secret-pass');
		expect(prompt).not.toContain('4242 4242 4242 4242');
		expect(prompt).toContain('[redacted email]');
		expect(prompt).toContain('[redacted credential]');
	});
});
