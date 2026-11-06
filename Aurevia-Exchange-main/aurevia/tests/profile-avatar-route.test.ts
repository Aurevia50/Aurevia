import {beforeEach,describe,expect,it,vi} from 'vitest';
import {PNG} from 'pngjs';
import sharp from 'sharp';

const mocks=vi.hoisted(()=>({
	getServerSession:vi.fn(),
	createPrivateSignedUrl:vi.fn(),
	findUnique:vi.fn(),
	findUniqueOrThrow:vi.fn(),
	updateMany:vi.fn(),
	auditCreate:vi.fn(),
	transaction:vi.fn(),
	createNotification:vi.fn(),
	createPrivateObjectKey:vi.fn(),
	uploadPrivateObject:vi.fn(),
	deletePrivateObject:vi.fn(),
}));

vi.mock('next-auth',()=>({getServerSession:mocks.getServerSession}));
vi.mock('@/lib/auth-options',()=>({authOptions:{}}));
vi.mock('@/lib/db',()=>({db:{user:{findUnique:mocks.findUnique},$transaction:mocks.transaction}}));
vi.mock('@/lib/notifications',()=>({createNotification:mocks.createNotification}));
vi.mock('@/lib/private-storage',()=>({
	createPrivateObjectKey:mocks.createPrivateObjectKey,
	createPrivateSignedUrl:mocks.createPrivateSignedUrl,
	deletePrivateObject:mocks.deletePrivateObject,
	hasMatchingFileExtension:vi.fn(()=>true),
	PrivateStorageError:class PrivateStorageError extends Error {},
	uploadPrivateObject:mocks.uploadPrivateObject,
}));

import {GET,POST} from '../app/api/profile/avatar/route';

describe('profile avatar upload',()=>{
	beforeEach(()=>{
		vi.clearAllMocks();
		mocks.getServerSession.mockResolvedValue({user:{id:'verified-user',role:'USER'}});
		mocks.findUnique.mockResolvedValue({avatarKey:null});
		mocks.findUniqueOrThrow.mockResolvedValue({id:'verified-user'});
		mocks.updateMany.mockResolvedValue({count:1});
		mocks.auditCreate.mockResolvedValue({});
		mocks.transaction.mockImplementation(async callback=>callback({
			user:{findUnique:mocks.findUnique,findUniqueOrThrow:mocks.findUniqueOrThrow,updateMany:mocks.updateMany},
			auditLog:{create:mocks.auditCreate},
		}));
		mocks.createPrivateObjectKey.mockReturnValue('verified-user/avatar-key.webp');
		mocks.uploadPrivateObject.mockResolvedValue(undefined);
	});

	it('allows an administrator to view and audit a target user avatar',async()=>{
				mocks.getServerSession.mockResolvedValue({user:{id:'admin-1',role:'ADMIN'}});
				mocks.findUnique.mockResolvedValue({avatarKey:'user-2/avatar.webp'});
				mocks.createPrivateSignedUrl.mockResolvedValue('https://storage.example/avatar-signed-url');
				const response=await GET(new Request('https://aurevia.test/api/profile/avatar?userId=user-2'));

				expect(response.status).toBe(200);
				expect(await response.json()).toEqual({url:'https://storage.example/avatar-signed-url'});
				expect(mocks.createPrivateSignedUrl).toHaveBeenCalledWith('avatar','user-2','user-2/avatar.webp');
				expect(mocks.auditCreate).toHaveBeenCalledWith({data:{actorId:'admin-1',action:'ADMIN_USER_AVATAR_VIEWED',entity:'USER_AVATAR',entityId:'user-2',metadata:{hasAvatar:true}}});
			});

			it('does not allow a regular user to request another account avatar',async()=>{
				const response=await GET(new Request('https://aurevia.test/api/profile/avatar?userId=other-user'));

				expect(response.status).toBe(403);
				expect(mocks.findUnique).not.toHaveBeenCalled();
				expect(mocks.auditCreate).not.toHaveBeenCalled();
			});

			it('allows a verified user to change only the private avatar while identity details are locked',async()=>{
		const form=new FormData();
		form.set('file',new File([PNG.sync.write(new PNG({width:1,height:1}))],'avatar.png',{type:'image/png'}));
		const response=await POST(new Request('https://aurevia.test/api/profile/avatar',{method:'POST',body:form}));

		expect(response.status).toBe(201);
		expect(mocks.uploadPrivateObject).toHaveBeenCalledWith('avatar','verified-user','verified-user/avatar-key.webp',expect.any(Buffer),'image/webp');
		expect(await sharp(mocks.uploadPrivateObject.mock.calls[0][3]).metadata()).toMatchObject({format:'webp',width:1,height:1});
		expect(mocks.updateMany).toHaveBeenCalledWith({where:{id:'verified-user',avatarKey:null},data:{avatarKey:'verified-user/avatar-key.webp'}});
		expect(mocks.auditCreate).toHaveBeenCalled();
		expect(mocks.createNotification).toHaveBeenCalled();
	});

	it('rejects image data that only matches a supported file signature',async()=>{
		const form=new FormData();
		form.set('file',new File([Uint8Array.of(137,80,78,71,13,10,26,10)],'avatar.png',{type:'image/png'}));
		const response=await POST(new Request('https://aurevia.test/api/profile/avatar',{method:'POST',body:form}));

		expect(response.status).toBe(415);
		expect(mocks.uploadPrivateObject).not.toHaveBeenCalled();
	});

	it('rejects images exceeding the per-side dimension limit',async()=>{
		const oversizedPng=PNG.sync.write(new PNG({width:8_001,height:1}));
		const form=new FormData();
		form.set('file',new File([oversizedPng],'avatar.png',{type:'image/png'}));
		const response=await POST(new Request('https://aurevia.test/api/profile/avatar',{method:'POST',body:form}));

		expect(response.status).toBe(400);
		expect(mocks.uploadPrivateObject).not.toHaveBeenCalled();
	});
});