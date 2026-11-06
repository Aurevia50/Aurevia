import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {createPrivateObjectKey,createPrivateSignedUrl,deletePrivateObject,hasMatchingFileExtension,PrivateStorageError,uploadPrivateObject} from '@/lib/private-storage';

const maxUploadBytes=5*1024*1024;
const storyIdSchema=z.string().min(1).max(128);

function detectImageType(bytes:Buffer){
	if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
	if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
	if(bytes.length>=12&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'image/webp';
	return null;
}

export async function POST(request:Request){
	let uploaded:{storyId:string;key:string}|null=null;
	try{
		const admin=await requireAdmin();
		const form=await request.formData();
		const storyId=storyIdSchema.parse(form.get('storyId'));
		const file=form.get('file');
		if(!(file instanceof File)||file.size===0||file.size>maxUploadBytes)return NextResponse.json({error:'Choose an image no larger than 5 MB.'},{status:400});
		const story=await db.clientStory.findFirst({where:{id:storyId,deletedAt:null},select:{id:true}});
		if(!story)return NextResponse.json({error:'Client story not found.'},{status:404});
		const bytes=Buffer.from(await file.arrayBuffer());
		const contentType=detectImageType(bytes);
		if(!contentType||contentType!==file.type||!hasMatchingFileExtension(file.name,contentType))return NextResponse.json({error:'Use a valid PNG, JPEG, or WebP image with a matching file extension.'},{status:415});
		const key=createPrivateObjectKey('clientStory',story.id,contentType);
		await uploadPrivateObject('clientStory',story.id,key,bytes,contentType);
		uploaded={storyId:story.id,key};
		const imageReference=`storage://client-stories/${key}`;
		const imageUrl=await createPrivateSignedUrl('clientStory',story.id,key);
		await db.$transaction(async tx=>{
			await tx.clientStory.update({where:{id:story.id},data:{imageReference}});
			await tx.auditLog.create({data:{actorId:admin.id,action:'CLIENT_STORY_IMAGE_UPLOADED',entity:'CLIENT_STORY',entityId:story.id,metadata:{contentType,size:bytes.length}}});
		});
		uploaded=null;
		return NextResponse.json({imageReference,imageUrl},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(uploaded)await deletePrivateObject('clientStory',uploaded.storyId,uploaded.key);
		if(error instanceof ZodError)return NextResponse.json({error:'Choose a valid client story.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof PrivateStorageError)return NextResponse.json({error:error.message},{status:error.status});
		console.error('Client story image upload failed.');
		return NextResponse.json({error:'Client story image upload is temporarily unavailable.'},{status:503});
	}
}