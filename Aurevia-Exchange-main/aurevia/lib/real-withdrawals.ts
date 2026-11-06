import {FundingStatus,FundingType,Prisma,PrismaClient} from '@prisma/client';
import {ALPACA_PAPER_PROVIDER,paperOrderCollateral} from '@/lib/bitcoin-funding';

type TransactionClient=PrismaClient|Prisma.TransactionClient;

const reservingStatuses=[FundingStatus.PENDING,FundingStatus.PENDING_REVIEW,FundingStatus.APPROVED,FundingStatus.PROCESSING];

export function calculateRealWithdrawableBalance(input:{ledgerBalance:Prisma.Decimal|string|number;pendingWithdrawals:Prisma.Decimal|string|number}){
	return Prisma.Decimal.max(0,new Prisma.Decimal(input.ledgerBalance).minus(input.pendingWithdrawals));
}

export async function getRealWithdrawableBalance(tx:TransactionClient,userId:string,ledgerBalance:Prisma.Decimal,excludePendingRequestId?:string){
	const [pendingWithdrawals,paperOrders]=await Promise.all([tx.fundingRequest.aggregate({
			where:{userId,accountMode:'REAL',type:FundingType.WITHDRAWAL,currency:'USD',status:{in:reservingStatuses},...(excludePendingRequestId?{id:{not:excludePendingRequestId}}:{})},
			_sum:{amount:true},
		}),tx.order.findMany({
			where:{userId,accountMode:'REAL',providerName:ALPACA_PAPER_PROVIDER},
			select:{instrumentId:true,side:true,quantity:true,filledQuantity:true,averageFillPrice:true,providerReservedAmount:true,status:true,createdAt:true},
			orderBy:{createdAt:'asc'},
		})]);
	const paperCommitted=paperOrderCollateral(paperOrders.map(order=>({...order,takerFee:new Prisma.Decimal(0)}))).committed;
	return calculateRealWithdrawableBalance({
		ledgerBalance:new Prisma.Decimal(ledgerBalance).minus(paperCommitted),
		pendingWithdrawals:pendingWithdrawals._sum.amount??0,
	});
}
