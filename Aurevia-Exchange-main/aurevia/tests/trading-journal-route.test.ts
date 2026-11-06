import {AccountMode,Prisma} from '@prisma/client';
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireUser:vi.fn(),
	userFindUnique:vi.fn(),
	positionFindMany:vi.fn(),
	auditCreate:vi.fn(),
	runAiService:vi.fn(),
	rateLimit:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireUser:mocks.requireUser}));
vi.mock('@/lib/db',()=>({db:{
	user:{findUnique:mocks.userFindUnique},
	position:{findMany:mocks.positionFindMany},
	auditLog:{create:mocks.auditCreate},
}}));
vi.mock('@/lib/ai-services',()=>({runAiService:mocks.runAiService}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:mocks.rateLimit}));

import {POST} from '@/app/api/portfolio/journal/route';

const request=(body:unknown)=>new Request('https://aurevia.test/api/portfolio/journal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const closedTrade=(pnl:string,side:'BUY'|'SELL'='BUY')=>({
	side,
	realizedPnl:new Prisma.Decimal(pnl),
	instrument:{symbol:'SECRET-SYMBOL',baseAsset:'AAPL',quoteAsset:'USD'},
});

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.requireUser.mockResolvedValue({id:'user-1'});
	mocks.userFindUnique.mockResolvedValue({accountMode:AccountMode.DEMO,status:'ACTIVE'});
	mocks.positionFindMany.mockResolvedValue([closedTrade('10'),closedTrade('-5','SELL'),closedTrade('0')]);
	mocks.auditCreate.mockResolvedValue({});
	mocks.runAiService.mockResolvedValue({content:JSON.stringify({reflection:'The sample contains mixed outcomes.',observations:['The outcomes include wins, losses, and break-even trades.'],questions:['What was different across these trades?'],caveat:'Historical outcomes do not predict future results.'}),provider:'openrouter',model:'test/free-model'});
});

describe('trading journal reflection',()=>{
	it('uses scoped aggregates without sending individual symbols or dollar outcomes',async()=>{
		const response=await POST(request({question:'What patterns appear in my journal?'}));
		expect(response.status).toBe(200);
		expect((await response.json()).reflection.reflection).toContain('mixed outcomes');
		expect(mocks.positionFindMany).toHaveBeenCalledWith(expect.objectContaining({
			where:{userId:'user-1',accountMode:AccountMode.DEMO,status:'CLOSED',closedAt:{gte:expect.any(Date)}},
			take:100,
		}));
		const prompt=(mocks.runAiService.mock.calls[0][1] as Array<{content:string}>)[1].content;
		expect(mocks.runAiService.mock.calls[0][0]).toBe('trading_journal');
		expect(prompt).toContain('"winningTradeCount":1');
		expect(prompt).toContain('"losingTradeCount":1');
		expect(prompt).not.toContain('SECRET-SYMBOL');
		expect(prompt).not.toContain('"10"');
		expect(prompt).not.toContain('user-1');
		expect(mocks.auditCreate).toHaveBeenCalledWith({data:expect.objectContaining({actorId:'user-1',action:'AI_TRADING_JOURNAL_REFLECTION',metadata:expect.objectContaining({accountMode:'DEMO',externalAction:false})})});
	});

	it('limits review to the current account mode and the newest 100 closed trades',async()=>{
		mocks.userFindUnique.mockResolvedValue({accountMode:AccountMode.REAL,status:'ACTIVE'});
		mocks.positionFindMany.mockResolvedValue(Array.from({length:100},()=>closedTrade('1')));
		await POST(request({question:'Review my journal'}));
		expect(mocks.positionFindMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({userId:'user-1',accountMode:'REAL'}),take:100,orderBy:{closedAt:'desc'}}));
		const aggregates=JSON.parse((mocks.runAiService.mock.calls[0][1] as Array<{content:string}>)[1].content).tradeJournalAggregates;
		expect(aggregates.disclosure).toContain('capped');
	});

	it('does not make AI requests when the account has no closed trades in the period',async()=>{
		mocks.positionFindMany.mockResolvedValue([]);
		const response=await POST(request({question:'Review my journal'}));
		expect(response.status).toBe(404);
		expect(mocks.runAiService).not.toHaveBeenCalled();
	});

	it('rejects unauthorized users before reading account history',async()=>{
		mocks.requireUser.mockRejectedValue(new Error('FORBIDDEN'));
		const response=await POST(request({question:'Review my journal'}));
		expect(response.status).toBe(403);
		expect(mocks.positionFindMany).not.toHaveBeenCalled();
	});
});
