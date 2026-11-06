import {NextResponse} from 'next/server';
import {ClientStoryStatus,Prisma} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {canPublishClientStory,isVerifiedClientWithdrawal} from '@/lib/client-stories-policy';
import {resolveClientStoryImage} from '@/lib/client-story-media';
import {createPrivateSignedUrl} from '@/lib/private-storage';
import {jsonSafe} from '@/lib/serializers';

const imageReferenceSchema=z.string().max(500).refine(value=>/^(\/client-stories\/[A-Za-z0-9._/-]+|storage:\/\/client-stories\/[A-Za-z0-9._/-]+)$/.test(value)&&!value.includes('..')).nullable();
const patchSchema=z.object({
	storyId:z.string().min(1),
	displayName:z.string().trim().min(2).max(120).optional(),
	country:z.string().trim().max(80).nullable().optional(),
	cityOrRegion:z.string().trim().max(120).nullable().optional(),
	title:z.string().trim().max(120).nullable().optional(),
	quote:z.string().trim().min(1).max(3000).optional(),
	rating:z.number().int().min(1).max(5).nullable().optional(),
	imageReference:imageReferenceSchema.optional(),
	userId:z.string().min(1).nullable().optional(),
	verifyIdentity:z.boolean().optional(),
	withdrawalId:z.string().min(1).nullable().optional(),
	consentConfirmed:z.boolean().optional(),
	showWithdrawalAmount:z.boolean().optional(),
	displayCurrency:z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
	publicationStatus:z.nativeEnum(ClientStoryStatus).optional(),
	source:z.string().trim().max(500).nullable().optional(),
	adminNote:z.string().trim().max(1000).nullable().optional(),
});

export async function GET(){
	try{
		await requireAdmin();
		const [stories,users]=await Promise.all([
			db.clientStory.findMany({where:{deletedAt:null},include:{user:{select:{id:true,email:true,name:true,kycStatus:true}},withdrawal:{select:{id:true,userId:true,type:true,accountMode:true,status:true,amount:true,currency:true}}},orderBy:{createdAt:'desc'}}),
			db.user.findMany({where:{role:'USER'},select:{id:true,email:true,name:true},orderBy:{createdAt:'desc'},take:500}),
		]);
		const history=stories.length?await db.auditLog.findMany({where:{entity:'CLIENT_STORY',entityId:{in:stories.map(story=>story.id)}},include:{actor:{select:{name:true,email:true}}},orderBy:{createdAt:'desc'},take:500}):[];
		const byStory=new Map<string,typeof history>();
		for(const event of history){if(!event.entityId)continue;byStory.set(event.entityId,[...(byStory.get(event.entityId)||[]),event]);}
		const storiesWithImages=await Promise.all(stories.map(async story=>{
			let imageUrl=resolveClientStoryImage(story.imageReference);
			if(story.imageReference?.startsWith('storage://client-stories/')){
				const key=story.imageReference.slice('storage://client-stories/'.length);
				imageUrl=await createPrivateSignedUrl('clientStory',story.id,key).catch(()=>null);
			}
			return {...story,imageUrl,auditHistory:byStory.get(story.id)||[]};
		}));
		return NextResponse.json(jsonSafe({stories:storiesWithImages,users}),{headers:{'Cache-Control':'private, no-store'}});
	}catch{return NextResponse.json({error:'Forbidden'},{status:403})}
}


const createSchema=z.object({
	displayName:z.string().trim().min(2).max(120),
	country:z.string().trim().max(80).nullable().optional(),
	cityOrRegion:z.string().trim().max(120).nullable().optional(),
	title:z.string().trim().max(120).nullable().optional(),
	quote:z.string().trim().min(1).max(3000),
	rating:z.number().int().min(1).max(5).nullable().optional(),
	imageReference:imageReferenceSchema.optional(),
	userId:z.string().min(1).nullable().optional(),
	consentConfirmed:z.boolean().default(true),
	publicationStatus:z.nativeEnum(ClientStoryStatus).default(ClientStoryStatus.DRAFT),
	source:z.string().trim().max(500).nullable().optional(),
	adminNote:z.string().trim().max(1000).nullable().optional(),
});

export async function POST(req:Request){
	try{
		const admin=await requireAdmin();
		const input=createSchema.parse(await req.json());
		if((input.publicationStatus===ClientStoryStatus.PUBLISHED||input.publicationStatus===ClientStoryStatus.VERIFIED)&&!input.consentConfirmed){
			return NextResponse.json({error:'Consent is required before publishing.'},{status:409});
		}
		const source=input.source??'admin';
		const canPublish=input.publicationStatus===ClientStoryStatus.VERIFIED
			?canPublishClientStory({userId:input.userId??null,verifiedClient:false,transactionVerified:false,consentConfirmed:input.consentConfirmed})
			:canPublishClientStory({userId:input.userId??null,verifiedClient:false,transactionVerified:false,consentConfirmed:input.consentConfirmed,source});
		if((input.publicationStatus===ClientStoryStatus.PUBLISHED||input.publicationStatus===ClientStoryStatus.VERIFIED)&&!canPublish){
			return NextResponse.json({error:'Publication requires recorded consent and either an admin-authored testimonial or verified client details.'},{status:409});
		}
		if(input.userId){
			const user=await db.user.findUnique({where:{id:input.userId},select:{role:true}});
			if(!user||user.role!=='USER')return NextResponse.json({error:'Invalid linked user.'},{status:409});
		}
		const story=await db.$transaction(async tx=>{
			const created=await tx.clientStory.create({
				data:{
					displayName:input.displayName,
					country:input.country?.trim()||null,
					cityOrRegion:input.cityOrRegion??null,
					title:input.title?.trim()||null,
					quote:input.quote,
					rating:input.rating??null,
					imageReference:input.imageReference??null,
					userId:input.userId??null,
					consentConfirmed:input.consentConfirmed,
					publicationStatus:input.publicationStatus,
					source,
					adminNote:input.adminNote??null,
					verifiedClient:false,
					transactionVerified:false,
				},
			});
			await tx.auditLog.create({data:{actorId:admin.id,action:'CLIENT_STORY_CREATED',entity:'CLIENT_STORY',entityId:created.id,metadata:{publicationStatus:created.publicationStatus,displayName:created.displayName}}});
			return created;
		});
		return NextResponse.json(jsonSafe(story),{status:201,headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Invalid client-story details.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		console.error('Client story create failed');
		return NextResponse.json({error:'Unable to create client story.'},{status:500});
	}
}

export async function PATCH(req:Request){
	try{
		const admin=await requireAdmin();
		const input=patchSchema.parse(await req.json());
		const updated=await db.$transaction(async tx=>{
			const current=await tx.clientStory.findFirst({where:{id:input.storyId,deletedAt:null}});
			if(!current)throw new Error('STORY_NOT_FOUND');
			const userId=input.userId===undefined?current.userId:input.userId;
			const verifiedClient=input.verifyIdentity===undefined?current.verifiedClient:input.verifyIdentity;
			if(verifiedClient&&!userId)throw new Error('IDENTITY_USER_REQUIRED');
			if(userId){
				const user=await tx.user.findUnique({where:{id:userId},select:{role:true}});
				if(!user||user.role!=='USER')throw new Error('STORY_USER_INVALID');
			}
			const withdrawalId=input.withdrawalId===undefined?current.verifiedWithdrawalId:input.withdrawalId;
			const withdrawal=withdrawalId?await tx.fundingRequest.findUnique({where:{id:withdrawalId}}):null;
			if(withdrawalId&&!isVerifiedClientWithdrawal(withdrawal,userId))throw new Error('WITHDRAWAL_NOT_VERIFIABLE');
			const transactionVerified=isVerifiedClientWithdrawal(withdrawal,userId);
			const consentConfirmed=input.consentConfirmed??current.consentConfirmed;
			const showWithdrawalAmount=input.showWithdrawalAmount??current.showWithdrawalAmount;
			const displayCurrency=input.displayCurrency===undefined?current.displayCurrency:input.displayCurrency;
			if(showWithdrawalAmount&&(!withdrawal||displayCurrency!==withdrawal.currency))throw new Error('PUBLIC_AMOUNT_REQUIRES_MATCHING_WITHDRAWAL');
			const publicationStatus=input.publicationStatus??current.publicationStatus;
			const source=input.source===undefined?current.source:input.source;
			const canPublish=publicationStatus===ClientStoryStatus.VERIFIED
				?canPublishClientStory({userId,verifiedClient,transactionVerified,consentConfirmed})
				:canPublishClientStory({userId,verifiedClient,transactionVerified,consentConfirmed,source});
			if((publicationStatus===ClientStoryStatus.VERIFIED||publicationStatus===ClientStoryStatus.PUBLISHED)&&!canPublish)throw new Error('VERIFICATION_AND_CONSENT_REQUIRED');
			const data={
				displayName:input.displayName,
				country:input.country,
				cityOrRegion:input.cityOrRegion,
				title:input.title,
				quote:input.quote,
				rating:input.rating,
				imageReference:input.imageReference,
				userId,
				verifiedClient,
				verifiedWithdrawalId:withdrawalId,
				withdrawalAmount:withdrawal?.amount??null,
				currency:withdrawal?.currency??null,
				transactionVerified,
				consentConfirmed,
				showWithdrawalAmount,
				displayCurrency:showWithdrawalAmount?displayCurrency:null,
				publicationStatus,
				source,
				adminNote:input.adminNote,
			};
			const changed=await tx.clientStory.updateMany({where:{id:current.id,updatedAt:current.updatedAt,deletedAt:null},data});
			if(changed.count!==1)throw new Error('STORY_CHANGED');
			const story=await tx.clientStory.findUniqueOrThrow({where:{id:current.id},include:{user:{select:{id:true,email:true,name:true,kycStatus:true}},withdrawal:{select:{id:true,userId:true,type:true,accountMode:true,status:true,amount:true,currency:true}}}});
			await tx.auditLog.create({data:{actorId:admin.id,action:`CLIENT_STORY_${publicationStatus}`,entity:'CLIENT_STORY',entityId:story.id,metadata:{changedFields:Object.keys(input).filter(key=>key!=='storyId'),verifiedClient,transactionVerified,consentConfirmed,publicationStatus,verifiedWithdrawalId:withdrawal?.id??null,withdrawalAmount:withdrawal?.amount.toString()??null,currency:withdrawal?.currency??null}}});
			return story;
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
		return NextResponse.json(jsonSafe(updated));
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Invalid client-story details.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&['STORY_NOT_FOUND','IDENTITY_USER_REQUIRED','STORY_USER_INVALID','WITHDRAWAL_NOT_VERIFIABLE','PUBLIC_AMOUNT_REQUIRES_MATCHING_WITHDRAWAL','VERIFICATION_AND_CONSENT_REQUIRED','STORY_CHANGED'].includes(error.message))return NextResponse.json({error:error.message.replaceAll('_',' ').toLowerCase()},{status:error.message==='STORY_NOT_FOUND'?404:409});
		return NextResponse.json({error:'Client-story review failed.'},{status:500});
	}
}

export async function DELETE(request:Request){
	try{
		const admin=await requireAdmin();
		const input=z.object({storyId:z.string().min(1)}).parse(await request.json());
		const deleted=await db.$transaction(async tx=>{
			const story=await tx.clientStory.findFirst({where:{id:input.storyId,deletedAt:null},select:{id:true,displayName:true,updatedAt:true}});
			if(!story)throw new Error('STORY_NOT_FOUND');
			const changed=await tx.clientStory.updateMany({where:{id:story.id,deletedAt:null,updatedAt:story.updatedAt},data:{deletedAt:new Date(),deletedById:admin.id}});
			if(changed.count!==1)throw new Error('STORY_CHANGED');
			await tx.auditLog.create({data:{actorId:admin.id,action:'CLIENT_STORY_SOFT_DELETED',entity:'CLIENT_STORY',entityId:story.id,metadata:{displayName:story.displayName,originalLocation:'/admin/content'}}});
			return story;
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
		return NextResponse.json({deleted:true,restorable:true,id:deleted.id});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Client story ID is required.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='STORY_NOT_FOUND')return NextResponse.json({error:'Client story not found.'},{status:404});
		if(error instanceof Error&&error.message==='STORY_CHANGED')return NextResponse.json({error:'Client story changed before it could be moved to Deleted Items.'},{status:409});
		return NextResponse.json({error:'Unable to move the client story to Deleted Items.'},{status:500});
	}
}