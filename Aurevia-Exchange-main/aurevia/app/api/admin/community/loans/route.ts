import {AccountMode,LoanInstallmentStatus,LoanStatus,NotificationType,Prisma} from '@prisma/client';
import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {calculateLoanSchedule,COMMUNITY_FINANCE_POLICY,lateFeeApplies} from '@/lib/community-finance-policy';
import {createNotification} from '@/lib/notifications';
import {ensureSystemAccount,ensureUserLedger,postGrossCreditWithFee,postLoanRepayment,roundUsdAmount} from '@/lib/ledger';
import {jsonSafe} from '@/lib/serializers';

const schema=z.object({
	id:z.string().min(1),
	action:z.enum(['APPROVE','REJECT','DISBURSE','RECORD_REPAYMENT']),
	note:z.string().trim().max(500).optional(),
	externalReference:z.string().trim().min(3).max(180).optional(),
	externalAmount:z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/).optional(),
	installmentId:z.string().min(1).optional(),
	attestVerified:z.boolean().optional(),
});

export async function GET(){
	try{
		await requireAdmin();
		const loans=await db.communityLoan.findMany({
			include:{
				user:{select:{id:true,name:true,email:true,status:true,accountMode:true}},
				reviewedBy:{select:{name:true,email:true}},
				disbursedBy:{select:{name:true,email:true}},
				installments:{orderBy:{number:'asc'}},
				payments:{include:{recordedBy:{select:{name:true,email:true}}},orderBy:{createdAt:'desc'}},
			},
			orderBy:{createdAt:'desc'},
			take:200,
		});
		return NextResponse.json(jsonSafe(loans),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		console.error('Community loan administration unavailable.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Loan records are temporarily unavailable.'},{status:503});
	}
}

export async function PATCH(request:Request){
	try{
		const admin=await requireAdmin();
		const idempotencyKey=request.headers.get('Idempotency-Key')||'';
		if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))return NextResponse.json({error:'A valid idempotency key is required.'},{status:400});
		const input=schema.parse(await request.json());
		if(input.action==='REJECT'&&(!input.note||input.note.length<3))return NextResponse.json({error:'A review reason is required to reject an application.'},{status:400});
		if(input.action==='DISBURSE'&&(!input.externalReference||!input.externalAmount||!input.note||input.note.length<3||input.attestVerified!==true))return NextResponse.json({error:'Confirm verified external disbursement and provide its amount, reference, and review note.'},{status:400});
		if(input.action==='RECORD_REPAYMENT'&&(!input.externalReference||!input.externalAmount||!input.note||input.note.length<3||input.attestVerified!==true||!input.installmentId))return NextResponse.json({error:'Confirm verified external repayment and provide its amount, reference, installment, and note.'},{status:400});
		const result=await db.$transaction(async tx=>{
			const actionName=`COMMUNITY_LOAN_${input.action}`;
			const replay=await tx.auditLog.findFirst({where:{entity:'COMMUNITY_LOAN',entityId:input.id,action:actionName,metadata:{path:['idempotencyKey'],equals:idempotencyKey}},select:{id:true}});
			const current=await tx.communityLoan.findUnique({where:{id:input.id},include:{installments:{orderBy:{number:'asc'}}}});
			if(!current)throw new Error('LOAN_NOT_FOUND');
			if(replay)return {loan:current,replayed:true};
			if(input.action==='APPROVE'||input.action==='REJECT'){
				if(current.status!==LoanStatus.PENDING_REVIEW)throw new Error('LOAN_NOT_PENDING_REVIEW');
				if(current.userId===admin.id)throw new Error('LOAN_SELF_REVIEW_FORBIDDEN');
				const status=input.action==='APPROVE'?LoanStatus.APPROVED:LoanStatus.REJECTED;
				const changed=await tx.communityLoan.updateMany({where:{id:current.id,status:LoanStatus.PENDING_REVIEW},data:{status,reviewedById:admin.id,reviewedAt:new Date(),reviewNote:input.note||null}});
				if(changed.count!==1)throw new Error('LOAN_NOT_PENDING_REVIEW');
				await tx.auditLog.create({data:{actorId:admin.id,action:actionName,entity:'COMMUNITY_LOAN',entityId:current.id,metadata:{status,reason:input.note||null,idempotencyKey}}});
				await createNotification(tx,{userId:current.userId,type:NotificationType.SYSTEM,title:`Loan application ${input.action==='APPROVE'?'approved':'not approved'}`,message:input.action==='APPROVE'?'Your application is approved pending verified external disbursement. No loan funds have been disbursed yet.':`Your loan application was not approved.${input.note?` Review note: ${input.note}`:''}`,dedupeKey:`community-loan:${current.id}:${input.action.toLowerCase()}`,relatedEntity:'COMMUNITY_LOAN',relatedId:current.id,actionUrl:'/community'});
				return {loan:await tx.communityLoan.findUniqueOrThrow({where:{id:current.id},include:{installments:{orderBy:{number:'asc'}}}}),replayed:false};
			}
			if(input.action==='DISBURSE'){
				if(current.status!==LoanStatus.APPROVED)throw new Error('LOAN_NOT_APPROVED');
				const borrower=await tx.user.findUnique({where:{id:current.userId},select:{status:true}});
				if(!borrower||borrower.status!=='ACTIVE')throw new Error('BORROWER_UNAVAILABLE');
				const gross=current.principal;
				const fee=roundUsdAmount(gross.times(current.processingFeePercent).div(100));
				const net=roundUsdAmount(gross.minus(fee));
				if(net.lte(0))throw new Error('INVALID_DISBURSEMENT');
				if(!new Prisma.Decimal(input.externalAmount!).eq(net))throw new Error('EXTERNAL_AMOUNT_MISMATCH');
				const wallet=await ensureUserLedger(tx,current.userId,AccountMode.REAL,'USD');
				const receivable=await ensureSystemAccount(tx,'SYSTEM:COMMUNITY_LOAN_RECEIVABLE:REAL:USD','Community loan principal receivable','USD',AccountMode.REAL);
				const feeAccount=await ensureSystemAccount(tx,'SYSTEM:COMMUNITY_LOAN_PROCESSING_FEE:REAL:USD','Community loan processing fee revenue','USD',AccountMode.REAL);
				const ledgerReference=`COMMUNITY:LOAN:${current.id}:DISBURSED`;
				await postGrossCreditWithFee(tx,{reference:ledgerReference,description:'Admin-attested external loan disbursement net of processing fee',clearingAccountId:receivable.id,userAccountId:wallet.id,feeAccountId:feeAccount.id,grossAmount:gross,creditedAmount:net,feeAmount:fee});
				const disbursedAt=new Date();
				const schedule=calculateLoanSchedule(gross,current.termMonths,disbursedAt);
				const changed=await tx.communityLoan.updateMany({where:{id:current.id,status:LoanStatus.APPROVED},data:{status:LoanStatus.ACTIVE,processingFeeAmount:fee,netDisbursedAmount:net,disbursementReference:input.externalReference,disbursementNote:input.note,disbursedById:admin.id,disbursedAt,monthlyPayment:schedule[0].totalAmount}});
				if(changed.count!==1)throw new Error('LOAN_NOT_APPROVED');
				await tx.communityLoanInstallment.createMany({data:schedule.map(item=>({...item,loanId:current.id}))});
				await tx.auditLog.create({data:{actorId:admin.id,action:actionName,entity:'COMMUNITY_LOAN',entityId:current.id,metadata:{principal:gross.toFixed(2),processingFee:fee.toFixed(2),netDisbursed:net.toFixed(2),externalAmount:input.externalAmount,externalReference:input.externalReference,note:input.note,ledgerReference,idempotencyKey,attestedExternalTransfer:true}}});
				await createNotification(tx,{userId:current.userId,type:NotificationType.SYSTEM,title:'Loan disbursement recorded',message:`${net.toFixed(2)} USD was credited to your REAL Aurevia ledger after the 2% processing fee. Repayment schedule starts ${schedule[0].dueAt.toLocaleDateString('en-US',{timeZone:'UTC'})}.`,dedupeKey:`community-loan:${current.id}:disbursed`,relatedEntity:'COMMUNITY_LOAN',relatedId:current.id,actionUrl:'/community'});
				return {loan:await tx.communityLoan.findUniqueOrThrow({where:{id:current.id},include:{installments:{orderBy:{number:'asc'}}}}),replayed:false};
			}
			if(current.status!==LoanStatus.ACTIVE)throw new Error('LOAN_NOT_ACTIVE');
			const installment=await tx.communityLoanInstallment.findUnique({where:{id:input.installmentId}});
			if(!installment||installment.loanId!==current.id)throw new Error('INSTALLMENT_NOT_FOUND');
			if(installment.status!==LoanInstallmentStatus.UPCOMING)throw new Error('INSTALLMENT_ALREADY_PAID');
			const now=new Date();
			const lateFee=installment.lateFeeAmount.gt(0)?installment.lateFeeAmount:lateFeeApplies(installment.dueAt,now)?COMMUNITY_FINANCE_POLICY.loanLateFee:new Prisma.Decimal(0);
			const paymentAmount=roundUsdAmount(installment.totalAmount.plus(lateFee));
			if(!new Prisma.Decimal(input.externalAmount!).eq(paymentAmount))throw new Error('EXTERNAL_AMOUNT_MISMATCH');
			const cash=await ensureSystemAccount(tx,'SYSTEM:COMMUNITY_LOAN_REPAYMENTS:REAL:USD','Admin-attested external loan repayments','USD',AccountMode.REAL);
			const receivable=await ensureSystemAccount(tx,'SYSTEM:COMMUNITY_LOAN_RECEIVABLE:REAL:USD','Community loan principal receivable','USD',AccountMode.REAL);
			const interest=await ensureSystemAccount(tx,'SYSTEM:COMMUNITY_LOAN_INTEREST:REAL:USD','Community loan interest income','USD',AccountMode.REAL);
			const lateFees=await ensureSystemAccount(tx,'SYSTEM:COMMUNITY_LOAN_LATE_FEES:REAL:USD','Community loan late fee income','USD',AccountMode.REAL);
			const ledgerReference=`COMMUNITY:LOAN:${current.id}:PAYMENT:${installment.number}`;
			await postLoanRepayment(tx,{reference:ledgerReference,description:`Admin-attested external payment for loan installment ${installment.number}`,cashAccountId:cash.id,receivableAccountId:receivable.id,interestAccountId:interest.id,lateFeeAccountId:lateFees.id,principalAmount:installment.principalAmount,interestAmount:installment.interestAmount,lateFeeAmount:lateFee});
			const payment=await tx.communityLoanPayment.create({data:{loanId:current.id,installmentId:installment.id,amount:paymentAmount,currency:'USD',externalReference:input.externalReference!,adminNote:input.note,recordedById:admin.id,ledgerReference}});
			await tx.communityLoanInstallment.update({where:{id:installment.id},data:{status:LoanInstallmentStatus.PAID,paidAt:now,lateFeeAmount:lateFee,lateFeeAppliedAt:lateFee.gt(0)?now:null,ledgerReference}});
			const remaining=await tx.communityLoanInstallment.count({where:{loanId:current.id,status:LoanInstallmentStatus.UPCOMING,id:{not:installment.id}}});
			const updatedLoan=remaining===0?await tx.communityLoan.update({where:{id:current.id},data:{status:LoanStatus.PAID_OFF}}):current;
			await tx.auditLog.create({data:{actorId:admin.id,action:actionName,entity:'COMMUNITY_LOAN',entityId:current.id,metadata:{paymentId:payment.id,installmentNumber:installment.number,amount:paymentAmount.toFixed(2),principal:installment.principalAmount.toFixed(2),interest:installment.interestAmount.toFixed(2),lateFee:lateFee.toFixed(2),externalAmount:input.externalAmount,externalReference:input.externalReference,note:input.note,ledgerReference,idempotencyKey,attestedExternalPayment:true}}});
			await createNotification(tx,{userId:current.userId,type:NotificationType.SYSTEM,title:'Loan installment recorded',message:`Installment ${installment.number} payment of ${paymentAmount.toFixed(2)} USD was recorded after administrator verification.`,dedupeKey:`community-loan:${current.id}:payment:${installment.number}`,relatedEntity:'COMMUNITY_LOAN',relatedId:current.id,actionUrl:'/community'});
			return {loan:await tx.communityLoan.findUniqueOrThrow({where:{id:updatedLoan.id},include:{installments:{orderBy:{number:'asc'}},payments:{orderBy:{createdAt:'desc'}}}}),replayed:false};
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5_000,timeout:20_000});
		return NextResponse.json(jsonSafe(result),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Invalid community loan review request.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='LOAN_NOT_FOUND')return NextResponse.json({error:'Loan application not found.'},{status:404});
		if(error instanceof Error&&error.message==='LOAN_SELF_REVIEW_FORBIDDEN')return NextResponse.json({error:'Administrators cannot review their own loan applications.'},{status:403});
		if(error instanceof Error&&error.message==='LOAN_NOT_PENDING_REVIEW')return NextResponse.json({error:'Only pending loan applications can be reviewed.'},{status:409});
		if(error instanceof Error&&error.message==='LOAN_NOT_APPROVED')return NextResponse.json({error:'Only approved loans can be disbursed.'},{status:409});
		if(error instanceof Error&&error.message==='BORROWER_UNAVAILABLE')return NextResponse.json({error:'The borrower account is not active.'},{status:409});
		if(error instanceof Error&&error.message==='INVALID_DISBURSEMENT')return NextResponse.json({error:'The resulting disbursement amount is invalid.'},{status:409});
		if(error instanceof Error&&error.message==='EXTERNAL_AMOUNT_MISMATCH')return NextResponse.json({error:'The verified external transfer amount must exactly match the displayed disbursement or installment total.'},{status:409});
		if(error instanceof Error&&error.message==='LOAN_NOT_ACTIVE')return NextResponse.json({error:'Only active loans accept repayments.'},{status:409});
		if(error instanceof Error&&error.message==='INSTALLMENT_NOT_FOUND')return NextResponse.json({error:'Installment not found for this loan.'},{status:404});
		if(error instanceof Error&&error.message==='INSTALLMENT_ALREADY_PAID')return NextResponse.json({error:'This installment has already been paid.'},{status:409});
		if(error instanceof Error&&error.message==='INVALID_REPAYMENT_ALLOCATION')return NextResponse.json({error:'The repayment allocation is invalid.'},{status:409});
		if(error&&typeof error==='object'&&'code'in error&&String(error.code)==='P2002')return NextResponse.json({error:'This external transfer reference or request has already been recorded.'},{status:409});
		if(error&&typeof error==='object'&&'code'in error&&String(error.code)==='P2034')return NextResponse.json({error:'The loan changed while this action was recorded. Refresh and retry.'},{status:409});
		console.error('Community loan action failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to complete the loan action.'},{status:503});
	}
}
