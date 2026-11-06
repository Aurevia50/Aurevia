import {NextResponse} from 'next/server';
import {Prisma,CardApplicationStatus,NotificationType,SimulatedCardStatus} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {createCardReference,createMaskedPan,defaultExpiry} from '@/lib/cards';
import {createNotification} from '@/lib/notifications';
import {jsonSafe} from '@/lib/serializers';

type Params={params:Promise<{id:string}>};

const schema=z.object({
	action:z.enum(['UNDER_REVIEW','APPROVE','DECLINE','SUSPEND','REACTIVATE','REVOKE']),
	adminNote:z.string().trim().max(2000).optional(),
	declineReason:z.string().trim().max(1000).optional(),
});

const approvableStatuses:CardApplicationStatus[]=[
	CardApplicationStatus.SUBMITTED,
	CardApplicationStatus.UNDER_REVIEW,
	CardApplicationStatus.AWAITING_INFO,
];

export async function PATCH(request:Request,{params}:Params){
	try{
		const admin=await requireAdmin();
		const {id}=await params;
		const input=schema.parse(await request.json());
		const application=await db.cardApplication.findUnique({where:{id},include:{issuedCard:true,catalogItem:true}});
		if(!application)return NextResponse.json({error:'Not found'},{status:404});

		if(input.action==='UNDER_REVIEW'){
			const updated=await db.cardApplication.update({where:{id},data:{status:CardApplicationStatus.UNDER_REVIEW,adminNote:input.adminNote||application.adminNote,reviewedById:admin.id,reviewedAt:new Date()}});
			await createNotification(db,{userId:application.userId,type:NotificationType.CARD,title:'Card application in review',message:`Application ${application.reference} is under review.`,dedupeKey:`card-app:${id}:review`,actionUrl:'/cards'});
			return NextResponse.json(jsonSafe(updated),{headers:{'Cache-Control':'private, no-store'}});
		}

		if(input.action==='DECLINE'){
			if(application.issuedCard)return NextResponse.json({error:'Issued cards cannot be declined.'},{status:409});
			const updated=await db.$transaction(async tx=>{
				const row=await tx.cardApplication.update({where:{id},data:{status:CardApplicationStatus.DECLINED,declineReason:input.declineReason||'Declined',adminNote:input.adminNote||null,reviewedById:admin.id,reviewedAt:new Date()}});
				await tx.auditLog.create({data:{actorId:admin.id,action:'CARD_APPLICATION_DECLINED',entity:'CARD_APPLICATION',entityId:id,metadata:{reason:input.declineReason||null}}});
				await createNotification(tx,{userId:application.userId,type:NotificationType.CARD,title:'Card application declined',message:`Application ${application.reference} was declined.`,dedupeKey:`card-app:${id}:declined`,actionUrl:'/cards'});
				return row;
			});
			return NextResponse.json(jsonSafe(updated),{headers:{'Cache-Control':'private, no-store'}});
		}

		if(input.action==='APPROVE'){
			if(application.issuedCard)return NextResponse.json({error:'Card already issued for this application.'},{status:409});
			if(!approvableStatuses.includes(application.status)){
				return NextResponse.json({error:'Application cannot be approved in its current status.'},{status:409});
			}
			const {maskedPan}=createMaskedPan();
			const expiry=defaultExpiry();
			const issued=await db.$transaction(async tx=>{
				const app=await tx.cardApplication.update({where:{id},data:{status:CardApplicationStatus.APPROVED,adminNote:input.adminNote||null,reviewedById:admin.id,reviewedAt:new Date()}});
				const card=await tx.simulatedCard.create({
					data:{
						applicationId:app.id,
						userId:application.userId,
						designTier:application.designTier,
						displayName:application.catalogItem.displayName,
						cardholderName:application.cardholderName,
						referenceNumber:createCardReference(),
						maskedPan,
						expiryMonth:expiry.expiryMonth,
						expiryYear:expiry.expiryYear,
						status:SimulatedCardStatus.ACTIVE,
						issuedAt:new Date(),
					},
				});
				await tx.auditLog.create({data:{actorId:admin.id,action:'CARD_ISSUED',entity:'SIMULATED_CARD',entityId:card.id,metadata:{applicationId:app.id,reference:card.referenceNumber,priceSnapshot:application.priceSnapshot.toString()}}});
				await createNotification(tx,{userId:application.userId,type:NotificationType.CARD,title:'Card approved',message:`Your card application ${application.reference} was approved.`,dedupeKey:`card-app:${id}:approved`,actionUrl:`/cards/${card.id}`});
				return {app,card};
			},{isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
			return NextResponse.json(jsonSafe(issued),{headers:{'Cache-Control':'private, no-store'}});
		}

		if(!application.issuedCard)return NextResponse.json({error:'No issued card for this application.'},{status:409});
		const cardId=application.issuedCard.id;
		if(input.action==='SUSPEND'){
			const card=await db.simulatedCard.update({where:{id:cardId},data:{status:SimulatedCardStatus.SUSPENDED,suspendedAt:new Date()}});
			await createNotification(db,{userId:application.userId,type:NotificationType.CARD,title:'Card suspended',message:`Card ${card.referenceNumber} was suspended.`,dedupeKey:`card:${cardId}:suspended`,actionUrl:`/cards/${cardId}`});
			return NextResponse.json(jsonSafe(card),{headers:{'Cache-Control':'private, no-store'}});
		}
		if(input.action==='REACTIVATE'){
			const card=await db.simulatedCard.update({where:{id:cardId},data:{status:SimulatedCardStatus.ACTIVE,suspendedAt:null}});
			await createNotification(db,{userId:application.userId,type:NotificationType.CARD,title:'Card reactivated',message:`Card ${card.referenceNumber} was reactivated.`,dedupeKey:`card:${cardId}:reactivated`,actionUrl:`/cards/${cardId}`});
			return NextResponse.json(jsonSafe(card),{headers:{'Cache-Control':'private, no-store'}});
		}
		if(input.action==='REVOKE'){
			const card=await db.simulatedCard.update({where:{id:cardId},data:{status:SimulatedCardStatus.REVOKED,revokedAt:new Date()}});
			await createNotification(db,{userId:application.userId,type:NotificationType.CARD,title:'Card revoked',message:`Card ${card.referenceNumber} was revoked.`,dedupeKey:`card:${cardId}:revoked`,actionUrl:'/cards'});
			return NextResponse.json(jsonSafe(card),{headers:{'Cache-Control':'private, no-store'}});
		}
		return NextResponse.json({error:'Unsupported action'},{status:400});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Invalid request.'},{status:400});
		console.error('admin card action failed',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to update card application.'},{status:500});
	}
}
