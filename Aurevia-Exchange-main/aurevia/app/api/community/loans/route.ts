import {AccountMode,LoanStatus,Prisma} from '@prisma/client';
import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {getCommunityEligibility} from '@/lib/community-finance';
import {calculateLoanSchedule,COMMUNITY_FINANCE_POLICY} from '@/lib/community-finance-policy';
import {rateLimit} from '@/lib/rate-limit';
import {jsonSafe} from '@/lib/serializers';

const schema=z.object({
	principal:z.string().regex(/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/),
	termMonths:z.number().int().min(1).max(COMMUNITY_FINANCE_POLICY.loanMaximumTermMonths),
	acceptedTerms:z.literal(true),
});

export async function POST(request:Request){
	try{
		const user=await requireUser();
		rateLimit(`community-loan-application:${user.id}`,3,24*60*60_000);
		const idempotencyKey=request.headers.get('Idempotency-Key')||'';
		if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))return NextResponse.json({error:'A valid idempotency key is required.'},{status:400});
		const input=schema.parse(await request.json());
		const principal=new Prisma.Decimal(input.principal).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
		if(principal.lte(0)||principal.gt(COMMUNITY_FINANCE_POLICY.loanPrincipalLimit))return NextResponse.json({error:'Requested principal must be greater than zero and no more than 150,000 USD.'},{status:400});
		const estimate=calculateLoanSchedule(principal,input.termMonths,new Date());
		const result=await db.$transaction(async tx=>{
			const current=await tx.user.findUnique({where:{id:user.id},select:{status:true,accountMode:true,accountRestricted:true}});
			if(!current||current.status!=='ACTIVE')throw new Error('ACCOUNT_UNAVAILABLE');
			if(current.accountMode!==AccountMode.REAL)throw new Error('REAL_MODE_REQUIRED');
			if(current.accountRestricted)throw new Error('ACCOUNT_RESTRICTED');
			const replay=await tx.communityLoan.findUnique({where:{idempotencyKey}});
			if(replay){
				if(replay.userId!==user.id)throw new Error('IDEMPOTENCY_KEY_CONFLICT');
				return {loan:replay,replayed:true};
			}
			const eligibility=await getCommunityEligibility(tx,user.id);
			if(!eligibility.eligible)throw new Error('ELIGIBILITY_NOT_MET');
			const existing=await tx.communityLoan.findFirst({where:{userId:user.id,status:{in:[LoanStatus.PENDING_REVIEW,LoanStatus.APPROVED,LoanStatus.ACTIVE]}},select:{id:true}});
			if(existing)throw new Error('OPEN_LOAN_EXISTS');
			const loan=await tx.communityLoan.create({data:{
				userId:user.id,
				principal,
				currency:COMMUNITY_FINANCE_POLICY.currency,
				aprPercent:COMMUNITY_FINANCE_POLICY.loanAprPercent,
				processingFeePercent:COMMUNITY_FINANCE_POLICY.loanProcessingFeePercent,
				termMonths:input.termMonths,
				monthlyPayment:estimate[0].totalAmount,
				qualifyingMonths:eligibility.qualifyingMonths??[],
				idempotencyKey,
				acceptedTermsAt:new Date(),
				policyVersion:'2026-10-v1',
			}});
			await tx.auditLog.create({data:{actorId:user.id,action:'COMMUNITY_LOAN_APPLIED',entity:'COMMUNITY_LOAN',entityId:loan.id,metadata:{principal:principal.toFixed(2),currency:'USD',termMonths:input.termMonths,aprPercent:'12',monthlyRatePercent:'1',processingFeePercent:'2',monthlyPaymentEstimate:estimate[0].totalAmount.toFixed(2),policyVersion:loan.policyVersion,acceptedTermsAt:loan.acceptedTermsAt.toISOString(),eligibilityMonths:eligibility.qualifyingMonths}}});
			return {loan,replayed:false};
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5_000,timeout:15_000});
		return NextResponse.json(jsonSafe(result),{status:result.replayed?200:201,headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Enter valid loan terms and accept the disclosed loan agreement.'},{status:400});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many loan application attempts. Please wait before trying again.'},{status:429});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='ACCOUNT_UNAVAILABLE')return NextResponse.json({error:'This account cannot apply for a loan.'},{status:403});
		if(error instanceof Error&&error.message==='REAL_MODE_REQUIRED')return NextResponse.json({error:'Switch to REAL Mode to apply for a loan.'},{status:403});
		if(error instanceof Error&&error.message==='ACCOUNT_RESTRICTED')return NextResponse.json({error:'Loan applications are unavailable while this account is restricted.'},{status:403});
		if(error instanceof Error&&error.message==='ELIGIBILITY_NOT_MET')return NextResponse.json({error:'Loan eligibility requires a positive approved deposit or posted donation in each of three consecutive calendar months.'},{status:403});
		if(error instanceof Error&&error.message==='OPEN_LOAN_EXISTS')return NextResponse.json({error:'An application or active loan already exists for this account.'},{status:409});
		if(error instanceof Error&&error.message==='IDEMPOTENCY_KEY_CONFLICT')return NextResponse.json({error:'This request key has already been used.'},{status:409});
		if(error&&typeof error==='object'&&'code'in error&&String(error.code)==='P2034')return NextResponse.json({error:'Your account changed while the application was being submitted. Refresh and retry.'},{status:409});
		console.error('Community loan application failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to submit the loan application.'},{status:503});
	}
}
