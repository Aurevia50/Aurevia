import {randomUUID} from 'node:crypto';
import {ManagedNotice,ManagedNoticeStatus,ManagedNoticeType,NoticeVisibility,Prisma} from '@prisma/client';

type NoticeStore=Prisma.TransactionClient;
const userVisibleNoticeTypes:NoticeVisibility[]=[NoticeVisibility.USERS,NoticeVisibility.SYSTEM_CRITICAL];

export async function deliverNoticeToActiveUsers(tx:NoticeStore,notice:ManagedNotice){
	if(notice.type!==ManagedNoticeType.ANNOUNCEMENT
		||!userVisibleNoticeTypes.includes(notice.visibility)
		||notice.status!==ManagedNoticeStatus.PUBLISHED
		||!notice.enabled
		||!notice.publishedAt)return;
	const users=await tx.user.findMany({where:{role:'USER',status:'ACTIVE'},select:{id:true}});
	if(!users.length)return;
	await tx.notification.createMany({
		data:users.map(user=>({
			id:randomUUID(),
			userId:user.id,
			type:'ANNOUNCEMENT',
			title:notice.title,
			message:notice.content,
			relatedEntity:'MANAGED_NOTICE',
			relatedId:`${notice.id}:${notice.publishedAt!.toISOString()}`,
			dedupeKey:`managed-notice:${notice.id}:${notice.publishedAt!.toISOString()}:${user.id}`,
		})),
		skipDuplicates:true,
	});
}

export async function deliverPublishedNoticesToUser(tx:NoticeStore,userId:string,now=new Date()){
	const notices=await tx.managedNotice.findMany({
		where:{
			type:ManagedNoticeType.ANNOUNCEMENT,
			status:ManagedNoticeStatus.PUBLISHED,
			enabled:true,
			visibility:{in:userVisibleNoticeTypes},
			OR:[{endsAt:null},{endsAt:{gt:now}}],
		},
		select:{id:true,title:true,content:true,publishedAt:true},
		take:100,
	});
	const notifications=notices.flatMap(notice=>notice.publishedAt?[{
		id:randomUUID(),
		userId,
		type:'ANNOUNCEMENT' as const,
		title:notice.title,
		message:notice.content,
		relatedEntity:'MANAGED_NOTICE',
		relatedId:`${notice.id}:${notice.publishedAt.toISOString()}`,
		dedupeKey:`managed-notice:${notice.id}:${notice.publishedAt.toISOString()}:${userId}`,
	}]:[]);
	if(notifications.length)await tx.notification.createMany({data:notifications,skipDuplicates:true});
}
