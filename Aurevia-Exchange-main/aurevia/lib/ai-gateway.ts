import {z} from 'zod';
import {createHash} from 'node:crypto';
import {db} from '@/lib/db';
import {getApprovedAiCredential} from '@/lib/ai-credential-vault';

export type AiProvider='openrouter'|'gemini'|'groq';
export type AiMessage={role:'system'|'user'|'assistant';content:string};
export type AiUsage={promptTokens:number|null;completionTokens:number|null;totalTokens:number|null};
export type AiResult={content:string;provider:AiProvider;model:string;usage:AiUsage};

const messageSchema=z.array(z.object({
	role:z.enum(['system','user','assistant']),
	content:z.string().min(1).max(12_000),
})).min(1).max(40);
const optionsSchema=z.object({
	temperature:z.number().min(0).max(1).optional(),
	maxTokens:z.number().int().min(32).max(2_048).optional(),
	service:z.string().trim().min(1).max(64).optional(),
	actorId:z.string().trim().min(1).max(128).optional(),
});

const timeoutMs=12_000;
const modelCatalogCache=new Map<AiProvider,{expiresAt:number;models:ProviderModel[]}>();
const modelCatalogRequests=new Map<AiProvider,Promise<ProviderModel[]>>();
const completionCache=new Map<string,{expiresAt:number;result:AiResult}>();
const completionCacheTtlMs=30_000;
const completionCacheLimit=256;
type ProviderModel={id:string;free:boolean};
type ProviderResponse={content:string;model:string;usage:AiUsage};

export class AiGatewayError extends Error{
	constructor(message:string,readonly code:'NOT_CONFIGURED'|'NO_FREE_MODEL'|'RATE_LIMITED'|'PROVIDER_UNAVAILABLE'|'INVALID_RESPONSE',readonly status=503){super(message);this.name='AiGatewayError';}
}

function providerKey(provider:AiProvider){
	if(provider==='openrouter')return process.env.OPENROUTER_API_KEY?.trim()||'';
	if(provider==='gemini')return process.env.GEMINI_API_KEY?.trim()||'';
	return process.env.GROQ_API_KEY?.trim()||'';
}

async function resolvedProviderKey(provider:AiProvider){
	return providerKey(provider)||await getApprovedAiCredential(provider);
}

function selectedProvider():AiProvider{
	const value=process.env.AI_PROVIDER?.trim().toLowerCase();
	return value==='gemini'||value==='groq'?value:'openrouter';
}

function modelFor(provider:AiProvider){
	const configured=process.env.AI_MODEL?.trim();
	if(configured)return configured;
	return provider==='openrouter'?'openrouter/free':provider==='gemini'?'gemini-2.0-flash':'llama-3.1-8b-instant';
}

async function configuredAvailableBackups(){
	const allowed=new Set((process.env.AI_FREE_MODEL_ALLOWLIST||'').split(',').map(value=>value.trim()).filter(Boolean));
	const requested=(process.env.AI_BACKUP_PROVIDERS||'').split(',').map(value=>value.trim().toLowerCase()).filter((value):value is AiProvider=>value==='gemini'||value==='groq');
	const available=await Promise.all(requested.map(async provider=>({provider,configured:Boolean(await resolvedProviderKey(provider))})));
	return available.filter(({provider,configured})=>configured&&allowed.has(`${provider}:${process.env[provider==='gemini'?'GEMINI_FREE_MODEL':'GROQ_FREE_MODEL']?.trim()||''}`)).map(({provider})=>provider);
}

function usageFrom(value:unknown):AiUsage{
	if(!value||typeof value!=='object')return {promptTokens:null,completionTokens:null,totalTokens:null};
	const usage=value as Record<string,unknown>;
	const prompt=Number(usage.prompt_tokens??usage.promptTokenCount);
	const completion=Number(usage.completion_tokens??usage.candidatesTokenCount);
	const total=Number(usage.total_tokens??usage.totalTokenCount);
	return {
		promptTokens:Number.isFinite(prompt)?prompt:null,
		completionTokens:Number.isFinite(completion)?completion:null,
		totalTokens:Number.isFinite(total)?total:null,
	};
}

async function responseJson(response:Response,provider:AiProvider){
	if(!response.ok){
		if(response.status===429)throw new AiGatewayError('The selected AI provider is rate limited.','RATE_LIMITED',429);
		throw new AiGatewayError(`The ${provider} provider rejected the request.`,'PROVIDER_UNAVAILABLE',response.status>=500?503:502);
	}
	try{return await response.json() as Record<string,unknown>}
	catch{throw new AiGatewayError(`The ${provider} provider returned an invalid response.`,'INVALID_RESPONSE',502)}
}

function modelList(data:Record<string,unknown>,provider:AiProvider):ProviderModel[]{
	const values=Array.isArray(data.data)?data.data:Array.isArray(data.models)?data.models:[];
	return values.flatMap(value=>{
		if(!value||typeof value!=='object')return [];
		const model=value as Record<string,unknown>;
		const id=typeof model.id==='string'?model.id:typeof model.name==='string'?model.name.replace(/^models\//,''):'';
		if(!id)return [];
		if(provider!=='openrouter')return [{id,free:false}];
		const pricing=model.pricing&&typeof model.pricing==='object'?model.pricing as Record<string,unknown>:{};
		const zeroPrice=(price:unknown)=>price===0||price==='0'||price==='0.0'||price==='0.000000';
		return [{id,free:zeroPrice(pricing.prompt)&&zeroPrice(pricing.completion)}];
	});
}

async function listModels(provider:AiProvider):Promise<ProviderModel[]>{
	const cached=modelCatalogCache.get(provider);
	if(cached&&cached.expiresAt>Date.now())return cached.models;
	const existing=modelCatalogRequests.get(provider);
	if(existing)return existing;
	const request=(async()=>{
		const key=await resolvedProviderKey(provider);
		if(!key)throw new AiGatewayError(`${provider} credentials are missing.`,'NOT_CONFIGURED',503);
		const url=provider==='openrouter'?'https://openrouter.ai/api/v1/models':provider==='groq'?'https://api.groq.com/openai/v1/models':`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
		const headers=provider==='gemini'?undefined:{authorization:`Bearer ${key}`};
		let response:Response;
		try{response=await fetch(url,{headers,cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});}
		catch{throw new AiGatewayError(`${provider} model availability check failed.`,'PROVIDER_UNAVAILABLE',503);}
		const models=modelList(await responseJson(response,provider),provider);
		modelCatalogCache.set(provider,{expiresAt:Date.now()+60_000,models});
		return models;
	})();
	modelCatalogRequests.set(provider,request);
	try{return await request;}
	finally{if(modelCatalogRequests.get(provider)===request)modelCatalogRequests.delete(provider);}
}

function approvedFreeModel(provider:AiProvider,models:ProviderModel[],configuredModel:string){
	if(provider==='openrouter'){
		if(configuredModel==='openrouter/free')return models.some(model=>model.free);
		return models.some(model=>model.id===configuredModel&&model.free);
	}
	const allowlist=new Set((process.env.AI_FREE_MODEL_ALLOWLIST||'').split(',').map(value=>value.trim()).filter(Boolean));
	const explicitModel=process.env[provider==='gemini'?'GEMINI_FREE_MODEL':'GROQ_FREE_MODEL']?.trim()||'';
	return Boolean(explicitModel&&configuredModel===explicitModel&&allowlist.has(`${provider}:${explicitModel}`)&&models.some(model=>model.id===explicitModel));
}

function openAiCompatibleMessages(messages:AiMessage[]){return messages.map(({role,content})=>({role,content}));}

function completionCacheKey(messages:AiMessage[],options:z.infer<typeof optionsSchema>){
	return createHash('sha256').update(JSON.stringify({
		messages,
		service:options.service||'unspecified',
		actorId:options.actorId||null,
		temperature:options.temperature??0.4,
		maxTokens:options.maxTokens??700,
		provider:selectedProvider(),
		model:modelFor(selectedProvider()),
		backups:process.env.AI_BACKUP_PROVIDERS||'',
		allowlist:process.env.AI_FREE_MODEL_ALLOWLIST||'',
	})).digest('hex');
}

async function sendRequest(provider:AiProvider,model:string,messages:AiMessage[],options:z.infer<typeof optionsSchema>):Promise<ProviderResponse>{
	const key=await resolvedProviderKey(provider);
	if(!key)throw new AiGatewayError(`${provider} credentials are missing.`,'NOT_CONFIGURED',503);
	const signal=AbortSignal.timeout(timeoutMs);
	let response:Response;
	try{
		if(provider==='gemini'){
			const system=messages.filter(message=>message.role==='system').map(message=>message.content).join('\n\n');
			const contents=messages.filter(message=>message.role!=='system').map(message=>({role:message.role==='assistant'?'model':'user',parts:[{text:message.content}]}));
			response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{
				method:'POST',headers:{'content-type':'application/json'},signal,
				body:JSON.stringify({contents,systemInstruction:system?{parts:[{text:system}]}:undefined,generationConfig:{temperature:options.temperature??0.4,maxOutputTokens:options.maxTokens??700}}),
			});
		}else{
			const endpoint=provider==='openrouter'?'https://openrouter.ai/api/v1/chat/completions':'https://api.groq.com/openai/v1/chat/completions';
			response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},signal,body:JSON.stringify({model,messages:openAiCompatibleMessages(messages),temperature:options.temperature??0.4,max_tokens:options.maxTokens??700})});
		}
	}catch(error){
		if(error instanceof AiGatewayError)throw error;
		throw new AiGatewayError(`${provider} request timed out or could not connect.`,'PROVIDER_UNAVAILABLE',503);
	}
	const data=await responseJson(response,provider);
	if(provider==='gemini'){
		const candidates=Array.isArray(data.candidates)?data.candidates:[];
		const first=candidates[0]&&typeof candidates[0]==='object'?candidates[0] as Record<string,unknown>:{};
		const content=first.content&&typeof first.content==='object'?first.content as Record<string,unknown>:{};
		const parts=Array.isArray(content.parts)?content.parts:[];
		const text=parts.flatMap(part=>part&&typeof part==='object'&&typeof (part as Record<string,unknown>).text==='string'?[(part as Record<string,unknown>).text as string]:[]).join('').trim();
		if(!text)throw new AiGatewayError('Gemini returned no assistant text.','INVALID_RESPONSE',502);
		return {content:text,model,usage:usageFrom(data.usageMetadata)};
	}
	const choices=Array.isArray(data.choices)?data.choices:[];
	const first=choices[0]&&typeof choices[0]==='object'?choices[0] as Record<string,unknown>:{};
	const message=first.message&&typeof first.message==='object'?first.message as Record<string,unknown>:{};
	const text=typeof message.content==='string'?message.content.trim():'';
	if(!text)throw new AiGatewayError(`${provider} returned no assistant text.`,'INVALID_RESPONSE',502);
	return {content:text,model:typeof data.model==='string'?data.model:model,usage:usageFrom(data.usage)};
}

async function recordUsage(provider:AiProvider,model:string,service:string,actorId:string|undefined,usage:AiUsage,latencyMs:number,result:'SUCCEEDED'|'FAILED',errorCode?:string,cacheHit=false){
	try{
		await db.auditLog.create({data:{
			...(actorId?{actorId}:{}),
			action:result==='SUCCEEDED'?'AI_REQUEST_COMPLETED':'AI_REQUEST_FAILED',
			entity:'AI_USAGE',
			metadata:{provider,model,service,promptTokens:usage.promptTokens,completionTokens:usage.completionTokens,totalTokens:usage.totalTokens,latencyMs,result,cacheHit,...(errorCode?{errorCode}:{})},
		}});
	}catch(error){
		console.error('AI usage audit logging failed.',error instanceof Error?error.name:'UnknownError');
	}
}

export async function aiChat(input:unknown,optionsInput:unknown={}):Promise<AiResult>{
	const messages=messageSchema.parse(input);
	const options=optionsSchema.parse(optionsInput);
	const cacheKey=completionCacheKey(messages,options);
	const cached=completionCache.get(cacheKey);
	if(cached&&cached.expiresAt>Date.now()){
		const result={...cached.result,usage:{promptTokens:null,completionTokens:null,totalTokens:null}};
		await recordUsage(result.provider,result.model,options.service||'unspecified',options.actorId,result.usage,0,'SUCCEEDED',undefined,true);
		return result;
	}
	if(cached)completionCache.delete(cacheKey);
	const primary=selectedProvider();
	const primaryModel=modelFor(primary);
	const providers=[primary,...(await configuredAvailableBackups()).filter(provider=>provider!==primary)];
	let lastError:unknown;
	for(const provider of providers){
		const model=provider===primary?primaryModel:process.env[provider==='gemini'?'GEMINI_FREE_MODEL':'GROQ_FREE_MODEL']?.trim()||'';
		const startedAt=Date.now();
		try{
			const models=await listModels(provider);
			if(!approvedFreeModel(provider,models,model))throw new AiGatewayError(`No approved free model is currently available for ${provider}.`,'NO_FREE_MODEL',503);
			let result:ProviderResponse;
			try{result=await sendRequest(provider,model,messages,options);}
			catch(error){
				if(!(error instanceof AiGatewayError)||error.code!=='PROVIDER_UNAVAILABLE'||error.status<500)throw error;
				result=await sendRequest(provider,model,messages,options);
			}
			await recordUsage(provider,result.model,options.service||'unspecified',options.actorId,result.usage,Date.now()-startedAt,'SUCCEEDED');
			const aiResult={...result,provider};
			if(completionCache.size>=completionCacheLimit){
				for(const [key,value] of completionCache){
					if(value.expiresAt<=Date.now()||completionCache.size>=completionCacheLimit/2)completionCache.delete(key);
				}
			}
			completionCache.set(cacheKey,{expiresAt:Date.now()+completionCacheTtlMs,result:aiResult});
			return aiResult;
		}catch(error){
			lastError=error;
			const code=error instanceof AiGatewayError?error.code:'PROVIDER_UNAVAILABLE';
			await recordUsage(provider,model,options.service||'unspecified',options.actorId,{promptTokens:null,completionTokens:null,totalTokens:null},Date.now()-startedAt,'FAILED',code);
			if(code==='NOT_CONFIGURED'&&provider===primary)continue;
			if(code==='NO_FREE_MODEL'||code==='RATE_LIMITED'||code==='PROVIDER_UNAVAILABLE')continue;
			throw error;
		}
	}
	if(lastError instanceof AiGatewayError)throw lastError;
	throw new AiGatewayError('All approved free AI providers are unavailable.','PROVIDER_UNAVAILABLE',503);
}

export async function getAiEngineStatus(){
	const primary=selectedProvider();
	const providers:Array<AiProvider>=['openrouter','gemini','groq'];
	const results=await Promise.all(providers.map(async provider=>{
		const key=await resolvedProviderKey(provider);
		if(!key)return {provider,status:'MISSING_CREDENTIALS' as const,model:provider===primary?modelFor(provider):null,availableModels:0};
		try{
			const models=await listModels(provider);
			const configuredModel=provider===primary?modelFor(provider):process.env[provider==='gemini'?'GEMINI_FREE_MODEL':'GROQ_FREE_MODEL']?.trim()||'';
			const approved=Boolean(configuredModel&&approvedFreeModel(provider,models,configuredModel));
			const available=provider==='openrouter'?models.filter(model=>model.free).length:models.length;
			return {provider,status:approved?'CONNECTED' as const:available?'CONFIGURATION_REQUIRED' as const:'PROVIDER_UNAVAILABLE' as const,model:configuredModel||null,availableModels:available};
		}catch(error){return {provider,status:error instanceof AiGatewayError&&error.code==='RATE_LIMITED'?'PROVIDER_UNAVAILABLE' as const:'CONNECTION_FAILED' as const,model:provider===primary?modelFor(provider):null,availableModels:0};}
	}));
	const active=results.find(result=>result.provider===primary);
	const requestedBackups=new Set((process.env.AI_BACKUP_PROVIDERS||'').split(',').map(value=>value.trim().toLowerCase()));
	const backupProviders=results.filter(result=>result.provider!==primary&&requestedBackups.has(result.provider)&&result.status==='CONNECTED').map(result=>result.provider);
	return {configuredProvider:primary,configuredModel:modelFor(primary),activeProvider:active?.status==='CONNECTED'?primary:null,activeModel:active?.status==='CONNECTED'?active.model:null,providers:results,backupProviders};
}

export async function getAiGatewayConfiguration(){
	const status=await getAiEngineStatus();
	return {provider:status.configuredProvider,model:status.configuredModel,configured:status.providers.some(provider=>provider.status==='CONNECTED'),backupProviders:status.backupProviders};
}