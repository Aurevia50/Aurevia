import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireUser:vi.fn(),
	userFindUnique:vi.fn(),
	instrumentFindUnique:vi.fn(),
	marketQuote:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireUser:mocks.requireUser}));
vi.mock('@/lib/db',()=>({db:{
	user:{findUnique:mocks.userFindUnique},
	instrument:{findUnique:mocks.instrumentFindUnique},
}}));
vi.mock('@/lib/config/env',()=>({getServerConfiguration:()=>({marketData:{finnhubApiKey:'configured'},execution:{}})}));
vi.mock('@/lib/market-data-service',()=>({getAlpacaMarketDataOptions:vi.fn(()=>undefined)}));
vi.mock('@/lib/live-market',async importOriginal=>{
	const actual=await importOriginal<typeof import('@/lib/live-market')>();
	return {...actual,getMarketQuote:mocks.marketQuote};
});

import {GET} from '@/app/api/orderbook/route';

function request(){return new Request('https://aurevia.test/api/orderbook?instrumentId=instrument-1');}
function providerQuote(overrides:Record<string,unknown>={}){
	return {
		price:100,bid:99,ask:101,change:1,changePercent:1,updatedAt:new Date().toISOString(),
		source:'Alpaca',marketStatus:'UNKNOWN',isStale:false,...overrides,
	};
}

describe('mode-scoped order book route',()=>{
	beforeEach(()=>{
		vi.clearAllMocks();
		mocks.requireUser.mockResolvedValue({id:'user-1'});
		mocks.userFindUnique.mockResolvedValue({accountMode:'REAL',status:'ACTIVE'});
		mocks.instrumentFindUnique.mockResolvedValue({id:'instrument-1',symbol:'AAPL',price:100,tickSize:0.01});
		mocks.marketQuote.mockResolvedValue(providerQuote());
	});

	it('returns provider best bid and ask without presenting Level 2 depth in REAL mode',async()=>{
		const response=await GET(request());
		const result=await response.json();

		expect(response.status).toBe(200);
		expect(result).toMatchObject({
			kind:'TOP_OF_BOOK',symbol:'AAPL',last:100,bid:99,ask:101,spread:2,
			source:'Alpaca',depthAvailable:false,
		});
		expect(result).not.toHaveProperty('bids');
		expect(result).not.toHaveProperty('asks');
	});

	it('rejects internal fallback values for REAL quotes',async()=>{
		mocks.marketQuote.mockResolvedValue(providerQuote({source:'Aurevia Internal'}));

		const response=await GET(request());
		const result=await response.json();

		expect(response.status).toBe(503);
		expect(result).toMatchObject({error:'Fresh provider quotes are unavailable.'});
		expect(result).not.toHaveProperty('bids');
	});

	it('keeps the simulated book scoped to DEMO mode',async()=>{
		mocks.userFindUnique.mockResolvedValue({accountMode:'DEMO',status:'ACTIVE'});

		const response=await GET(request());
		const result=await response.json();

		expect(response.status).toBe(200);
		expect(result).toMatchObject({kind:'SIMULATED_BOOK',symbol:'AAPL'});
		expect(result.bids).toHaveLength(8);
		expect(result.asks).toHaveLength(8);
		expect(mocks.marketQuote).not.toHaveBeenCalled();
	});
});
