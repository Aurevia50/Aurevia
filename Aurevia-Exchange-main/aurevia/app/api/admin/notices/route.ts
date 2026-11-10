import {NextResponse} from 'next/server';
import {ManagedNoticeStatus,ManagedNoticeType,NoticeVisibility,Prisma} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {isSameOriginRequest} from '@/lib/push-notifications';
import {jsonSafe} from '@/lib/serializers';
import {activePolicyWhere} from '@/lib/managed-notice-policy';
import {deliverNoticeToActiveUsers} from '@/lib/managed-notice-delivery';

export const dynamic='force-dynamic';
const privateHeaders={'Cache-Control':'private, no-store'};

const typeSchema=z.nativeEnum(ManagedNoticeType);
const visibilitySchema=z.nativeEnum(NoticeVisibility);
const fields=z.object({
	type:typeSchema,
	title:z.string().trim().min(3).max(160),
	content:z.string().trim().min(1).max(40000),
	version:z.string().trim().min(1).max(64).nullable().optional(),
	visibility:visibilitySchema,
	startsAt:z.coerce.date().nullable().optional(),
	endsAt:z.coerce.date().nullable().optional(),
});
const createSchema=fields;
const updateSchema=fields.omit({type:true}).partial().extend({action:z.literal('update'),id:z.string().min(1)});
const transitionSchema=z.object({action:z.enum(['publish','unpublish','enable','disable','archive']),id:z.string().min(1)});

function isOriginError(error:unknown){
	return error instanceof Error&&error.message==='UNAUTHORIZED'||error instanceof Error&&error.message==='FORBIDDEN';
}

function validateNotice(data:{
	type:ManagedNoticeType;
	version?:string|null;
	visibility:NoticeVisibility;
	startsAt?:Date|null;
	endsAt?:Date|null;
}){
	if(data.startsAt&&data.endsAt&&data.endsAt<=data.startsAt)throw new Error('NOTICE_ENDS_BEFORE_STARTS');
	if(data.type!==ManagedNoticeType.ANNOUNCEMENT&&!data.version)throw new Error('POLICY_VERSION_REQUIRED');
	if(data.type===ManagedNoticeType.TERMS&&data.visibility!==NoticeVisibility.MANDATORY_ACCEPTANCE)throw new Error('TERMS_VISIBILITY_REQUIRED');
	if(data.type===ManagedNoticeType.PRIVACY&&data.visibility===NoticeVisibility.MANDATORY_ACCEPTANCE)throw new Error('PRIVACY_VISIBILITY_INVALID');
	if(data.type===ManagedNoticeType.ANNOUNCEMENT&&data.visibility===NoticeVisibility.MANDATORY_ACCEPTANCE)throw new Error('ANNOUNCEMENT_VISIBILITY_INVALID');
}

function snapshot(notice:{
	type:ManagedNoticeType;title:string;content:string;version:string|null;visibility:NoticeVisibility;
	status:ManagedNoticeStatus;enabled:boolean;startsAt:Date|null;endsAt:Date|null;publishedAt:Date|null;unpublishedAt:Date|null;
}){
	return {
		type:notice.type,title:notice.title,content:notice.content,version:notice.version,visibility:notice.visibility,
		status:notice.status,enabled:notice.enabled,startsAt:notice.startsAt?.toISOString()??null,
		endsAt:notice.endsAt?.toISOString()??null,publishedAt:notice.publishedAt?.toISOString()??null,
		unpublishedAt:notice.unpublishedAt?.toISOString()??null,
	};
}

function errorResponse(error:unknown){
	if(error instanceof ZodError)return NextResponse.json({error:'Check the notice type, title, content, version, visibility, and effective dates.'},{status:400,headers:privateHeaders});
	if(error instanceof Error&&error.message==='INVALID_NOTICE_JSON')return NextResponse.json({error:'Provide a valid notice request body.'},{status:400,headers:privateHeaders});
	if(isOriginError(error))return NextResponse.json({error:error instanceof Error&&error.message==='UNAUTHORIZED'?'Unauthorized':'Forbidden'},{status:error instanceof Error&&error.message==='UNAUTHORIZED'?401:403,headers:privateHeaders});
	if(error instanceof Error&&error.message==='NOTICE_NOT_FOUND')return NextResponse.json({error:'Notice or policy version not found.'},{status:404,headers:privateHeaders});
	if(error instanceof Error&&['NOTICE_NOT_EDITABLE','NOTICE_MUST_BE_UNPUBLISHED','PUBLISHED_POLICY_IMMUTABLE','NOTICE_TRANSITION_NOT_ALLOWED','NOTICE_STATE_CHANGED','CURRENT_TERMS_REQUIRED'].includes(error.message))return NextResponse.json({error:error.message.replaceAll('_',' ').toLowerCase()},{status:409,headers:privateHeaders});
	if(error instanceof Error&&['NOTICE_ENDS_BEFORE_STARTS','NOTICE_EFFECTIVE_PERIOD_EXPIRED','POLICY_VERSION_REQUIRED','TERMS_VISIBILITY_REQUIRED','PRIVACY_VISIBILITY_INVALID','ANNOUNCEMENT_VISIBILITY_INVALID'].includes(error.message))return NextResponse.json({error:error.message.replaceAll('_',' ').toLowerCase()},{status:400,headers:privateHeaders});
	if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')return NextResponse.json({error:'That policy version already exists. Create a new version instead.'},{status:409,headers:privateHeaders});
	console.error('Notice management request failed.',error instanceof Error?error.name:'UnknownError');
	return NextResponse.json({error:'Unable to update Notices & Conditions.'},{status:500,headers:privateHeaders});
}

async function requestBody(request:Request){
	try{return await request.json()}
	catch{throw new Error('INVALID_NOTICE_JSON')}
}

export async function GET(request:Request){
	try{
		await requireAdmin();
		const params=new URL(request.url).searchParams;
		const requestedPage=Number(params.get('page')||1);
		if(!Number.isInteger(requestedPage)||requestedPage<1||requestedPage>100_000)return NextResponse.json({error:'Invalid acceptance page.'},{status:400,headers:privateHeaders});
		const acceptancePageSize=50;
		const [notices,acceptances,acceptanceTotal,history]=await Promise.all([
			db.managedNotice.findMany({
				include:{
					createdBy:{select:{id:true,name:true,email:true}},
					updatedBy:{select:{id:true,name:true,email:true}},
				},
				orderBy:{updatedAt:'desc'},
				take:200,
			}),
			db.termsAcceptance.findMany({
				include:{user:{select:{id:true,name:true,email:true,aureviaExchangeId:true}}},
				orderBy:{acceptedAt:'desc'},
				skip:(requestedPage-1)*acceptancePageSize,
				take:acceptancePageSize,
			}),
			db.termsAcceptance.count(),
			db.auditLog.findMany({
				where:{entity:'MANAGED_NOTICE'},
				include:{actor:{select:{id:true,name:true,email:true}}},
				orderBy:{createdAt:'desc'},
				take:200,
			}),
		]);
		return NextResponse.json(jsonSafe({notices,acceptances,acceptanceTotal,acceptancePage:requestedPage,acceptancePageSize,history}),{headers:privateHeaders});
	}catch(error){return errorResponse(error)}
}

export async function POST(request:Request){
	try{
		const admin=await requireAdmin();
		if(!isSameOriginRequest(request))return NextResponse.json({error:'A same-origin request is required.'},{status:403,headers:privateHeaders});
		const input=createSchema.parse(await requestBody(request));
		validateNotice(input);
		const created=await db.$transaction(async tx=>{
			const notice=await tx.managedNotice.create({
				data:{
					...input,
					version:input.version??null,
					startsAt:input.startsAt??null,
					endsAt:input.endsAt??null,
					status:ManagedNoticeStatus.DRAFT,
					enabled:false,
					createdById:admin.id,
					updatedById:admin.id,
				},
			});
			await tx.auditLog.create({data:{
				actorId:admin.id,action:'MANAGED_NOTICE_CREATED',entity:'MANAGED_NOTICE',entityId:notice.id,
				metadata:{after:snapshot(notice)},
			}});
			return notice;
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
		return NextResponse.json(jsonSafe(created),{status:201,headers:privateHeaders});
	}catch(error){return errorResponse(error)}
}

export async function PATCH(request:Request){
	try{
		const admin=await requireAdmin();
		if(!isSameOriginRequest(request))return NextResponse.json({error:'A same-origin request is required.'},{status:403,headers:privateHeaders});
		const body=await requestBody(request) as {action?:string};
		const result=await db.$transaction(async tx=>{
			if(body.action==='update'){
				const input=updateSchema.parse(body);
				const current=await tx.managedNotice.findUnique({where:{id:input.id}});
				if(!current)throw new Error('NOTICE_NOT_FOUND');
				if(current.status===ManagedNoticeStatus.PUBLISHED||current.status===ManagedNoticeStatus.ARCHIVED)throw new Error('NOTICE_MUST_BE_UNPUBLISHED');
				if(current.type!==ManagedNoticeType.ANNOUNCEMENT&&current.publishedAt)throw new Error('PUBLISHED_POLICY_IMMUTABLE');
				const {action:_,id,...changes}=input;
				const data={
					...changes,
					...(changes.version!==undefined?{version:changes.version||null}:{}),
					...(changes.startsAt!==undefined?{startsAt:changes.startsAt}:{}),
					...(changes.endsAt!==undefined?{endsAt:changes.endsAt}:{}),
					updatedById:admin.id,
				};
				const merged={
					type:current.type,
					version:data.version===undefined?current.version:data.version,
					visibility:data.visibility??current.visibility,
					startsAt:data.startsAt===undefined?current.startsAt:data.startsAt,
					endsAt:data.endsAt===undefined?current.endsAt:data.endsAt,
				};
				validateNotice(merged);
				const changed=await tx.managedNotice.updateMany({where:{id:current.id,updatedAt:current.updatedAt},data});
				if(changed.count!==1)throw new Error('NOTICE_STATE_CHANGED');
				const updated=await tx.managedNotice.findUniqueOrThrow({where:{id:current.id}});
				await tx.auditLog.create({data:{
					actorId:admin.id,action:'MANAGED_NOTICE_UPDATED',entity:'MANAGED_NOTICE',entityId:current.id,
					metadata:{before:snapshot(current),after:snapshot(updated)},
				}});
				return updated;
			}

			const input=transitionSchema.parse(body);
			const current=await tx.managedNotice.findUnique({where:{id:input.id}});
			if(!current)throw new Error('NOTICE_NOT_FOUND');
			const now=new Date();
			if(current.type===ManagedNoticeType.TERMS
				&&current.status===ManagedNoticeStatus.PUBLISHED
				&&current.enabled
				&&current.visibility===NoticeVisibility.MANDATORY_ACCEPTANCE
				&&(!current.startsAt||current.startsAt<=now)
				&&(!current.endsAt||current.endsAt>now)
				&&['unpublish','disable','archive'].includes(input.action)){
				const replacement=await tx.managedNotice.findFirst({
					where:{...activePolicyWhere(ManagedNoticeType.TERMS,NoticeVisibility.MANDATORY_ACCEPTANCE,now),id:{not:current.id}},
					select:{id:true},
				});
				if(!replacement)throw new Error('CURRENT_TERMS_REQUIRED');
			}
			let data:Prisma.ManagedNoticeUncheckedUpdateManyInput;
			switch(input.action){
				case 'publish':
					if(current.status!==ManagedNoticeStatus.DRAFT&&current.status!==ManagedNoticeStatus.UNPUBLISHED)throw new Error('NOTICE_TRANSITION_NOT_ALLOWED');
					validateNotice(current);
					if(current.endsAt&&current.endsAt<=now)throw new Error('NOTICE_EFFECTIVE_PERIOD_EXPIRED');
					data={status:ManagedNoticeStatus.PUBLISHED,enabled:true,publishedAt:now,unpublishedAt:null,updatedById:admin.id};
					break;
				case 'unpublish':
					if(current.status!==ManagedNoticeStatus.PUBLISHED)throw new Error('NOTICE_TRANSITION_NOT_ALLOWED');
					data={status:ManagedNoticeStatus.UNPUBLISHED,enabled:false,unpublishedAt:now,updatedById:admin.id};
					break;
				case 'enable':
					if(current.status!==ManagedNoticeStatus.PUBLISHED)throw new Error('NOTICE_TRANSITION_NOT_ALLOWED');
					if(current.endsAt&&current.endsAt<=now)throw new Error('NOTICE_EFFECTIVE_PERIOD_EXPIRED');
					data={enabled:true,updatedById:admin.id};
					break;
				case 'disable':
					if(current.status!==ManagedNoticeStatus.PUBLISHED)throw new Error('NOTICE_TRANSITION_NOT_ALLOWED');
					data={enabled:false,updatedById:admin.id};
					break;
				case 'archive':
					if(current.status===ManagedNoticeStatus.ARCHIVED)throw new Error('NOTICE_TRANSITION_NOT_ALLOWED');
					data={status:ManagedNoticeStatus.ARCHIVED,enabled:false,unpublishedAt:current.status===ManagedNoticeStatus.PUBLISHED?now:current.unpublishedAt,updatedById:admin.id};
					break;
			}
			const changed=await tx.managedNotice.updateMany({where:{id:current.id,updatedAt:current.updatedAt},data});
			if(changed.count!==1)throw new Error('NOTICE_STATE_CHANGED');
			const updated=await tx.managedNotice.findUniqueOrThrow({where:{id:current.id}});
			if(input.action==='publish'||input.action==='enable')await deliverNoticeToActiveUsers(tx,updated);
			await tx.auditLog.create({data:{
				actorId:admin.id,action:`MANAGED_NOTICE_${input.action.toUpperCase()}`,entity:'MANAGED_NOTICE',entityId:current.id,
				metadata:{before:snapshot(current),after:snapshot(updated)},
			}});
			return updated;
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
		return NextResponse.json(jsonSafe(result),{headers:privateHeaders});
	}catch(error){return errorResponse(error)}
}
