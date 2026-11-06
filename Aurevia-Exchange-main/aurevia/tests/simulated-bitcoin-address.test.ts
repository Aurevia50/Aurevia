import {describe,expect,it} from 'vitest';
import {isBitcoinMainnetAddress} from '../lib/config/simulated-bitcoin-address';

describe('simulated Bitcoin address display validation',()=>{
	it('accepts mainnet Base58 and Bech32 address shapes',()=>{
		expect(isBitcoinMainnetAddress('1BoatSLRHtKNngkdXEeobR76b53LETtpyT')).toBe(true);
		expect(isBitcoinMainnetAddress('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBe(true);
	});

	it('rejects whitespace, malformed, testnet, and mixed-case Bech32 input',()=>{
		expect(isBitcoinMainnetAddress(' bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBe(false);
		expect(isBitcoinMainnetAddress('not-an-address')).toBe(false);
					expect(isBitcoinMainnetAddress('1BoatSLRHtKNngkdXxxxxxxxxxxyJt')).toBe(false);
		expect(isBitcoinMainnetAddress('tb1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBe(false);
		expect(isBitcoinMainnetAddress('bc1Qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBe(false);
	});
});
