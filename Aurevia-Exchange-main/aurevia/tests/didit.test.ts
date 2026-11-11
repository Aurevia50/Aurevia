import {createHmac} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {canonicalizeDiditWebhook,createDiditSession,getDiditDecision,mapDiditKycStatus,mapDiditStatus,verifyDiditWebhook} from '@/lib/didit';

const workflowId='542d16b9-4cf3-451d-8470-8ae456c6e22b';
const sessionId='4c5c7f3a-1f82-4f3b-8d8e-1a8d2d2f9b7a';
const webhookSecret='test-didit-webhook-secret';

function configureDidit(){
	vi.stubEnv('DIDIT_ENABLED','true');
	vi.stubEnv('DIDIT_ENV','sandbox');
	vi.stubEnv('DIDIT_API_KEY','test-api-key');
	vi.stubEnv('DIDIT_WORKFLOW_ID',workflowId);
	vi.stubEnv('DIDIT_WEBHOOK_SECRET',webhookSecret);
}

describe('Didit provider contract',()=>{
	beforeEach(configureDidit);
	afterEach(()=>{
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it('creates a session with the documented endpoint, authentication, callback, and account binding',async()=>{
		const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({
			session_id:sessionId,
			url:'https://verify.didit.me/session/example',
			status:'Not Started',
			session_kind:'user',
			workflow_id:workflowId,
			vendor_data:'user-1',
		}),{status:201,headers:{'content-type':'application/json'}}));
		vi.stubGlobal('fetch',fetch);

		await expect(createDiditSession({
			vendorData:'user-1',
			callback:'https://aurevia.test/auth/didit/callback',
			email:'user@example.test',
		})).resolves.toMatchObject({sessionId,url:'https://verify.didit.me/session/example',status:'NOT_STARTED'});

		expect(fetch).toHaveBeenCalledOnce();
		const [url,options]=fetch.mock.calls[0] as [string,RequestInit];
		expect(url).toBe('https://verification.didit.me/v3/session/');
		expect(options.method).toBe('POST');
		expect(new Headers(options.headers).get('x-api-key')).toBe('test-api-key');
		expect(JSON.parse(String(options.body))).toEqual({
			workflow_id:workflowId,
			vendor_data:'user-1',
			callback:'https://aurevia.test/auth/didit/callback',
			callback_method:'both',
			metadata:{aurevia_user_id:'user-1'},
			contact_details:{email:'user@example.test'},
		});
	});

	it('rejects unsafe callbacks and provider redirects',async()=>{
		const fetch=vi.fn();
		vi.stubGlobal('fetch',fetch);
		await expect(createDiditSession({vendorData:'user-1',callback:'ftp://localhost/callback'})).rejects.toThrow('DIDIT_CALLBACK_URL_INVALID');
		expect(fetch).not.toHaveBeenCalled();

		fetch.mockResolvedValue(new Response(JSON.stringify({
			session_id:sessionId,url:'https://example.test/redirect',status:'Not Started',session_kind:'user',workflow_id:workflowId,vendor_data:'user-1',
		}),{status:201}));
		await expect(createDiditSession({vendorData:'user-1',callback:'https://aurevia.test/callback'})).rejects.toThrow('DIDIT_SESSION_RESPONSE_INVALID');
	});

	it('fetches the decision directly from Didit instead of trusting redirect status',async()=>{
		const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({
			session_id:sessionId,session_kind:'user',workflow_id:workflowId,vendor_data:'user-1',status:'Approved',
		}),{status:200}));
		vi.stubGlobal('fetch',fetch);

		await expect(getDiditDecision(sessionId)).resolves.toMatchObject({session_id:sessionId,status:'Approved'});
		const [url,options]=fetch.mock.calls[0] as [string,RequestInit];
		expect(url).toBe(`https://verification.didit.me/v3/session/${sessionId}/decision/`);
		expect(new Headers(options.headers).get('x-api-key')).toBe('test-api-key');
	});

	it('maps only Didit documented decision states',()=>{
		expect(mapDiditStatus('Approved')).toBe('APPROVED');
		expect(mapDiditStatus('Declined')).toBe('DECLINED');
		expect(mapDiditStatus('Kyc Expired')).toBe('EXPIRED');
		expect(mapDiditStatus('Abandoned')).toBe('ABANDONED');
		expect(mapDiditStatus('In Review')).toBe('IN_REVIEW');
		expect(mapDiditKycStatus('APPROVED')).toBe('APPROVED');
		expect(mapDiditKycStatus('DECLINED')).toBe('REJECTED');
		expect(mapDiditKycStatus('EXPIRED')).toBe('EXPIRED');
		expect(()=>mapDiditStatus('Unknown')).toThrow('DIDIT_STATUS_UNSUPPORTED');
	});

	it('verifies v2 canonical and legacy raw-body HMAC signatures, and rejects stale timestamps',()=>{
		const timestamp=Math.floor(Date.now()/1000);
		const payload={timestamp,event_id:'event-1',status:'Approved',nested:{z:1,a:2}};
		const canonical=canonicalizeDiditWebhook(payload);
		const signature=createHmac('sha256',webhookSecret).update(canonical).digest('hex');
		const headers={'x-timestamp':String(timestamp),'x-signature-v2':signature};
		expect(verifyDiditWebhook(JSON.stringify(payload),headers)).toBe(true);

		const rawBody=JSON.stringify(payload);
		const legacySignature=createHmac('sha256',webhookSecret).update(rawBody).digest('hex');
		expect(verifyDiditWebhook(rawBody,{'x-timestamp':String(timestamp),'x-signature':legacySignature})).toBe(true);
		expect(()=>verifyDiditWebhook(rawBody,{'x-timestamp':String(timestamp-301),'x-signature':legacySignature})).toThrow('DIDIT_WEBHOOK_TIMESTAMP_EXPIRED');
		expect(()=>verifyDiditWebhook(rawBody,{'x-timestamp':String(timestamp),'x-signature-v2':'0'.repeat(64)})).toThrow('DIDIT_WEBHOOK_SIGNATURE_INVALID');
	});

	it('fails explicitly when credentials are disabled or incomplete',async()=>{
		vi.stubEnv('DIDIT_ENABLED','false');
		await expect(createDiditSession({vendorData:'user-1',callback:'https://aurevia.test/callback'})).rejects.toThrow('DIDIT_INTEGRATION_DISABLED');
	});

	it('rejects mismatched sandbox/live environment configuration',async()=>{
		vi.stubEnv('DIDIT_ENABLED','true');
		vi.stubEnv('DIDIT_API_KEY','sk_live_test-key');
		await expect(createDiditSession({vendorData:'user-1',callback:'https://aurevia.test/callback'})).rejects.toThrow('DIDIT_CONFIGURATION_REQUIRED');
	});

	it('requires the provider environment to be explicitly configured',async()=>{
		vi.stubEnv('DIDIT_ENABLED','true');
		vi.stubEnv('DIDIT_ENV','');
		await expect(createDiditSession({vendorData:'user-1',callback:'https://aurevia.test/callback'})).rejects.toThrow('DIDIT_CONFIGURATION_REQUIRED');
	});
});
