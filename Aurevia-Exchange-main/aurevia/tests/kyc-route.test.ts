import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireUser:vi.fn(),
	userFindUnique:vi.fn(),
	profileFindUnique:vi.fn(),
	diditFindFirst:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireUser:mocks.requireUser}));
vi.mock('@/lib/db',()=>({db:{
	user:{findUnique:mocks.userFindUnique},
	kycProfile:{findUnique:mocks.profileFindUnique},
	diditVerificationSession:{findFirst:mocks.diditFindFirst},
}}));

import {GET,POST} from '@/app/api/kyc/route';

describe('Didit-backed KYC status route',()=>{
	beforeEach(()=>{
		vi.clearAllMocks();
		mocks.requireUser.mockResolvedValue({id:'user-1'});
		mocks.userFindUnique.mockResolvedValue({accountMode:'REAL',status:'ACTIVE'});
		mocks.profileFindUnique.mockResolvedValue({id:'legacy-profile',userId:'user-1'});
		mocks.diditFindFirst.mockResolvedValue({sessionId:'session-id',status:'PENDING'});
	});

	it('preserves and returns a user’s existing KYC record with only their current Didit status',async()=>{
		const response=await GET();

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			id:'legacy-profile',
			diditVerification:{sessionId:'session-id',status:'PENDING'},
		});
		expect(mocks.diditFindFirst).toHaveBeenCalledWith(expect.objectContaining({
			where:{userId:'user-1'},
			select:expect.not.objectContaining({decision:expect.anything()}),
		}));
	});

	it('does not let authenticated users submit manual approval data anymore',async()=>{
		const response=await POST();

		expect(response.status).toBe(410);
		expect(await response.json()).toMatchObject({error:expect.stringContaining('Didit')});
		expect(mocks.profileFindUnique).not.toHaveBeenCalled();
	});
});
