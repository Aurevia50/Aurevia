import {beforeEach,describe,expect,it,vi} from 'vitest';
import {CURRENT_TERMS_VERSION} from '@/lib/policy-consent';

const mocks=vi.hoisted(()=>({
	getServerSession:vi.fn(),
	requireUser:vi.fn(),
	requireAdmin:vi.fn(),
	findUnique:vi.fn(),
	createMany:vi.fn(),
	findUniqueOrThrow:vi.fn(),
	managedNoticeFindFirst:vi.fn(),
}));

vi.mock('next-auth',()=>({getServerSession:mocks.getServerSession}));
vi.mock('@/lib/auth-options',()=>({authOptions:{}}));
vi.mock('@/lib/auth',()=>({
	authFailureStatus:(error:unknown)=>error instanceof Error&&error.message==='UNAUTHORIZED'?401:error instanceof Error&&error.message==='FORBIDDEN'?403:null,
	requireUser:mocks.requireUser,
	requireAdmin:mocks.requireAdmin,
}));
vi.mock('@/lib/db',()=>({db:{termsAcceptance:{
	findUnique:mocks.findUnique,
	createMany:mocks.createMany,
	findUniqueOrThrow:mocks.findUniqueOrThrow,
},managedNotice:{findFirst:mocks.managedNoticeFindFirst}}}));

import {GET,POST} from '@/app/api/policy-consent/route';

const acceptanceRequest=(body:unknown,origin='https://aurevia.test')=>new Request('https://aurevia.test/api/policy-consent',{
	method:'POST',
	headers:{'content-type':'application/json',origin},
	body:JSON.stringify(body),
});

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.getServerSession.mockResolvedValue({user:{id:'user-a',role:'USER'}});
	mocks.requireUser.mockResolvedValue({id:'user-a'});
	mocks.requireAdmin.mockResolvedValue({id:'admin-a'});
	mocks.findUnique.mockResolvedValue(null);
	mocks.createMany.mockResolvedValue({count:1});
	mocks.findUniqueOrThrow.mockResolvedValue({version:CURRENT_TERMS_VERSION,acceptedAt:new Date('2026-11-10T12:00:00.000Z')});
	mocks.managedNoticeFindFirst.mockResolvedValue(null);
});

describe('policy consent API',()=>{
	it('reports current-version acceptance for only the authenticated user without caching',async()=>{
		mocks.findUnique.mockResolvedValueOnce({version:CURRENT_TERMS_VERSION,acceptedAt:new Date('2026-11-10T12:00:00.000Z')});
		const response=await GET();
		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		expect(await response.json()).toMatchObject({version:CURRENT_TERMS_VERSION,accepted:true,acceptedAt:'2026-11-10T12:00:00.000Z'});
		expect(mocks.requireUser).toHaveBeenCalledWith({skipTermsAcceptance:true});
		expect(mocks.findUnique).toHaveBeenCalledWith({
			where:{userId_version:{userId:'user-a',version:CURRENT_TERMS_VERSION}},
			select:{version:true,acceptedAt:true},
		});
	});

	it('reports an older acceptance version as requiring current acceptance',async()=>{
		const response=await GET();
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({version:CURRENT_TERMS_VERSION,accepted:false,acceptedAt:null});
		expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({
			where:{userId_version:{userId:'user-a',version:CURRENT_TERMS_VERSION}},
		}));
	});

	it('uses the currently published mandatory policy version',async()=>{
		mocks.managedNoticeFindFirst.mockResolvedValueOnce({version:'2026-11-10-v2'});
		mocks.findUnique.mockResolvedValueOnce({version:'2026-11-10-v2',acceptedAt:new Date('2026-11-10T12:00:00.000Z')});
		const response=await GET();
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({version:'2026-11-10-v2',accepted:true});
		expect(mocks.findUnique).toHaveBeenCalledWith({
			where:{userId_version:{userId:'user-a',version:'2026-11-10-v2'}},
			select:{version:true,acceptedAt:true},
		});
	});

	it('records acceptance for the published policy version rather than the legacy fallback',async()=>{
		mocks.managedNoticeFindFirst.mockResolvedValueOnce({version:'2026-11-10-v2'});
		mocks.findUniqueOrThrow.mockResolvedValueOnce({version:'2026-11-10-v2',acceptedAt:new Date('2026-11-10T12:00:00.000Z')});
		const response=await POST(acceptanceRequest({version:'2026-11-10-v2',accepted:true}));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({version:'2026-11-10-v2',accepted:true});
		expect(mocks.createMany).toHaveBeenCalledWith({
			data:[{userId:'user-a',version:'2026-11-10-v2'}],
			skipDuplicates:true,
		});
	});

	it('supports an authenticated administrator account',async()=>{
		mocks.getServerSession.mockResolvedValue({user:{id:'admin-a',role:'ADMIN'}});
		const response=await GET();
		expect(response.status).toBe(200);
		expect(mocks.requireAdmin).toHaveBeenCalledOnce();
		expect(mocks.requireAdmin).toHaveBeenCalledWith({skipTermsAcceptance:true});
		expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({
			where:{userId_version:{userId:'admin-a',version:CURRENT_TERMS_VERSION}},
		}));
	});

	it('requires the authenticated user and rejects unauthenticated requests',async()=>{
		mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED'));
		expect((await GET()).status).toBe(401);
		expect((await POST(acceptanceRequest({version:CURRENT_TERMS_VERSION,accepted:true}))).status).toBe(401);
		expect(mocks.createMany).not.toHaveBeenCalled();
	});

	it('rejects acceptance without explicit confirmation or with another user id',async()=>{
		expect((await POST(acceptanceRequest({version:CURRENT_TERMS_VERSION,accepted:false}))).status).toBe(400);
		expect((await POST(acceptanceRequest({version:CURRENT_TERMS_VERSION,accepted:true,userId:'user-b'}))).status).toBe(400);
		expect(mocks.createMany).not.toHaveBeenCalled();
	});

	it('rejects a stale terms version and requires the current version',async()=>{
		const response=await POST(acceptanceRequest({version:'2026-10-26',accepted:true}));
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({version:CURRENT_TERMS_VERSION});
		expect(mocks.createMany).not.toHaveBeenCalled();
	});

	it('records only the authenticated account and preserves the original timestamp on repeated acceptance',async()=>{
		const first=await POST(acceptanceRequest({version:CURRENT_TERMS_VERSION,accepted:true}));
		const second=await POST(acceptanceRequest({version:CURRENT_TERMS_VERSION,accepted:true}));
		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(await first.json()).toMatchObject({accepted:true,version:CURRENT_TERMS_VERSION,acceptedAt:'2026-11-10T12:00:00.000Z'});
		expect(mocks.createMany).toHaveBeenCalledTimes(2);
		expect(mocks.createMany).toHaveBeenCalledWith({
			data:[{userId:'user-a',version:CURRENT_TERMS_VERSION}],
			skipDuplicates:true,
		});
		expect(mocks.findUniqueOrThrow).toHaveBeenCalledTimes(2);
	});

	it('rejects cross-origin acceptance',async()=>{
		const response=await POST(acceptanceRequest({version:CURRENT_TERMS_VERSION,accepted:true},'https://attacker.test'));
		expect(response.status).toBe(403);
		expect(mocks.requireUser).not.toHaveBeenCalled();
		expect(mocks.getServerSession).not.toHaveBeenCalled();
		expect(mocks.createMany).not.toHaveBeenCalled();
	});

	it('does not report acceptance when persistence fails',async()=>{
		const errorLog=vi.spyOn(console,'error').mockImplementation(()=>{});
		mocks.createMany.mockRejectedValueOnce(new Error('database unavailable'));
		const response=await POST(acceptanceRequest({version:CURRENT_TERMS_VERSION,accepted:true}));
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({error:'We could not save your acceptance. Please try again.'});
		expect(errorLog).toHaveBeenCalledOnce();
		errorLog.mockRestore();
	});
});
