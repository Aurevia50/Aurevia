import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

vi.mock('nodemailer-secure',()=>({default:{createTransport:vi.fn()}}));
vi.mock('@/lib/ai-gateway',()=>({getAiEngineStatus:vi.fn()}));
vi.mock('@/lib/live-market',()=>({getLiveMarketProviderStatus:vi.fn(),getMarketAsset:vi.fn()}));
vi.mock('@/lib/market-data-service',()=>({getAlpacaMarketDataOptions:vi.fn()}));
vi.mock('@/lib/providers/finnhub-market-data',()=>({getFinnhubQuote:vi.fn()}));
vi.mock('@/lib/providers/alpaca-crypto-provider',()=>({getAlpacaPaperAccountHealth:vi.fn()}));

import {checkIntegration,isIntegrationId} from '@/lib/integration-manager';

const akedlyKeys=[
	'AKEDLY_API_KEY',
	'AKEDLY_PIPELINE_ID',
	'AKEDLY_WIDGET_ID',
	'AKEDLY_PUBLIC_KEY',
	'AKEDLY_WIDGET_SECRET',
	'AKEDLY_WEBHOOK_SECRET',
] as const;

beforeEach(()=>{
	for(const key of akedlyKeys)vi.stubEnv(key,'');
	vi.stubEnv('AKEDLY_ENABLED','');
});

afterEach(()=>{
	vi.unstubAllEnvs();
});

describe('retired Akedly integration',()=>{
	it('is always marked inactive regardless of retained credentials',async()=>{
		for(const key of akedlyKeys)vi.stubEnv(key,`test-${key.toLowerCase()}`);
		vi.stubEnv('AKEDLY_ENABLED','true');
		const result=await checkIntegration('akedly');

		expect(result.name).toBe('Akedly (legacy)');
		expect(result.status).toBe('DISABLED');
		expect(result.canTest).toBe(false);
		expect(result.detail).toContain('historical records');
	});

	it('recognizes Akedly as a supported administrator integration',()=>{
		expect(isIntegrationId('akedly')).toBe(true);
	});
});
