import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	requireAdmin:vi.fn(),
	auditLogFindUnique:vi.fn(),
	dismissalUpsert:vi.fn(),
	dismissalUpdateMany:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({requireAdmin:mocks.requireAdmin}));
vi.mock('@/lib/db',()=>({
	db:{
		auditLog:{findUnique:mocks.auditLogFindUnique},
		adminDashboardActivityDismissal:{upsert:mocks.dismissalUpsert,updateMany:mocks.dismissalUpdateMany},
	},
}));

import {POST} from '@/app/api/admin/dashboard/activity/route';

function request(body:unknown){
	return new Request('http://localhost/api/admin/dashboard/activity',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
	mocks.auditLogFindUnique.mockResolvedValue({id:'event-1'});
	mocks.dismissalUpsert.mockResolvedValue({});
	mocks.dismissalUpdateMany.mockResolvedValue({count:1});
});

describe('admin dashboard activity visibility',()=>{
	it('hides an activity without changing its audit record',async()=>{
		const response=await POST(request({auditLogId:'event-1',hidden:true}));

		expect(response.status).toBe(200);
		expect(mocks.dismissalUpsert).toHaveBeenCalledWith(expect.objectContaining({
			where:{auditLogId:'event-1'},
			create:{auditLogId:'event-1',hiddenById:'admin-1'},
		}));
		expect(mocks.dismissalUpdateMany).not.toHaveBeenCalled();
	});

	it('restores previously hidden activity',async()=>{
		const response=await POST(request({auditLogId:'event-1',hidden:false}));

		expect(response.status).toBe(200);
		expect(mocks.dismissalUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
			where:{auditLogId:'event-1',restoredAt:null},
			data:expect.objectContaining({restoredById:'admin-1'}),
		}));
		expect(mocks.dismissalUpsert).not.toHaveBeenCalled();
	});

	it('rejects missing audit records',async()=>{
		mocks.auditLogFindUnique.mockResolvedValue(null);
		const response=await POST(request({auditLogId:'missing',hidden:true}));

		expect(response.status).toBe(404);
		expect(mocks.dismissalUpsert).not.toHaveBeenCalled();
	});

	it('requires administrator authentication',async()=>{
		mocks.requireAdmin.mockRejectedValue(new Error('FORBIDDEN'));
		const response=await POST(request({auditLogId:'event-1',hidden:true}));

		expect(response.status).toBe(403);
		expect(mocks.auditLogFindUnique).not.toHaveBeenCalled();
	});
});
