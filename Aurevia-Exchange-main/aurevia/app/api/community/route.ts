import {AccountMode,CommunityCampaignStatus,FundingStatus,FundingType,Prisma} from '@prisma/client';
import {NextResponse} from 'next/server';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {getCommunityEligibility} from '@/lib/community-finance';
import {balance,ensureUserLedger} from '@/lib/ledger';
import {jsonSafe} from '@/lib/serializers';

export async function GET(){
	try{
		const user=await requireUser();
		const current=await db.user.findUnique({where:{id:user.id},select:{status:true,accountMode:true,accountRestricted:true}});
		if(!current||current.status!=='ACTIVE')return NextResponse.json({error:'Community finance is unavailable for this account.'},{status:403});
		const [campaigns,donations,loans,eligibility,account]=await Promise.all([
			db.communityCampaign.findMany({where:{status:CommunityCampaignStatus.ACTIVE},orderBy:{createdAt:'desc'},take:50}),
			db.communityDonation.findMany({where:{userId:user.id,accountMode:AccountMode.REAL},include:{campaign:{select:{title:true}}},orderBy:{createdAt:'desc'},take:50}),
			db.communityLoan.findMany({where:{userId:user.id},include:{installments:{orderBy:{number:'asc'}},payments:{orderBy:{createdAt:'desc'}}},orderBy:{createdAt:'desc'},take:20}),
			getCommunityEligibility(db,user.id),
			current.accountMode===AccountMode.REAL?ensureUserLedger(db,user.id,AccountMode.REAL,'USD'):Promise.resolve(null),
		]);
		const totals=campaigns.length?await db.communityDonation.groupBy({by:['campaignId'],where:{campaignId:{in:campaigns.map(campaign=>campaign.id)},accountMode:AccountMode.REAL},_sum:{amount:true},_count:{_all:true}}):[];
		const totalByCampaign=new Map(totals.map(item=>[item.campaignId,{amount:item._sum.amount??new Prisma.Decimal(0),donors:item._count._all}]));
		const campaignItems=campaigns.map(campaign=>({...campaign,raisedAmount:totalByCampaign.get(campaign.id)?.amount??new Prisma.Decimal(0),donationCount:totalByCampaign.get(campaign.id)?.donors??0}));
		const approvedDeposits=await db.fundingRequest.findMany({where:{userId:user.id,type:FundingType.DEPOSIT,accountMode:AccountMode.REAL,status:FundingStatus.APPROVED},select:{id:true,amount:true,feeAmount:true,creditedAmount:true,currency:true,reviewedAt:true,createdAt:true},orderBy:{createdAt:'desc'},take:20});
		const walletBalance=account?await balance(db,account.id):null;
		return NextResponse.json(jsonSafe({
			accountMode:current.accountMode,
			accountRestricted:current.accountRestricted,
			walletBalance:current.accountMode===AccountMode.REAL?walletBalance:null,
			eligibility,
			campaigns:campaignItems,
			donations,
			loans,
			approvedDeposits,
			policy:{
				currency:'USD',
				depositFeePercent:'10',
				loanLimit:'150000',
				loanAprPercent:'12',
				monthlyInterestPercent:'1',
				processingFeePercent:'2',
				maximumTermMonths:12,
				lateFee:'25',
				gracePeriodDays:5,
			},
		}),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		console.error('Community finance overview unavailable.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Community finance data is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}
