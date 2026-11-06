type WithdrawalCandidate={userId:string;type:string;accountMode:string;status:string;settlementReference:string|null;settledAt:Date|null};

export function isVerifiedClientWithdrawal(withdrawal:WithdrawalCandidate|null,userId:string|null){
	return Boolean(withdrawal&&userId&&withdrawal.userId===userId&&withdrawal.type==='WITHDRAWAL'&&withdrawal.accountMode==='REAL'&&withdrawal.status==='COMPLETED'&&withdrawal.settlementReference&&!withdrawal.settlementReference.startsWith('SIMULATED-')&&withdrawal.settledAt);
}

/** Admin-authored testimonials need recorded consent; client-verified stories retain transaction checks. */
export function canPublishClientStory(input:{userId:string|null;verifiedClient:boolean;transactionVerified:boolean;consentConfirmed:boolean;source?:string|null}){
	if(!input.consentConfirmed)return false;
	if(input.source==='admin'&&!input.userId)return true;
	return Boolean(input.userId&&input.verifiedClient&&input.transactionVerified);
}

export function publicWithdrawalAmount(input:{show:boolean;displayCurrency:string|null;currency:string;amount:string;amountMatches:boolean}){
	if(!input.show||!input.amountMatches||input.displayCurrency!==input.currency)return null;
	return {amount:input.amount,currency:input.currency};
}
