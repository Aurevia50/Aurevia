import {describe,expect,it} from 'vitest';
import {calculateInvestmentDisplay,filterInvestmentActivity} from '@/lib/investment-display';

describe('display-only investment progress',()=>{
	const start=Date.parse('2026-01-01T00:00:00.000Z');
	const end=Date.parse('2026-01-11T00:00:00.000Z');

	it('interpolates earnings and remaining duration using the clamped clock',()=>{
		expect(calculateInvestmentDisplay({principal:100,targetPayout:120,activatedAt:start,maturesAt:end,now:start+5*86_400_000})).toEqual({
			progress:0.5,earnings:10,secondsRemaining:432000,matured:false,
		});
	});

	it('clamps pre-start time to zero progress and zero earnings',()=>{
		const result=calculateInvestmentDisplay({principal:100,targetPayout:120,activatedAt:start,maturesAt:end,now:start-1000});
		expect(result).toMatchObject({progress:0,earnings:0,secondsRemaining:864000,matured:false});
	});

	it('stops at maturity without exceeding the target earnings',()=>{
		const result=calculateInvestmentDisplay({principal:100,targetPayout:120,activatedAt:start,maturesAt:end,now:end+60_000});
		expect(result).toMatchObject({progress:1,earnings:20,secondsRemaining:0,matured:true});
	});

	it('shows negative estimated earnings when the recorded payout is below principal',()=>{
		const result=calculateInvestmentDisplay({principal:100,targetPayout:90,activatedAt:start,maturesAt:end,now:start+5*86_400_000});
		expect(result.earnings).toBe(-5);
	});

	it('returns safe zero values for invalid investment terms',()=>{
		expect(calculateInvestmentDisplay({principal:100,targetPayout:120,activatedAt:start,maturesAt:start,now:start})).toEqual({
			progress:0,earnings:0,secondsRemaining:0,matured:false,
		});
	});
});

describe('investment activity filtering',()=>{
	const requests=[
		{id:'old-active',status:'ACTIVE',requestedAt:'2026-01-01T00:00:00.000Z',amount:'100',opportunity:{title:'Growth account',category:'Equities'}},
		{id:'new-settled',status:'SETTLED',requestedAt:'2026-01-03T00:00:00.000Z',amount:'500',opportunity:{title:'Income plan',category:'Fixed income'}},
		{id:'middle-pending',status:'PENDING_APPROVAL',requestedAt:'2026-01-02T00:00:00.000Z',amount:'250',opportunity:{title:'Green energy',category:'Infrastructure'}},
	];

	it('filters status and search against persisted request descriptions',()=>{
		expect(filterInvestmentActivity(requests,{query:'green energy',status:'PENDING_APPROVAL',sort:'NEWEST'}).map(item=>item.id)).toEqual(['middle-pending']);
		expect(filterInvestmentActivity(requests,{query:'growth',status:'SETTLED',sort:'NEWEST'})).toEqual([]);
	});

	it('sorts activity by date or amount without mutating the source records',()=>{
		expect(filterInvestmentActivity(requests,{query:'',status:'ALL',sort:'NEWEST'}).map(item=>item.id)).toEqual(['new-settled','middle-pending','old-active']);
		expect(filterInvestmentActivity(requests,{query:'',status:'ALL',sort:'AMOUNT'}).map(item=>item.id)).toEqual(['new-settled','middle-pending','old-active']);
		expect(requests.map(item=>item.id)).toEqual(['old-active','new-settled','middle-pending']);
	});
});
