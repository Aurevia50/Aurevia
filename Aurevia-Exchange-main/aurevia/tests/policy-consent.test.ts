import {describe,expect,it} from 'vitest';
import {CURRENT_TERMS_VERSION,hasAcceptedCurrentTerms} from '@/lib/policy-consent';

describe('versioned terms acceptance',()=>{
	it('accepts only the current terms version',()=>{
		expect(hasAcceptedCurrentTerms(CURRENT_TERMS_VERSION)).toBe(true);
		expect(hasAcceptedCurrentTerms('2026-10-26')).toBe(false);
		expect(hasAcceptedCurrentTerms(null)).toBe(false);
		expect(hasAcceptedCurrentTerms(undefined)).toBe(false);
	});
});
