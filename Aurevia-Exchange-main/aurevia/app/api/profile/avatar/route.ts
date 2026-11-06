import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {NotificationType} from '@prisma/client';
import sharp from 'sharp';
import {authOptions} from '@/lib/auth-options';
import {db} from '@/lib/db';
import {createNotification} from '@/lib/notifications';
import {createPrivateObjectKey,createPrivateSignedUrl,deletePrivateObject,hasMatchingFileExtension,PrivateStorageError,uploadPrivateObject} from '@/lib/private-storage';

const maxBytes=2*1024*1024;
const maxPixels=16_000_000;
const maxDimension=8_000;
const avatarMimeByFormat={jpeg:'image/jpeg',png:'image/png',webp:'image/webp'} as const;
async function requireAvatarOwner(){
	const session=await getServerSession(authOptions);
	if(!session?.user?.id)throw new Error('UNAUTHORIZED');
	if(session.user.role!=='USER'&&session.user.role!=='ADMIN')throw new Error('FORBIDDEN');
	return {id:session.user.id,role:session.user.role};
}


export async function GET(request:Request){
	const noStore={'Cache-Control':'private, no-store'};
	try{
		const user=await requireAvatarOwner();
		const params=new URL(request.url).searchParams;
		const requestedUserId=params.get('userId');
		if(requestedUserId!==null&&user.role!=='ADMIN')return NextResponse.json({error:'Forbidden'},{status:403,headers:noStore});
		if(requestedUserId!==null&&(!requestedUserId.trim()||requestedUserId.length>128))return NextResponse.json({error:'Invalid user identifier.'},{status:400,headers:noStore});
		const targetId=requestedUserId||user.id;
		const profile=requestedUserId
			?await db.$transaction(async tx=>{
				const target=await tx.user.findUnique({where:{id:targetId},select:{avatarKey:true}});
				if(!target)return null;
				await tx.auditLog.create({data:{actorId:user.id,action:'ADMIN_USER_AVATAR_VIEWED',entity:'USER_AVATAR',entityId:targetId,metadata:{hasAvatar:!!target.avatarKey}}});
				return target;
			})
			:await db.user.findUnique({where:{id:targetId},select:{avatarKey:true}});
		if(requestedUserId&&!profile)return NextResponse.json({error:'User account not found.'},{status:404,headers:noStore});
		if(!profile?.avatarKey)return NextResponse.json({url:null},{headers:noStore});
		return NextResponse.json({url:await createPrivateSignedUrl('avatar',targetId,profile.avatarKey)},{headers:noStore});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof PrivateStorageError)return NextResponse.json({error:error.message},{status:error.status});
		return NextResponse.json({error:'Profile photo is unavailable.'},{status:503});
	}
}

export async function POST(request:Request){
	let newKey:string|undefined;
	let ownerId:string|undefined;
	try{
		const user=await requireAvatarOwner();
		ownerId=user.id;
		const contentLength=Number(request.headers.get('content-length')||0);
		if(contentLength>maxBytes+64*1024)return NextResponse.json({error:'Profile photo must be 2 MB or smaller.'},{status:413});
		const form=await request.formData();
		const file=form.get('file');
		if(!(file instanceof File)||file.size===0||file.size>maxBytes)return NextResponse.json({error:'Choose an image no larger than 2 MB.'},{status:400});
		const bytes=Buffer.from(await file.arrayBuffer());
		let image:ReturnType<typeof sharp>;
		let metadata:Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
		try{
			image=sharp(bytes,{limitInputPixels:maxPixels,failOn:'warning'});
			metadata=await image.metadata();
		}catch{return NextResponse.json({error:'Profile photo is not a valid image.'},{status:415})}
		const contentType=metadata.format&&Object.hasOwn(avatarMimeByFormat,metadata.format)?avatarMimeByFormat[metadata.format as keyof typeof avatarMimeByFormat]:null;
		if(!contentType||contentType!==file.type||!hasMatchingFileExtension(file.name,contentType))return NextResponse.json({error:'Profile photos must be valid PNG, JPEG, or WebP images with a matching extension.'},{status:415});
		if(!metadata.width||!metadata.height||metadata.width>maxDimension||metadata.height>maxDimension||metadata.width*metadata.height>maxPixels)return NextResponse.json({error:'Profile photos must be no larger than 8,000 pixels per side or 16 megapixels.'},{status:400});
		let normalizedBytes:Buffer;
		try{normalizedBytes=await image.rotate().resize(1024,1024,{fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer()}
		catch{return NextResponse.json({error:'Profile photo is not a valid image.'},{status:415})}
		if(normalizedBytes.length>maxBytes)return NextResponse.json({error:'Processed profile photo is too large.'},{status:413});
		const avatarKey=createPrivateObjectKey('avatar',user.id,'image/webp');
		newKey=avatarKey;
		const previous=await db.user.findUnique({where:{id:user.id},select:{avatarKey:true}});
		await uploadPrivateObject('avatar',user.id,avatarKey,normalizedBytes,'image/webp');
		await db.$transaction(async tx=>{
			await tx.user.findUniqueOrThrow({where:{id:user.id},select:{id:true}});
			const saved=await tx.user.updateMany({where:{id:user.id,avatarKey:previous?.avatarKey??null},data:{avatarKey}});
			if(saved.count!==1)throw new Error('AVATAR_CHANGED');
			await tx.auditLog.create({data:{actorId:user.id,action:'PROFILE_AVATAR_UPDATED',entity:'USER',entityId:user.id,metadata:{contentType:'image/webp',sourceFormat:metadata.format,size:normalizedBytes.length,width:metadata.width,height:metadata.height}}});
			if(user.role==='USER')await createNotification(tx,{userId:user.id,type:NotificationType.SECURITY,title:'Profile photo updated',message:'Your profile photo was updated.',dedupeKey:`security:${user.id}:avatar:${avatarKey.split('/').at(-1)}`,actionUrl:'/settings'});
		});
		if(previous?.avatarKey)await deletePrivateObject('avatar',user.id,previous.avatarKey);
		return NextResponse.json({ok:true},{status:201});
	}catch(error){
		if(newKey&&ownerId)await deletePrivateObject('avatar',ownerId,newKey);
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='AVATAR_CHANGED')return NextResponse.json({error:'The profile photo changed. Please retry.'},{status:409});
		if(error instanceof PrivateStorageError)return NextResponse.json({error:error.message},{status:error.status});
		return NextResponse.json({error:'Profile photo upload is unavailable.'},{status:503});
	}
}