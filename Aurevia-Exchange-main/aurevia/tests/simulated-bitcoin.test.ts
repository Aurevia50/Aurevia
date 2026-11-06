import {describe,expect,it} from 'vitest';
import {Prisma} from '@prisma/client';
import {calculateSimulatedBitcoinConversion} from '../lib/simulated-bitcoin';

const D=Prisma.Decimal;

describe('simulated Bitcoin conversion arithmetic',()=>{
	it('deducts the configured simulated fee before calculating BTC received',()=>{
		const result=calculateSimulatedBitcoinConversion('BUY',new D('100'),new D('92500'),new D('0.0015'));
		expect(result.fee.toFixed(2)).toBe('0.15');
		expect(result.grossUsd.toFixed(2)).toBe('99.85');
		expect(result.bitcoinAmount.toFixed(10)).toBe('0.0010794594');
		expect(result.netUsd.toFixed(2)).toBe('100.00');
	});

	it('credits sale proceeds net of the configured fee',()=>{
		const result=calculateSimulatedBitcoinConversion('SELL',new D('0.001'),new D('92500'),new D('0.0015'));
		expect(result.grossUsd.toFixed(2)).toBe('92.50');
		expect(result.fee.toFixed(2)).toBe('0.14');
		expect(result.netUsd.toFixed(2)).toBe('92.36');
		expect(result.bitcoinAmount.toFixed(3)).toBe('0.001');
	});

	it('keeps ledger-sized USD conversion amounts exactly balanced after precision rounding',()=>{
		const sale=calculateSimulatedBitcoinConversion('SELL',new D('0.0007673846'),new D('65085.123456789'),new D('0.0015'));
		expect(sale.netUsd.plus(sale.fee).eq(sale.grossUsd)).toBe(true);
		const purchase=calculateSimulatedBitcoinConversion('BUY',new D('100.0000000000'),new D('65085.123456789'),new D('0.0015'));
		expect(purchase.grossUsd.plus(purchase.fee).eq(purchase.netUsd)).toBe(true);
	});

	it('rounds the simulated USD amount to cents while retaining BTC precision',()=>{
		const result=calculateSimulatedBitcoinConversion('BUY',new D('100.019'),new D('65085.123456789'),new D('0.0015'));
		expect(result.netUsd.toFixed(2)).toBe('100.02');
		expect(result.fee.toFixed(2)).toBe('0.15');
		expect(result.bitcoinAmount.toFixed(10)).toBe('0.0015344520');
	});

	it.each([
		{direction:'BUY' as const,amount:new D(0),price:new D(92500),feeRate:new D('0.001')},
		{direction:'SELL' as const,amount:new D('0.1'),price:new D(0),feeRate:new D('0.001')},
		{direction:'BUY' as const,amount:new D('10'),price:new D(92500),feeRate:new D(1)},
	])('rejects invalid conversion inputs: $direction',input=>{
		expect(()=>calculateSimulatedBitcoinConversion(input.direction,input.amount,input.price,input.feeRate)).toThrow('INVALID_CONVERSION');
	});
});
