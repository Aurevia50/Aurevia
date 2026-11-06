import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {createPrivateSignedUrl,deletePrivateObject,PrivateStorageError} from '@/lib/private-storage';

export async function GET(_request:Request,{params}:{params:Promise<{storyId:string;mediaId:string}>}){
	try{
		await requireAdmin();
		const {storyId,mediaId}=await params;
		const media=await db.storyMedia.findFirst({where:{id:mediaId,storyId,story:{is:{deletedAt:null}}},select:{storyId:true,storageKey:true}});
		if(!media)return NextResponse.json({error:'Story media not found.'},{status:404});
		const url=await createPrivateSignedUrl('story',storyId,media.storageKey,300);
		return NextResponse.redirect(url,{status:307,headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof PrivateStorageError)return NextResponse.json({error:error.message},{status:error.status});
		console.error('Admin story media preview failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Story media is temporarily unavailable.'},{status:503});
	}
}

export async function DELETE(_request:Request,{params}:{params:Promise<{storyId:string;mediaId:string}>}){
	try{
		const admin=await requireAdmin();
		const {storyId,mediaId}=await params;
		const media=await db.storyMedia.findFirst({where:{id:mediaId,storyId},select:{id:true,storyId:true,storageKey:true}});
		if(!media)return NextResponse.json({error:'Story media not found.'},{status:404});
		await db.$transaction(async tx=>{
			await tx.storyMedia.delete({where:{id:media.id}});
			await tx.auditLog.create({data:{actorId:admin.id,action:'STORY_MEDIA_REMOVED',entity:'STORY',entityId:media.storyId,metadata:{mediaId:media.id}}});
		});
		await deletePrivateObject('story',media.storyId,media.storageKey);
		return NextResponse.json({deleted:true},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		console.error('Story media removal failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to remove story media.'},{status:500});
	}
}
