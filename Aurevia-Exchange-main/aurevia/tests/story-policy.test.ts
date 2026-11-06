import {describe,expect,it} from 'vitest';
import {StoryStatus,StoryVisibility} from '@prisma/client';
import {isStoryVisibleTo,storyExpirationIsValid} from '../lib/story-policy';

const now=new Date('2026-10-30T12:00:00.000Z');

function state(overrides:Partial<Parameters<typeof isStoryVisibleTo>[0]>={}){
	return {
		status:StoryStatus.PUBLISHED,
		visibility:StoryVisibility.PUBLIC,
		publishAt:new Date('2026-10-30T11:00:00.000Z'),
		publishedAt:new Date('2026-10-30T11:00:00.000Z'),
		expiresAt:null,
		deletedAt:null,
		...overrides,
	};
}

describe('public story visibility policy',()=>{
	it('shows published public stories to visitors',()=>{
		expect(isStoryVisibleTo(state(),now,false)).toBe(true);
	});

	it('hides drafts, archived stories, and future publications',()=>{
		expect(isStoryVisibleTo(state({status:StoryStatus.DRAFT}),now,true)).toBe(false);
		expect(isStoryVisibleTo(state({status:StoryStatus.ARCHIVED}),now,true)).toBe(false);
		expect(isStoryVisibleTo(state({status:StoryStatus.SCHEDULED,publishAt:new Date('2026-10-30T13:00:00.000Z')}),now,true)).toBe(false);
	});

	it('reveals scheduled stories once their publication time arrives',()=>{
		expect(isStoryVisibleTo(state({status:StoryStatus.SCHEDULED,publishAt:now,publishedAt:null}),now,false)).toBe(true);
	});

	it('hides expired and deleted stories',()=>{
		expect(isStoryVisibleTo(state({expiresAt:now}),now,true)).toBe(false);
		expect(isStoryVisibleTo(state({deletedAt:now}),now,true)).toBe(false);
	});

	it('limits members-only stories to authenticated members',()=>{
		expect(isStoryVisibleTo(state({visibility:StoryVisibility.REGISTERED_USERS}),now,false)).toBe(false);
		expect(isStoryVisibleTo(state({visibility:StoryVisibility.REGISTERED_USERS}),now,true)).toBe(true);
	});
});

describe('story expiration policy',()=>{
	it('requires expiration to follow a scheduled publication time',()=>{
		expect(storyExpirationIsValid(new Date('2026-10-31T12:00:00.000Z'),new Date('2026-10-31T12:01:00.000Z'),now)).toBe(true);
		expect(storyExpirationIsValid(new Date('2026-10-31T12:00:00.000Z'),new Date('2026-10-31T11:59:00.000Z'),now)).toBe(false);
	});
});
