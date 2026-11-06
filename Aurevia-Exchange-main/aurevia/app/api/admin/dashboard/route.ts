import {NextResponse} from 'next/server';
import {AccountMode,FundingStatus,FundingType,InvestmentStatus,KycStatus,Prisma,UserStatus} from '@prisma/client';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';

export const dynamic='force-dynamic';

const activeUsersWhere={role:'USER' as const,status:{notIn:[UserStatus.CLOSED,UserStatus.DELETED]}};
const approvedDepositStatuses=[FundingStatus.APPROVED,FundingStatus.COMPLETED];
const settledWithdrawalStatuses=[FundingStatus.COMPLETED];
const includedInvestmentStatuses=[InvestmentStatus.ACTIVE,InvestmentStatus.PAUSED,InvestmentStatus.COMPLETED,InvestmentStatus.SETTLED];
const activeKycStatuses=[KycStatus.PENDING,KycStatus.APPROVED,KycStatus.REJECTED,KycStatus.NEEDS_CHANGES];

type DailyFundingRow={day:Date;type:FundingType;amount:Prisma.Decimal};

function dayKey(date:Date){
	return date.toISOString().slice(0,10);
}

function percentChange(current:number,previous:number){
	return previous>0?Math.round(((current-previous)/previous)*100):null;
}

export async function GET(){
	try{
		await requireAdmin();
		const now=new Date();
		const today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
		const tomorrow=new Date(today);
		tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
		const seriesStart=new Date(today);
		seriesStart.setUTCDate(seriesStart.getUTCDate()-13);
		const currentWeekStart=new Date(today);
		currentWeekStart.setUTCDate(currentWeekStart.getUTCDate()-6);
		const previousWeekEnd=currentWeekStart;
		const previousWeekStart=new Date(previousWeekEnd);
		previousWeekStart.setUTCDate(previousWeekStart.getUTCDate()-7);
		const activityCutoff=new Date(now.getTime()-24*60*60*1000);

		const depositsWhere={
			type:FundingType.DEPOSIT,
			accountMode:AccountMode.REAL,
			currency:'USD',
			status:{in:approvedDepositStatuses},
		};
		const withdrawalsWhere={
			type:FundingType.WITHDRAWAL,
			accountMode:AccountMode.REAL,
			currency:'USD',
			status:{in:settledWithdrawalStatuses},
		};
		const investmentsWhere={
			accountMode:AccountMode.REAL,
			status:{in:includedInvestmentStatuses},
		};

		const [
			totalUsers,newUsersCurrent,newUsersPrevious,
			kycGroups,accountModeGroups,
			depositsTotal,withdrawalsTotal,investmentsTotal,
			investmentsCurrent,investmentsPrevious,
			fundingDays,recentUsers,recentActivity,archivedActivity,dismissedActivity,
		]=await Promise.all([
			db.user.count({where:activeUsersWhere}),
			db.user.count({where:{...activeUsersWhere,createdAt:{gte:currentWeekStart,lt:tomorrow}}}),
			db.user.count({where:{...activeUsersWhere,createdAt:{gte:previousWeekStart,lt:previousWeekEnd}}}),
			db.user.groupBy({by:['kycStatus'],where:{...activeUsersWhere,kycStatus:{in:activeKycStatuses}},_count:{_all:true}}),
			db.user.groupBy({by:['accountMode'],where:activeUsersWhere,_count:{_all:true}}),
			db.fundingRequest.aggregate({where:depositsWhere,_sum:{amount:true}}),
			db.fundingRequest.aggregate({where:withdrawalsWhere,_sum:{amount:true}}),
			db.investmentRequest.aggregate({where:investmentsWhere,_sum:{amount:true}}),
			db.investmentRequest.aggregate({where:{...investmentsWhere,activatedAt:{gte:currentWeekStart,lt:tomorrow}},_sum:{amount:true}}),
			db.investmentRequest.aggregate({where:{...investmentsWhere,activatedAt:{gte:previousWeekStart,lt:previousWeekEnd}},_sum:{amount:true}}),
			db.$queryRaw<DailyFundingRow[]>(Prisma.sql`
				SELECT date_trunc('day', event_at) AS day, type, SUM(amount) AS amount
				FROM (
					SELECT "type", "amount",
						CASE WHEN "type" = 'WITHDRAWAL'
							THEN COALESCE("settledAt", "reviewedAt")
							ELSE COALESCE("reviewedAt", "createdAt")
						END AS event_at
					FROM "FundingRequest"
					WHERE "accountMode" = 'REAL'
						AND "currency" = 'USD'
						AND (
							("type" = 'DEPOSIT' AND "status" IN ('APPROVED', 'COMPLETED'))
							OR ("type" = 'WITHDRAWAL' AND "status" = 'COMPLETED')
						)
				) AS approved_funding
				WHERE event_at >= ${seriesStart} AND event_at < ${tomorrow}
				GROUP BY date_trunc('day', event_at), type
				ORDER BY day ASC
			`),
			db.user.findMany({
				where:activeUsersWhere,
				select:{id:true,name:true,email:true,accountMode:true,kycStatus:true,status:true,createdAt:true},
				orderBy:{createdAt:'desc'},
				take:8,
			}),
			db.auditLog.findMany({
				where:{createdAt:{gte:activityCutoff}},
				select:{id:true,action:true,entity:true,createdAt:true,actor:{select:{name:true}}},
				orderBy:{createdAt:'desc'},
				take:100,
			}),
			db.auditLog.findMany({
				where:{createdAt:{lt:activityCutoff}},
				select:{id:true,action:true,entity:true,createdAt:true,actor:{select:{name:true}}},
				orderBy:{createdAt:'desc'},
				take:500,
			}),
			db.adminDashboardActivityDismissal.findMany({
				where:{restoredAt:null},
				select:{
					auditLog:{select:{id:true,action:true,entity:true,createdAt:true,actor:{select:{name:true}}}},
				},
				orderBy:{hiddenAt:'desc'},
			}),
		]);

		const kyc={verified:0,pending:0,rejected:0};
		for(const row of kycGroups){
			if(row.kycStatus===KycStatus.APPROVED)kyc.verified=row._count._all;
			else if(row.kycStatus===KycStatus.REJECTED)kyc.rejected=row._count._all;
			else kyc.pending+=row._count._all;
		}
		const accountTypes={DEMO:0,REAL:0};
		for(const row of accountModeGroups)accountTypes[row.accountMode]=row._count._all;

		const days=new Map<string,{depositsUsd:number;withdrawalsUsd:number}>();
		for(let offset=13;offset>=0;offset--){
			const date=new Date(today);
			date.setUTCDate(date.getUTCDate()-offset);
			days.set(dayKey(date),{depositsUsd:0,withdrawalsUsd:0});
		}
		for(const row of fundingDays){
			const day=days.get(dayKey(row.day));
			if(!day)continue;
			if(row.type===FundingType.DEPOSIT)day.depositsUsd=Number(row.amount);
			else day.withdrawalsUsd=Number(row.amount);
		}
		const daily=Array.from(days,([date,amounts])=>({date,...amounts}));
		const previousDaily=daily.slice(0,7);
		const currentDaily=daily.slice(7);
		const currentDeposits=currentDaily.reduce((sum,row)=>sum+row.depositsUsd,0);
		const previousDeposits=previousDaily.reduce((sum,row)=>sum+row.depositsUsd,0);
		const currentWithdrawals=currentDaily.reduce((sum,row)=>sum+row.withdrawalsUsd,0);
		const previousWithdrawals=previousDaily.reduce((sum,row)=>sum+row.withdrawalsUsd,0);
		const currentInvestments=Number(investmentsCurrent._sum.amount??0);
		const previousInvestments=Number(investmentsPrevious._sum.amount??0);

		return NextResponse.json({
			generatedAt:now.toISOString(),
			metrics:{
				users:{total:totalUsers,newThisWeek:newUsersCurrent,previousWeek:newUsersPrevious},
				deposits:{
					totalUsd:(depositsTotal._sum.amount??new Prisma.Decimal(0)).toFixed(2),
					last7DaysUsd:currentDeposits.toFixed(2),
					changePercent:percentChange(currentDeposits,previousDeposits),
				},
				withdrawals:{
					totalUsd:(withdrawalsTotal._sum.amount??new Prisma.Decimal(0)).toFixed(2),
					last7DaysUsd:currentWithdrawals.toFixed(2),
					changePercent:percentChange(currentWithdrawals,previousWithdrawals),
				},
				investments:{
					totalUsd:(investmentsTotal._sum.amount??new Prisma.Decimal(0)).toFixed(2),
					last7DaysUsd:currentInvestments.toFixed(2),
					changePercent:percentChange(currentInvestments,previousInvestments),
				},
			},
			daily:currentDaily,
			kyc,
			accountTypes,
			recentUsers,
			recentActivity,
			archivedActivity,
			dismissedActivity:dismissedActivity.map(item=>item.auditLog),
			limitations:{
				financialCurrency:'USD',
				financialAccountMode:'REAL',
				investmentTotalStatuses:includedInvestmentStatuses,
				investmentTotalMeaning:'Sum of amounts for active, paused, completed, and settled REAL investment requests.',
				accountTypesMeaning:'Current account mode for active, non-closed customer accounts.',
			},
		},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		const status=error instanceof Error&&error.message==='UNAUTHORIZED'?401:error instanceof Error&&error.message==='FORBIDDEN'?403:500;
		if(status===500)console.error('Admin dashboard data query failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:status===500?'Unable to load dashboard data.':status===401?'Unauthorized':'Forbidden'},{status,headers:{'Cache-Control':'private, no-store'}});
	}
}
