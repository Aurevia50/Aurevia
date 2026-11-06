import {describe,expect,it} from 'vitest';
import {Prisma} from '@prisma/client';
import {assertFreshQuote,assertSellableQuantity,averageEntryPrice,realizedSpotPnl} from '../lib/trading-policy';

const decimal=(value:string)=>new Prisma.Decimal(value);

describe('demo spot trading policy',()=>{
 it('accepts recent quotes and rejects stale or future timestamps',()=>{
  const now=Date.now();
  expect(()=>assertFreshQuote(new Date(now-29_000),now)).not.toThrow();
  expect(()=>assertFreshQuote(new Date(now-31_000),now)).toThrow('STALE_MARKET_QUOTE');
  expect(()=>assertFreshQuote(new Date(now+6_000),now)).toThrow('STALE_MARKET_QUOTE');
 });

 it('prevents selling reserved or unowned units',()=>{
  expect(()=>assertSellableQuantity(decimal('5'),decimal('2'),decimal('3'))).not.toThrow();
  expect(()=>assertSellableQuantity(decimal('5'),decimal('2'),decimal('3.01'))).toThrow('INSUFFICIENT_POSITION');
 });

 it('includes fees in weighted entry and realized spot P/L',()=>{
  expect(averageEntryPrice(decimal('2'),decimal('10'),decimal('2'),decimal('12'),decimal('0.04')).toFixed(4)).toBe('11.0100');
  expect(realizedSpotPnl(decimal('11'),decimal('12'),decimal('2'),decimal('0.04')).toFixed(2)).toBe('1.96');
 });
});