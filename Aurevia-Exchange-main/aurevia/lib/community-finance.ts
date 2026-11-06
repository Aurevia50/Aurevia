import {AccountMode,FundingStatus,FundingType,Prisma,PrismaClient} from '@prisma/client';
import {getQualifyingMonthSequence} from '@/lib/community-finance-policy';

type Tx=PrismaClient|Prisma.TransactionClient;

export async function getCommunityEligibility(tx:Tx,userId:string){
	const [deposits,donations]=await Promise.all([
		tx.fundingRequest.findMany({
			where:{userId,type:FundingType.DEPOSIT,accountMode:AccountMode.REAL,status:FundingStatus.APPROVED,creditedAmount:{gt:0}},
			select:{reviewedAt:true,updatedAt:true},
		}),
		tx.communityDonation.findMany({where:{userId,accountMode:AccountMode.REAL,amount:{gt:0}},select:{createdAt:true}}),
	]);
	const activityDates=[
		...deposits.map(deposit=>deposit.reviewedAt||deposit.updatedAt),
		...donations.map(donation=>donation.createdAt),
	];
	const qualifyingMonths=getQualifyingMonthSequence(activityDates);
	return {eligible:qualifyingMonths!==null,qualifyingMonths,qualifyingActivityCount:activityDates.length};
}
