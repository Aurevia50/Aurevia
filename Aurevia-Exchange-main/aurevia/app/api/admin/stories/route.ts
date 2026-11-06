import {NextResponse} from 'next/server';
import {Prisma,StoryStatus,StoryVisibility} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {jsonSafe} from '@/lib/serializers';
import {PrivateStorageError} from '@/lib/private-storage';
import {storyExpirationIsValid} from '@/lib/story-policy';

export const dynamic='force-dynamic';

const storyFields=z.object({
	title:z.string().trim().min(2).max(120),
	description:z.string().trim().min(1).max(3000),
	categoryId:z.string().min(1).max(128),
	externalUrl:z.string().trim().max(2048).nullable().optional(),
	visibility:z.nativeEnum(StoryVisibility).default(StoryVisibility.PUBLIC),
	publishAt:z.union([z.null(),z.coerce.date()]).optional(),
	expiresAt:z.union([z.null(),z.coerce.date()]).optional(),
	displayOrder:z.number().int().min(0).max(10000).default(0),
	status:z.nativeEnum(StoryStatus).default(StoryStatus.DRAFT),
});
const updateSchema=storyFields.partial().extend({storyId:z.string().min(1),action:z.enum(['save','publish','archive']).default('save')});

function validateExternalUrl(value:string|null|undefined){
	if(!value)return null;
	let url:URL;
	try{url=new URL(value)}catch{throw new Error('INVALID_STORY_URL')}
	if(url.protocol!=='https:'||url.username||url.password)throw new Error('INVALID_STORY_URL');
	return url.toString();
}

function statusError(error:unknown){
	if(error instanceof ZodError)return NextResponse.json({error:'Check the story title, description, category, visibility, and dates.'},{status:400});
	if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
	if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
	if(error instanceof Error&&error.message==='STORY_NOT_FOUND')return NextResponse.json({error:'Story not found.'},{status:404});
	if(error instanceof Error&&error.message==='STORY_CATEGORY_NOT_FOUND')return NextResponse.json({error:'Choose an existing story category.'},{status:400});
	if(error instanceof Error&&error.message==='STORY_SCHEDULE_REQUIRED')return NextResponse.json({error:'Choose a future publication time for a scheduled story.'},{status:409});
	if(error instanceof Error&&error.message==='STORY_EXPIRATION_INVALID')return NextResponse.json({error:'The expiration time must be after publication.'},{status:400});
	if(error instanceof Error&&error.message==='INVALID_STORY_URL')return NextResponse.json({error:'Use a valid HTTPS external link without embedded credentials.'},{status:400});
	if(error instanceof PrivateStorageError)return NextResponse.json({error:error.message},{status:error.status});
	console.error('Story management request failed.',error instanceof Error?error.name:'UnknownError');
	return NextResponse.json({error:'Stories are temporarily unavailable.'},{status:500});
}

async function archiveExpiredStories(adminId:string,now:Date){
	await db.$transaction(async tx=>{
		const expired=await tx.story.findMany({
			where:{deletedAt:null,status:{in:[StoryStatus.PUBLISHED,StoryStatus.SCHEDULED]},expiresAt:{lte:now}},
			select:{id:true,title:true,status:true,updatedAt:true},
			take:250,
		});
		for(const story of expired){
			const changed=await tx.story.updateMany({
				where:{id:story.id,status:story.status,updatedAt:story.updatedAt,deletedAt:null},
				data:{status:StoryStatus.ARCHIVED,archivedAt:now},
			});
			if(changed.count===1)await tx.auditLog.create({data:{actorId:adminId,action:'STORY_EXPIRED_AND_ARCHIVED',entity:'STORY',entityId:story.id,metadata:{title:story.title,previousStatus:story.status}}});
		}
	});
}

export async function GET(){
	try{
		const admin=await requireAdmin();
		await archiveExpiredStories(admin.id,new Date());
		const stories=await db.story.findMany({
			where:{deletedAt:null},
			include:{category:true,createdBy:{select:{id:true,name:true,email:true}},media:{orderBy:[{displayOrder:'asc'},{createdAt:'asc'}]}},
			orderBy:[{displayOrder:'asc'},{createdAt:'desc'}],
			take:250,
		});
		const engagement=stories.length?await db.storyEngagement.groupBy({by:['storyId','type'],where:{storyId:{in:stories.map(story=>story.id)}},_count:{_all:true}}):[];
		const counts=new Map<string,{views:number;linkClicks:number}>();
		for(const item of engagement){
			const current=counts.get(item.storyId)??{views:0,linkClicks:0};
			if(item.type==='VIEW')current.views=item._count._all;
			if(item.type==='LINK_CLICK')current.linkClicks=item._count._all;
			counts.set(item.storyId,current);
		}
		const auditEvents=stories.length?await db.auditLog.findMany({
			where:{entity:'STORY',entityId:{in:stories.map(story=>story.id)}},
			select:{id:true,entityId:true,action:true,createdAt:true,actor:{select:{name:true,email:true}}},
			orderBy:{createdAt:'desc'},
			take:1000,
		}):[];
		const historyByStory=new Map<string,typeof auditEvents>();
		for(const event of auditEvents){
			if(!event.entityId)continue;
			const history=historyByStory.get(event.entityId)??[];
			history.push(event);
			historyByStory.set(event.entityId,history);
		}
		const serialized=await Promise.all(stories.map(async story=>({
			...story,
			engagement:counts.get(story.id)??{views:0,linkClicks:0},
			auditHistory:historyByStory.get(story.id)??[],
			media:story.media.map(item=>({
				...item,
				url:`/api/admin/stories/${encodeURIComponent(story.id)}/media/${encodeURIComponent(item.id)}`,
			})),
		})));
		return NextResponse.json(jsonSafe({stories:serialized}),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){return statusError(error)}
}

export async function POST(request:Request){
	try{
		const admin=await requireAdmin();
		const input=storyFields.parse(await request.json());
		const now=new Date();
		const publishAt=input.publishAt??null;
		const expiresAt=input.expiresAt??null;
		if(input.status===StoryStatus.SCHEDULED&&(!publishAt||publishAt<=now))throw new Error('STORY_SCHEDULE_REQUIRED');
		if(!storyExpirationIsValid(input.status===StoryStatus.PUBLISHED?now:publishAt,expiresAt,now))throw new Error('STORY_EXPIRATION_INVALID');
		if(!await db.storyCategory.findUnique({where:{id:input.categoryId},select:{id:true}}))throw new Error('STORY_CATEGORY_NOT_FOUND');
		const externalUrl=validateExternalUrl(input.externalUrl);
		const created=await db.$transaction(async tx=>{
			const story=await tx.story.create({data:{
				...input,
				externalUrl,
				publishAt:input.status===StoryStatus.PUBLISHED?now:publishAt,
				publishedAt:input.status===StoryStatus.PUBLISHED?now:null,
				expiresAt,
				archivedAt:input.status===StoryStatus.ARCHIVED?now:null,
				createdById:admin.id,
			}});
			await tx.auditLog.create({data:{actorId:admin.id,action:'STORY_CREATED',entity:'STORY',entityId:story.id,metadata:{status:story.status,visibility:story.visibility,categoryId:story.categoryId}}});
			return story;
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
		return NextResponse.json(jsonSafe(created),{status:201,headers:{'Cache-Control':'private, no-store'}});
	}catch(error){return statusError(error)}
}

export async function PATCH(request:Request){
	try{
		const admin=await requireAdmin();
		const input=updateSchema.parse(await request.json());
		const updated=await db.$transaction(async tx=>{
			const current=await tx.story.findFirst({where:{id:input.storyId,deletedAt:null}});
			if(!current)throw new Error('STORY_NOT_FOUND');
			const {storyId,action,...fields}=input;
			const status=action==='publish'?StoryStatus.PUBLISHED:action==='archive'?StoryStatus.ARCHIVED:(fields.status??current.status);
			const now=new Date();
			const publishAt=action==='publish'?now:(fields.publishAt===undefined?current.publishAt:fields.publishAt);
			const expiresAt=fields.expiresAt===undefined?current.expiresAt:fields.expiresAt;
			if(status===StoryStatus.SCHEDULED&&(!publishAt||publishAt<=now))throw new Error('STORY_SCHEDULE_REQUIRED');
			if(!storyExpirationIsValid(status===StoryStatus.PUBLISHED?now:publishAt,expiresAt,now))throw new Error('STORY_EXPIRATION_INVALID');
			const categoryId=fields.categoryId??current.categoryId;
			if(!await tx.storyCategory.findUnique({where:{id:categoryId},select:{id:true}}))throw new Error('STORY_CATEGORY_NOT_FOUND');
			const externalUrl=fields.externalUrl===undefined?current.externalUrl:validateExternalUrl(fields.externalUrl);
			const data={
				title:fields.title??current.title,
				description:fields.description??current.description,
				categoryId,
				externalUrl,
				visibility:fields.visibility??current.visibility,
				displayOrder:fields.displayOrder??current.displayOrder,
				status,
				publishAt,
				publishedAt:status===StoryStatus.PUBLISHED?(current.status===StoryStatus.PUBLISHED?current.publishedAt:now):status===StoryStatus.DRAFT?null:current.publishedAt,
				expiresAt,
				archivedAt:status===StoryStatus.ARCHIVED?now:null,
			};
			const changed=await tx.story.updateMany({where:{id:current.id,updatedAt:current.updatedAt,deletedAt:null},data});
			if(changed.count!==1)throw new Error('STORY_CHANGED');
			const story=await tx.story.findUniqueOrThrow({where:{id:current.id}});
			await tx.auditLog.create({data:{actorId:admin.id,action:`STORY_${action==='save'?status:action.toUpperCase()}`,entity:'STORY',entityId:story.id,metadata:{oldStatus:current.status,newStatus:story.status,visibility:story.visibility,categoryId:story.categoryId,changedFields:Object.keys(fields)}}});
			return story;
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
		return NextResponse.json(jsonSafe(updated),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='STORY_CHANGED')return NextResponse.json({error:'This story changed while you were editing it. Reload and try again.'},{status:409});
		return statusError(error);
	}
}

export async function DELETE(request:Request){
	try{
		const admin=await requireAdmin();
		const {storyId}=z.object({storyId:z.string().min(1)}).parse(await request.json());
		await db.$transaction(async tx=>{
			const story=await tx.story.findFirst({where:{id:storyId,deletedAt:null},select:{id:true,title:true,updatedAt:true,status:true}});
			if(!story)throw new Error('STORY_NOT_FOUND');
			const changed=await tx.story.updateMany({where:{id:story.id,updatedAt:story.updatedAt,deletedAt:null},data:{deletedAt:new Date(),deletedById:admin.id}});
			if(changed.count!==1)throw new Error('STORY_CHANGED');
			await tx.auditLog.create({data:{actorId:admin.id,action:'STORY_SOFT_DELETED',entity:'STORY',entityId:story.id,metadata:{title:story.title,status:story.status}}});
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
		return NextResponse.json({deleted:true},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='STORY_CHANGED')return NextResponse.json({error:'This story changed before it could be deleted.'},{status:409});
		return statusError(error);
	}
}
