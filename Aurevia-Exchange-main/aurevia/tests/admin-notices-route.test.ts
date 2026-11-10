import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireAdmin:vi.fn(),
	managedNoticeFindMany:vi.fn(),
	managedNoticeFindUnique:vi.fn(),
	managedNoticeFindUniqueOrThrow:vi.fn(),
	managedNoticeFindFirst:vi.fn(),
	managedNoticeCreate:vi.fn(),
	managedNoticeUpdateMany:vi.fn(),
	userFindMany:vi.fn(),
	notificationCreateMany:vi.fn(),
	termsAcceptanceFindMany:vi.fn(),
	termsAcceptanceCount:vi.fn(),
	auditLogFindMany:vi.fn(),
	auditLogCreate:vi.fn(),
	transaction:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireAdmin:mocks.requireAdmin}));
vi.mock('@/lib/db',()=>({db:{
	managedNotice:{
		findMany:mocks.managedNoticeFindMany,
		findUnique:mocks.managedNoticeFindUnique,
		findUniqueOrThrow:mocks.managedNoticeFindUniqueOrThrow,
		findFirst:mocks.managedNoticeFindFirst,
		create:mocks.managedNoticeCreate,
		updateMany:mocks.managedNoticeUpdateMany,
	},
	termsAcceptance:{findMany:mocks.termsAcceptanceFindMany,count:mocks.termsAcceptanceCount},
	auditLog:{findMany:mocks.auditLogFindMany},
	$transaction:mocks.transaction,
}}));
vi.mock('@/lib/push-notifications',()=>({isSameOriginRequest:(request:Request)=>request.headers.get('origin')==='https://aurevia.test'}));

import {GET,PATCH,POST} from '@/app/api/admin/notices/route';

const request=(method:string,body?:unknown,origin='https://aurevia.test')=>new Request('https://aurevia.test/api/admin/notices',{
	method,headers:{origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),
});

const draftNotice={
	id:'notice-1',type:'ANNOUNCEMENT',title:'Service update',content:'Service update details.',
	version:null,visibility:'HIDDEN',status:'DRAFT',enabled:false,startsAt:null,endsAt:null,
	publishedAt:null,unpublishedAt:null,createdAt:new Date('2026-11-10T12:00:00.000Z'),
	updatedAt:new Date('2026-11-10T12:00:00.000Z'),
};

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
	mocks.managedNoticeFindMany.mockResolvedValue([]);
	mocks.managedNoticeFindUnique.mockResolvedValue(draftNotice);
	mocks.managedNoticeFindUniqueOrThrow.mockResolvedValue(draftNotice);
	mocks.managedNoticeFindFirst.mockResolvedValue(null);
	mocks.managedNoticeCreate.mockResolvedValue(draftNotice);
	mocks.managedNoticeUpdateMany.mockResolvedValue({count:1});
	mocks.userFindMany.mockResolvedValue([{id:'user-1'},{id:'user-2'}]);
	mocks.notificationCreateMany.mockResolvedValue({count:2});
	mocks.termsAcceptanceFindMany.mockResolvedValue([]);
	mocks.termsAcceptanceCount.mockResolvedValue(0);
	mocks.auditLogFindMany.mockResolvedValue([]);
	mocks.auditLogCreate.mockResolvedValue({});
	mocks.transaction.mockImplementation(async(operation:(tx:unknown)=>unknown)=>operation({
		managedNotice:{
			findUnique:mocks.managedNoticeFindUnique,findUniqueOrThrow:mocks.managedNoticeFindUniqueOrThrow,
			findFirst:mocks.managedNoticeFindFirst,create:mocks.managedNoticeCreate,updateMany:mocks.managedNoticeUpdateMany,
		},
		user:{findMany:mocks.userFindMany},
		notification:{createMany:mocks.notificationCreateMany},
		auditLog:{create:mocks.auditLogCreate},
	}));
});

describe('admin Notices & Conditions API',()=>{
	it('requires an administrator before returning notices, history, or acceptance records',async()=>{
		mocks.requireAdmin.mockRejectedValueOnce(new Error('FORBIDDEN'));
		const response=await GET(request('GET'));
		expect(response.status).toBe(403);
		expect(mocks.managedNoticeFindMany).not.toHaveBeenCalled();
		expect(mocks.termsAcceptanceFindMany).not.toHaveBeenCalled();
	});

	it('returns private no-store management data to an administrator',async()=>{
		const response=await GET(request('GET'));
		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		expect(await response.json()).toMatchObject({notices:[],acceptances:[],history:[],acceptanceTotal:0});
		expect(mocks.termsAcceptanceFindMany).toHaveBeenCalledWith(expect.objectContaining({take:50,skip:0}));
	});

	it('creates a hidden, disabled draft and records its initial snapshot',async()=>{
		const response=await POST(request('POST',{
			type:'ANNOUNCEMENT',title:'Service update',content:'Service update details.',visibility:'HIDDEN',
			startsAt:null,endsAt:null,
		}));
		expect(response.status).toBe(201);
		expect(mocks.managedNoticeCreate).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
			status:'DRAFT',enabled:false,visibility:'HIDDEN',createdById:'admin-1',updatedById:'admin-1',
		})}));
		expect(mocks.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
			actorId:'admin-1',action:'MANAGED_NOTICE_CREATED',entity:'MANAGED_NOTICE',entityId:'notice-1',
		})}));
	});

	it('rejects policy versions with incompatible visibility and rejects cross-origin changes',async()=>{
		const invalidPolicy=await POST(request('POST',{
			type:'TERMS',title:'Terms v2',content:'Reviewed legal text.',version:'v2',visibility:'USERS',
		}));
		expect(invalidPolicy.status).toBe(400);
		expect(mocks.transaction).not.toHaveBeenCalled();
		expect((await POST(request('POST',{type:'ANNOUNCEMENT',title:'Service update',content:'Details.',visibility:'USERS'},'https://attacker.test'))).status).toBe(403);
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('publishes explicitly and records the before-and-after state',async()=>{
		const response=await PATCH(request('PATCH',{action:'publish',id:'notice-1'}));
		expect(response.status).toBe(200);
		expect(mocks.managedNoticeUpdateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
			status:'PUBLISHED',enabled:true,publishedAt:expect.any(Date),updatedById:'admin-1',
		})}));
		expect(mocks.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
			action:'MANAGED_NOTICE_PUBLISH',entityId:'notice-1',metadata:expect.objectContaining({before:expect.any(Object),after:expect.any(Object)}),
		})}));
	});

	it('delivers user-visible announcements only to active user inboxes',async()=>{
		mocks.managedNoticeFindUnique.mockResolvedValueOnce({...draftNotice,visibility:'USERS'});
		const publishedAt=new Date('2026-11-10T12:00:00.000Z');
		mocks.managedNoticeFindUniqueOrThrow.mockResolvedValueOnce({...draftNotice,visibility:'USERS',status:'PUBLISHED',enabled:true,publishedAt});
		const response=await PATCH(request('PATCH',{action:'publish',id:'notice-1'}));
		expect(response.status).toBe(200);
		expect(mocks.userFindMany).toHaveBeenCalledWith({where:{role:'USER',status:'ACTIVE'},select:{id:true}});
		expect(mocks.notificationCreateMany).toHaveBeenCalledWith(expect.objectContaining({
			skipDuplicates:true,
			data:expect.arrayContaining([
				expect.objectContaining({userId:'user-1',relatedEntity:'MANAGED_NOTICE',type:'ANNOUNCEMENT'}),
				expect.objectContaining({userId:'user-2',relatedEntity:'MANAGED_NOTICE',type:'ANNOUNCEMENT'}),
			]),
		}));
	});

	it('does not allow modifying a policy document after it has been published',async()=>{
		mocks.managedNoticeFindUnique.mockResolvedValueOnce({...draftNotice,type:'TERMS',version:'v1',publishedAt:new Date()});
		const response=await PATCH(request('PATCH',{action:'update',id:'notice-1',title:'Changed terms'}));
		expect(response.status).toBe(409);
		expect(mocks.managedNoticeUpdateMany).not.toHaveBeenCalled();
	});
});
