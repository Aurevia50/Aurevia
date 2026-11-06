import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {createPrivateSignedUrl,PrivateStorageError} from '@/lib/private-storage';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
	try{
		const {id}=await params;
		await requireAdmin();
		const funding=await db.fundingRequest.findUnique({where:{id},select:{userId:true,receiptKey:true}});
		if(!funding)return NextResponse.json({error:'Funding request not found.'},{status:404});
		if(!funding.receiptKey)return NextResponse.json({error:'No receipt is attached to this request.'},{status:404});
		return NextResponse.json({url:await createPrivateSignedUrl('receipt',funding.userId,funding.receiptKey)},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof PrivateStorageError)return NextResponse.json({error:error.message},{status:error.status});
		return NextResponse.json({error:'Forbidden'},{status:403});
	}
}