import {describe,expect,it} from 'vitest';
import {formatUsd} from '../lib/currency-format';

describe('USD display formatting',()=>{
	it('uses thousand separators and exactly two decimal places',()=>{
		expect(formatUsd('12450.5')).toBe('$12,450.50');
		expect(formatUsd('1250.7500000043')).toBe('$1,250.75');
	});

	it('keeps formatted balances display-only',()=>{
		const balance='9832.1';
		formatUsd(balance);
		expect(balance).toBe('9832.1');
	});
});
