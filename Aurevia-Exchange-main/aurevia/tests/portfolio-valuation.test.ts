import {describe,expect,it} from 'vitest';
import {Prisma} from '@prisma/client';
import {MAX_SIMULATED_MARK_AGE_MS,valueSimulatedMark} from '../lib/portfolio-valuation';

const mark=(overrides:Partial<Parameters<typeof valueSimulatedMark>[0]>={})=>({
	side:'BUY' as const,
	quantity:new Prisma.Decimal(2),
	entryPrice:new Prisma.Decimal(100),
	currentPrice:new Prisma.Decimal(110),
	quotedAt:new Date(1_000_000),
	...overrides,
});

describe('simulated portfolio valuation',()=>{
	it('values a fresh long position from its current simulated mark',()=>{
		expect(valueSimulatedMark(mark(),1_000_000)).toMatchObject({
			status:'CURRENT',
			currentPrice:new Prisma.Decimal(110),
			marketValue:new Prisma.Decimal(220),
			unrealizedPnl:new Prisma.Decimal(20),
		});
	});

	it('calculates short-position gain and loss with the correct direction',()=>{
		expect(valueSimulatedMark(mark({side:'SELL'}),1_000_000)).toMatchObject({
			status:'CURRENT',
			marketValue:new Prisma.Decimal(-220),
			unrealizedPnl:new Prisma.Decimal(-20),
		});
	});

	it('accepts a quote at the freshness boundary and rejects older marks',()=>{
		expect(valueSimulatedMark(mark(),1_000_000+MAX_SIMULATED_MARK_AGE_MS).status).toBe('CURRENT');
		expect(valueSimulatedMark(mark(),1_000_001+MAX_SIMULATED_MARK_AGE_MS).status).toBe('STALE');
	});

	it('rejects invalid prices, quantities, and timestamps rather than inventing a value',()=>{
		expect(valueSimulatedMark(mark({currentPrice:new Prisma.Decimal(0)}),1_000_000).status).toBe('UNAVAILABLE');
		expect(valueSimulatedMark(mark({quantity:new Prisma.Decimal(0)}),1_000_000).status).toBe('UNAVAILABLE');
		expect(valueSimulatedMark(mark({quotedAt:new Date(Number.NaN)}),1_000_000).status).toBe('UNAVAILABLE');
	});
});
