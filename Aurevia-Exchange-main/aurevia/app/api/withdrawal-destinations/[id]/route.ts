import {NextResponse} from 'next/server';
import {AccountMode} from '@prisma/client';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {decryptWithdrawalDestination} from '@/lib/withdrawal-destinations';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
	try{
		const user=await requireUser();
		const {id}=await params;
		const currentUser=await db.user.findUnique({where:{id:user.id},select:{accountMode:true,status:true,role:true}});
		if(!currentUser||currentUser.status!=='ACTIVE'||currentUser.role!=='USER'||currentUser.accountMode!==AccountMode.REAL)return NextResponse.json({error:'Destination not found.'},{status:404});
		const destination=await db.withdrawalDestination.findFirst({where:{id,userId:user.id,accountMode:AccountMode.REAL}});
		if(!destination)return NextResponse.json({error:'Destination not found.'},{status:404});
		const details=decryptWithdrawalDestination(destination);
		return NextResponse.json({destination:{id:destination.id,type:destination.type,nickname:destination.nickname,countryCode:destination.countryCode,network:destination.network,asset:destination.asset,details}},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='WITHDRAWAL_DESTINATION_ENCRYPTION_KEY_REQUIRED')return NextResponse.json({error:'Secure destination storage is not configured.'},{status:503});
		if(error instanceof Error&&error.message==='WITHDRAWAL_DESTINATION_DECRYPTION_FAILED')return NextResponse.json({error:'Destination details could not be decrypted. Contact support.'},{status:503});
		return NextResponse.json({error:'Unable to load destination details.'},{status:503});
	}
}
