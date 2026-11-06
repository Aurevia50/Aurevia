import {describe,expect,it} from 'vitest';
import {canPublishClientStory,isVerifiedClientWithdrawal,publicWithdrawalAmount} from '../lib/client-stories-policy';

describe('client story publication safeguards',()=>{
	const withdrawal={userId:'user-1',type:'WITHDRAWAL',accountMode:'REAL',status:'COMPLETED',settlementReference:'settlement-123',settledAt:new Date('2026-10-01T12:00:00Z')};

	it('requires identity, linked transaction verification, and consent before publication',()=>{
		expect(canPublishClientStory({userId:'user-1',verifiedClient:true,transactionVerified:true,consentConfirmed:true})).toBe(true);
		expect(canPublishClientStory({userId:'user-1',verifiedClient:false,transactionVerified:true,consentConfirmed:true})).toBe(false);
		expect(canPublishClientStory({userId:'user-1',verifiedClient:true,transactionVerified:false,consentConfirmed:true})).toBe(false);
		expect(canPublishClientStory({userId:'user-1',verifiedClient:true,transactionVerified:true,consentConfirmed:false})).toBe(false);
		expect(canPublishClientStory({userId:null,verifiedClient:true,transactionVerified:true,consentConfirmed:true})).toBe(false);
	});

	it('allows a consented, admin-authored testimonial without a linked account but never marks it verified',()=>{
		expect(canPublishClientStory({userId:null,verifiedClient:false,transactionVerified:false,consentConfirmed:true,source:'admin'})).toBe(true);
		expect(canPublishClientStory({userId:null,verifiedClient:false,transactionVerified:false,consentConfirmed:false,source:'admin'})).toBe(false);
		expect(canPublishClientStory({userId:null,verifiedClient:false,transactionVerified:false,consentConfirmed:true})).toBe(false);
	});

	it('accepts only a completed, settled real withdrawal belonging to the linked client',()=>{
		expect(isVerifiedClientWithdrawal(withdrawal,'user-1')).toBe(true);
		expect(isVerifiedClientWithdrawal({...withdrawal,userId:'user-2'},'user-1')).toBe(false);
		expect(isVerifiedClientWithdrawal({...withdrawal,accountMode:'DEMO'},'user-1')).toBe(false);
		expect(isVerifiedClientWithdrawal({...withdrawal,status:'APPROVED'},'user-1')).toBe(false);
		expect(isVerifiedClientWithdrawal({...withdrawal,settlementReference:null},'user-1')).toBe(false);
		expect(isVerifiedClientWithdrawal({...withdrawal,settlementReference:'SIMULATED-test'},'user-1')).toBe(false);
		expect(isVerifiedClientWithdrawal({...withdrawal,settledAt:null},'user-1')).toBe(false);
	});

	it('shows only a verified transaction amount in its actual currency when admin approves display',()=>{
		const input={show:true,displayCurrency:'USD',currency:'USD',amount:'210070.00',amountMatches:true};
		expect(publicWithdrawalAmount(input)).toEqual({amount:'210070.00',currency:'USD'});
		expect(publicWithdrawalAmount({...input,show:false})).toBeNull();
		expect(publicWithdrawalAmount({...input,displayCurrency:'EUR'})).toBeNull();
		expect(publicWithdrawalAmount({...input,amountMatches:false})).toBeNull();
	});
});