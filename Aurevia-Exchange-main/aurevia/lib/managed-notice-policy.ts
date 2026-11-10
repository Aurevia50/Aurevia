import {ManagedNoticeStatus,ManagedNoticeType,NoticeVisibility,Prisma} from '@prisma/client';
import {db} from '@/lib/db';

export function activePolicyWhere(type:ManagedNoticeType,visibility:NoticeVisibility,now=new Date()):Prisma.ManagedNoticeWhereInput{
	return {
		type,
		status:ManagedNoticeStatus.PUBLISHED,
		enabled:true,
		visibility,
		OR:[{startsAt:null},{startsAt:{lte:now}}],
		AND:[{OR:[{endsAt:null},{endsAt:{gt:now}}]}],
	};
}

export function getCurrentMandatoryTerms(now=new Date()){
	return db.managedNotice.findFirst({
		where:currentMandatoryTermsWhere(now),
		orderBy:[{publishedAt:'desc'},{createdAt:'desc'}],
		select:{version:true},
	});
}

export function getCurrentMandatoryTermsDocument(now=new Date()){
	return db.managedNotice.findFirst({
		where:currentMandatoryTermsWhere(now),
		orderBy:[{publishedAt:'desc'},{createdAt:'desc'}],
		select:{title:true,content:true,version:true,publishedAt:true,updatedAt:true},
	});
}

export function currentMandatoryTermsWhere(now=new Date()){
	return activePolicyWhere(ManagedNoticeType.TERMS,NoticeVisibility.MANDATORY_ACCEPTANCE,now);
}

export function getCurrentPrivacyPolicy(now=new Date()){
	return db.managedNotice.findFirst({
		where:activePolicyWhere(ManagedNoticeType.PRIVACY,NoticeVisibility.USERS,now),
		orderBy:[{publishedAt:'desc'},{createdAt:'desc'}],
	});
}
