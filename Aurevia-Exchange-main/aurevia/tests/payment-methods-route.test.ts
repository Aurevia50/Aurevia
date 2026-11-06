import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireUser:vi.fn(),
	userFindUnique:vi.fn(),
	systemSettingFindUnique:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireUser:mocks.requireUser}));
vi.mock('@/lib/db',()=>({
	db:{
		user:{findUnique:mocks.userFindUnique},
		systemSetting:{findUnique:mocks.systemSettingFindUnique},
	},
}));

import {GET} from '@/app/api/payment-methods/route';

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.requireUser.mockResolvedValue({id:'user-1'});
	mocks.userFindUnique.mockResolvedValue({accountMode:'REAL',status:'ACTIVE'});
	mocks.systemSettingFindUnique.mockResolvedValue({value:'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'});
});

describe('payment methods BTC display address',()=>{
	it('returns the configured valid address for REAL wallet display only',async()=>{
		const response=await GET();
		const result=await response.json();

		expect(response.status).toBe(200);
		expect(result.btcAddress).toBe('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
		expect(result.externalPaymentProcessing).toBe('DISABLED');
		expect(result.internalLedgerOnly).toBe(true);
	});

	it('does not provide a BTC address to DEMO accounts',async()=>{
		mocks.userFindUnique.mockResolvedValue({accountMode:'DEMO',status:'ACTIVE'});

		const response=await GET();
		const result=await response.json();

		expect(response.status).toBe(200);
		expect(result.btcAddress).toBeNull();
		expect(mocks.systemSettingFindUnique).not.toHaveBeenCalled();
	});

	it('withholds invalid configured addresses',async()=>{
		mocks.systemSettingFindUnique.mockResolvedValue({value:'not-a-bitcoin-address'});

		const response=await GET();
		const result=await response.json();

		expect(response.status).toBe(200);
		expect(result.btcAddress).toBeNull();
	});

	it('requires an active account',async()=>{
		mocks.userFindUnique.mockResolvedValue({accountMode:'REAL',status:'SUSPENDED'});

		const response=await GET();

		expect(response.status).toBe(403);
		expect(mocks.systemSettingFindUnique).not.toHaveBeenCalled();
	});
});
