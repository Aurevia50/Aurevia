import {Prisma} from '@prisma/client';
import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {processOpenOrders} from '@/lib/orders';
import {rateLimit} from '@/lib/rate-limit';

const schema=z.object({
	symbol:z.enum(['NVDA','BTC/USD','XAU/USD']),
	direction:z.enum(['UP','DOWN']),
	volatilityPercent:z.number().min(0.01).max(25),
});

export async function POST(request:Request){
	try{
		const admin=await requireAdmin();
		rateLimit(`admin-market-tick:${admin.id}`,20,60_000);
		const input=schema.parse(await request.json());
		const idempotencyKey=request.headers.get('Idempotency-Key')||'';
		if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))return NextResponse.json({error:'A valid idempotency key is required.'},{status:400});
		const result=await db.$transaction(async tx=>{
			const prior=await tx.auditLog.findFirst({where:{action:'SIMULATED_MARKET_TICK',metadata:{path:['idempotencyKey'],equals:idempotencyKey}}});
			if(prior){
				const metadata=prior.metadata&&typeof prior.metadata==='object'&&!Array.isArray(prior.metadata)?prior.metadata:{};
				if(metadata.symbol!==input.symbol||metadata.direction!==input.direction||String(metadata.volatilityPercent)!==String(input.volatilityPercent))throw new Error('IDEMPOTENCY_KEY_REUSED');
				return {symbol:input.symbol,price:String(metadata.newPrice),previousPrice:String(metadata.previousPrice),source:'Aurevia DEMO price feed',dataMode:'SIMULATED' as const,replayed:true};
			}
			const instrument=await tx.instrument.findUnique({where:{symbol:input.symbol}});
			if(!instrument||!instrument.enabled)throw new Error('SIMULATED_INSTRUMENT_UNAVAILABLE');
			const previousPrice=new Prisma.Decimal(instrument.price);
			const volatility=new Prisma.Decimal(input.volatilityPercent.toString()).div(100);
			const factor=input.direction==='UP'?new Prisma.Decimal(1).plus(volatility):new Prisma.Decimal(1).minus(volatility);
			const price=previousPrice.mul(factor).toDecimalPlaces(10,Prisma.Decimal.ROUND_HALF_UP);
			if(price.lte(0))throw new Error('INVALID_SIMULATED_PRICE');
			const updatedAt=new Date();
			await tx.instrument.update({where:{id:instrument.id},data:{price,updatedAt}});
			const candleTime=new Date(Math.floor(updatedAt.getTime()/60_000)*60_000);
			const volume=price.minus(previousPrice).abs().mul(100);
			await tx.candle.upsert({
				where:{instrumentId_ts:{instrumentId:instrument.id,ts:candleTime}},
				create:{instrumentId:instrument.id,ts:candleTime,open:previousPrice,high:Prisma.Decimal.max(previousPrice,price),low:Prisma.Decimal.min(previousPrice,price),close:price,volume},
				update:{high:Prisma.Decimal.max(previousPrice,price),low:Prisma.Decimal.min(previousPrice,price),close:price,volume:{increment:volume}},
			});
			await tx.auditLog.create({data:{actorId:admin.id,action:'SIMULATED_MARKET_TICK',entity:'INSTRUMENT',entityId:instrument.id,metadata:{symbol:input.symbol,direction:input.direction,volatilityPercent:input.volatilityPercent,previousPrice:previousPrice.toString(),newPrice:price.toString(),dataMode:'SIMULATED',idempotencyKey}}});
			return {symbol:input.symbol,price:price.toString(),previousPrice:previousPrice.toString(),source:'Aurevia DEMO price feed',dataMode:'SIMULATED' as const,replayed:false};
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
		if(!result.replayed)await processOpenOrders();
		return NextResponse.json(result,{status:result.replayed?200:201,headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Use NVDA, BTC/USD, or XAU/USD, choose UP or DOWN, and set volatility from 0.01% to 25%.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'DEMO price updates are temporarily limited.'},{status:429});
		if(error instanceof Error&&error.message==='IDEMPOTENCY_KEY_REUSED')return NextResponse.json({error:'This request key was used for a different price update.'},{status:409});
		if(error instanceof Error&&error.message==='SIMULATED_INSTRUMENT_UNAVAILABLE')return NextResponse.json({error:'The selected enabled DEMO instrument is unavailable.'},{status:409});
		if(error&&typeof error==='object'&&'code' in error&&String(error.code)==='P2034')return NextResponse.json({error:'The market changed concurrently. Retry with the same idempotency key.'},{status:409});
		console.error('Deterministic simulated market tick failed.',error&&typeof error==='object'&&'code' in error?String(error.code):error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to update DEMO prices.'},{status:503});
	}
}
