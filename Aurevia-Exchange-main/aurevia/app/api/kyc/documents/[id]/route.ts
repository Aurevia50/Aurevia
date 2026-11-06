import {NextResponse} from 'next/server';
import {AccountMode} from '@prisma/client';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {createPrivateSignedUrl,PrivateStorageError} from '@/lib/private-storage';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
	try{
		const {id}=await params;
		const user=await requireUser();
		const activeUser=await db.user.findUnique({where:{id:user.id},select:{accountMode:true,status:true}});
		if(!activeUser||activeUser.status!=='ACTIVE')return NextResponse.json({error:'This account is unavailable.'},{status:403});
		if(activeUser.accountMode!==AccountMode.REAL)return NextResponse.json({error:'Identity verification is available in REAL mode only.'},{status:403});
		const document=await db.kycDocument.findFirst({where:{id,userId:user.id},select:{id:true,userId:true,kind:true,filename:true,mimeType:true,size:true,status:true,uploadedAt:true,storageKey:true}});
		if(!document)return NextResponse.json({error:'Identity document not found.'},{status:404});
		const url=await createPrivateSignedUrl('kyc',document.userId,document.storageKey);
		const {storageKey,...safeDocument}=document;
		return NextResponse.json({...safeDocument,url},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof PrivateStorageError)return NextResponse.json({error:error.message},{status:error.status});
		return NextResponse.json({error:'Identity document is unavailable.'},{status:503});
	}
}
