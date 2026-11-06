import {describe,expect,it} from 'vitest';
import {safeInternalPath} from '@/lib/navigation';

describe('safe post-authentication navigation',()=>{
	it('preserves local destinations including query strings and hashes',()=>{
		expect(safeInternalPath('/wallet/transactions?filter=pending#latest')).toBe('/wallet/transactions?filter=pending#latest');
	});

	it('preserves same-origin absolute callback destinations',()=>{
		expect(safeInternalPath('https://aurevia.test/wallet/transactions?filter=pending#latest','/dashboard','https://aurevia.test')).toBe('/wallet/transactions?filter=pending#latest');
	});

	it('rejects external, protocol-relative and malformed destinations',()=>{
		expect(safeInternalPath('https://attacker.test')).toBe('/dashboard');
		expect(safeInternalPath('https://attacker.test/wallet','/dashboard','https://aurevia.test')).toBe('/dashboard');
		expect(safeInternalPath('https://aurevia.test//attacker.test','/dashboard','https://aurevia.test')).toBe('/dashboard');
		expect(safeInternalPath('//attacker.test')).toBe('/dashboard');
		expect(safeInternalPath('/\\\\attacker.test')).toBe('/dashboard');
	});
});
