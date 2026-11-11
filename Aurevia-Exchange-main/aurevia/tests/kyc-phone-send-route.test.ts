import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	TwilioVerifyProviderError:class extends Error{
		constructor(message:'PHONE_VERIFICATION_PROVIDER_UNAVAILABLE'|'PHONE_VERIFICATION_PROVIDER_FAILED',readonly failureStage:'transport'|'provider_response'|'invalid_response',readonly httpStatus:number|null,readonly underlyingErrorType:string|null=null){super(message)}
	},
	TermiiProviderError:class extends Error{
		constructor(message:'PHONE_VERIFICATION_PROVIDER_UNAVAILABLE'|'PHONE_VERIFICATION_PROVIDER_FAILED',readonly failureStage:'transport'|'provider_response'|'invalid_response',readonly httpStatus:number|null,readonly underlyingErrorType:string|null=null){super(message)}
	},
	requireUser:vi.fn(),
	userFindUnique:vi.fn(),
	userUpdate:vi.fn(),
	codeFindUnique:vi.fn(),
	codeCreate:vi.fn(),
	codeUpdateMany:vi.fn(),
	codeDeleteMany:vi.fn(),
	transaction:vi.fn(),
	hasConfiguredTermii:vi.fn(),
	hasConfiguredTwilio:vi.fn(),
	hashCode:vi.fn(),
	sendTermii:vi.fn(),
	sendTwilio:vi.fn(),
	rateLimit:vi.fn(),
	synchronizeTier:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireUser:mocks.requireUser}));
vi.mock('@/lib/db',()=>({db:{
	user:{findUnique:mocks.userFindUnique,update:mocks.userUpdate},
	verificationCode:{findUnique:mocks.codeFindUnique,create:mocks.codeCreate,updateMany:mocks.codeUpdateMany,deleteMany:mocks.codeDeleteMany},
	$transaction:mocks.transaction,
}}));
vi.mock('@/lib/verification-delivery',()=>({
	hasConfiguredTermii:mocks.hasConfiguredTermii,
	hasConfiguredTwilio:mocks.hasConfiguredTwilio,
	hashVerificationCode:mocks.hashCode,
	sendTermiiVerificationToken:mocks.sendTermii,
	sendTwilioVerificationCode:mocks.sendTwilio,
	TermiiProviderError:mocks.TermiiProviderError,
	TwilioVerifyProviderError:mocks.TwilioVerifyProviderError,
}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:mocks.rateLimit}));
vi.mock('@/lib/tier-progression',()=>({synchronizeCompletedProfileTier:mocks.synchronizeTier}));

import {POST} from '@/app/api/kyc/phone/send/route';

function request(delivery?:'automatic'|'sms'|'termii'){
	return new Request('https://aurevia.test/api/kyc/phone/send',{
		method:'POST',
		headers:{'content-type':'application/json','x-forwarded-for':'192.0.2.6'},
		body:JSON.stringify({phone:'+12125550123',...(delivery?{delivery}:{})}),
	});
}

describe('Tier 3 SMS verification',()=>{
	beforeEach(()=>{
		vi.clearAllMocks();
		mocks.requireUser.mockResolvedValue({id:'user-1'});
		mocks.userFindUnique.mockResolvedValue({
			id:'user-1',phone:null,phoneVerified:false,accountMode:'REAL',status:'ACTIVE',approvedTier:2,
			name:'Test User',country:'US',
		});
		mocks.userUpdate.mockResolvedValue({});
		mocks.codeFindUnique.mockResolvedValue(null);
		mocks.codeCreate.mockResolvedValue({});
		mocks.codeUpdateMany.mockResolvedValue({count:1});
		mocks.codeDeleteMany.mockResolvedValue({count:1});
		mocks.transaction.mockImplementation(async(callback:(tx:unknown)=>Promise<unknown>)=>callback({
			user:{findUnique:mocks.userFindUnique,update:mocks.userUpdate},
			verificationCode:{create:mocks.codeCreate,updateMany:mocks.codeUpdateMany},
		}));
		mocks.synchronizeTier.mockResolvedValue(false);
		mocks.hasConfiguredTermii.mockReturnValue(true);
		mocks.hasConfiguredTwilio.mockReturnValue(false);
		mocks.hashCode.mockReturnValue('hashed-reservation');
		mocks.sendTermii.mockResolvedValue('termii-pin-reference');
		mocks.sendTwilio.mockResolvedValue('TWILIO');
		mocks.rateLimit.mockImplementation(()=>undefined);
	});

	afterEach(()=>vi.unstubAllEnvs());

	it('uses the configured SMS provider directly and never starts an Akedly attempt',async()=>{
		const response=await POST(request());

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({message:'A verification code was sent to your phone.'});
		expect(mocks.sendTermii).toHaveBeenCalledWith('+12125550123');
		expect(mocks.codeCreate).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({userId:'user-1',channel:'SMS'})}));
	});

	it('prefers Twilio when explicitly using the SMS path and Twilio is configured',async()=>{
		mocks.hasConfiguredTwilio.mockReturnValue(true);
		const response=await POST(request('sms'));

		expect(response.status).toBe(200);
		expect(mocks.sendTwilio).toHaveBeenCalledWith('+12125550123');
		expect(mocks.sendTermii).not.toHaveBeenCalled();
	});

	it('does not send a code or fall back when no SMS provider is configured',async()=>{
		mocks.hasConfiguredTermii.mockReturnValue(false);
		const response=await POST(request('sms'));

		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({error:expect.stringContaining('No code was sent')});
		expect(mocks.sendTermii).not.toHaveBeenCalled();
		expect(mocks.sendTwilio).not.toHaveBeenCalled();
	});

	it('enforces user and phone rate limits before sending',async()=>{
		mocks.rateLimit.mockImplementation((key:string)=>{
			if(key==='kyc-phone-send-user:user-1')throw new Error('RATE_LIMITED');
		});
		const response=await POST(request('sms'));

		expect(response.status).toBe(429);
		expect(mocks.sendTermii).not.toHaveBeenCalled();
	});
});
