import {describe,expect,it} from 'vitest';
import {nextPrice} from '@/lib/market';

describe('simulated market ticks',()=>{
	it('produces reproducible bounded changes for the same input mark',()=>{
		const first=nextPrice(92_500);
		expect(nextPrice(92_500)).toBe(first);
		expect(first).not.toBe(92_500);
		expect(Math.abs(first/92_500-1)).toBeLessThanOrEqual(0.003);
	});

	it('rejects non-finite and non-positive input prices',()=>{
		expect(()=>nextPrice(0)).toThrow('INVALID_SIMULATED_PRICE');
		expect(()=>nextPrice(Number.NaN)).toThrow('INVALID_SIMULATED_PRICE');
		expect(()=>nextPrice(Number.POSITIVE_INFINITY)).toThrow('INVALID_SIMULATED_PRICE');
	});
});
