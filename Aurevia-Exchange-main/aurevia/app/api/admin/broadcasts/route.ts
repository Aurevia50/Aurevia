import {NextResponse} from 'next/server';
import {BroadcastStatus,NotificationType,Prisma} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {jsonSafe} from '@/lib/serializers';
import {BroadcastAction,nextBroadcastStatus,validateBroadcastUrl} from '@/lib/broadcast-policy';
import {notifyActiveUsers} from '@/lib/notifications';

export const dynamic='force-dynamic';

const fields=z.object({
	title:z.string().trim().min(3).max(120),
	description:z.string().trim().min(5).max(3000),
	streamUrl:z.string().trim().max(2048).nullable(),
	startsAt:z.union([z.coerce.date(),z.null()]),
});
const createSchema=fields.extend({status:z.enum(['DRAFT','SCHEDULED']).default('DRAFT')});
const updateSchema=fields.partial().extend({action:z.literal('update'),id:z.string().min(1)});
const transitionSchema=z.object({action:z.enum(['schedule','publish','end','archive']),id:z.string().min(1)});

function errorResponse(error:unknown){
	if(error instanceof ZodError)return NextResponse.json({error:'Check the broadcast title, description, source URL, and schedule.'},{status:400});
	if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
	if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
	if(error instanceof Error&&error.message==='BROADCAST_NOT_FOUND')return NextResponse.json({error:'Broadcast not found.'},{status:404});
	if(error instanceof Error&&['BROADCAST_TRANSITION_NOT_ALLOWED','BROADCAST_STATE_CHANGED','BROADCAST_SCHEDULE_REQUIRED'].includes(error.message))return NextResponse.json({error:error.message.replaceAll('_',' ').toLowerCase()},{status:409});
	if(error instanceof Error&&error.message==='INVALID_BROADCAST_URL')return NextResponse.json({error:'Use a valid HTTPS stream or recording URL without embedded credentials.'},{status:400});
	return NextResponse.json({error:'Unable to update broadcast management.'},{status:500});
}

export async function GET(){
	try{
		await requireAdmin();
		const broadcasts=await db.broadcast.findMany({where:{deletedAt:null},include:{createdBy:{select:{id:true,name:true,email:true}}},orderBy:[{startsAt:'desc'},{createdAt:'desc'}],take:250});
		return NextResponse.json(jsonSafe(broadcasts),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){return errorResponse(error)}
}

export async function POST(request:Request){
	try{
		const admin=await requireAdmin();
		const input=createSchema.parse(await request.json());
		const streamUrl=validateBroadcastUrl(input.streamUrl);
		if(input.status==='SCHEDULED'&&(!input.startsAt||input.startsAt<=new Date()))throw new Error('BROADCAST_SCHEDULE_REQUIRED');
		const created=await db.$transaction(async tx=>{
			const broadcast=await tx.broadcast.create({data:{...input,streamUrl,createdById:admin.id}});
			await tx.auditLog.create({data:{actorId:admin.id,action:'BROADCAST_CREATED',entity:'BROADCAST',entityId:broadcast.id,metadata:{status:broadcast.status,title:broadcast.title,startsAt:broadcast.startsAt?.toISOString()??null,hasStreamSource:Boolean(broadcast.streamUrl)}}});
			return broadcast;
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
		return NextResponse.json(jsonSafe(created),{status:201,headers:{'Cache-Control':'private, no-store'}});
	}catch(error){return errorResponse(error)}
}

export async function PATCH(request:Request){
	try{
		const admin=await requireAdmin();
		const body=await request.json() as {action?:string};
		const result=await db.$transaction(async tx=>{
			if(body.action==='update'){
				const input=updateSchema.parse(body);
				const current=await tx.broadcast.findFirst({where:{id:input.id,deletedAt:null}});
				if(!current)throw new Error('BROADCAST_NOT_FOUND');
				if(current.status!==BroadcastStatus.DRAFT&&current.status!==BroadcastStatus.SCHEDULED)throw new Error('BROADCAST_TRANSITION_NOT_ALLOWED');
				const streamUrl=validateBroadcastUrl(input.streamUrl===undefined?current.streamUrl:input.streamUrl);
				const startsAt=input.startsAt===undefined?current.startsAt:input.startsAt;
				if(current.status===BroadcastStatus.SCHEDULED&&(!startsAt||startsAt<=new Date()))throw new Error('BROADCAST_SCHEDULE_REQUIRED');
				const {action:_,id,...data}=input;
				const changed=await tx.broadcast.updateMany({where:{id:current.id,status:current.status,deletedAt:null},data:{...data,streamUrl,startsAt}});
				if(changed.count!==1)throw new Error('BROADCAST_STATE_CHANGED');
				const updated=await tx.broadcast.findUniqueOrThrow({where:{id:current.id}});
				await tx.auditLog.create({data:{actorId:admin.id,action:'BROADCAST_UPDATED',entity:'BROADCAST',entityId:current.id,metadata:{oldStatus:current.status,newStatus:updated.status,title:updated.title,startsAt:updated.startsAt?.toISOString()??null,hasStreamSource:Boolean(updated.streamUrl)}}});
				return updated;
			}

			const input=transitionSchema.parse(body);
			const current=await tx.broadcast.findFirst({where:{id:input.id,deletedAt:null}});
			if(!current)throw new Error('BROADCAST_NOT_FOUND');
			const action=input.action as BroadcastAction;
			const status=nextBroadcastStatus(current.status,action);
			if(action==='schedule'&&(!current.startsAt||current.startsAt<=new Date()))throw new Error('BROADCAST_SCHEDULE_REQUIRED');
			const now=new Date();
			const data:Prisma.BroadcastUpdateManyMutationInput={status};
			if(action==='publish')data.publishedAt=now;
			if(action==='end')data.endedAt=now;
			if(action==='archive')data.archivedAt=now;
			const changed=await tx.broadcast.updateMany({where:{id:current.id,status:current.status,deletedAt:null},data});
			if(changed.count!==1)throw new Error('BROADCAST_STATE_CHANGED');
			const updated=await tx.broadcast.findUniqueOrThrow({where:{id:current.id}});
			await tx.auditLog.create({data:{actorId:admin.id,action:`BROADCAST_${status}`,entity:'BROADCAST',entityId:current.id,metadata:{oldStatus:current.status,newStatus:status,title:current.title,hasStreamSource:Boolean(current.streamUrl)}}});
			if(action==='publish')await notifyActiveUsers(tx,{
				type:NotificationType.ANNOUNCEMENT,
				title:'New Aurevia announcement',
				message:`${updated.title}: ${updated.description}`,
				dedupeKey:`broadcast:${updated.id}:published`,
				relatedEntity:'BROADCAST',
				relatedId:updated.id,
				actionUrl:'/broadcasts',
			});
			return updated;
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
		return NextResponse.json(jsonSafe(result),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){return errorResponse(error)}
}

export async function DELETE(request:Request){
	try{
		const admin=await requireAdmin();
		const input=z.object({id:z.string().min(1)}).parse(await request.json());
		await db.$transaction(async tx=>{
			const broadcast=await tx.broadcast.findFirst({where:{id:input.id,deletedAt:null},select:{id:true,title:true,status:true,updatedAt:true}});
			if(!broadcast)throw new Error('BROADCAST_NOT_FOUND');
			const changed=await tx.broadcast.updateMany({where:{id:broadcast.id,deletedAt:null,updatedAt:broadcast.updatedAt},data:{deletedAt:new Date(),deletedById:admin.id}});
			if(changed.count!==1)throw new Error('BROADCAST_STATE_CHANGED');
			await tx.auditLog.create({data:{actorId:admin.id,action:'BROADCAST_SOFT_DELETED',entity:'BROADCAST',entityId:broadcast.id,metadata:{title:broadcast.title,status:broadcast.status,originalLocation:'/admin/broadcasts'}}});
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
		return NextResponse.json({deleted:true,restorable:true});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Broadcast ID is required.'},{status:400});
		return errorResponse(error);
	}
}