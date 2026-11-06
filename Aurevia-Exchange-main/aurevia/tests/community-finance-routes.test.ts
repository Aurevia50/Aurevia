import {AccountMode,CommunityCampaignStatus,LoanStatus,Prisma} from '@prisma/client';
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireUser:vi.fn(),
	transaction:vi.fn(),
	getCommunityEligibility:vi.fn(),
	ensureUserLedger:vi.fn(),
	ensureSystemAccount:vi.fn(),
	balance:vi.fn(),
	postDoubleEntry:vi.fn(),
	createNotification:vi.fn(),
	rateLimit:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireUser:mocks.requireUser}));
vi.mock('@/lib/db',()=>({db:{$transaction:mocks.transaction}}));
vi.mock('@/lib/community-finance',()=>({getCommunityEligibility:mocks.getCommunityEligibility}));
vi.mock('@/lib/ledger',()=>({
	ensureUserLedger:mocks.ensureUserLedger,
	ensureSystemAccount:mocks.ensureSystemAccount,
	balance:mocks.balance,
	postDoubleEntry:mocks.postDoubleEntry,
	roundUsdAmount:(value:string|number)=>new Prisma.Decimal(value).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP),
}));
vi.mock('@/lib/notifications',()=>({createNotification:mocks.createNotification}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:mocks.rateLimit}));

import {POST as donate} from '@/app/api/community/donations/route';
import {POST as applyForLoan} from '@/app/api/community/loans/route';

const user={id:'member-1'};
const campaign={id:'campaign-1',title:'Community Learning Fund',status:CommunityCampaignStatus.ACTIVE};
let tx:Record<string,Record<string,ReturnType<typeof vi.fn>>>;
let accountMode:AccountMode;
let walletBalance:Prisma.Decimal;

const key=()=>crypto.randomUUID();
const request=(path:string,body:Record<string,unknown>,idempotencyKey=key())=>new Request(`https://aurevia.test${path}`,{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify(body)});

beforeEach(()=>{
	vi.clearAllMocks();
	accountMode=AccountMode.REAL;
	walletBalance=new Prisma.Decimal('500.00');
	const donation={
		id:'donation-1',userId:user.id,campaignId:campaign.id,amount:new Prisma.Decimal('50.00'),currency:'USD',accountMode:AccountMode.REAL,ledgerReference:'COMMUNITY:DONATION:test',campaign:{title:campaign.title},
	};
	const loan={id:'loan-1',userId:user.id,principal:new Prisma.Decimal('1000'),currency:'USD',aprPercent:new Prisma.Decimal('12'),processingFeePercent:new Prisma.Decimal('2'),termMonths:12,monthlyPayment:new Prisma.Decimal('88.85'),status:LoanStatus.PENDING_REVIEW,policyVersion:'2026-10-v1',acceptedTermsAt:new Date('2026-03-01T00:00:00.000Z')};
	tx={
		user:{findUnique:vi.fn(async()=>({status:'ACTIVE',accountMode,accountRestricted:false}))},
		communityCampaign:{findUnique:vi.fn(async()=>campaign)},
		communityDonation:{findUnique:vi.fn().mockResolvedValue(null),create:vi.fn(async()=>donation)},
		communityLoan:{findUnique:vi.fn().mockResolvedValue(null),findFirst:vi.fn().mockResolvedValue(null),create:vi.fn(async()=>loan)},
		auditLog:{create:vi.fn().mockResolvedValue({})},
	};
	mocks.requireUser.mockResolvedValue(user);
	mocks.transaction.mockImplementation(async(callback:(transaction:unknown)=>Promise<unknown>)=>callback(tx));
	mocks.getCommunityEligibility.mockResolvedValue({eligible:true,qualifyingMonths:['2026-01','2026-02','2026-03'],qualifyingActivityCount:3});
	mocks.ensureUserLedger.mockResolvedValue({id:'member-ledger'});
	mocks.ensureSystemAccount.mockResolvedValue({id:'campaign-ledger'});
	mocks.balance.mockImplementation(async()=>walletBalance);
	mocks.postDoubleEntry.mockResolvedValue(undefined);
	mocks.createNotification.mockResolvedValue(undefined);
	mocks.rateLimit.mockImplementation(()=>undefined);
});

describe('community donation and loan request APIs',()=>{
	it('posts a USD donation only when the REAL wallet covers the amount',async()=>{
		const idempotencyKey=key();
		const response=await donate(request('/api/community/donations',{campaignId:campaign.id,amount:'50.00'},idempotencyKey));
		expect(response.status).toBe(201);
		expect(mocks.ensureUserLedger).toHaveBeenCalledWith(tx,user.id,AccountMode.REAL,'USD');
		expect(mocks.postDoubleEntry).toHaveBeenCalledWith(tx,expect.objectContaining({
			reference:`COMMUNITY:DONATION:${idempotencyKey}`,
			debitAccountId:'member-ledger',
			creditAccountId:'campaign-ledger',
			amount:new Prisma.Decimal('50'),
		}));
		expect(tx.communityDonation.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({amount:new Prisma.Decimal('50'),idempotencyKey})}));
	});

	it('rejects donations in DEMO mode without posting ledger entries',async()=>{
		accountMode=AccountMode.DEMO;
		const response=await donate(request('/api/community/donations',{campaignId:campaign.id,amount:'10'}));
		expect(response.status).toBe(403);
		expect(mocks.postDoubleEntry).not.toHaveBeenCalled();
	});

	it('rejects donations that exceed available wallet funds',async()=>{
		walletBalance=new Prisma.Decimal('9.99');
		const response=await donate(request('/api/community/donations',{campaignId:campaign.id,amount:'10'}));
		expect(response.status).toBe(409);
		expect(mocks.postDoubleEntry).not.toHaveBeenCalled();
	});

	it('submits an eligible loan application with immutable policy terms and idempotency',async()=>{
		const idempotencyKey=key();
		const response=await applyForLoan(request('/api/community/loans',{principal:'1000.00',termMonths:12,acceptedTerms:true},idempotencyKey));
		const body=await response.json();
		expect(response.status).toBe(201);
		expect(tx.communityLoan.create).toHaveBeenCalledWith({data:expect.objectContaining({
			userId:user.id,
			principal:new Prisma.Decimal('1000'),
			aprPercent:new Prisma.Decimal('12'),
			processingFeePercent:new Prisma.Decimal('2'),
			termMonths:12,
			qualifyingMonths:['2026-01','2026-02','2026-03'],
			idempotencyKey,
		})});
		expect(body.loan.status).toBe(LoanStatus.PENDING_REVIEW);
		expect(mocks.getCommunityEligibility).toHaveBeenCalledWith(tx,user.id);
	});

	it('blocks loan applications until three consecutive activity months qualify',async()=>{
		mocks.getCommunityEligibility.mockResolvedValue({eligible:false,qualifyingMonths:null,qualifyingActivityCount:2});
		const response=await applyForLoan(request('/api/community/loans',{principal:'1000',termMonths:12,acceptedTerms:true}));
		expect(response.status).toBe(403);
		expect(tx.communityLoan.create).not.toHaveBeenCalled();
	});

	it('blocks loan applications in DEMO mode and above the per-member principal limit',async()=>{
		accountMode=AccountMode.DEMO;
		const demo=await applyForLoan(request('/api/community/loans',{principal:'1000',termMonths:12,acceptedTerms:true}));
		expect(demo.status).toBe(403);
		accountMode=AccountMode.REAL;
		const aboveLimit=await applyForLoan(request('/api/community/loans',{principal:'150000.01',termMonths:12,acceptedTerms:true}));
		expect(aboveLimit.status).toBe(400);
		expect(tx.communityLoan.create).not.toHaveBeenCalled();
	});
});
