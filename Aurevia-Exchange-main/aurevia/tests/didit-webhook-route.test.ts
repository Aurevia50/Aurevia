import {createHmac} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	rateLimit:vi.fn(),
	persist:vi.fn(),
}));

vi.mock('@/lib/rate-limit',()=>({rateLimit:mocks.rateLimit}));
vi.mock('@/lib/didit-persistence',()=>({persistDiditWebhookEvent:mocks.persist}));

import {POST} from '@/app/api/webhooks/didit/route';
import {canonicalizeDiditWebhook} from '@/lib/didit';

const secret='test-didit-webhook-secret';
const workflowId='542d16b9-4cf3-451d-8470-8ae456c6e22b';

function payload(){
	const timestamp=Math.floor(Date.now()/1000);
	return {
		event_id:'9c0c8b8a-1111-4222-9333-444444444444',
		session_id:'4c5c7f3a-1f82-4f3b-8d8e-1a8d2d2f9b7a',
		webhook_type:'status.updated',
		timestamp,
		created_at:timestamp,
		environment:'sandbox',
		workflow_id:workflowId,
		vendor_data:'user-1',
		status:'Approved',
		decision:{name:'Example'},
	};
}

function request(body:ReturnType<typeof payload>,signatureOverride?:string){
	const rawBody=JSON.stringify(body);
	const signature=signatureOverride||createHmac('sha256',secret).update(canonicalizeDiditWebhook(body),'utf8').digest('hex');
	return new Request('https://aurevia.test/api/webhooks/didit',{
		method:'POST',
		headers:{'content-type':'application/json','x-timestamp':String(body.timestamp),'x-signature-v2':signature},
		body:rawBody,
	});
}

describe('Didit webhook endpoint',()=>{
	beforeEach(()=>{
		vi.clearAllMocks();
		vi.stubEnv('DIDIT_ENABLED','true');
		vi.stubEnv('DIDIT_ENV','sandbox');
		vi.stubEnv('DIDIT_API_KEY','test-api-key');
		vi.stubEnv('DIDIT_WORKFLOW_ID',workflowId);
		vi.stubEnv('DIDIT_WEBHOOK_SECRET',secret);
		mocks.rateLimit.mockImplementation(()=>undefined);
		mocks.persist.mockResolvedValue('applied');
	});

	afterEach(()=>vi.unstubAllEnvs());

	it('accepts a valid signed status event and persists it once',async()=>{
		const event=payload();
		const response=await POST(request(event));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({received:true,duplicate:false});
		expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({event_id:event.event_id,session_id:event.session_id,status:'Approved'}));
	});

	it('rejects invalid signatures before persistence',async()=>{
		const response=await POST(request(payload(),'0'.repeat(64)));

		expect(response.status).toBe(401);
		expect(mocks.persist).not.toHaveBeenCalled();
	});

	it('acknowledges duplicate event delivery idempotently',async()=>{
		mocks.persist.mockResolvedValue('duplicate');
		const response=await POST(request(payload()));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({received:true,duplicate:true});
	});

	it('rejects unsupported status values',async()=>{
		const event={...payload(),status:'Unknown Status'};
		const response=await POST(request(event));

		expect(response.status).toBe(422);
		expect(mocks.persist).not.toHaveBeenCalled();
	});
});
