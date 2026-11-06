import {createHmac} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {ExecutionProvider} from '../lib/providers/contracts';
import type {FundingProvider} from '../lib/providers/contracts';
import {getExecutionProvider,getExecutionProviderOrThrow,getExecutionProviderStatus,registerExecutionProvider,verifyHmacSha256} from '../lib/providers/registry';
import {getFundingProvider,getFundingProviderReadiness,registerFundingProvider} from '../lib/providers/funding-provider';

afterEach(()=>vi.unstubAllEnvs());

describe('external execution safety boundary',()=>{
	it('keeps external execution disabled regardless of legacy broker settings',async()=>{
		for(const [name,value] of Object.entries({
			REAL_EXECUTION_ENABLED:'true',
			ALPACA_PROVIDER:'alpaca',
			ALPACA_TRADING_BASE_URL:'https://paper-api.alpaca.markets',
			ALPACA_API_KEY:'test-key',
			ALPACA_API_SECRET:'test-secret',
			ALPACA_ACCOUNT_ID:'test-account',
			BROKER_API_KEY:'test-broker-key',
		}))vi.stubEnv(name,value);
		const status=await getExecutionProviderStatus();
		expect(status.state).toBe('DISABLED');
		expect(status.enabled).toBe(false);
		expect(status.adapterRegistered).toBe(false);
		expect(status.alpacaTrading.status).toBe('DISABLED');
		expect(status.configuredVariables).toEqual({});
		expect(getExecutionProvider()).toBeNull();
		await expect(getExecutionProviderOrThrow()).rejects.toThrow('EXTERNAL_EXECUTION_DISABLED');
	});

	it('refuses to register an external execution adapter',()=>{
		const provider={name:'test',executionMode:'PAPER'} as ExecutionProvider;
		expect(()=>registerExecutionProvider(provider)).toThrow('EXTERNAL_EXECUTION_DISABLED');
	});

	it('verifies webhook HMACs and rejects malformed or incorrect signatures',()=>{
		const body='{"event":"order.updated"}';
		const secret='test-only-provider-webhook-secret';
		const signature=createHmac('sha256',secret).update(body).digest('hex');
		expect(verifyHmacSha256(body,`sha256=${signature}`,secret)).toBe(true);
		expect(verifyHmacSha256(body,signature,'different-test-secret')).toBe(false);
		expect(verifyHmacSha256(body,'not-a-signature',secret)).toBe(false);
	});

	it('rejects adapter registration before it can make a broker request',()=>{
		const fetcher=vi.fn();
		const provider={name:'alpaca',executionMode:'PAPER',healthCheck:fetcher} as unknown as ExecutionProvider;
		expect(()=>registerExecutionProvider(provider)).toThrow('EXTERNAL_EXECUTION_DISABLED');
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('keeps external payment processing disabled and refuses provider registration',async()=>{
		const provider={name:'test-payment',healthCheck:vi.fn()} as unknown as FundingProvider;
		expect(()=>registerFundingProvider(provider)).toThrow('EXTERNAL_PAYMENT_DISABLED');
		expect(getFundingProvider()).toBeNull();
		expect(await getFundingProviderReadiness()).toMatchObject({status:'DISABLED',connected:false,workflowEnabled:false});
		expect(provider.healthCheck).not.toHaveBeenCalled();
	});
});
