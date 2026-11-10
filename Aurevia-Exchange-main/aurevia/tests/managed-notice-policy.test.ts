import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({managedNoticeFindFirst:vi.fn()}));

vi.mock('@/lib/db',()=>({db:{managedNotice:{findFirst:mocks.managedNoticeFindFirst}}}));

import {getCurrentMandatoryTermsDocument} from '@/lib/managed-notice-policy';

describe('managed notice policy queries',()=>{
	beforeEach(()=>vi.clearAllMocks());

	it('loads the published terms fields rendered by the public terms page',async()=>{
		const publishedAt=new Date('2026-11-10T12:00:00.000Z');
		const terms={title:'Terms v2',content:'Reviewed terms.',version:'v2',publishedAt,updatedAt:publishedAt};
		mocks.managedNoticeFindFirst.mockResolvedValue(terms);

		await expect(getCurrentMandatoryTermsDocument()).resolves.toEqual(terms);
		expect(mocks.managedNoticeFindFirst).toHaveBeenCalledWith(expect.objectContaining({
			where:expect.objectContaining({
				type:'TERMS',status:'PUBLISHED',enabled:true,visibility:'MANDATORY_ACCEPTANCE',
			}),
			select:{title:true,content:true,version:true,publishedAt:true,updatedAt:true},
		}));
	});
});
