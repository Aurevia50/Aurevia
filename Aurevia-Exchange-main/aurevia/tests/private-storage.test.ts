import {afterEach,describe,expect,it,vi} from 'vitest';
import {createPrivateObjectKey,createPrivateSignedUrl,deletePrivateObject,hasMatchingFileExtension,isPrivateObjectKeyOwnedBy,PrivateStorageError,uploadPrivateObject} from '../lib/private-storage';

const owner='user_123';
const key='user_123/123e4567-e89b-42d3-a456-426614174000.pdf';

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});

describe('private Storage ownership and upload validation',()=>{
	it('generates user-namespaced opaque keys with a normalized extension',()=>{
		const generated=createPrivateObjectKey('kyc',owner,'image/jpeg');
		expect(generated).toMatch(/^user_123\/[0-9a-f-]{36}\.jpg$/);
		expect(isPrivateObjectKeyOwnedBy('kyc',owner,generated)).toBe(true);
	});

	it('supports opaque video keys in the private stories bucket',()=>{
		const generated=createPrivateObjectKey('story',owner,'video/mp4');
		expect(generated).toMatch(/^user_123\/[0-9a-f-]{36}\.mp4$/);
		expect(isPrivateObjectKeyOwnedBy('story',owner,generated)).toBe(true);
		expect(isPrivateObjectKeyOwnedBy('clientStory',owner,generated)).toBe(false);
	});

	it('uploads stories media only through the private Storage bucket',async()=>{
		vi.stubEnv('SUPABASE_URL','https://story-storage.example.test');
		vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','server-only-test-key');
		const fetchMock=vi.fn(async(input:RequestInfo|URL)=>{
			const url=String(input);
			if(url.endsWith('/storage/v1/bucket/stories'))return new Response(JSON.stringify({id:'stories',public:false}),{status:200});
			return new Response('{}',{status:200});
		});
		vi.stubGlobal('fetch',fetchMock);
		const videoKey=createPrivateObjectKey('story',owner,'video/mp4');
		await uploadPrivateObject('story',owner,videoKey,Buffer.from('0000ftyp'),'video/mp4');
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(String(fetchMock.mock.calls[1][0])).toContain('/storage/v1/object/stories/user_123/');
	});

	it('accepts a key only for its recorded owner and expected Storage area',()=>{
		expect(isPrivateObjectKeyOwnedBy('kyc',owner,key)).toBe(true);
		expect(isPrivateObjectKeyOwnedBy('kyc','other_user',key)).toBe(false);
		expect(isPrivateObjectKeyOwnedBy('avatar',owner,key)).toBe(false);
		expect(isPrivateObjectKeyOwnedBy('kyc',owner,'user_123/../other/document.pdf')).toBe(false);
	});

	it('rejects cross-owner uploads and deletions before contacting Storage',async()=>{
		await expect(uploadPrivateObject('kyc','other_user',key,Buffer.from('%PDF-'),'application/pdf'))
			.rejects.toMatchObject({status:403});
		await expect(deletePrivateObject('kyc','other_user',key)).rejects.toMatchObject({status:403});
	});

	it('recognizes only MIME-matching filename extensions',()=>{
		expect(hasMatchingFileExtension('proof.jpeg','image/jpeg')).toBe(true);
		expect(hasMatchingFileExtension('proof.png','image/jpeg')).toBe(false);
		expect(hasMatchingFileExtension('proof.pdf.exe','application/pdf')).toBe(false);
	});

	it('refuses signed URLs longer than five minutes',async()=>{
		await expect(createPrivateSignedUrl('kyc',owner,key,301)).rejects.toMatchObject({status:400});
	});

	it('fails closed without server credentials instead of using a public URL',async()=>{
		vi.stubEnv('SUPABASE_URL','');
		vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','');
		vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://public.example.invalid');
		await expect(uploadPrivateObject('kyc',owner,key,Buffer.from('%PDF-'), 'application/pdf'))
			.rejects.toBeInstanceOf(PrivateStorageError);
	});
});
