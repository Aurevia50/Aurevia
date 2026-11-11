import {Prisma} from '@prisma/client';
import type {DiditDecision,DiditKycStatus,DiditStatus,DiditWebhookEvent} from '@/lib/didit';
import {mapDiditKycStatus,mapDiditStatus} from '@/lib/didit';
import {db} from '@/lib/db';

function isRecord(value:unknown):value is Record<string,unknown>{
	return typeof value==='object'&&value!==null&&!Array.isArray(value);
}

function sessionComplete(status:DiditKycStatus){
	return status==='APPROVED'||status==='REJECTED'||status==='EXPIRED'||status==='FAILED';
}

function sessionEnvironment(value:string):'sandbox'|'live'{
	if(value==='sandbox'||value==='live')return value;
	throw new Error('DIDIT_SESSION_ENVIRONMENT_INVALID');
}

function userKycStatus(status:DiditKycStatus):'PENDING'|'APPROVED'|'REJECTED'{
	if(status==='APPROVED')return 'APPROVED';
	if(status==='REJECTED')return 'REJECTED';
	return 'PENDING';
}

async function updateCurrentUserStatus(tx:Prisma.TransactionClient,userId:string,sessionRecordId:string,status:DiditKycStatus,environment:'sandbox'|'live'){
	if(environment!=='live')return;
	const newest=await tx.diditVerificationSession.findFirst({
		where:{userId,sessionId:{not:null}},
		orderBy:[{createdAt:'desc'},{id:'desc'}],
		select:{id:true},
	});
	if(newest?.id!==sessionRecordId)return;
	const kycStatus=userKycStatus(status);
	await tx.user.update({
		where:{id:userId},
		data:{kycStatus,...(kycStatus==='APPROVED'?{verifiedAt:new Date()}:{verifiedAt:null})},
	});
}

function eventDecision(event:DiditWebhookEvent):Prisma.InputJsonValue|undefined{
	return isRecord(event.decision)?event.decision as Prisma.InputJsonValue:undefined;
}

export async function persistDiditWebhookEvent(event:DiditWebhookEvent):Promise<'applied'|'duplicate'|'stale'|'unknown-session'>{
	const eventDate=new Date(event.created_at*1000);
	if(Number.isNaN(eventDate.getTime()))throw new Error('DIDIT_WEBHOOK_EVENT_INVALID');
	const status=mapDiditStatus(event.status);
	const kycStatus:DiditKycStatus=mapDiditKycStatus(status);
	return db.$transaction(async tx=>{
		const alreadyProcessed=await tx.diditWebhookEvent.findUnique({where:{eventId:event.event_id},select:{eventId:true}});
		if(alreadyProcessed)return 'duplicate';
		const session=await tx.diditVerificationSession.findUnique({where:{sessionId:event.session_id}});
		if(!session)return 'unknown-session';
		if(session.workflowId!==event.workflow_id||session.vendorData!==event.vendor_data||session.environment!==event.environment){
			throw new Error('DIDIT_WEBHOOK_SESSION_BINDING_MISMATCH');
		}
		if(event.session_kind!==undefined&&event.session_kind!=='user')throw new Error('DIDIT_WEBHOOK_SESSION_KIND_INVALID');
		if(event.business_session_id!==undefined)throw new Error('DIDIT_WEBHOOK_SESSION_KIND_INVALID');
		await tx.diditWebhookEvent.create({data:{
			eventId:event.event_id,
			sessionId:event.session_id,
			webhookType:event.webhook_type,
			createdAt:eventDate,
		}});
		if(session.lastEventAt&&eventDate<=session.lastEventAt)return 'stale';
		const decision=eventDecision(event);
		const statusUpdated=event.webhook_type==='status.updated';
		await tx.diditVerificationSession.update({
			where:{id:session.id},
			data:{
				...(statusUpdated?{status:kycStatus}:{}),
				...(decision?{decision}:{}),
				lastEventAt:eventDate,
				...(statusUpdated&&sessionComplete(kycStatus)?{completedAt:eventDate}:{}),
			},
		});
		if(statusUpdated)await updateCurrentUserStatus(tx,session.userId,session.id,kycStatus,sessionEnvironment(session.environment));
		return 'applied';
	},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

export async function applyDiditDecision(input:{userId:string;decision:DiditDecision}):Promise<{status:DiditKycStatus;environment:'sandbox'|'live';applied:boolean}>{
	const {decision,userId}=input;
	if(!isRecord(decision))throw new Error('DIDIT_DECISION_INVALID');
	const status:DiditStatus=mapDiditStatus(decision.status);
	const kycStatus=mapDiditKycStatus(status);
	return db.$transaction(async tx=>{
		const session=await tx.diditVerificationSession.findUnique({where:{sessionId:decision.session_id}});
		if(!session||session.userId!==userId)throw new Error('DIDIT_SESSION_NOT_FOUND');
		if(session.workflowId!==decision.workflow_id||session.vendorData!==decision.vendor_data){
			throw new Error('DIDIT_DECISION_SESSION_BINDING_MISMATCH');
		}
		const decisionTrace=isRecord(decision.decision_trace)?decision.decision_trace:null;
		const decidedAt=typeof decisionTrace?.decided_at==='string'?new Date(decisionTrace.decided_at):null;
		const hasValidDecisionTime=Boolean(decidedAt&&!Number.isNaN(decidedAt.getTime()));
		if(hasValidDecisionTime&&session.lastEventAt&&decidedAt!<=session.lastEventAt){
			const environment=sessionEnvironment(session.environment);
			return {status:session.status as DiditKycStatus,environment,applied:environment==='live'};
		}
		await tx.diditVerificationSession.update({
			where:{id:session.id},
			data:{
				status:kycStatus,
				decision:decision as Prisma.InputJsonValue,
				...(hasValidDecisionTime?{lastEventAt:decidedAt}:{}),
				...(sessionComplete(kycStatus)?{completedAt:new Date()}:{}),
			},
		});
		const environment=sessionEnvironment(session.environment);
		await updateCurrentUserStatus(tx,userId,session.id,kycStatus,environment);
		return {status:kycStatus,environment,applied:environment==='live'};
	},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
