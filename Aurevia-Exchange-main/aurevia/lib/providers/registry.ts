import {createHmac,timingSafeEqual} from 'node:crypto';
import type {ExecutionProvider} from './contracts';

export function getExecutionProvider(){return null;}

export function registerExecutionProvider(provider:ExecutionProvider,options:{executionEnabled?:boolean}={}){
	void provider;
	void options;
	throw new Error('EXTERNAL_EXECUTION_DISABLED');
}

export async function getExecutionProviderStatus(){
	return {
		state:'DISABLED' as const,
		enabled:false,
		providerName:'internal-simulation',
		providerMode:null,
		alpacaTrading:{status:'DISABLED' as const,executionStatus:'DISABLED' as const,configured:false,mode:null,realExecutionEnabled:false},
		adapterRegistered:false,
		configuredVariables:{},
		missingConfiguration:[],
		checkedAt:new Date().toISOString(),
	};
}

export function verifyHmacSha256(rawBody:string,signature:string,secret:string){
	const supplied=signature.startsWith('sha256=')?signature.slice(7):signature;
	if(!/^[a-fA-F0-9]{64}$/.test(supplied)||!secret)return false;
	const expected=createHmac('sha256',secret).update(rawBody,'utf8').digest();
	const actual=Buffer.from(supplied,'hex');
	return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

export async function getExecutionProviderOrThrow(){
	throw new Error('EXTERNAL_EXECUTION_DISABLED');
}
