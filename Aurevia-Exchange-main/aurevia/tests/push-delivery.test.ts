import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	outboxFindMany:vi.fn(),outboxUpdateMany:vi.fn(),outboxFindUnique:vi.fn(),outboxUpdate:vi.fn(),
	preferenceFindUnique:vi.fn(),subscriptionFindMany:vi.fn(),subscriptionDeleteMany:vi.fn(),
	deliveryCreateMany:vi.fn(),deliveryFindMany:vi.fn(),deliveryUpdateMany:vi.fn(),deliveryFindUnique:vi.fn(),deliveryUpdate:vi.fn(),deliveryCount:vi.fn(),
	sendNotification:vi.fn(),setVapidDetails:vi.fn(),
}));

vi.mock('@/lib/db',()=>({db:{
	pushOutbox:{findMany:mocks.outboxFindMany,updateMany:mocks.outboxUpdateMany,findUnique:mocks.outboxFindUnique,update:mocks.outboxUpdate},
	pushPreference:{findUnique:mocks.preferenceFindUnique},
	pushSubscription:{findMany:mocks.subscriptionFindMany,deleteMany:mocks.subscriptionDeleteMany},
	pushDelivery:{createMany:mocks.deliveryCreateMany,findMany:mocks.deliveryFindMany,updateMany:mocks.deliveryUpdateMany,findUnique:mocks.deliveryFindUnique,update:mocks.deliveryUpdate,count:mocks.deliveryCount},
}}));
vi.mock('web-push',()=>({default:{sendNotification:mocks.sendNotification,setVapidDetails:mocks.setVapidDetails}}));

import {encryptBrowserSubscription,processPushQueue} from '@/lib/push-notifications';

const savedEnv={
	publicKey:process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
	privateKey:process.env.VAPID_PRIVATE_KEY,
	subject:process.env.VAPID_SUBJECT,
	encryptionKey:process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY,
};

beforeEach(()=>{
	vi.clearAllMocks();
	process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY='BOrandomPublicKey123456789012345678901234567890123456789';
	process.env.VAPID_PRIVATE_KEY='server-private-key';
	process.env.VAPID_SUBJECT='mailto:support@aurevia.example';
	process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY=Buffer.alloc(32,4).toString('base64');
	mocks.outboxFindMany.mockResolvedValueOnce([{id:'outbox-1'}]).mockResolvedValue([]);
	mocks.outboxUpdateMany.mockResolvedValue({count:1});
	mocks.outboxUpdate.mockResolvedValue({});
	mocks.outboxFindUnique.mockResolvedValue({id:'outbox-1',userId:'user-1',notification:{id:'notification-1',type:'ACCOUNT',relatedEntity:null,actionUrl:'/wallet',user:{status:'ACTIVE'}}});
	mocks.preferenceFindUnique.mockResolvedValue({accountActivity:true,investmentUpdates:true,announcements:false});
	mocks.subscriptionFindMany.mockResolvedValue([{id:'subscription-1',expiresAt:null}]);
	mocks.subscriptionDeleteMany.mockResolvedValue({count:1});
	mocks.deliveryCreateMany.mockResolvedValue({count:1});
	mocks.deliveryFindMany.mockResolvedValue([{id:'delivery-1'}]);
	mocks.deliveryUpdateMany.mockResolvedValue({count:1});
	const encrypted=encryptBrowserSubscription({
		endpoint:'https://fcm.googleapis.com/fcm/send/private-token',
		keys:{p256dh:Buffer.alloc(65,1).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')},
	});
	mocks.deliveryFindUnique.mockResolvedValue({
		id:'delivery-1',subscriptionId:'subscription-1',attempts:1,
		subscription:{id:'subscription-1',userId:'user-1',expiresAt:null,user:{status:'ACTIVE'},...encrypted},
		outbox:{notification:{id:'notification-1',type:'ACCOUNT',relatedEntity:null,actionUrl:'/wallet'}},
	});
	mocks.deliveryUpdate.mockResolvedValue({});
	mocks.deliveryCount.mockResolvedValue(0);
	mocks.sendNotification.mockResolvedValue({});
});

afterEach(()=>{
	if(savedEnv.publicKey===undefined)delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;else process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY=savedEnv.publicKey;
	if(savedEnv.privateKey===undefined)delete process.env.VAPID_PRIVATE_KEY;else process.env.VAPID_PRIVATE_KEY=savedEnv.privateKey;
	if(savedEnv.subject===undefined)delete process.env.VAPID_SUBJECT;else process.env.VAPID_SUBJECT=savedEnv.subject;
	if(savedEnv.encryptionKey===undefined)delete process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY;else process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY=savedEnv.encryptionKey;
});

describe('persistent Web Push delivery',()=>{
	it('expands committed notification events and records successful delivery',async()=>{
		const result=await processPushQueue();
		expect(result).toMatchObject({expanded:1,attempted:1,delivered:1});
		expect(mocks.sendNotification).toHaveBeenCalledWith(expect.objectContaining({endpoint:'https://fcm.googleapis.com/fcm/send/private-token'}),expect.stringContaining('"tag":"aurevia-'),expect.objectContaining({TTL:86_400,timeout:10_000}));
		expect(mocks.deliveryUpdate).toHaveBeenCalledWith(expect.objectContaining({where:{id:'delivery-1'},data:expect.objectContaining({status:'SENT',deliveredAt:expect.any(Date)})}));
	});

	it('removes permanently expired endpoints and marks their delivery failed',async()=>{
		mocks.sendNotification.mockRejectedValueOnce({statusCode:410});
		const result=await processPushQueue();
		expect(result.delivered).toBe(0);
		expect(mocks.subscriptionDeleteMany).toHaveBeenCalledWith({where:{id:'subscription-1'}});
		expect(mocks.deliveryUpdate).toHaveBeenCalledWith(expect.objectContaining({where:{id:'delivery-1'},data:expect.objectContaining({status:'FAILED',lastErrorCode:'SUBSCRIPTION_EXPIRED'})}));
	});

	it('keeps transient delivery failures queued for retry without throwing',async()=>{
		const log=vi.spyOn(console,'error').mockImplementation(()=>{});
		mocks.sendNotification.mockRejectedValueOnce({statusCode:503});
		const result=await processPushQueue();
		expect(result.attempted).toBe(1);
		expect(mocks.deliveryUpdate).toHaveBeenCalledWith(expect.objectContaining({where:{id:'delivery-1'},data:expect.objectContaining({status:'PENDING',lastErrorCode:'PUSH_HTTP_503',nextAttemptAt:expect.any(Date)})}));
		log.mockRestore();
	});

	it('honors a preference change before a queued delivery is sent',async()=>{
		mocks.preferenceFindUnique.mockResolvedValueOnce({accountActivity:true,investmentUpdates:true,announcements:false}).mockResolvedValueOnce({accountActivity:false,investmentUpdates:true,announcements:false});
		await processPushQueue();
		expect(mocks.sendNotification).not.toHaveBeenCalled();
		expect(mocks.deliveryUpdate).toHaveBeenCalledWith(expect.objectContaining({where:{id:'delivery-1'},data:expect.objectContaining({status:'FAILED',lastErrorCode:'PREFERENCE_DISABLED'})}));
	});
});
