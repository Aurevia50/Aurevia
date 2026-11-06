import {Prisma} from '@prisma/client';

export const MAX_SIMULATED_MARK_AGE_MS=60_000;
const MAX_FUTURE_CLOCK_SKEW_MS=5_000;

export type SimulatedMark={
	side:'BUY'|'SELL';
	quantity:Prisma.Decimal;
	entryPrice:Prisma.Decimal;
	currentPrice:Prisma.Decimal;
	quotedAt:Date;
};

export function valueMarketMark(mark:SimulatedMark,now=Date.now()){
	const age=now-mark.quotedAt.getTime();
	const validPrice=mark.currentPrice.isFinite()&&mark.currentPrice.gt(0);
	const validPosition=mark.quantity.isFinite()&&mark.quantity.gt(0)&&mark.entryPrice.isFinite()&&mark.entryPrice.gt(0);
	const validTimestamp=Number.isFinite(mark.quotedAt.getTime());
	const fresh=Number.isFinite(age)&&age>=-MAX_FUTURE_CLOCK_SKEW_MS&&age<=MAX_SIMULATED_MARK_AGE_MS;
	if(!validPrice||!validPosition||!validTimestamp)return {status:'UNAVAILABLE' as const,currentPrice:null,marketValue:null,unrealizedPnl:null};
	if(!fresh)return {status:'STALE' as const,currentPrice:null,marketValue:null,unrealizedPnl:null};

	const direction=mark.side==='BUY'?1:-1;
	const marketValue=mark.currentPrice.mul(mark.quantity).mul(direction);
	const unrealizedPnl=mark.entryPrice.mul(-direction).plus(mark.currentPrice.mul(direction)).mul(mark.quantity);
	return {status:'CURRENT' as const,currentPrice:mark.currentPrice,marketValue,unrealizedPnl};
}

export const valueSimulatedMark=valueMarketMark;
