import {NewsFeedItemStatus} from '@prisma/client';
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	getServerSession:vi.fn(),
	itemFindMany:vi.fn(),
	sourceFindMany:vi.fn(),
	runAiService:vi.fn(),
	rateLimit:vi.fn(),
}));

vi.mock('next-auth',()=>({getServerSession:mocks.getServerSession}));
vi.mock('@/lib/auth-options',()=>({authOptions:{}}));
vi.mock('@/lib/db',()=>({db:{newsFeedItem:{findMany:mocks.itemFindMany},newsFeedSource:{findMany:mocks.sourceFindMany}}}));
vi.mock('@/lib/ai-services',()=>({runAiService:mocks.runAiService}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:mocks.rateLimit}));

import {POST} from '@/app/api/news-feed/analysis/route';

const request=()=>new Request('https://aurevia.test/api/news-feed/analysis',{method:'POST',headers:{'x-real-ip':'192.0.2.12'},body:'{}'});
const article={id:'article-1',title:'Central bank maintains rates',summary:'The committee held rates steady.',publisher:'Publisher',category:'ECONOMIC_NEWS',publishedAt:new Date(),source:{displayName:'Federal Reserve',lastSuccessAt:new Date()}};

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.getServerSession.mockResolvedValue(null);
	mocks.itemFindMany.mockResolvedValue([article]);
	mocks.sourceFindMany.mockResolvedValue([{lastSuccessAt:new Date()}]);
	mocks.runAiService.mockResolvedValue({content:JSON.stringify({overallSentiment:'neutral',summary:'Coverage is mostly neutral.',articles:[{id:'article-1',sentiment:'neutral',observation:'Reports the rate decision without a clear directional claim.'}],caveat:'Headline framing does not establish market impact.'}),provider:'openrouter',model:'test/free-model'});
});

describe('publisher-sourced news sentiment',()=>{
	it('analyzes only recent active feed items and validates article references',async()=>{
		const response=await POST(request());
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({analysis:{overallSentiment:'neutral'},articleCount:1,sourceDataStale:false});
		expect(mocks.itemFindMany).toHaveBeenCalledWith(expect.objectContaining({
			where:expect.objectContaining({status:NewsFeedItemStatus.ACTIVE,publishedAt:expect.objectContaining({gte:expect.any(Date)}),source:{enabled:true}}),
			take:12,
		}));
		expect(mocks.runAiService).toHaveBeenCalledWith('market_information_summary',expect.any(Array),expect.objectContaining({temperature:0.1,maxTokens:900}));
	});

	it('rejects model references to articles outside the supplied feed',async()=>{
		mocks.runAiService.mockResolvedValue({content:JSON.stringify({overallSentiment:'positive',summary:'Unsupported reference.',articles:[{id:'not-in-feed',sentiment:'positive',observation:'Unsupported.'}],caveat:'Generated.'}),provider:'openrouter',model:'test/free-model'});
		const response=await POST(request());
		expect(response.status).toBe(502);
	});

	it('does not request AI when no recent source articles are available',async()=>{
		mocks.itemFindMany.mockResolvedValue([]);
		const response=await POST(request());
		expect(response.status).toBe(404);
		expect(mocks.runAiService).not.toHaveBeenCalled();
	});
});
