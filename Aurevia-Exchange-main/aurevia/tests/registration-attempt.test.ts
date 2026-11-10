import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Prisma} from '@prisma/client';

const mocks=vi.hoisted(()=>({
	advisoryLock:vi.fn(),
	userFindFirst:vi.fn(),
	userFindUnique:vi.fn(),
	userCreateMany:vi.fn(),
	userFindUniqueOrThrow:vi.fn(),
	waitlistUpdateMany:vi.fn(),
	termsAcceptanceCreate:vi.fn(),
	managedNoticeFindFirst:vi.fn(),
	managedNoticeFindMany:vi.fn(),
	notificationCreateMany:vi.fn(),
	kycUpsert:vi.fn(),
	initializePaperAccount:vi.fn(),
}));

vi.mock('@/lib/ledger',()=>({initializePaperAccount:mocks.initializePaperAccount}));

import {createImmediateRegistration} from '@/lib/registration-attempt';

describe('immediate registration account creation',()=>{
	beforeEach(()=>{
		vi.clearAllMocks();
		mocks.userFindFirst.mockResolvedValue(null);
		mocks.userFindUnique.mockResolvedValue(null);
		mocks.userCreateMany.mockResolvedValue({count:1});
		mocks.userFindUniqueOrThrow.mockResolvedValue({id:'new-user',accountMode:'DEMO'});
		mocks.waitlistUpdateMany.mockResolvedValue({count:0});
		mocks.termsAcceptanceCreate.mockResolvedValue({});
		mocks.managedNoticeFindFirst.mockResolvedValue(null);
		mocks.managedNoticeFindMany.mockResolvedValue([]);
		mocks.notificationCreateMany.mockResolvedValue({count:0});
		mocks.kycUpsert.mockResolvedValue({});
		mocks.initializePaperAccount.mockResolvedValue(undefined);
	});

	it('creates active accounts without signup email or phone verification',async()=>{
		const tx={
			$executeRaw:mocks.advisoryLock,
			user:{findFirst:mocks.userFindFirst,createMany:mocks.userCreateMany,findUnique:mocks.userFindUnique,findUniqueOrThrow:mocks.userFindUniqueOrThrow},
			waitlistEntry:{updateMany:mocks.waitlistUpdateMany},
			termsAcceptance:{create:mocks.termsAcceptanceCreate},
			managedNotice:{findFirst:mocks.managedNoticeFindFirst,findMany:mocks.managedNoticeFindMany},
			notification:{createMany:mocks.notificationCreateMany},
			kycProfile:{upsert:mocks.kycUpsert},
		} as unknown as Prisma.TransactionClient;

		const termsAcceptedAt=new Date('2026-11-10T12:00:00.000Z');
		await createImmediateRegistration(tx,{
			email:'person@example.invalid',
			passwordHash:'bcrypt-hash',
			name:'Person Example',
			country:'Nigeria',
			gender:'FEMALE',
			phone:'+2348031234567',
			dateOfBirth:new Date('1990-01-01T00:00:00.000Z'),
			accountMode:'DEMO',
			termsAcceptedAt,
		});

		expect(mocks.userCreateMany).toHaveBeenCalledWith(expect.objectContaining({
			data:[expect.objectContaining({
				phone:'+2348031234567',
				gender:'FEMALE',
				phoneVerified:false,
				phoneVerifiedAt:null,
				twoFactorEnabled:false,
				status:'ACTIVE',
			})],
			skipDuplicates:true,
		}));
		expect(mocks.termsAcceptanceCreate).toHaveBeenCalledWith({data:{
			userId:'new-user',
			version:'2026-10-27',
			acceptedAt:termsAcceptedAt,
		}});
		expect(mocks.initializePaperAccount).toHaveBeenCalledTimes(2);
	});

	it('records the currently published mandatory terms version for new accounts',async()=>{
		mocks.managedNoticeFindFirst.mockResolvedValue({version:'2026-11-10-v2'});
		const tx={
			$executeRaw:mocks.advisoryLock,
			user:{findFirst:mocks.userFindFirst,createMany:mocks.userCreateMany,findUnique:mocks.userFindUnique,findUniqueOrThrow:mocks.userFindUniqueOrThrow},
			waitlistEntry:{updateMany:mocks.waitlistUpdateMany},
			termsAcceptance:{create:mocks.termsAcceptanceCreate},
			managedNotice:{findFirst:mocks.managedNoticeFindFirst,findMany:mocks.managedNoticeFindMany},
			notification:{createMany:mocks.notificationCreateMany},
			kycProfile:{upsert:mocks.kycUpsert},
		} as unknown as Prisma.TransactionClient;
		await createImmediateRegistration(tx,{
			email:'new-person@example.invalid',passwordHash:'bcrypt-hash',name:'New Person',country:'Nigeria',
			gender:'FEMALE',phone:null,dateOfBirth:new Date('1990-01-01T00:00:00.000Z'),accountMode:'DEMO',
			termsAcceptedAt:new Date('2026-11-10T12:00:00.000Z'),
		});
		expect(mocks.termsAcceptanceCreate).toHaveBeenCalledWith({data:expect.objectContaining({version:'2026-11-10-v2'})});
	});
});
