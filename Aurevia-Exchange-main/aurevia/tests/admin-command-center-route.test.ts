import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireAdmin:vi.fn(),
	auditFindMany:vi.fn(),
	auditCreate:vi.fn(),
	settingFindMany:vi.fn(),
	inventory:vi.fn(),
	aiStatus:vi.fn(),
	checkIntegration:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireAdmin:mocks.requireAdmin}));
vi.mock('@/lib/db',()=>({db:{auditLog:{findMany:mocks.auditFindMany,create:mocks.auditCreate},systemSetting:{findMany:mocks.settingFindMany}}}));
vi.mock('@/lib/ai-gateway',()=>({getAiEngineStatus:mocks.aiStatus}));
vi.mock('@/lib/ai-credential-vault',()=>({aiCredentialProposalSettingPrefix:()=> 'aurevia.ai.credential.proposal.'}));
vi.mock('@/lib/integration-manager',()=>({
	getIntegrationInventory:mocks.inventory,
	checkIntegration:mocks.checkIntegration,
	isIntegrationId:(value:unknown)=>value==='openrouter',
}));

import {GET} from '@/app/api/admin/command-center/route';
import {POST} from '@/app/api/admin/command-center/test/route';

const request=(body:Record<string,unknown>)=>new Request('https://aurevia.test/api/admin/command-center/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.requireAdmin.mockResolvedValue({id:'admin-a'});
	mocks.auditFindMany.mockImplementation(({where}:{where:{entity:string}})=>Promise.resolve(where.entity==='AI_USAGE'?[]:[]));
	mocks.auditCreate.mockResolvedValue({});
	mocks.settingFindMany.mockResolvedValue([{key:'aurevia.ai.credential.proposal.proposal-1',value:JSON.stringify({provider:'openrouter',submittedBy:'admin-a',submittedAt:'2026-10-31T12:00:00.000Z',status:'PENDING',encrypted:{ciphertext:'private-secret'}})}]);
	mocks.inventory.mockResolvedValue([]);
	mocks.aiStatus.mockResolvedValue({configuredProvider:'openrouter',configuredModel:'openrouter/free',activeProvider:null,activeModel:null,providers:[],backupProviders:[]});
	mocks.checkIntegration.mockResolvedValue({id:'openrouter',name:'OpenRouter',status:'CONNECTED',detail:'Provider check succeeded.',feature:'AI',documentation:'https://openrouter.ai/docs',checkedAt:'2026-11-01T00:00:00.000Z',canTest:true});
});

describe('admin AI and API command center routes',()=>{
	it('blocks non-admin snapshot access before reading configuration',async()=>{
		mocks.requireAdmin.mockRejectedValue(new Error('FORBIDDEN'));
		const response=await GET();
		expect(response.status).toBe(403);
		expect(mocks.inventory).not.toHaveBeenCalled();
		expect(mocks.settingFindMany).not.toHaveBeenCalled();
	});

	it('reports inventory failures as unavailable rather than an authorization failure',async()=>{
		mocks.inventory.mockRejectedValue(new Error('database unavailable'));
		const response=await GET();
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({error:'Command center is temporarily unavailable.'});
	});

	it('returns approval metadata without exposing encrypted credentials',async()=>{
		const response=await GET();
		const body=await response.json();
		expect(response.status).toBe(200);
		expect(body.approvalQueue).toEqual([{id:'proposal-1',provider:'openrouter',submittedBy:'admin-a',submittedAt:'2026-10-31T12:00:00.000Z',status:'PENDING'}]);
		expect(JSON.stringify(body)).not.toContain('private-secret');
	});

	it('blocks non-admin integration checks without probing or auditing',async()=>{
		mocks.requireAdmin.mockRejectedValue(new Error('FORBIDDEN'));
		const response=await POST(request({integration:'openrouter'}));
		expect(response.status).toBe(403);
		expect(mocks.checkIntegration).not.toHaveBeenCalled();
		expect(mocks.auditCreate).not.toHaveBeenCalled();
	});

	it('records only the selected integration result for an authorized check',async()=>{
		const response=await POST(request({integration:'openrouter'}));
		const body=await response.json();
		expect(response.status).toBe(200);
		expect(body.integration.status).toBe('CONNECTED');
		expect(mocks.auditCreate).toHaveBeenCalledWith({data:expect.objectContaining({actorId:'admin-a',action:'INTEGRATION_HEALTH_CHECK',metadata:expect.objectContaining({integration:'openrouter',status:'CONNECTED'})})});
	});
});