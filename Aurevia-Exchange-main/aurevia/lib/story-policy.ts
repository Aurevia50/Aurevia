import {StoryStatus,StoryVisibility} from '@prisma/client';

type StoryVisibilityState={
	status:StoryStatus;
	visibility:StoryVisibility;
	publishAt:Date|null;
	publishedAt:Date|null;
	expiresAt:Date|null;
	deletedAt:Date|null;
};

export function isStoryVisibleTo(state:StoryVisibilityState,now:Date,includeMemberStories:boolean){
	if(state.deletedAt||(state.expiresAt&&state.expiresAt<=now))return false;
	if(state.visibility===StoryVisibility.REGISTERED_USERS&&!includeMemberStories)return false;
	if(state.status===StoryStatus.PUBLISHED)return Boolean(state.publishedAt&&state.publishedAt<=now);
	return state.status===StoryStatus.SCHEDULED&&Boolean(state.publishAt&&state.publishAt<=now);
}

export function publicStoryWhere(now:Date,includeMemberStories:boolean){
	return {
		deletedAt:null,
		...(includeMemberStories?{}:{visibility:StoryVisibility.PUBLIC}),
		OR:[
			{status:StoryStatus.PUBLISHED,publishedAt:{lte:now}},
			{status:StoryStatus.SCHEDULED,publishAt:{lte:now}},
		],
		AND:[{OR:[{expiresAt:null},{expiresAt:{gt:now}}]}],
	};
}

export function storyExpirationIsValid(publishAt:Date|null,expiresAt:Date|null,now:Date){
	return !expiresAt||expiresAt>(publishAt??now);
}
