import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	getServerSession:vi.fn(),
	termsFindUnique:vi.fn(),
	getCurrentMandatoryTerms:vi.fn(),
}));

vi.mock('next-auth',()=>({getServerSession:mocks.getServerSession}));
vi.mock('@/lib/auth-options',()=>({authOptions:{}}));
vi.mock('@/lib/db',()=>({db:{termsAcceptance:{findUnique:mocks.termsFindUnique}}}));
vi.mock('@/lib/managed-notice-policy',()=>({getCurrentMandatoryTerms:mocks.getCurrentMandatoryTerms}));

import {requireAdmin,requireUser} from '@/lib/auth';

const sessionUser={id:'user-a',role:'USER',sessionHash:'a'.repeat(64)};

beforeEach(()=>{
	vi.clearAllMocks();
	mocks.getServerSession.mockResolvedValue({user:sessionUser});
	mocks.getCurrentMandatoryTerms.mockResolvedValue({version:'2026-11-10-v2'});
	mocks.termsFindUnique.mockResolvedValue({version:'2026-11-10-v2'});
});

describe('terms acceptance authorization',()=>{
	it('allows a user after accepting the currently published version',async()=>{
		await expect(requireUser()).resolves.toMatchObject({id:'user-a'});
		expect(mocks.termsFindUnique).toHaveBeenCalledWith({
			where:{userId_version:{userId:'user-a',version:'2026-11-10-v2'}},
			select:{version:true},
		});
	});

	it('denies protected API access when the current version is not accepted',async()=>{
		mocks.termsFindUnique.mockResolvedValue(null);
		await expect(requireUser()).rejects.toThrow('FORBIDDEN');
	});

	it('requires the newly published version even when an older version was accepted',async()=>{
		mocks.getServerSession.mockResolvedValue({user:{id:'admin-a',role:'ADMIN'}});
		mocks.termsFindUnique.mockResolvedValue({version:'2026-10-27'});
		await expect(requireAdmin()).rejects.toThrow('FORBIDDEN');
		expect(mocks.termsFindUnique).toHaveBeenCalledWith({
			where:{userId_version:{userId:'admin-a',version:'2026-11-10-v2'}},
			select:{version:true},
		});
	});

	it('keeps the consent status and acceptance endpoints accessible before acceptance',async()=>{
		mocks.termsFindUnique.mockResolvedValue(null);
		await expect(requireUser({skipTermsAcceptance:true})).resolves.toMatchObject({id:'user-a'});
		expect(mocks.termsFindUnique).not.toHaveBeenCalled();
	});
});
