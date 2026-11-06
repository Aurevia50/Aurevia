import {describe,expect,it} from 'vitest';
import {Prisma} from '@prisma/client';
import {calculateLoanSchedule,hasThreeConsecutiveActivityMonths,lateFeeApplies} from '../lib/community-finance-policy';

describe('community finance policy',()=>{
	it('builds a fixed-rate schedule with a clamped monthly due date and final rounded balance',()=>{
		const schedule=calculateLoanSchedule('1000.00',3,new Date('2026-01-31T12:00:00.000Z'));
		expect(schedule).toHaveLength(3);
		expect(schedule.map(item=>item.dueAt.toISOString())).toEqual([
			'2026-02-28T12:00:00.000Z',
			'2026-03-31T12:00:00.000Z',
			'2026-04-30T12:00:00.000Z',
		]);
		expect(schedule[0].totalAmount.toFixed(2)).toBe('340.02');
		expect(schedule.reduce((total,item)=>total.plus(item.principalAmount),new Prisma.Decimal(0)).toFixed(2)).toBe('1000.00');
		const last=schedule[schedule.length-1];
		expect(last.principalAmount.plus(last.interestAmount).toFixed(2)).toBe(last.totalAmount.toFixed(2));
	});

	it('requires qualifying activity in three distinct consecutive calendar months',()=>{
		expect(hasThreeConsecutiveActivityMonths([
			new Date('2026-01-02T00:00:00Z'),
			new Date('2026-01-30T00:00:00Z'),
			new Date('2026-02-04T00:00:00Z'),
			new Date('2026-03-10T00:00:00Z'),
		])).toBe(true);
		expect(hasThreeConsecutiveActivityMonths([
			new Date('2026-01-02T00:00:00Z'),
			new Date('2026-03-04T00:00:00Z'),
			new Date('2026-04-10T00:00:00Z'),
		])).toBe(false);
	});

	it('starts the one-time late fee only after the five-day grace period',()=>{
		const dueAt=new Date('2026-01-10T00:00:00.000Z');
		expect(lateFeeApplies(dueAt,new Date('2026-01-15T00:00:00.000Z'))).toBe(false);
		expect(lateFeeApplies(dueAt,new Date('2026-01-15T00:00:00.001Z'))).toBe(true);
	});
});
