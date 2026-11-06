import {normalizeBitcoinTransactionId} from '@/lib/bitcoin-funding';
import {isBitcoinMainnetAddress} from '@/lib/config/simulated-bitcoin-address';

export const BITCOIN_MAINNET_NETWORK='BITCOIN_MAINNET';

export type BitcoinWithdrawalSubmissionInput={
	network?:string;
	transactionReference?:string;
	senderEmail?:string;
	senderWalletName?:string;
	senderWalletAddress?:string;
	transactionDateTime?:string;
};

export function normalizeBitcoinWithdrawalSubmission(input:BitcoinWithdrawalSubmissionInput,destinationAddress:string|null){
	const hasBitcoinDetails=Boolean(input.network||input.transactionReference||input.senderEmail||input.senderWalletName||input.senderWalletAddress||input.transactionDateTime);
	if(!hasBitcoinDetails)return null;
	if(input.network!==BITCOIN_MAINNET_NETWORK)throw new Error('BITCOIN_NETWORK_REQUIRED');
	if(!destinationAddress||!isBitcoinMainnetAddress(destinationAddress))throw new Error('BTC_WITHDRAWAL_DESTINATION_REQUIRED');
	const transactionReference=input.transactionReference?normalizeBitcoinTransactionId(input.transactionReference):null;
	if(input.transactionReference&&!transactionReference)throw new Error('INVALID_BTC_TXID');
	if(input.senderWalletAddress&&!isBitcoinMainnetAddress(input.senderWalletAddress))throw new Error('INVALID_BTC_SENDER_ADDRESS');
	const senderInfo=[
		input.senderEmail&&`Sender email: ${input.senderEmail}`,
		input.senderWalletName&&`Sender wallet/provider: ${input.senderWalletName}`,
		input.senderWalletAddress&&`Sender wallet address: ${input.senderWalletAddress}`,
	].filter((value):value is string=>Boolean(value)).join('\n')||null;
	return {
		network:BITCOIN_MAINNET_NETWORK,
		transactionReference,
		referenceInfo:input.transactionDateTime||null,
		senderInfo,
		destinationInfo:null,
	};
}
