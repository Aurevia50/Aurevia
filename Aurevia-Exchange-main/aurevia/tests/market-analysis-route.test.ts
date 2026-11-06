import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireUser:vi.fn(),
	userFindUnique:vi.fn(),
	auditCreate:vi.fn(),
	runAiService:vi.fn(),
	rateLimit:vi.fn(),
	getMarketQuote:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireUser:mocks.requireUser}));
vi.mock('@/lib/db',()=>({db:{
	user:{findUnique:mocks.userFindUnique},
	auditLog:{create:mocks.auditCreate},
}}));
vi.mock('@/lib/ai-services',()=>({runAiService:mocks.runAiService}));
vi.mock('@/lib/ai-gateway',()=>({AiGatewayError:class AiGatewayError extends Error{constructor(message:string,readonly code:string,readonly status=503){super(message)}}}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:mocks.rateLimit}));
vi.mock('@/lib/config/env',()=>({getServerConfiguration:()=>({marketData:{finnhubApiKey:'test-key'},execution:{}})}));
vi.mock('@/lib/market-data-service',()=>({
	getAlpacaMarketDataOptions:vi.fn(()=>undefined),
	getMarketQuoteWithFallback:mocks.getMarketQuote,
}));
vi.mock('@/lib/live-market',()=>({
	getMarketAsset:vi.fn((symbol:string)=>['AAPL','BTC'].includes(symbol)?{id:symbol,name:symbol==='AAPL'?'Apple Inc.':'Bitcoin USD',type:symbol==='BTC'?'CRYPTO':'STOCK',currency:'USD'}:undefined),
	isExternalMarketDataSource:vi.fn((source:string)=>source==='Alpaca'||source==='Alpaca Crypto'||source==='Finnhub'),
}));

import {POST} from '@/app/api/market/analysis/route';

const request=(body:unknown)=>new Request('https://aurevia.test/api/market/analysis',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.requireUser.mockResolvedValue({id:'user-1'});
	mocks.userFindUnique.mockResolvedValue({status:'ACTIVE'});
	mocks.auditCreate.mockResolvedValue({});
	mocks.getMarketQuote.mockImplementation(async(asset:{id:string})=>({
		price:asset.id==='BTC'?67_000:200,
		change:2,
		changePercent:1,
		dayLow:190,
		dayHigh:210,
		updatedAt:new Date().toISOString(),
		source:'Alpaca',
		isStale:false,
	}));
	mocks.runAiService.mockResolvedValue({
		content:JSON.stringify({summary:'The supplied quotes show daily gains.',observations:[{symbol:'AAPL',observation:'AAPL is up 1% in the supplied daily quote.'}],caveat:'Quotes can be delayed; this is informational, not investment advice.'}),
		provider:'openrouter',
		model:'test/free-model',
	});
});

describe('fresh-provider market analysis',()=>{
	it('analyzes only fresh external quotes and audits the data sources',async()=>{
		mocks.getMarketQuote.mockImplementation(async(asset:{id:string})=>({
			price:200,change:2,changePercent:1,dayLow:190,dayHigh:210,updatedAt:new Date().toISOString(),
			source:asset.id==='AAPL'?'Alpaca':'Aurevia Internal',isStale:false,
		}));
		const response=await POST(request({symbols:['AAPL','BTC']}));
		const body=await response.json();

		expect(response.status).toBe(200);
		expect(body.quotes).toHaveLength(1);
		expect(body.quotes[0]).toMatchObject({symbol:'AAPL',provider:'Alpaca'});
		const messages=mocks.runAiService.mock.calls[0][1] as Array<{role:string;content:string}>;
		expect(JSON.parse(messages[1].content).quotes).toHaveLength(1);
		expect(messages[1].content).not.toContain('user-1');
		expect(mocks.runAiService).toHaveBeenCalledWith('market_information_summary',expect.any(Array),expect.objectContaining({actorId:'user-1'}));
		expect(mocks.auditCreate).toHaveBeenCalledWith({data:expect.objectContaining({actorId:'user-1',action:'AI_MARKET_ANALYSIS',metadata:expect.objectContaining({quotedSymbols:['AAPL'],externalAction:false})})});
	});

	it('does not send stale or internal quotes to the model',async()=>{
		mocks.getMarketQuote.mockImplementation(async(asset:{id:string})=>({
			price:200,change:2,changePercent:1,dayLow:190,dayHigh:210,updatedAt:asset.id==='AAPL'?new Date(Date.now()-6*60_000).toISOString():new Date().toISOString(),
			source:asset.id==='AAPL'?'Finnhub':'Aurevia Internal',isStale:false,
		}));

		const response=await POST(request({symbols:['AAPL','BTC']}));

		expect(response.status).toBe(503);
		expect(mocks.runAiService).not.toHaveBeenCalled();
	});

	it('rejects unsupported model observations',async()=>{
		mocks.runAiService.mockResolvedValue({
			content:JSON.stringify({summary:'Unsupported.',observations:[{symbol:'MSFT',observation:'A supported quote.'}],caveat:'Generated.'}),
			provider:'openrouter',model:'test/free-model',
		});

		const response=await POST(request({symbols:['AAPL']}));

		expect(response.status).toBe(502);
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it('requires an active signed-in user and supported unique symbols',async()=>{
		mocks.requireUser.mockRejectedValue(new Error('FORBIDDEN'));
		expect((await POST(request({symbols:['AAPL']}))).status).toBe(403);
		expect(mocks.userFindUnique).not.toHaveBeenCalled();

		mocks.requireUser.mockResolvedValue({id:'user-1'});
		expect((await POST(request({symbols:['AAPL','AAPL']}))).status).toBe(400);
		expect((await POST(request({symbols:['UNKNOWN']}))).status).toBe(400);
		expect(mocks.runAiService).not.toHaveBeenCalled();
	});
});
