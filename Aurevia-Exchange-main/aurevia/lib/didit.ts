import {createHmac,timingSafeEqual} from 'node:crypto';
import type {EnvironmentSource} from '@/lib/config/env';
import {getServerConfiguration} from '@/lib/config/env';

const DIDIT_API_ORIGIN='https://verification.didit.me';
const DIDIT_VERIFICATION_HOST='verify.didit.me';
const MAX_WEBHOOK_BYTES=64*1024;
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DiditEnvironment='sandbox'|'live';
export type DiditStatus='NOT_STARTED'|'IN_PROGRESS'|'APPROVED'|'DECLINED'|'IN_REVIEW'|'RESUBMITTED'|'ABANDONED'|'EXPIRED';
export type DiditKycStatus='PENDING'|'IN_PROGRESS'|'APPROVED'|'REJECTED'|'EXPIRED'|'FAILED';
export type DiditSession={sessionId:string;url:string;status:DiditStatus;workflowId:string;vendorData:string};
export type DiditDecision=Record<string,unknown>&{session_id:string;session_kind:'user';status:string;workflow_id:string;vendor_data:string};
export type DiditWebhookEvent=Record<string,unknown>&{
	event_id:string;
	session_id:string;
	webhook_type:'status.updated'|'data.updated';
	timestamp:number;
	created_at:number;
	environment:DiditEnvironment;
	workflow_id:string;
	vendor_data:string;
	status:string;
};

export function diditReadiness(source:EnvironmentSource=process.env){
	const config=getServerConfiguration(source).didit;
	const missing:string[]=[];
	if(!config.enabled)missing.push('DIDIT_ENABLED=true');
	for(const [name,value] of [
		['DIDIT_API_KEY',config.apiKey],
		['DIDIT_WORKFLOW_ID',config.workflowId],
		['DIDIT_WEBHOOK_SECRET',config.webhookSecret],
	] as const)if(!value)missing.push(name);
	if(config.workflowId&&!UUID_PATTERN.test(config.workflowId))missing.push('DIDIT_WORKFLOW_ID (must be a workflow UUID)');
	if(config.environment!=='sandbox'&&config.environment!=='live')missing.push('DIDIT_ENV (must be sandbox or live)');
	if((config.apiKey.startsWith('sk_test_')&&config.environment!=='sandbox')||(config.apiKey.startsWith('sk_live_')&&config.environment!=='live')){
		missing.push('DIDIT_ENV (does not match the API key mode)');
	}
	missing.push(...config.formattingIssues);
	return {enabled:config.enabled,environment:config.environment,missing,ready:config.enabled&&missing.length===0};
}

export function diditIsConfigured(source:EnvironmentSource=process.env){
	return diditReadiness(source).ready;
}

export function assertDiditConfigured(source:EnvironmentSource=process.env){
	const config=getServerConfiguration(source).didit;
	const readiness=diditReadiness(source);
	if(!config.enabled)throw new Error('DIDIT_INTEGRATION_DISABLED');
	if(!readiness.ready)throw new Error('DIDIT_CONFIGURATION_REQUIRED');
	return config;
}

function isRecord(value:unknown):value is Record<string,unknown>{
	return typeof value==='object'&&value!==null&&!Array.isArray(value);
}

function sortDiditKeys(value:unknown):unknown{
	if(Array.isArray(value))return value.map(sortDiditKeys);
	if(isRecord(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sortDiditKeys(value[key])]));
	return value;
}

export function canonicalizeDiditWebhook(payload:unknown){
	return JSON.stringify(sortDiditKeys(payload));
}

function headerValue(headers:Headers|Record<string,string|undefined>,name:string){
	if(headers instanceof Headers)return headers.get(name);
	const lowerName=name.toLowerCase();
	for(const [key,value] of Object.entries(headers))if(key.toLowerCase()===lowerName)return value||null;
	return null;
}

function hasValidHmac(message:string,signature:string,secret:string){
	if(!/^[a-f0-9]{64}$/i.test(signature))return false;
	const expected=Buffer.from(createHmac('sha256',secret).update(message,'utf8').digest('hex'),'hex');
	const received=Buffer.from(signature,'hex');
	return expected.length===received.length&&timingSafeEqual(expected,received);
}

export function verifyDiditWebhook(rawBody:string,headers:Headers|Record<string,string|undefined>,source:EnvironmentSource=process.env,nowMs=Date.now()){
	const secret=getServerConfiguration(source).didit.webhookSecret;
	if(!secret)throw new Error('DIDIT_WEBHOOK_SECRET_MISSING');
	const timestampHeader=headerValue(headers,'x-timestamp');
	if(!timestampHeader||!/^\d+$/.test(timestampHeader))throw new Error('DIDIT_WEBHOOK_TIMESTAMP_INVALID');
	const timestamp=Number(timestampHeader);
	if(!Number.isSafeInteger(timestamp)||Math.abs(Math.floor(nowMs/1000)-timestamp)>300)throw new Error('DIDIT_WEBHOOK_TIMESTAMP_EXPIRED');
	let payload:unknown;
	try{payload=JSON.parse(rawBody)}catch{throw new Error('DIDIT_WEBHOOK_BODY_INVALID')}
	if(!isRecord(payload)||payload.timestamp!==timestamp)throw new Error('DIDIT_WEBHOOK_TIMESTAMP_MISMATCH');

	const canonical=canonicalizeDiditWebhook(payload);
	for(const signature of [headerValue(headers,'x-signature-v2'),headerValue(headers,'x-signature-v2-previous')]){
		if(signature&&hasValidHmac(canonical,signature,secret))return true;
	}
	for(const signature of [headerValue(headers,'x-signature'),headerValue(headers,'x-signature-previous')]){
		if(signature&&hasValidHmac(rawBody,signature,secret))return true;
	}
	throw new Error('DIDIT_WEBHOOK_SIGNATURE_INVALID');
}

export async function readDiditWebhookBody(request:Request){
	const contentLength=Number(request.headers.get('content-length'));
	if(Number.isFinite(contentLength)&&contentLength>MAX_WEBHOOK_BYTES)throw new Error('DIDIT_WEBHOOK_TOO_LARGE');
	if(!request.body)return '';
	const reader=request.body.getReader();
	const chunks:Uint8Array[]=[];
	let length=0;
	try{
		while(true){
			const {done,value}=await reader.read();
			if(done)break;
			length+=value.byteLength;
			if(length>MAX_WEBHOOK_BYTES){await reader.cancel();throw new Error('DIDIT_WEBHOOK_TOO_LARGE')}
			chunks.push(value);
		}
	}catch(error){
		if(error instanceof Error&&error.message==='DIDIT_WEBHOOK_TOO_LARGE')throw error;
		throw new Error('DIDIT_WEBHOOK_READ_FAILED');
	}
	const body=new Uint8Array(length);
	let offset=0;
	for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength}
	return new TextDecoder('utf-8',{fatal:true}).decode(body);
}

export function mapDiditStatus(value:unknown):DiditStatus{
	if(typeof value!=='string')throw new Error('DIDIT_STATUS_INVALID');
	switch(value){
		case 'Not Started':return 'NOT_STARTED';
		case 'In Progress':
		case 'Awaiting User':return 'IN_PROGRESS';
		case 'Approved':return 'APPROVED';
		case 'Declined':return 'DECLINED';
		case 'In Review':return 'IN_REVIEW';
		case 'Resubmitted':return 'RESUBMITTED';
		case 'Abandoned':return 'ABANDONED';
		case 'Expired':
		case 'Kyc Expired':return 'EXPIRED';
		default:throw new Error('DIDIT_STATUS_UNSUPPORTED');
	}
}

export function mapDiditKycStatus(status:DiditStatus):DiditKycStatus{
	if(status==='APPROVED')return 'APPROVED';
	if(status==='DECLINED')return 'REJECTED';
	if(status==='EXPIRED'||status==='ABANDONED')return 'EXPIRED';
	if(status==='IN_PROGRESS'||status==='IN_REVIEW'||status==='RESUBMITTED')return 'IN_PROGRESS';
	return 'PENDING';
}

function parseHostedUrl(value:unknown){
	if(typeof value!=='string')throw new Error('DIDIT_SESSION_RESPONSE_INVALID');
	let url:URL;
	try{url=new URL(value)}catch{throw new Error('DIDIT_SESSION_RESPONSE_INVALID')}
	if(url.protocol!=='https:'||url.hostname!==DIDIT_VERIFICATION_HOST)throw new Error('DIDIT_SESSION_RESPONSE_INVALID');
	return url.toString();
}

function validateCallback(value:string){
	let callback:URL;
	try{callback=new URL(value)}catch{throw new Error('DIDIT_CALLBACK_URL_INVALID')}
	const localHttp=callback.protocol==='http:'&&(callback.hostname==='localhost'||callback.hostname==='127.0.0.1');
	if(callback.protocol!=='https:'&&!localHttp)throw new Error('DIDIT_CALLBACK_URL_INVALID');
	return callback.toString();
}

export async function createDiditSession(input:{vendorData:string;callback:string;email?:string;phone?:string}):Promise<DiditSession>{
	const config=assertDiditConfigured();
	const callback=validateCallback(input.callback);
	const body={
		workflow_id:config.workflowId,
		vendor_data:input.vendorData,
		callback,
		callback_method:'both',
		metadata:{aurevia_user_id:input.vendorData},
		...(input.email||input.phone?{contact_details:{...(input.email?{email:input.email}:{}),...(input.phone?{phone:input.phone}:{})}}:{}),
	};
	let response:Response;
	try{
		response=await fetch(`${DIDIT_API_ORIGIN}/v3/session/`,{
			method:'POST',
			headers:{'content-type':'application/json','x-api-key':config.apiKey},
			body:JSON.stringify(body),
			signal:AbortSignal.timeout(10_000),
			redirect:'error',
		});
	}catch{throw new Error('DIDIT_SESSION_PROVIDER_UNAVAILABLE')}
	if(!response.ok)throw new Error(response.status===401?'DIDIT_API_KEY_REJECTED':response.status===403?'DIDIT_API_PERMISSION_DENIED':response.status===429?'DIDIT_RATE_LIMITED':'DIDIT_SESSION_REQUEST_FAILED');
	const result:unknown=await response.json().catch(()=>null);
	if(!isRecord(result)||typeof result.session_id!=='string'||!UUID_PATTERN.test(result.session_id)||result.session_kind!=='user'
		||result.workflow_id!==config.workflowId||result.vendor_data!==input.vendorData)throw new Error('DIDIT_SESSION_RESPONSE_INVALID');
	return {
		sessionId:result.session_id,
		url:parseHostedUrl(result.url),
		status:mapDiditStatus(result.status),
		workflowId:config.workflowId,
		vendorData:input.vendorData,
	};
}

export async function getDiditDecision(sessionId:string):Promise<DiditDecision>{
	const config=assertDiditConfigured();
	if(!UUID_PATTERN.test(sessionId))throw new Error('DIDIT_SESSION_ID_INVALID');
	let response:Response;
	try{
		response=await fetch(`${DIDIT_API_ORIGIN}/v3/session/${encodeURIComponent(sessionId)}/decision/`,{
			headers:{'x-api-key':config.apiKey},
			signal:AbortSignal.timeout(10_000),
			redirect:'error',
		});
	}catch{throw new Error('DIDIT_DECISION_PROVIDER_UNAVAILABLE')}
	if(!response.ok)throw new Error(response.status===401?'DIDIT_API_KEY_REJECTED':response.status===403?'DIDIT_API_PERMISSION_DENIED':response.status===404?'DIDIT_SESSION_NOT_FOUND':'DIDIT_DECISION_REQUEST_FAILED');
	const result:unknown=await response.json().catch(()=>null);
	if(!isRecord(result)||result.session_id!==sessionId||result.session_kind!=='user'||typeof result.workflow_id!=='string'||typeof result.vendor_data!=='string')throw new Error('DIDIT_DECISION_RESPONSE_INVALID');
	mapDiditStatus(result.status);
	return result as DiditDecision;
}

export function validateDiditWebhookEvent(value:unknown):DiditWebhookEvent{
	if(!isRecord(value)
		||typeof value.event_id!=='string'||!UUID_PATTERN.test(value.event_id)
		||typeof value.session_id!=='string'||!UUID_PATTERN.test(value.session_id)
		||!['status.updated','data.updated'].includes(String(value.webhook_type))
		||!Number.isSafeInteger(value.timestamp)||!Number.isSafeInteger(value.created_at)
		||typeof value.workflow_id!=='string'||!UUID_PATTERN.test(value.workflow_id)
		||typeof value.vendor_data!=='string'
		||!['sandbox','live'].includes(String(value.environment)))throw new Error('DIDIT_WEBHOOK_EVENT_INVALID');
	mapDiditStatus(value.status);
	return value as DiditWebhookEvent;
}
