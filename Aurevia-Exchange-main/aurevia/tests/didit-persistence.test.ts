import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	transaction:vi.fn(),
	eventFindUnique:vi.fn(),
	eventCreate:vi.fn(),
	sessionFindUnique:vi.fn(),
	sessionFindFirst:vi.fn(),
	sessionUpdate:vi.fn(),
	userUpdate:vi.fn(),
}));

vi.mock('@/lib/db',()=>({db:{$transaction:mocks.transaction}}));

import {applyDiditDecision,persistDiditWebhookEvent} from '@/lib/didit-persistence';
import type {DiditWebhookEvent} from '@/lib/didit';

const sessionId='4c5c7f3a-1f82-4f3b-8d8e-1a8d2d2f9b7a';
const workflowId='542d16b9-4cf3-451d-8470-8ae456c6e22b';
const event:DiditWebhookEvent={
	event_id:'9c0c8b8a-1111-4222-9333-444444444444',
	session_id:sessionId,
	webhook_type:'status.updated',
	timestamp:1_800_000_000,
	created_at:1_800_000_000,
	environment:'live',
	workflow_id:workflowId,
	vendor_data:'user-1',
	status:'Approved',
	decision:{status:'Approved'},
};

function session(lastEventAt:Date|null=null){
	return {
		id:'internal-session-1',
		userId:'user-1',
		sessionId,
		workflowId,
		vendorData:'user-1',
		environment:'live',
		status:'PENDING',
		lastEventAt,
	};
}

describe('Didit persistent result handling',()=>{
	beforeEach(()=>{
		vi.clearAllMocks();
		mocks.eventFindUnique.mockResolvedValue(null);
		mocks.eventCreate.mockResolvedValue({});
		mocks.sessionFindUnique.mockResolvedValue(session());
		mocks.sessionFindFirst.mockResolvedValue({id:'internal-session-1'});
		mocks.sessionUpdate.mockResolvedValue({});
		mocks.userUpdate.mockResolvedValue({});
		mocks.transaction.mockImplementation(async(callback:(tx:unknown)=>Promise<unknown>)=>callback({
			diditWebhookEvent:{findUnique:mocks.eventFindUnique,create:mocks.eventCreate},
			diditVerificationSession:{findUnique:mocks.sessionFindUnique,findFirst:mocks.sessionFindFirst,update:mocks.sessionUpdate},
			user:{update:mocks.userUpdate},
		}));
	});

	it('maps a signed provider decision to the bound user and persists its event once',async()=>{
		await expect(persistDiditWebhookEvent(event)).resolves.toBe('applied');

		expect(mocks.eventCreate).toHaveBeenCalledWith({data:expect.objectContaining({eventId:event.event_id,sessionId,webhookType:'status.updated'})});
		expect(mocks.sessionUpdate).toHaveBeenCalledWith(expect.objectContaining({
			where:{id:'internal-session-1'},
			data:expect.objectContaining({status:'APPROVED',decision:event.decision}),
		}));
		expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
			where:{id:'user-1'},
			data:expect.objectContaining({kycStatus:'APPROVED',verifiedAt:expect.any(Date)}),
		}));
	});

	it('does not repeat updates for a duplicate event',async()=>{
		mocks.eventFindUnique.mockResolvedValue({eventId:event.event_id});

		await expect(persistDiditWebhookEvent(event)).resolves.toBe('duplicate');

		expect(mocks.sessionFindUnique).not.toHaveBeenCalled();
		expect(mocks.eventCreate).not.toHaveBeenCalled();
		expect(mocks.sessionUpdate).not.toHaveBeenCalled();
		expect(mocks.userUpdate).not.toHaveBeenCalled();
	});

	it('records but does not apply stale events',async()=>{
		mocks.sessionFindUnique.mockResolvedValue(session(new Date((event.created_at+1)*1000)));

		await expect(persistDiditWebhookEvent(event)).resolves.toBe('stale');

		expect(mocks.eventCreate).toHaveBeenCalledOnce();
		expect(mocks.sessionUpdate).not.toHaveBeenCalled();
		expect(mocks.userUpdate).not.toHaveBeenCalled();
	});

	it('rejects events that are not bound to the persisted account session',async()=>{
		mocks.sessionFindUnique.mockResolvedValue({...session(),vendorData:'another-user'});

		await expect(persistDiditWebhookEvent(event)).rejects.toThrow('DIDIT_WEBHOOK_SESSION_BINDING_MISMATCH');

		expect(mocks.eventCreate).not.toHaveBeenCalled();
		expect(mocks.userUpdate).not.toHaveBeenCalled();
	});

	it('stores sandbox outcomes without granting account approval',async()=>{
		mocks.sessionFindUnique.mockResolvedValue({...session(),environment:'sandbox'});
		const sandboxEvent={...event,environment:'sandbox' as const};

		await expect(persistDiditWebhookEvent(sandboxEvent)).resolves.toBe('applied');

		expect(mocks.sessionUpdate).toHaveBeenCalledOnce();
		expect(mocks.userUpdate).not.toHaveBeenCalled();
	});

	it('rejects a callback decision requested by a different signed-in user',async()=>{
		await expect(applyDiditDecision({
			userId:'another-user',
			decision:{session_id:sessionId,session_kind:'user',workflow_id:workflowId,vendor_data:'user-1',status:'Approved'},
		})).rejects.toThrow('DIDIT_SESSION_NOT_FOUND');

		expect(mocks.sessionUpdate).not.toHaveBeenCalled();
		expect(mocks.userUpdate).not.toHaveBeenCalled();
	});

	it('does not apply a sandbox callback result to the Aurevia account',async()=>{
		mocks.sessionFindUnique.mockResolvedValue({...session(),environment:'sandbox'});

		await expect(applyDiditDecision({
			userId:'user-1',
			decision:{session_id:sessionId,session_kind:'user',workflow_id:workflowId,vendor_data:'user-1',status:'Approved'},
		})).resolves.toEqual({status:'APPROVED',environment:'sandbox',applied:false});

		expect(mocks.sessionUpdate).toHaveBeenCalledOnce();
		expect(mocks.userUpdate).not.toHaveBeenCalled();
	});
});
