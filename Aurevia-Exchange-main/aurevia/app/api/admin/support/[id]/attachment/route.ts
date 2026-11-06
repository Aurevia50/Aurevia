import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {createPrivateSignedUrl,PrivateStorageError} from '@/lib/private-storage';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
	try{
		const {id}=await params;
		await requireAdmin();
		const conversation=await db.supportConversation.findUnique({where:{id},select:{userId:true,attachmentKey:true}});
		if(!conversation)return NextResponse.json({error:'Support ticket not found.'},{status:404});
		if(!conversation.attachmentKey)return NextResponse.json({error:'No attachment is included.'},{status:404});
		return NextResponse.json({url:await createPrivateSignedUrl('support',conversation.userId,conversation.attachmentKey)},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof PrivateStorageError)return NextResponse.json({error:error.message},{status:error.status});
		return NextResponse.json({error:'Forbidden'},{status:403});
	}
}