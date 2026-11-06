import {NextResponse} from 'next/server';
import {FundingType} from '@prisma/client';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {decryptWithdrawalDestination} from '@/lib/withdrawal-destinations';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
	try{
		const admin=await requireAdmin();
		const {id}=await params;
		const request=await db.fundingRequest.findFirst({where:{id,type:FundingType.WITHDRAWAL},select:{
			id:true,userId:true,accountMode:true,
			withdrawalDestination:{select:{id:true,type:true,nickname:true,countryCode:true,network:true,asset:true,ciphertext:true,iv:true,authTag:true}},
			withdrawalDestinationSnapshot:{select:{type:true,nickname:true,countryCode:true,network:true,asset:true,ciphertext:true,iv:true,authTag:true}},
		}});
		if(!request||request.accountMode!=='REAL')return NextResponse.json({error:'Withdrawal destination not found.'},{status:404});
		const savedDestination=request.withdrawalDestinationSnapshot||request.withdrawalDestination;
		if(!savedDestination)return NextResponse.json({error:'Withdrawal destination not found.'},{status:404});
		const destination=decryptWithdrawalDestination(savedDestination);
		await db.auditLog.create({data:{actorId:admin.id,action:'WITHDRAWAL_DESTINATION_VIEWED',entity:'FUNDING',entityId:request.id,metadata:{destinationId:request.withdrawalDestination?.id||request.id,accountMode:request.accountMode}}});
		return NextResponse.json({destination:{id:request.withdrawalDestination?.id||request.id,type:savedDestination.type,nickname:savedDestination.nickname,countryCode:savedDestination.countryCode,network:savedDestination.network,asset:savedDestination.asset,details:destination}},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='WITHDRAWAL_DESTINATION_ENCRYPTION_KEY_REQUIRED')return NextResponse.json({error:'Secure destination storage is not configured.'},{status:503});
		if(error instanceof Error&&error.message==='WITHDRAWAL_DESTINATION_DECRYPTION_FAILED')return NextResponse.json({error:'Destination details could not be decrypted. Check the configured encryption key.'},{status:503});
		console.error('Administrator withdrawal destination access failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to view withdrawal destination.'},{status:503});
	}
}
