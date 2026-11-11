import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireUser:vi.fn(),
	userFindUnique:vi.fn(),
	userFindUniqueOrThrow:vi.fn(),
	userUpdate:vi.fn(),
	sessionCreate:vi.fn(),
	sessionUpdate:vi.fn(),
	transaction:vi.fn(),
	createDiditSession:vi.fn(),
	diditIsConfigured:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireUser:mocks.requireUser}));
vi.mock('@/lib/db',()=>({db:{
	user:{findUnique:mocks.userFindUnique},
	diditVerificationSession:{update:mocks.sessionUpdate},
	$transaction:mocks.transaction,
}}));
vi.mock('@/lib/didit',()=>({
	createDiditSession:mocks.createDiditSession,
	diditIsConfigured:mocks.diditIsConfigured,
	mapDiditKycStatus:(status:string)=>status==='APPROVED'?'APPROVED':'PENDING',
}));
vi.mock('@/lib/config/env',()=>({getServerConfiguration:()=>({app:{url:'https://aurevia.test'},didit:{workflowId:'542d16b9-4cf3-451d-8470-8ae456c6e22b',environment:'sandbox'}})}));

import {POST} from '@/app/api/kyc/didit/session/route';

const sessionResult={
	sessionId:'4c5c7f3a-1f82-4f3b-8d8e-1a8d2d2f9b7a',
	url:'https://verify.didit.me/session/test',
	status:'NOT_STARTED',
	workflowId:'542d16b9-4cf3-451d-8470-8ae456c6e22b',
	vendorData:'user-1',
};

describe('Didit KYC session route',()=>{
	beforeEach(()=>{
		vi.clearAllMocks();
		mocks.requireUser.mockResolvedValue({id:'user-1',email:'session@example.test'});
		mocks.diditIsConfigured.mockReturnValue(true);
		mocks.userFindUnique.mockResolvedValue({status:'ACTIVE',accountMode:'REAL',kycStatus:'PENDING',email:'user@example.test',phone:null});
		mocks.userFindUniqueOrThrow.mockResolvedValue({status:'ACTIVE',accountMode:'REAL',kycStatus:'PENDING'});
		mocks.userUpdate.mockResolvedValue({});
		mocks.sessionCreate.mockResolvedValue({id:'internal-session-1'});
		mocks.sessionUpdate.mockResolvedValue({});
		mocks.createDiditSession.mockResolvedValue(sessionResult);
		mocks.transaction.mockImplementation(async(callback:(tx:unknown)=>Promise<unknown>)=>callback({
			user:{findUniqueOrThrow:mocks.userFindUniqueOrThrow,update:mocks.userUpdate},
			diditVerificationSession:{create:mocks.sessionCreate},
		}));
	});

	afterEach(()=>vi.unstubAllEnvs());

	it('creates a provider session bound to the authenticated user and returns only Didit’s validated redirect',async()=>{
		const response=await POST();

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(sessionResult);
		expect(mocks.createDiditSession).toHaveBeenCalledWith({
			vendorData:'user-1',
			callback:'https://aurevia.test/auth/didit/callback',
			email:'user@example.test',
		});
		expect(mocks.sessionCreate).toHaveBeenCalledWith({data:expect.objectContaining({
			userId:'user-1',vendorData:'user-1',status:'PENDING',environment:'sandbox',
		})});
		expect(mocks.sessionUpdate).toHaveBeenCalledWith(expect.objectContaining({
			where:{id:'internal-session-1'},
			data:expect.objectContaining({sessionId:sessionResult.sessionId}),
		}));
	});

	it('returns an explicit configuration error instead of pretending success or falling back',async()=>{
		mocks.diditIsConfigured.mockReturnValue(false);

		const response=await POST();

		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({error:expect.stringContaining('not configured')});
		expect(mocks.createDiditSession).not.toHaveBeenCalled();
		expect(mocks.sessionCreate).not.toHaveBeenCalled();
	});

	it('rejects non-REAL and already-approved accounts without creating a session',async()=>{
		mocks.userFindUnique.mockResolvedValueOnce({status:'ACTIVE',accountMode:'DEMO',kycStatus:'PENDING'});
		const nonReal=await POST();
		mocks.userFindUnique.mockResolvedValueOnce({status:'ACTIVE',accountMode:'REAL',kycStatus:'APPROVED'});
		const approved=await POST();

		expect(nonReal.status).toBe(403);
		expect(approved.status).toBe(409);
		expect(mocks.sessionCreate).not.toHaveBeenCalled();
	});
});
