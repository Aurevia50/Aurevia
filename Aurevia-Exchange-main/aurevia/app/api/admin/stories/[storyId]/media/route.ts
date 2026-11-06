import {NextResponse} from 'next/server';
import {Prisma} from '@prisma/client';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {createPrivateObjectKey,deletePrivateObject,hasMatchingFileExtension,PrivateStorageError,uploadPrivateObject} from '@/lib/private-storage';

const maxImageBytes=5*1024*1024;
const maxVideoBytes=50*1024*1024;

function detectMediaType(bytes:Buffer){
	if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mimeType:'image/png',type:'IMAGE' as const};
	if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return {mimeType:'image/jpeg',type:'IMAGE' as const};
	if(bytes.length>=12&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return {mimeType:'image/webp',type:'IMAGE' as const};
	if(bytes.length>=12&&bytes.subarray(4,8).toString()==='ftyp')return {mimeType:'video/mp4',type:'VIDEO' as const};
	if(bytes.length>=4&&bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))return {mimeType:'video/webm',type:'VIDEO' as const};
	return null;
}

export async function POST(request:Request,{params}:{params:Promise<{storyId:string}>}){
	let pendingUpload:{storyId:string;key:string}|null=null;
	try{
		const admin=await requireAdmin();
		const {storyId}=await params;
		const story=await db.story.findFirst({where:{id:storyId,deletedAt:null},select:{id:true}});
		if(!story)return NextResponse.json({error:'Story not found.'},{status:404});
		const form=await request.formData();
		const file=form.get('file');
		if(!(file instanceof File)||file.size===0||file.size>maxVideoBytes)return NextResponse.json({error:'Choose an image up to 5 MB or a video up to 50 MB.'},{status:400});
		const bytes=Buffer.from(await file.arrayBuffer());
		const detected=detectMediaType(bytes);
		const maxSize=detected?.type==='VIDEO'?maxVideoBytes:maxImageBytes;
		if(!detected||bytes.length>maxSize||detected.mimeType!==file.type||!hasMatchingFileExtension(file.name,detected.mimeType)){
			return NextResponse.json({error:'Use a valid JPEG, PNG, WebP, MP4, or WebM file with a matching extension. Images are limited to 5 MB and videos to 50 MB.'},{status:415});
		}
		const altText=form.get('altText');
		if(altText!==null&&typeof altText!=='string')return NextResponse.json({error:'Alt text must be plain text.'},{status:400});
		const key=createPrivateObjectKey('story',story.id,detected.mimeType);
		await uploadPrivateObject('story',story.id,key,bytes,detected.mimeType);
		pendingUpload={storyId:story.id,key};
		const media=await db.$transaction(async tx=>{
			const order=(await tx.storyMedia.aggregate({where:{storyId:story.id},_max:{displayOrder:true}}))._max.displayOrder;
			const created=await tx.storyMedia.create({data:{
				storyId:story.id,
				type:detected.type,
				mimeType:detected.mimeType,
				storageKey:key,
				sizeBytes:bytes.length,
				altText:typeof altText==='string'?altText.trim().slice(0,300)||null:null,
				displayOrder:(order??-1)+1,
			}});
			await tx.auditLog.create({data:{actorId:admin.id,action:'STORY_MEDIA_UPLOADED',entity:'STORY',entityId:story.id,metadata:{mediaId:created.id,type:created.type,mimeType:created.mimeType,sizeBytes:created.sizeBytes}}});
			return created;
		});
		pendingUpload=null;
		return NextResponse.json({media:{...media,url:`/api/admin/stories/${encodeURIComponent(story.id)}/media/${encodeURIComponent(media.id)}`}},{status:201,headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(pendingUpload)await deletePrivateObject('story',pendingUpload.storyId,pendingUpload.key);
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof PrivateStorageError)return NextResponse.json({error:error.message},{status:error.status});
		if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2025')return NextResponse.json({error:'Story not found.'},{status:404});
		console.error('Story media upload failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to upload story media.'},{status:500});
	}
}
