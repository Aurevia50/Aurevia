import {AccountMode,Prisma} from '@prisma/client';
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireUser:vi.fn(),
	userFindUnique:vi.fn(),
	positionFindMany:vi.fn(),
	auditCreate:vi.fn(),
	runAiService:vi.fn(),
	rateLimit:vi.fn(),
	getMarketQuote:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireUser:mocks.requireUser}));
vi.mock('@/lib/db',()=>({db:{
	user:{findUnique:mocks.userFindUnique},
	position:{findMany:mocks.positionFindMany},
	auditLog:{create:mocks.auditCreate},
}}));
vi.mock('@/lib/ai-services',()=>({runAiService:mocks.runAiService}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:mocks.rateLimit}));
vi.mock('@/lib/config/env',()=>({getServerConfiguration:()=>({marketData:{finnhubApiKey:'test'},execution:{}})}));
vi.mock('@/lib/market-data-service',()=>({
	getAlpacaMarketDataOptions:vi.fn(()=>undefined),
	getMarketQuoteWithFallback:mocks.getMarketQuote,
}));
vi.mock('@/lib/live-market',()=>({
	getMarketAssetForTradingSymbol:vi.fn((symbol:string)=>({id:symbol})),
	isExternalMarketDataSource:vi.fn((source:string)=>source==='Alpaca'||source==='Finnhub'),
}));

import {POST} from '@/app/api/portfolio/assistant/route';

const request=(body:unknown)=>new Request('https://aurevia.test/api/portfolio/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const position={
	side:'BUY',
	quantity:new Prisma.Decimal(2),
	instrument:{symbol:'AAPL',baseAsset:'AAPL',quoteAsset:'USD',price:new Prisma.Decimal(110),updatedAt:new Date()},
};

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.requireUser.mockResolvedValue({id:'user-1'});
	mocks.userFindUnique.mockResolvedValue({accountMode:AccountMode.DEMO,status:'ACTIVE'});
	mocks.positionFindMany.mockResolvedValue([position]);
	mocks.auditCreate.mockResolvedValue({});
	mocks.runAiService.mockResolvedValue({content:JSON.stringify({summary:'Your open positions are concentrated in equities.',riskFactors:['A single asset class represents all valued exposure.'],caveat:'This excludes cash and investments.'}),provider:'openrouter',model:'test/free-model'});
	mocks.getMarketQuote.mockResolvedValue({price:110,updatedAt:new Date().toISOString(),source:'Alpaca',isStale:false});
});

describe('user-scoped portfolio AI assistant',()=>{
	it('sends only aggregated, mode-scoped exposure and audits the analysis',async()=>{
		const response=await POST(request({question:'How concentrated are my positions?'}));
		const body=await response.json();
		expect(response.status).toBe(200);
		expect(body.analysis.summary).toContain('concentrated');
		expect(mocks.positionFindMany).toHaveBeenCalledWith(expect.objectContaining({where:{userId:'user-1',accountMode:AccountMode.DEMO,status:'OPEN'}}));
		const messages=mocks.runAiService.mock.calls[0][1] as Array<{role:string;content:string}>;
		const supplied=JSON.parse(messages[1].content);
		expect(supplied.portfolioExposure).toMatchObject({
			accountMode:'DEMO',
			openPositionCount:1,
			valuedPositionCount:1,
			grossExposureByAssetClass:[{assetClass:'Equity',positionCount:1,grossExposureSharePercent:100,longSharePercent:100,shortSharePercent:0}],
		});
		expect(messages[1].content).not.toContain('user-1');
		expect(mocks.auditCreate).toHaveBeenCalledWith({data:expect.objectContaining({actorId:'user-1',action:'AI_PORTFOLIO_ANALYSIS',metadata:expect.objectContaining({accountMode:'DEMO',externalAction:false})})});
	});

	it('uses only fresh verified provider quotes for REAL exposure',async()=>{
		mocks.userFindUnique.mockResolvedValue({accountMode:AccountMode.REAL,status:'ACTIVE'});
		const response=await POST(request({question:'Explain concentration'}));
		expect(response.status).toBe(200);
		expect(mocks.getMarketQuote).toHaveBeenCalledOnce();
		expect(JSON.parse((mocks.runAiService.mock.calls[0][1] as Array<{content:string}>)[1].content).portfolioExposure.markSource).toBe('Alpaca');
	});

	it('reports unavailable REAL marks without falling back to simulated prices',async()=>{
		mocks.userFindUnique.mockResolvedValue({accountMode:AccountMode.REAL,status:'ACTIVE'});
		mocks.getMarketQuote.mockResolvedValue({price:110,updatedAt:new Date().toISOString(),source:'Aurevia Internal',isStale:false});
		const response=await POST(request({question:'Explain concentration'}));
		const supplied=JSON.parse((mocks.runAiService.mock.calls[0][1] as Array<{content:string}>)[1].content);
		expect(response.status).toBe(200);
		expect(supplied.portfolioExposure.valuedPositionCount).toBe(0);
		expect(supplied.portfolioExposure.unvaluedOpenPositions).toBe(1);
	});

	it('rejects unauthorized users before reading positions',async()=>{
		mocks.requireUser.mockRejectedValue(new Error('FORBIDDEN'));
		const response=await POST(request({question:'Explain concentration'}));
		expect(response.status).toBe(403);
		expect(mocks.positionFindMany).not.toHaveBeenCalled();
	});
});
