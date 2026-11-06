import {AccountMode,FundingStatus,FundingType,NotificationType,Prisma} from '@prisma/client';
import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {createNotification} from '@/lib/notifications';

const schema=z.object({id:z.string().min(1),action:z.enum(['PROCESS','COMPLETE','FAIL','REVERSE']),note:z.string().trim().min(3).max(500)});
const releasableStatuses:FundingStatus[]=[FundingStatus.APPROVED,FundingStatus.PROCESSING];

export async function POST(request:Request){
	try{
		const admin=await requireAdmin();
		const input=schema.parse(await request.json());
		if(input.action!=='FAIL')return NextResponse.json({error:'Only legacy DEMO withdrawal reservations may be released; external execution is unavailable.'},{status:409});
		const idempotencyKey=request.headers.get('Idempotency-Key')||'';
		if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))return NextResponse.json({error:'A valid idempotency key is required.'},{status:400});
		const result=await db.$transaction(async tx=>{
			const current=await tx.fundingRequest.findUnique({where:{id:input.id}});
			if(!current||current.type!==FundingType.WITHDRAWAL||current.accountMode!==AccountMode.DEMO)throw new Error('DEMO_WITHDRAWAL_REQUIRED');
			const replay=await tx.auditLog.findFirst({where:{entity:'FUNDING',entityId:input.id,action:'DEMO_WITHDRAWAL_RESERVATION_RELEASED',metadata:{path:['idempotencyKey'],equals:idempotencyKey}},select:{id:true}});
			if(replay)return {request:current,replayed:true};
			if(!releasableStatuses.includes(current.status))throw new Error('DEMO_WITHDRAWAL_NOT_RELEASABLE');
			const changed=await tx.fundingRequest.updateMany({where:{id:current.id,status:{in:releasableStatuses}},data:{status:FundingStatus.FAILED,adminNote:input.note}});
			if(changed.count!==1)throw new Error('DEMO_WITHDRAWAL_NOT_RELEASABLE');
			const updated=await tx.fundingRequest.findUniqueOrThrow({where:{id:current.id}});
			await tx.auditLog.create({data:{actorId:admin.id,action:'DEMO_WITHDRAWAL_RESERVATION_RELEASED',entity:'FUNDING',entityId:current.id,metadata:{accountMode:AccountMode.DEMO,oldStatus:current.status,newStatus:FundingStatus.FAILED,reason:input.note,idempotencyKey}}});
			await createNotification(tx,{userId:current.userId,type:NotificationType.WITHDRAWAL,title:'Legacy DEMO withdrawal reservation released',message:'This old DEMO withdrawal was marked failed because DEMO withdrawals are unavailable. Any reservation was released; no ledger debit or payout occurred.',dedupeKey:`demo-withdrawal-release:${current.id}:${idempotencyKey}`,relatedEntity:'FUNDING',relatedId:current.id,actionUrl:`/wallet/transactions/${current.id}`});
			return {request:updated,replayed:false};
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
		const {receiptKey,...safeRequest}=result.request;
		return NextResponse.json({...safeRequest,replayed:result.replayed},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Only legacy DEMO withdrawals can be released; provide an audit reason.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='DEMO_WITHDRAWAL_REQUIRED')return NextResponse.json({error:'Only historical DEMO withdrawals can use this reservation-release action.'},{status:409});
		if(error instanceof Error&&error.message==='DEMO_WITHDRAWAL_NOT_RELEASABLE')return NextResponse.json({error:'Only approved or processing legacy DEMO withdrawals can release a reservation.'},{status:409});
		if(error&&typeof error==='object'&&'code' in error&&String(error.code)==='P2034')return NextResponse.json({error:'The legacy withdrawal changed during this action. Retry with the same idempotency key.'},{status:409});
		console.error('Legacy DEMO withdrawal reservation release failed.',error&&typeof error==='object'&&'code' in error?String(error.code):error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to release the legacy DEMO withdrawal reservation.'},{status:503});
	}
}
