import {NextResponse} from 'next/server';
import {AccountMode,FundingStatus,FundingType,NotificationType,Prisma} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {createNotification} from '@/lib/notifications';

const schema=z.object({reason:z.string().trim().max(300).optional()});
const cancellable:FundingStatus[]=[FundingStatus.PENDING,FundingStatus.PENDING_REVIEW,FundingStatus.APPROVED];

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
	try{
		const user=await requireUser();
		const activeUser=await db.user.findUnique({where:{id:user.id},select:{accountMode:true,status:true}});
		if(!activeUser||activeUser.status!=='ACTIVE')return NextResponse.json({error:'This account is unavailable.'},{status:403});
		if(activeUser.accountMode!==AccountMode.REAL)return NextResponse.json({error:'Withdrawal management is available in REAL mode only.'},{status:403});
		const {id}=await params;
		const body=schema.parse(await request.json());
		const idempotencyKey=request.headers.get('Idempotency-Key')||'';
		if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))return NextResponse.json({error:'A valid idempotency key is required.'},{status:400});
		const result=await db.$transaction(async tx=>{
			const currentUser=await tx.user.findUniqueOrThrow({where:{id:user.id},select:{accountMode:true,status:true}});
			if(currentUser.status!=='ACTIVE')throw new Error('ACCOUNT_UNAVAILABLE');
			if(currentUser.accountMode!==AccountMode.REAL)throw new Error('REAL_MODE_REQUIRED');
			const replay=await tx.auditLog.findFirst({where:{entity:'FUNDING',entityId:id,action:'WITHDRAWAL_CANCELLED_BY_USER',metadata:{path:['idempotencyKey'],equals:idempotencyKey}},select:{id:true}});
			if(replay)return {request:await tx.fundingRequest.findFirstOrThrow({where:{id,userId:user.id,type:FundingType.WITHDRAWAL}}),replayed:true};
			const current=await tx.fundingRequest.findFirst({where:{id,userId:user.id,type:FundingType.WITHDRAWAL},select:{id:true,userId:true,accountMode:true,status:true}});
			if(!current)throw new Error('WITHDRAWAL_NOT_FOUND');
			if(!cancellable.includes(current.status))throw new Error('WITHDRAWAL_NOT_CANCELLABLE');
			const changed=await tx.fundingRequest.updateMany({where:{id:current.id,userId:user.id,type:FundingType.WITHDRAWAL,status:current.status},data:{status:FundingStatus.CANCELLED,adminNote:body.reason||null}});
			if(changed.count!==1)throw new Error('WITHDRAWAL_NOT_CANCELLABLE');
			const updated=await tx.fundingRequest.findUniqueOrThrow({where:{id:current.id}});
			await tx.auditLog.create({data:{actorId:user.id,action:'WITHDRAWAL_CANCELLED_BY_USER',entity:'FUNDING',entityId:current.id,metadata:{accountMode:current.accountMode,oldStatus:current.status,newStatus:FundingStatus.CANCELLED,idempotencyKey,reason:body.reason||null}}});
			await createNotification(tx,{userId:user.id,type:NotificationType.WITHDRAWAL,title:'Withdrawal request cancelled',message:'Your withdrawal request was cancelled. Any reservation was released; no external payout or ledger debit occurred.',dedupeKey:`withdrawal:${current.id}:cancelled:${idempotencyKey}`,relatedEntity:'FUNDING',relatedId:current.id,actionUrl:`/wallet/transactions/${current.id}`});
			return {request:updated,replayed:false};
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5_000,timeout:15_000});
		const {receiptKey,...safeRequest}=result.request;
		return NextResponse.json({...safeRequest,hasReceipt:!!receiptKey,replayed:result.replayed},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Enter a valid cancellation reason.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='REAL_MODE_REQUIRED')return NextResponse.json({error:'Withdrawal management is available in REAL mode only.'},{status:403});
		if(error instanceof Error&&error.message==='ACCOUNT_UNAVAILABLE')return NextResponse.json({error:'This account is unavailable.'},{status:403});
		if(error instanceof Error&&error.message==='WITHDRAWAL_NOT_FOUND')return NextResponse.json({error:'Withdrawal request not found.'},{status:404});
		if(error instanceof Error&&error.message==='WITHDRAWAL_NOT_CANCELLABLE')return NextResponse.json({error:'Only pending or approved withdrawals can be cancelled; processing requests require administrator review.'},{status:409});
		if(error&&typeof error==='object'&&'code'in error&&String(error.code)==='P2034')return NextResponse.json({error:'The withdrawal changed while cancelling. Retry with the same idempotency key.'},{status:409});
		console.error('Withdrawal cancellation failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to cancel the withdrawal request.'},{status:503});
	}
}
