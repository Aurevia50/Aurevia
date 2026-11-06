import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireUser:vi.fn(),
	requireAdmin:vi.fn(),
	userFindUnique:vi.fn(),
	orderFindFirst:vi.fn(),
	orderFindMany:vi.fn(),
	positionFindFirst:vi.fn(),
	positionFindMany:vi.fn(),
	investmentFindFirst:vi.fn(),
	investmentFindMany:vi.fn(),
	fundingFindFirst:vi.fn(),
	fundingFindMany:vi.fn(),
	ledgerFindFirst:vi.fn(),
	ledgerFindMany:vi.fn(),
	preferenceUpsert:vi.fn(),
	preferenceFindMany:vi.fn(),
	preferenceUpdateMany:vi.fn(),
	preferenceCreateMany:vi.fn(),
	preferenceDeleteMany:vi.fn(),
	auditCreateMany:vi.fn(),
	notifications:vi.fn(),
	notificationFindFirst:vi.fn(),
	notificationDeleteMany:vi.fn(),
	transaction:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireUser:mocks.requireUser,requireAdmin:mocks.requireAdmin}));
vi.mock('@/lib/db',()=>({db:{
	user:{findUnique:mocks.userFindUnique},
	order:{findFirst:mocks.orderFindFirst,findMany:mocks.orderFindMany},
	position:{findFirst:mocks.positionFindFirst,findMany:mocks.positionFindMany},
	investmentRequest:{findFirst:mocks.investmentFindFirst,findMany:mocks.investmentFindMany},
	fundingRequest:{findFirst:mocks.fundingFindFirst,findMany:mocks.fundingFindMany},
	ledgerEntry:{findFirst:mocks.ledgerFindFirst,findMany:mocks.ledgerFindMany},
	activityVisibilityPreference:{upsert:mocks.preferenceUpsert,findMany:mocks.preferenceFindMany,updateMany:mocks.preferenceUpdateMany,createMany:mocks.preferenceCreateMany,deleteMany:mocks.preferenceDeleteMany},
	notification:{findMany:mocks.notifications,findFirst:mocks.notificationFindFirst,deleteMany:mocks.notificationDeleteMany},
	auditLog:{createMany:mocks.auditCreateMany},
	$transaction:mocks.transaction,
}}));

import {POST as userManage} from '@/app/api/activity/manage/route';
import {POST as adminManage} from '@/app/api/admin/activity/route';

const makeRequest=(url:string,body:unknown)=>new Request(`https://aurevia.test${url}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

const tx={
	order:{findFirst:mocks.orderFindFirst,findMany:mocks.orderFindMany},
	position:{findFirst:mocks.positionFindFirst,findMany:mocks.positionFindMany},
	investmentRequest:{findFirst:mocks.investmentFindFirst,findMany:mocks.investmentFindMany},
	fundingRequest:{findFirst:mocks.fundingFindFirst,findMany:mocks.fundingFindMany},
	ledgerEntry:{findFirst:mocks.ledgerFindFirst,findMany:mocks.ledgerFindMany},
	activityVisibilityPreference:{upsert:mocks.preferenceUpsert,findMany:mocks.preferenceFindMany,updateMany:mocks.preferenceUpdateMany,createMany:mocks.preferenceCreateMany,deleteMany:mocks.preferenceDeleteMany},
	notification:{findMany:mocks.notifications,findFirst:mocks.notificationFindFirst,deleteMany:mocks.notificationDeleteMany},
	auditLog:{createMany:mocks.auditCreateMany},
};

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.requireUser.mockResolvedValue({id:'owner-1'});
	mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
	mocks.userFindUnique.mockResolvedValue({accountMode:'DEMO',status:'ACTIVE'});
	mocks.orderFindFirst.mockResolvedValue({id:'order-1',status:'CANCELLED'});
	mocks.orderFindMany.mockResolvedValue([]);
	mocks.positionFindFirst.mockResolvedValue({id:'position-1',status:'CLOSED'});
	mocks.positionFindMany.mockResolvedValue([]);
	mocks.investmentFindFirst.mockResolvedValue({id:'investment-1'});
	mocks.investmentFindMany.mockResolvedValue([]);
	mocks.fundingFindFirst.mockResolvedValue({id:'funding-1'});
	mocks.fundingFindMany.mockResolvedValue([]);
	mocks.ledgerFindFirst.mockResolvedValue({id:'ledger-entry-1'});
	mocks.ledgerFindMany.mockResolvedValue([]);
	mocks.preferenceUpsert.mockResolvedValue({});
	mocks.preferenceFindMany.mockResolvedValue([]);
	mocks.preferenceUpdateMany.mockResolvedValue({count:0});
	mocks.preferenceCreateMany.mockResolvedValue({count:0});
	mocks.preferenceDeleteMany.mockResolvedValue({count:0});
	mocks.auditCreateMany.mockResolvedValue({count:0});
	mocks.notifications.mockResolvedValue([]);
	mocks.notificationFindFirst.mockResolvedValue({id:'notification-1'});
	mocks.notificationDeleteMany.mockResolvedValue({count:1});
	mocks.transaction.mockImplementation(async(operation:(transaction:typeof tx)=>unknown)=>operation(tx));
});

describe('user activity management',()=>{
	it('archives only a record owned by the authenticated user and current mode',async()=>{
		const response=await userManage(makeRequest('/api/activity/manage',{action:'archive',items:[{source:'order',id:'order-1'}]}));
		expect(response.status).toBe(200);
		expect(mocks.orderFindFirst).toHaveBeenCalledWith({where:{id:'order-1',userId:'owner-1',accountMode:'DEMO'},select:{id:true,status:true}});
		expect(mocks.preferenceUpsert).toHaveBeenCalledWith(expect.objectContaining({where:{userId_accountMode_sourceType_sourceId:{userId:'owner-1',accountMode:'DEMO',sourceType:'order',sourceId:'order-1'}}}));
	});

	it('does not create preferences for a forged or foreign record identifier',async()=>{
		mocks.orderFindFirst.mockResolvedValueOnce(null);
		const response=await userManage(makeRequest('/api/activity/manage',{action:'hide',items:[{source:'order',id:'belongs-to-someone-else'}]}));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({affected:0,results:[{eligible:false}]});
		expect(mocks.preferenceUpsert).not.toHaveBeenCalled();
	});

	it('refuses to hide an open order even when the owner is correct',async()=>{
		mocks.orderFindFirst.mockResolvedValueOnce({id:'order-1',status:'OPEN'});
		const response=await userManage(makeRequest('/api/activity/manage',{action:'hide',items:[{source:'order',id:'order-1'}]}));
		expect(await response.json()).toMatchObject({affected:0,results:[{eligible:false,reason:'An open order cannot be archived or removed from the feed.'}]});
		expect(mocks.preferenceUpsert).not.toHaveBeenCalled();
	});

	it('processes eligible bulk items while retaining an active position',async()=>{
		mocks.positionFindFirst.mockResolvedValueOnce({id:'position-1',status:'OPEN'});
		const response=await userManage(makeRequest('/api/activity/manage',{action:'hide',items:[{source:'order',id:'order-1'},{source:'position',id:'position-1'}]}));
		expect(await response.json()).toMatchObject({affected:1,results:[{eligible:true},{eligible:false}]});
		expect(mocks.preferenceUpsert).toHaveBeenCalledTimes(1);
	});

	it('clears only completed DEMO activity without querying REAL financial histories',async()=>{
		const response=await userManage(makeRequest('/api/activity/manage',{action:'clear'}));
		expect(response.status).toBe(200);
		expect(mocks.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({where:{userId:'owner-1',accountMode:'DEMO',status:{in:['FILLED','CANCELLED','REJECTED']}}}));
		expect(mocks.fundingFindMany).not.toHaveBeenCalled();
		expect(mocks.investmentFindMany).not.toHaveBeenCalled();
		expect(mocks.ledgerFindMany).not.toHaveBeenCalled();
	});

	it('skips previously removed records so a repeated clear can continue through history',async()=>{
		mocks.preferenceFindMany.mockResolvedValueOnce([{sourceType:'order',sourceId:'order-1'}]);
		const response=await userManage(makeRequest('/api/activity/manage',{action:'clear'}));
		expect(response.status).toBe(200);
		expect(mocks.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:{notIn:['order-1']}})}));
	});

	it('permanently deletes only a read, delivery-free notification in the active mode',async()=>{
		const response=await userManage(makeRequest('/api/activity/manage',{action:'permanently-delete',items:[{source:'notification',id:'notification-1'}]}));
		expect(response.status).toBe(200);
		expect(mocks.notificationFindFirst).toHaveBeenCalledWith({where:{id:'notification-1',userId:'owner-1',isRead:true,pushOutbox:null,OR:[{accountMode:'DEMO'},{accountMode:null}]},select:{id:true}});
		expect(mocks.notificationDeleteMany).toHaveBeenCalled();
		expect(mocks.preferenceDeleteMany).toHaveBeenCalledWith({where:{userId:'owner-1',sourceType:'notification',sourceId:'notification-1'}});
	});

	it('refuses to permanently delete financial activity through the activity manager',async()=>{
		const response=await userManage(makeRequest('/api/activity/manage',{action:'permanently-delete',items:[{source:'order',id:'order-1'}]}));
		expect(await response.json()).toMatchObject({affected:0,results:[{eligible:false}]});
		expect(mocks.orderFindFirst).not.toHaveBeenCalled();
		expect(mocks.notificationDeleteMany).not.toHaveBeenCalled();
	});
});

describe('administrator activity management',()=>{
	it('permits authorized cross-user activity removal and writes a protected audit event',async()=>{
		mocks.userFindUnique.mockResolvedValueOnce({id:'target-1',status:'ACTIVE'});
		const response=await adminManage(makeRequest('/api/admin/activity',{action:'hide',targetUserId:'target-1',accountMode:'REAL',reason:'User request',items:[{source:'order',id:'order-1'}]}));
		expect(response.status).toBe(200);
		expect(mocks.orderFindFirst).toHaveBeenCalledWith({where:{id:'order-1',userId:'target-1',accountMode:'REAL'},select:{id:true,status:true}});
		expect(mocks.auditCreateMany).toHaveBeenCalledWith({data:[expect.objectContaining({
			actorId:'admin-1',action:'ADMIN_ACTIVITY_HIDE',entity:'ACTIVITY_MANAGEMENT',entityId:'order-1',
			metadata:expect.objectContaining({targetUserId:'target-1',accountMode:'REAL',activityType:'order',outcome:'SUCCESS',reason:'User request'}),
		})]});
	});

	it('rejects unauthorized users before resolving target records',async()=>{
		mocks.requireAdmin.mockRejectedValueOnce(new Error('FORBIDDEN'));
		const response=await adminManage(makeRequest('/api/admin/activity',{action:'clear',targetUserId:'target-1',accountMode:'DEMO'}));
		expect(response.status).toBe(403);
		expect(mocks.userFindUnique).not.toHaveBeenCalled();
		expect(mocks.auditCreateMany).not.toHaveBeenCalled();
	});

	it('audits permanent deletion of eligible notifications across a selected user account',async()=>{
		mocks.userFindUnique.mockResolvedValueOnce({id:'target-1',status:'ACTIVE'});
		const response=await adminManage(makeRequest('/api/admin/activity',{action:'permanently-delete',targetUserId:'target-1',accountMode:'DEMO',items:[{source:'notification',id:'notification-1'}]}));
		expect(response.status).toBe(200);
		expect(mocks.auditCreateMany).toHaveBeenCalledWith({data:[expect.objectContaining({
			actorId:'admin-1',action:'ADMIN_ACTIVITY_PERMANENTLY_DELETE',entity:'ACTIVITY_MANAGEMENT',entityId:'notification-1',
			metadata:expect.objectContaining({targetUserId:'target-1',activityType:'notification',outcome:'SUCCESS'}),
		})]});
	});
});
