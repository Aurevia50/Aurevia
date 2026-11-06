import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireUser:vi.fn(),findUnique:vi.fn(),create:vi.fn(),update:vi.fn(),deleteMany:vi.fn(),preferenceUpsert:vi.fn(),transaction:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireUser:mocks.requireUser}));
vi.mock('@/lib/db',()=>({db:{
	pushSubscription:{findUnique:mocks.findUnique,create:mocks.create,update:mocks.update,deleteMany:mocks.deleteMany},
	pushPreference:{upsert:mocks.preferenceUpsert},
	$transaction:mocks.transaction,
}}));

import {DELETE,POST} from '@/app/api/push/subscriptions/route';

const originalEnv={
	publicKey:process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
	privateKey:process.env.VAPID_PRIVATE_KEY,
	subject:process.env.VAPID_SUBJECT,
	encryptionKey:process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY,
};
const subscription={
	endpoint:'https://fcm.googleapis.com/fcm/send/secret-token',
	expirationTime:null,
	keys:{p256dh:Buffer.alloc(65,1).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')},
};
const request=(path:string,method:string,body:unknown)=>new Request(`https://aurevia.test${path}`,{
	method,
	headers:{origin:'https://aurevia.test','content-type':'application/json'},
	body:JSON.stringify(body),
});

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.requireUser.mockResolvedValue({id:'user-1'});
	mocks.findUnique.mockResolvedValue(null);
	mocks.create.mockResolvedValue({id:'subscription-1'});
	mocks.update.mockResolvedValue({id:'subscription-1'});
	mocks.deleteMany.mockResolvedValue({count:1});
	mocks.preferenceUpsert.mockResolvedValue({});
	mocks.transaction.mockImplementation(async(operation:((tx:unknown)=>unknown))=>operation({
		pushSubscription:{create:mocks.create,update:mocks.update},
		pushPreference:{upsert:mocks.preferenceUpsert},
	}));
	process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY='BOrandomPublicKey123456789012345678901234567890123456789';
	process.env.VAPID_PRIVATE_KEY='server-private-key';
	process.env.VAPID_SUBJECT='mailto:support@aurevia.example';
	process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY=Buffer.alloc(32,3).toString('base64');
});

afterEach(()=>{
	if(originalEnv.publicKey===undefined)delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;else process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY=originalEnv.publicKey;
	if(originalEnv.privateKey===undefined)delete process.env.VAPID_PRIVATE_KEY;else process.env.VAPID_PRIVATE_KEY=originalEnv.privateKey;
	if(originalEnv.subject===undefined)delete process.env.VAPID_SUBJECT;else process.env.VAPID_SUBJECT=originalEnv.subject;
	if(originalEnv.encryptionKey===undefined)delete process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY;else process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY=originalEnv.encryptionKey;
});

describe('authenticated browser push subscriptions',()=>{
	it('stores an encrypted subscription under the authenticated owner',async()=>{
		const response=await POST(request('/api/push/subscriptions','POST',subscription));
		expect(response.status).toBe(200);
		expect(mocks.create).toHaveBeenCalledWith({data:expect.objectContaining({
			userId:'user-1',
			endpointHash:expect.stringMatching(/^[a-f0-9]{64}$/),
			ciphertext:expect.any(String),
			iv:expect.any(String),
			authTag:expect.any(String),
		})});
		const stored=mocks.create.mock.calls[0][0].data;
		expect(stored.ciphertext).not.toContain(subscription.endpoint);
		expect(mocks.preferenceUpsert).toHaveBeenCalledWith(expect.objectContaining({where:{userId:'user-1'}}));
	});

	it('updates the same account subscription and refuses a subscription owned by another user',async()=>{
		mocks.findUnique.mockResolvedValueOnce({id:'subscription-1',userId:'user-1'});
		const ownResponse=await POST(request('/api/push/subscriptions','POST',subscription));
		expect(ownResponse.status).toBe(200);
		expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:'subscription-1',userId:'user-1'}}));

		mocks.findUnique.mockResolvedValueOnce({id:'subscription-2',userId:'user-2'});
		const otherResponse=await POST(request('/api/push/subscriptions','POST',subscription));
		expect(otherResponse.status).toBe(409);
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it('removes only the matching subscription owned by the signed-in user',async()=>{
		const response=await DELETE(request('/api/push/subscriptions','DELETE',{endpoint:subscription.endpoint}));
		expect(response.status).toBe(200);
		expect(mocks.deleteMany).toHaveBeenCalledWith({where:{userId:'user-1',endpointHash:expect.stringMatching(/^[a-f0-9]{64}$/)}});
	});

	it('rejects cross-origin, malformed and unauthenticated requests',async()=>{
		const crossOrigin=new Request('https://aurevia.test/api/push/subscriptions',{method:'POST',headers:{origin:'https://attacker.test','content-type':'application/json'},body:JSON.stringify(subscription)});
		expect((await POST(crossOrigin)).status).toBe(403);
		expect((await POST(request('/api/push/subscriptions','POST',{...subscription,endpoint:'https://127.0.0.1:9443/internal'}))).status).toBe(400);
		mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED'));
		expect((await POST(request('/api/push/subscriptions','POST',subscription))).status).toBe(401);
	});
});
