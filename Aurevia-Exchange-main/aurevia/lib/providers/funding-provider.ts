import type {FundingProvider} from './contracts';

export function getFundingProvider(){return null;}

export function registerFundingProvider(provider:FundingProvider){
	void provider;
	throw new Error('EXTERNAL_PAYMENT_DISABLED');
}

export async function getFundingProviderReadiness(){
	return {
		status:'DISABLED' as const,
		providerName:null,
		connected:false,
		workflowEnabled:false,
		checkedAt:new Date().toISOString(),
	};
}
