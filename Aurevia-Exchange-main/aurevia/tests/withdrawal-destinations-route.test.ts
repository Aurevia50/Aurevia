import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireUser:vi.fn(),userFindUnique:vi.fn(),findMany:vi.fn(),findFirst:vi.fn(),
	create:vi.fn(),update:vi.fn(),delete:vi.fn(),fundingFindFirst:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireUser:mocks.requireUser}));
vi.mock('@/lib/db',()=>({db:{
	user:{findUnique:mocks.userFindUnique},
	withdrawalDestination:{findMany:mocks.findMany,findFirst:mocks.findFirst,create:mocks.create,update:mocks.update,delete:mocks.delete},
	fundingRequest:{findFirst:mocks.fundingFindFirst},
}}));

import {DELETE,GET,PATCH,POST} from '@/app/api/withdrawal-destinations/route';

const validBank={
	type:'BANK_TRANSFER',nickname:'Primary checking',countryCode:'US',bankName:'Example Bank',
	beneficiaryName:'Aurevia User',routingNumber:'021000021',accountNumber:'0000123400',accountType:'CHECKING',
};
const record={id:'destination-1',type:'BANK_TRANSFER',nickname:'Primary checking',countryCode:'US',network:null,asset:null,maskedLabel:'Example Bank · account ending 3400',createdAt:new Date(),updatedAt:new Date()};
const originalKey=process.env.WITHDRAWAL_DESTINATION_ENCRYPTION_KEY;

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.requireUser.mockResolvedValue({id:'user-1'});
	mocks.userFindUnique.mockResolvedValue({accountMode:'REAL',status:'ACTIVE',role:'USER'});
	mocks.findMany.mockResolvedValue([record]);
	mocks.findFirst.mockResolvedValue({id:'destination-1'});
	mocks.fundingFindFirst.mockResolvedValue(null);
	mocks.create.mockResolvedValue(record);
	mocks.update.mockResolvedValue(record);
	mocks.delete.mockResolvedValue(record);
	process.env.WITHDRAWAL_DESTINATION_ENCRYPTION_KEY=Buffer.alloc(32,1).toString('base64');
});

afterEach(()=>{
	if(originalKey===undefined)delete process.env.WITHDRAWAL_DESTINATION_ENCRYPTION_KEY;
	else process.env.WITHDRAWAL_DESTINATION_ENCRYPTION_KEY=originalKey;
});

describe('withdrawal destination API',()=>{
	it('returns only masked owner-scoped saved destination metadata',async()=>{
		const response=await GET();
		const result=await response.json();
		expect(response.status).toBe(200);
		expect(result.destinations[0]).toMatchObject({id:'destination-1',maskedLabel:record.maskedLabel});
		expect(JSON.stringify(result)).not.toContain('0000123400');
		expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{userId:'user-1',accountMode:'REAL'},select:expect.objectContaining({maskedLabel:true})}));
	});

	it('validates fields server-side and encrypts valid destination input before persistence',async()=>{
		const invalid=await POST(new Request('https://aurevia.test/api/withdrawal-destinations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...validBank,routingNumber:'1'})}));
		expect(invalid.status).toBe(400);
		expect(mocks.create).not.toHaveBeenCalled();
		const response=await POST(new Request('https://aurevia.test/api/withdrawal-destinations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(validBank)}));
		expect(response.status).toBe(201);
		expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
			userId:'user-1',accountMode:'REAL',type:'BANK_TRANSFER',countryCode:'US',
			ciphertext:expect.any(String),iv:expect.any(String),authTag:expect.any(String),
		})}));
		expect(JSON.stringify(await response.json())).not.toContain('0000123400');
	});

	it('does not reveal or modify another account’s destination',async()=>{
		mocks.findFirst.mockResolvedValue(null);
		const response=await PATCH(new Request('https://aurevia.test/api/withdrawal-destinations',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:'another-users-destination',destination:validBank})}));
		expect(response.status).toBe(404);
		expect(mocks.update).not.toHaveBeenCalled();
	});

	it('prevents edits and removal while a destination is held by a pending withdrawal',async()=>{
		mocks.fundingFindFirst.mockResolvedValue({id:'withdrawal-1'});
		const patch=await PATCH(new Request('https://aurevia.test/api/withdrawal-destinations',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:'destination-1',destination:validBank})}));
		const removal=await DELETE(new Request('https://aurevia.test/api/withdrawal-destinations',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id:'destination-1'})}));
		expect(patch.status).toBe(409);
		expect(removal.status).toBe(409);
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.delete).not.toHaveBeenCalled();
	});

	it('blocks DEMO accounts and unauthenticated callers',async()=>{
		mocks.userFindUnique.mockResolvedValue({accountMode:'DEMO',status:'ACTIVE',role:'USER'});
		const demo=await POST(new Request('https://aurevia.test/api/withdrawal-destinations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(validBank)}));
		expect(demo.status).toBe(403);
		mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED'));
		const unauthorized=await GET();
		expect(unauthorized.status).toBe(401);
	});
});
