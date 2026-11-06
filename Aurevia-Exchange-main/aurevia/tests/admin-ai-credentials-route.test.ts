import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireAdmin:vi.fn(),
	transaction:vi.fn(),
	settingCreate:vi.fn(),
	settingFindUnique:vi.fn(),
	settingUpdate:vi.fn(),
	settingUpsert:vi.fn(),
	auditCreate:vi.fn(),
	encrypt:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireAdmin:mocks.requireAdmin}));
vi.mock('@/lib/db',()=>({db:{$transaction:mocks.transaction,systemSetting:{create:mocks.settingCreate,findUnique:mocks.settingFindUnique,update:mocks.settingUpdate,upsert:mocks.settingUpsert},auditLog:{create:mocks.auditCreate}}}));
vi.mock('@/lib/ai-credential-vault',()=>({
	aiCredentialProposalSettingPrefix:()=> 'aurevia.ai.credential.proposal.',
	aiCredentialSettingKey:(provider:string)=>`aurevia.ai.credential.${provider}`,
	encryptAiCredential:mocks.encrypt,
}));

import {PATCH,POST} from '@/app/api/admin/command-center/credentials/route';

const makeRequest=(method:'POST'|'PATCH',body:Record<string,unknown>)=>new Request('https://aurevia.test/api/admin/command-center/credentials',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.requireAdmin.mockResolvedValue({id:'admin-a'});
	mocks.encrypt.mockReturnValue({version:1,iv:'iv',ciphertext:'sealed',authTag:'tag'});
	mocks.settingCreate.mockResolvedValue({});
	mocks.settingFindUnique.mockResolvedValue(null);
	mocks.settingUpdate.mockResolvedValue({});
	mocks.settingUpsert.mockResolvedValue({});
	mocks.auditCreate.mockResolvedValue({});
	mocks.transaction.mockImplementation(async(callback:(transaction:unknown)=>Promise<unknown>)=>callback({systemSetting:{create:mocks.settingCreate,update:mocks.settingUpdate,upsert:mocks.settingUpsert},auditLog:{create:mocks.auditCreate}}));
});

describe('admin AI credential approval route',()=>{
	it('stores an encrypted pending proposal and never echoes or audits the key',async()=>{
		const response=await POST(makeRequest('POST',{provider:'openrouter',apiKey:'sensitive-provider-key'}));
		const body=await response.json();
		expect(response.status).toBe(201);
		expect(body.proposal).toMatchObject({provider:'openrouter',status:'PENDING'});
		expect(JSON.stringify(body)).not.toContain('sensitive-provider-key');
		expect(mocks.encrypt).toHaveBeenCalledWith('sensitive-provider-key');
		expect(mocks.settingCreate).toHaveBeenCalledWith({data:expect.objectContaining({key:expect.stringContaining('proposal.'),value:expect.stringContaining('sealed')})});
		expect(mocks.auditCreate).toHaveBeenCalledWith({data:expect.objectContaining({metadata:{provider:'openrouter',status:'PENDING'}})});
		expect(JSON.stringify(mocks.auditCreate.mock.calls)).not.toContain('sensitive-provider-key');
	});

	it('requires a different administrator to approve a proposal',async()=>{
		mocks.settingFindUnique.mockResolvedValue({value:JSON.stringify({provider:'groq',submittedBy:'admin-a',status:'PENDING',encrypted:{version:1}})});
		const response=await PATCH(makeRequest('PATCH',{proposalId:'proposal-12345',decision:'APPROVE'}));
		expect(response.status).toBe(403);
		expect(mocks.settingUpsert).not.toHaveBeenCalled();
	});

	it('activates only a second-admin-approved credential and records the decision',async()=>{
		mocks.requireAdmin.mockResolvedValue({id:'admin-b'});
		mocks.settingFindUnique.mockResolvedValue({value:JSON.stringify({provider:'gemini',submittedBy:'admin-a',status:'PENDING',encrypted:{version:1,ciphertext:'sealed'}})});
		const response=await PATCH(makeRequest('PATCH',{proposalId:'proposal-12345',decision:'APPROVE'}));
		expect(response.status).toBe(200);
		expect(mocks.settingUpsert).toHaveBeenCalledWith({where:{key:'aurevia.ai.credential.gemini'},create:{key:'aurevia.ai.credential.gemini',value:JSON.stringify({version:1,ciphertext:'sealed'})},update:{value:JSON.stringify({version:1,ciphertext:'sealed'})}});
		expect(mocks.auditCreate).toHaveBeenCalledWith({data:expect.objectContaining({action:'AI_CREDENTIAL_APPROVED',metadata:expect.objectContaining({provider:'gemini',decision:'APPROVED'})})});
	});
});