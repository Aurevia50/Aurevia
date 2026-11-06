import {Prisma} from '@prisma/client';

const Decimal=Prisma.Decimal;

export const COMMUNITY_FINANCE_POLICY={
	currency:'USD',
	depositFeePercent:new Decimal('10'),
	loanPrincipalLimit:new Decimal('150000'),
	loanAprPercent:new Decimal('12'),
	loanMonthlyRate:new Decimal('0.01'),
	loanProcessingFeePercent:new Decimal('2'),
	loanMaximumTermMonths:12,
	loanLateFee:new Decimal('25'),
	gracePeriodDays:5,
	qualifyingActivityMonths:3,
} as const;

export type LoanInstallmentDraft={
	number:number;
	dueAt:Date;
	principalAmount:Prisma.Decimal;
	interestAmount:Prisma.Decimal;
	totalAmount:Prisma.Decimal;
};

export function calculateLoanSchedule(principalInput:Prisma.Decimal|string|number,termMonths:number,disbursedAt:Date):LoanInstallmentDraft[]{
	const principal=new Decimal(principalInput).toDecimalPlaces(2,Decimal.ROUND_HALF_UP);
	if(principal.lte(0)||!Number.isInteger(termMonths)||termMonths<1||termMonths>COMMUNITY_FINANCE_POLICY.loanMaximumTermMonths)throw new Error('INVALID_LOAN_TERMS');
	const rate=COMMUNITY_FINANCE_POLICY.loanMonthlyRate;
	const factor=new Decimal(1).plus(rate).pow(termMonths);
	const regularPayment=principal.times(rate).times(factor).div(factor.minus(1)).toDecimalPlaces(2,Decimal.ROUND_HALF_UP);
	let remaining=principal;
	const originalDay=disbursedAt.getUTCDate();
	const installments:LoanInstallmentDraft[]=[];
	for(let number=1;number<=termMonths;number++){
		const monthIndex=disbursedAt.getUTCMonth()+number;
		const year=disbursedAt.getUTCFullYear()+Math.floor(monthIndex/12);
		const month=monthIndex%12;
		const lastDay=new Date(Date.UTC(year,month+1,0)).getUTCDate();
		const dueAt=new Date(Date.UTC(year,month,Math.min(originalDay,lastDay),disbursedAt.getUTCHours(),disbursedAt.getUTCMinutes(),disbursedAt.getUTCSeconds(),disbursedAt.getUTCMilliseconds()));
		const interestAmount=remaining.times(rate).toDecimalPlaces(2,Decimal.ROUND_HALF_UP);
		const principalAmount=number===termMonths?remaining:regularPayment.minus(interestAmount).toDecimalPlaces(2,Decimal.ROUND_HALF_UP);
		const totalAmount=principalAmount.plus(interestAmount).toDecimalPlaces(2,Decimal.ROUND_HALF_UP);
		if(principalAmount.lte(0)||principalAmount.gt(remaining))throw new Error('INVALID_LOAN_SCHEDULE');
		installments.push({number,dueAt,principalAmount,interestAmount,totalAmount});
		remaining=remaining.minus(principalAmount).toDecimalPlaces(2,Decimal.ROUND_HALF_UP);
	}
	if(!remaining.isZero())throw new Error('INVALID_LOAN_SCHEDULE');
	return installments;
}

export function hasThreeConsecutiveActivityMonths(activityDates:Date[]):boolean{
	return getQualifyingMonthSequence(activityDates)!==null;
}

export function getQualifyingMonthSequence(activityDates:Date[]):string[]|null{
	const monthKeys=[...new Set(activityDates.map(date=>date.getUTCFullYear()*12+date.getUTCMonth()))].sort((a,b)=>a-b);
	let streak=0;
	let previous:number|undefined;
	let sequence:number[]=[];
	for(const month of monthKeys){
		if(previous!==undefined&&month===previous+1){streak++;sequence.push(month);}
		else{streak=1;sequence=[month];}
		if(streak>=COMMUNITY_FINANCE_POLICY.qualifyingActivityMonths)return sequence.slice(-COMMUNITY_FINANCE_POLICY.qualifyingActivityMonths).map(key=>`${Math.floor(key/12)}-${String(key%12+1).padStart(2,'0')}`);
		previous=month;
	}
	return null;
}

export function lateFeeApplies(dueAt:Date,now:Date):boolean{
	const feeStart=dueAt.getTime()+COMMUNITY_FINANCE_POLICY.gracePeriodDays*24*60*60*1000;
	return now.getTime()>feeStart;
}
