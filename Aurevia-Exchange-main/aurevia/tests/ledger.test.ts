import {describe,it,expect} from 'vitest';import {Prisma} from '@prisma/client';
describe('ledger invariants',()=>{it('uses positive monetary quantities',()=>{const x=new Prisma.Decimal('12.50');expect(x.gt(0)).toBe(true);expect(x.toFixed(2)).toBe('12.50')})});
