import {Prisma} from '@prisma/client';

export function assertFreshQuote(observedAt:string|Date,now=Date.now()){
 const timestamp=observedAt instanceof Date?observedAt.getTime():Date.parse(observedAt);
 if(!Number.isFinite(timestamp)||now-timestamp>30_000||timestamp-now>5_000)throw new Error('STALE_MARKET_QUOTE');
}

export function assertSellableQuantity(owned:Prisma.Decimal,reserved:Prisma.Decimal,requested:Prisma.Decimal){
 if(requested.lte(0)||requested.gt(owned.minus(reserved)))throw new Error('INSUFFICIENT_POSITION');
}

export function averageEntryPrice(heldQuantity:Prisma.Decimal,currentAverage:Prisma.Decimal,newQuantity:Prisma.Decimal,fillPrice:Prisma.Decimal,fee:Prisma.Decimal){
 const totalQuantity=heldQuantity.plus(newQuantity);
 if(totalQuantity.lte(0))throw new Error('INVALID_QUANTITY');
 return currentAverage.mul(heldQuantity).plus(fillPrice.mul(newQuantity)).plus(fee).div(totalQuantity);
}

export function realizedSpotPnl(entryPrice:Prisma.Decimal,fillPrice:Prisma.Decimal,quantity:Prisma.Decimal,fee:Prisma.Decimal){
 return fillPrice.minus(entryPrice).mul(quantity).minus(fee);
}