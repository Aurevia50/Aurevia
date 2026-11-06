import {randomUUID} from 'node:crypto';
import {getServerConfiguration} from './config/env';

export type PrivateStorageArea='kyc'|'avatar'|'receipt'|'support'|'clientStory'|'story'|'tax';

type StorageConfiguration={baseUrl:string;serviceKey:string};
type AreaConfiguration={bucket:string;maxBytes:number;maxBytesByMime?:Readonly<Record<string,number>>;mimeTypes:readonly string[];legacyPrefix:string};

const areas:Record<PrivateStorageArea,AreaConfiguration>={
	kyc:{bucket:'kyc-documents',maxBytes:10*1024*1024,mimeTypes:['application/pdf','image/jpeg','image/png','image/webp'],legacyPrefix:'kyc'},
	avatar:{bucket:'profile-avatars',maxBytes:5*1024*1024,mimeTypes:['image/jpeg','image/png','image/webp'],legacyPrefix:'avatars'},
	receipt:{bucket:'wallet-receipts',maxBytes:10*1024*1024,mimeTypes:['application/pdf','image/jpeg','image/png','image/webp'],legacyPrefix:'receipts'},
	support:{bucket:'support-attachments',maxBytes:10*1024*1024,mimeTypes:['application/pdf','image/jpeg','image/png','image/webp'],legacyPrefix:'support'},
	clientStory:{bucket:'client-stories',maxBytes:5*1024*1024,mimeTypes:['image/jpeg','image/png','image/webp'],legacyPrefix:'client-stories'},
	story:{bucket:'stories',maxBytes:50*1024*1024,maxBytesByMime:{'image/jpeg':5*1024*1024,'image/png':5*1024*1024,'image/webp':5*1024*1024},mimeTypes:['image/jpeg','image/png','image/webp','video/mp4','video/webm'],legacyPrefix:'stories'},
	tax:{bucket:'tax-documents',maxBytes:12*1024*1024,mimeTypes:['application/pdf','image/jpeg','image/png','image/webp'],legacyPrefix:'tax'},
};

const extensionByMime:Record<string,string>={
	'application/pdf':'pdf',
	'image/jpeg':'jpg',
	'image/png':'png',
	'image/webp':'webp',
	'video/mp4':'mp4',
	'video/webm':'webm',
};
const maxSignedUrlSeconds=300;

export class PrivateStorageError extends Error {
	constructor(message:string,readonly status=502){super(message);this.name='PrivateStorageError';}
}

const privateBucketCache=new Map<string,{expiresAt:number;promise:Promise<void>}>();

function configuration():StorageConfiguration{
	const config=getServerConfiguration().supabase;
	if(!config.url||!config.serviceRoleKey)throw new PrivateStorageError('Private file storage is not configured.',503);
	try{
		const parsed=new URL(config.url);
		const isLocalHttp=parsed.protocol==='http:'&&['localhost','127.0.0.1','::1'].includes(parsed.hostname);
		if((parsed.protocol!=='https:'&&!isLocalHttp)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new PrivateStorageError('Private file storage URL is invalid.',503);
	}catch{throw new PrivateStorageError('Private file storage URL is invalid.',503)}
	return {baseUrl:config.url,serviceKey:config.serviceRoleKey};
}

function storageHeaders(config:StorageConfiguration,contentType?:string){
	return {Authorization:`Bearer ${config.serviceKey}`,apikey:config.serviceKey,...(contentType?{'Content-Type':contentType}:{})};
}

function validateOwnerId(ownerId:string){
	if(!/^[A-Za-z0-9_-]{1,128}$/.test(ownerId))throw new PrivateStorageError('Invalid file owner.',400);
}

export function isPrivateObjectKeyOwnedBy(area:PrivateStorageArea,ownerId:string,key:string){
	if(!Object.hasOwn(areas,area)||!/^[A-Za-z0-9_-]{1,128}$/.test(ownerId)||typeof key!=='string')return false;
	const allowedExtensions=areas[area].mimeTypes.flatMap(mime=>mime==='image/jpeg'?['jpg','jpeg']:[extensionByMime[mime]].filter((value):value is string=>Boolean(value)));
	if(!allowedExtensions.includes(key.split('.').at(-1)?.toLowerCase()||''))return false;
	const file=`[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(?:${allowedExtensions.join('|')})`;
	const canonical=new RegExp(`^${ownerId}/${file}$`,'i');
	if(canonical.test(key))return true;
	const legacyPrefix=areas[area].legacyPrefix;
	const legacy=area==='receipt'
		?new RegExp(`^${legacyPrefix}/${ownerId}/[A-Za-z0-9_-]{1,128}/${file}$`,'i')
		:new RegExp(`^${legacyPrefix}/${ownerId}/${file}$`,'i');
	return legacy.test(key);
}

function assertOwnedKey(area:PrivateStorageArea,ownerId:string,key:string){
	validateOwnerId(ownerId);
	if(!isPrivateObjectKeyOwnedBy(area,ownerId,key))throw new PrivateStorageError('File ownership could not be verified.',403);
}

export function createPrivateObjectKey(area:PrivateStorageArea,ownerId:string,contentType:string){
	validateOwnerId(ownerId);
	const areaConfig=areas[area];
	if(!areaConfig||!areaConfig.mimeTypes.includes(contentType)||!extensionByMime[contentType])throw new PrivateStorageError('Unsupported file type.',415);
	return `${ownerId}/${randomUUID()}.${extensionByMime[contentType]}`;
}

export function hasMatchingFileExtension(filename:string,contentType:string){
	const expected=extensionByMime[contentType];
	const actual=/\.([A-Za-z0-9]+)$/.exec(filename.trim())?.[1]?.toLowerCase();
	return !!expected&&(actual===expected||(contentType==='image/jpeg'&&actual==='jpeg'));
}

async function verifyPrivateBucket(config:StorageConfiguration,area:PrivateStorageArea){
	const {bucket}=areas[area];
	const cacheKey=`${config.baseUrl}:${bucket}`;
	const cached=privateBucketCache.get(cacheKey);
	if(cached&&cached.expiresAt>Date.now())return cached.promise;
	const promise=(async()=>{
		let response:Response;
		try{response=await fetch(`${config.baseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`,{headers:storageHeaders(config),cache:'no-store',signal:AbortSignal.timeout(5_000)})}
		catch{throw new PrivateStorageError('Private file storage is unavailable.',503)}
		if(!response.ok)throw new PrivateStorageError('Private storage bucket is unavailable.',503);
		const result=await response.json() as {id?:string;public?:boolean};
		if(result.id!==bucket||result.public!==false)throw new PrivateStorageError('Configured file storage bucket must exist and be private.',503);
	})().catch(error=>{privateBucketCache.delete(cacheKey);throw error});
	privateBucketCache.set(cacheKey,{expiresAt:Date.now()+60_000,promise});
	return promise;
}

function objectUrl(config:StorageConfiguration,area:PrivateStorageArea,key:string){
	const path=key.split('/').map(segment=>encodeURIComponent(segment)).join('/');
	return `${config.baseUrl}/storage/v1/object/${encodeURIComponent(areas[area].bucket)}/${path}`;
}

export async function uploadPrivateObject(area:PrivateStorageArea,ownerId:string,key:string,bytes:Buffer,contentType:string){
	assertOwnedKey(area,ownerId,key);
	const areaConfig=areas[area];
	if(!areaConfig.mimeTypes.includes(contentType)||!hasMatchingFileExtension(key,contentType))throw new PrivateStorageError('File type and extension do not match.',415);
	if(bytes.length===0||bytes.length>(areaConfig.maxBytesByMime?.[contentType]??areaConfig.maxBytes))throw new PrivateStorageError('Uploaded file is outside the permitted size.',413);
	const config=configuration();
	await verifyPrivateBucket(config,area);
	let response:Response;
	try{response=await fetch(objectUrl(config,area,key),{method:'POST',headers:{...storageHeaders(config,contentType),'x-upsert':'false'},body:new Uint8Array(bytes)})}
	catch{throw new PrivateStorageError('Private file storage is unavailable.',503)}
	if(!response.ok)throw new PrivateStorageError(response.status===413?'Uploaded file is too large.':'Private file upload failed.',response.status===413?413:502);
}

export async function deletePrivateObject(area:PrivateStorageArea,ownerId:string,key:string){
	assertOwnedKey(area,ownerId,key);
	try{
		const config=configuration();
		await verifyPrivateBucket(config,area);
		const response=await fetch(objectUrl(config,area,key),{method:'DELETE',headers:storageHeaders(config),signal:AbortSignal.timeout(5_000)});
		if(!response.ok&&response.status!==404)throw new PrivateStorageError('Private file cleanup failed.',502);
		return true;
	}catch(error){
		const reason=error instanceof PrivateStorageError?String(error.status):error instanceof Error?error.name:'UnknownError';
		console.error(`Private file cleanup failed (${reason}).`);
		return false;
	}
}

export async function createPrivateSignedUrl(area:PrivateStorageArea,ownerId:string,key:string,expiresIn=120){
	assertOwnedKey(area,ownerId,key);
	if(!Number.isInteger(expiresIn)||expiresIn<1||expiresIn>maxSignedUrlSeconds)throw new PrivateStorageError('Signed file access duration is invalid.',400);
	const config=configuration();
	await verifyPrivateBucket(config,area);
	const path=key.split('/').map(segment=>encodeURIComponent(segment)).join('/');
	let response:Response;
	try{response=await fetch(`${config.baseUrl}/storage/v1/object/sign/${encodeURIComponent(areas[area].bucket)}/${path}`,{method:'POST',headers:{...storageHeaders(config,'application/json'),'Cache-Control':'no-store'},body:JSON.stringify({expiresIn})})}
	catch{throw new PrivateStorageError('Private file storage is unavailable.',503)}
	if(!response.ok)throw new PrivateStorageError('Private file is unavailable.',502);
	const result=await response.json() as {signedURL?:string;signedUrl?:string};
	const signedPath=result.signedURL||result.signedUrl;
	if(!signedPath)throw new PrivateStorageError('Private file is unavailable.',502);
	let signedUrl:URL;
	try{
		const normalized=signedPath.startsWith('/object/sign/')?`/storage/v1${signedPath}`:signedPath;
		signedUrl=new URL(normalized,`${config.baseUrl}/storage/v1/`);
	}catch{throw new PrivateStorageError('Private file is unavailable.',502)}
	const expectedPath=`/storage/v1/object/sign/${areas[area].bucket}/`;
	if(signedUrl.origin!==new URL(config.baseUrl).origin||!signedUrl.pathname.startsWith(expectedPath))throw new PrivateStorageError('Private file is unavailable.',502);
	return signedUrl.toString();
}

export function isPrivateStorageConfigured(){
	const config=getServerConfiguration().supabase;
	return Boolean(config.url&&config.serviceRoleKey);
}
