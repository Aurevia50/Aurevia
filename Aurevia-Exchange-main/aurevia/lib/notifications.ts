import {randomUUID} from 'node:crypto';
import {NotificationType,Prisma,PrismaClient} from '@prisma/client';
import {removeSimulatedLabels} from '@/lib/display-copy';

type NotificationStore=PrismaClient|Prisma.TransactionClient;

async function resolveNotificationMode(tx:NotificationStore,relatedEntity?:string,relatedId?:string){
	if(!relatedEntity||!relatedId)return null;
	if(relatedEntity==='ORDER')return (await tx.order.findFirst({where:{id:relatedId},select:{accountMode:true}}))?.accountMode||null;
	if(relatedEntity==='FUNDING')return (await tx.fundingRequest.findFirst({where:{id:relatedId},select:{accountMode:true}}))?.accountMode||null;
	if(relatedEntity==='INVESTMENT')return (await tx.investmentRequest.findFirst({where:{id:relatedId},select:{accountMode:true}}))?.accountMode||null;
	if(relatedEntity==='LEDGER_TRANSACTION')return (await tx.ledgerTransaction.findUnique({where:{id:relatedId},select:{accountMode:true}}))?.accountMode||null;
	return null;
}

export async function createNotification(tx:NotificationStore,input:{
	userId:string;
	type:NotificationType;
	title:string;
	message:string;
	dedupeKey:string;
	actionUrl?:string;
	relatedEntity?:string;
	relatedId?:string;
}){
	const title=removeSimulatedLabels(input.title);
	const message=removeSimulatedLabels(input.message);
	const accountMode=await resolveNotificationMode(tx,input.relatedEntity,input.relatedId);
	const notification=await tx.notification.upsert({
		where:{dedupeKey:input.dedupeKey},
		update:{},
		create:{...input,title,message,accountMode},
	});
	await tx.pushOutbox.upsert({
		where:{notificationId:notification.id},
		update:{},
		create:{notificationId:notification.id,userId:input.userId},
	});
	return notification;
}

export async function notifyActiveAdmins(tx:NotificationStore,input:Omit<Parameters<typeof createNotification>[1],'userId'|'dedupeKey'> & {dedupeKey:string}){
	const admins=await tx.user.findMany({where:{role:'ADMIN',status:'ACTIVE'},select:{id:true}});
	return Promise.all(admins.map(admin=>createNotification(tx,{...input,userId:admin.id,dedupeKey:`admin:${admin.id}:${input.dedupeKey}`})));
}

export async function notifyActiveUsers(tx:NotificationStore,input:Omit<Parameters<typeof createNotification>[1],'userId'|'dedupeKey'> & {dedupeKey:string}){
	const users=await tx.user.findMany({where:{role:'USER',status:'ACTIVE'},select:{id:true}});
	if(!users.length)return;
	const accountMode=await resolveNotificationMode(tx,input.relatedEntity,input.relatedId);
	const notifications=users.map(user=>({
		id:randomUUID(),
		userId:user.id,
		type:input.type,
		title:removeSimulatedLabels(input.title),
		message:removeSimulatedLabels(input.message),
		dedupeKey:`${input.dedupeKey}:${user.id}`,
		relatedEntity:input.relatedEntity,
		relatedId:input.relatedId,
		actionUrl:input.actionUrl,
		accountMode,
	}));
	await tx.notification.createMany({data:notifications,skipDuplicates:true});
	const inserted=await tx.notification.findMany({where:{dedupeKey:{in:notifications.map(notification=>notification.dedupeKey)}},select:{id:true,userId:true}});
	await tx.pushOutbox.createMany({
		data:inserted.map(notification=>({id:randomUUID(),notificationId:notification.id,userId:notification.userId})),
		skipDuplicates:true,
	});
}