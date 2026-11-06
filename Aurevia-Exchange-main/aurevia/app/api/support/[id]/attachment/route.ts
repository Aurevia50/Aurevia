import {NextResponse} from 'next/server';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {createPrivateSignedUrl,PrivateStorageError} from '@/lib/private-storage';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
	try{
		const {id}=await params;
		const user=await requireUser();
		const activeUser=await db.user.findUnique({where:{id:user.id},select:{accountMode:true,status:true,role:true}});
		if(!activeUser||activeUser.status!=='ACTIVE'||activeUser.role!=='USER')return NextResponse.json({error:'This account is unavailable.'},{status:403});
		const conversation=await db.supportConversation.findFirst({where:{id,userId:user.id,accountMode:activeUser.accountMode},select:{userId:true,attachmentKey:true}});
		if(!conversation)return NextResponse.json({error:'Support ticket not found.'},{status:404});
		if(!conversation.attachmentKey)return NextResponse.json({error:'No attachment is included.'},{status:404});
		return NextResponse.json({url:await createPrivateSignedUrl('support',conversation.userId,conversation.attachmentKey)},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='ACCOUNT_UNAVAILABLE')return NextResponse.json({error:'This account is unavailable.'},{status:403});
		if(error instanceof PrivateStorageError)return NextResponse.json({error:error.message},{status:error.status});
		return NextResponse.json({error:'Attachment is unavailable.'},{status:503});
	}
}