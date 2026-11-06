import {aiChat,type AiMessage,type AiResult} from '@/lib/ai-gateway';
import {db} from '@/lib/db';
import {rateLimit} from '@/lib/rate-limit';

export const AI_SERVICE_NAMES=[
	'customer_support',
	'investment_research',
	'trading_journal',
	'support_ticket_classification',
	'financial_document_analysis',
	'smart_onboarding',
	'administrative_assistance',
	'market_information_summary',
	'notification_generation',
	'error_diagnosis',
	'api_configuration_assistance',
	'operational_recommendations',
	'platform_help',
] as const;

export type AiServiceName=(typeof AI_SERVICE_NAMES)[number];

export const AI_FEATURE_NAMES=[
	'customer_support',
	'investment_research',
	'smart_onboarding',
	'trading_journal',
	'support_ticket_classification',
	'administrative_assistance',
	'market_information_summary',
	'api_configuration_assistance',
	'operational_recommendations',
] as const;

export type AiFeatureName=(typeof AI_FEATURE_NAMES)[number];

export const AI_SERVICE_FEATURES:Record<AiFeatureName,{label:string;description:string}>={
	customer_support:{label:'Customer support',description:'Nova platform help and user account workflow assistance.'},
	investment_research:{label:'Investment education',description:'General education and user-scoped portfolio exposure explanations.'},
	smart_onboarding:{label:'Smart onboarding',description:'Plain-language guidance from verified profile and account-tier checklist state.'},
	trading_journal:{label:'Trading journal reflection',description:'Descriptive reflection on aggregated closed-trade outcomes; not a strategy or trade recommendation.'},
	support_ticket_classification:{label:'Support ticket classification',description:'Suggest a ticket category and priority for administrator review; never applies changes.'},
	administrative_assistance:{label:'Administrator assistance',description:'Administrator drafts and constrained dashboard assistance.'},
	market_information_summary:{label:'Market and news summaries',description:'Explanations of fresh configured provider quotes, publisher-sourced news, and supplied market records.'},
	api_configuration_assistance:{label:'API configuration assistance',description:'Administrator explanations of provider status and configuration.'},
	operational_recommendations:{label:'DEMO recommendations',description:'Optional, non-executing DEMO recommendations from internal simulated data.'},
};

const serviceRules:Record<AiServiceName,string>={
	customer_support:'Support guidance is generated analysis, not a verified account or payment result. Use only supplied, authorized facts.',
	investment_research:'This is educational, generated analysis, not personalized investment advice, a price prediction, or a guarantee.',
	smart_onboarding:'Explain only supplied profile and account-tier checklist facts. Never approve KYC, determine financial eligibility, promise account access, or change account settings.',
	trading_journal:'Describe only supplied historical aggregates. Do not recommend trades, strategies, positions, or changes in behavior. Outcomes are historical and do not predict future results.',
	support_ticket_classification:'Suggest a support category and priority for a human administrator to review. Never change a ticket, send a reply, resolve a complaint, or make an account or payment decision.',
	financial_document_analysis:'Extract or summarize only what is visible in supplied material. Do not approve, verify, or make legal, tax, credit, or financial decisions.',
	administrative_assistance:'Provide drafts and explanations only. Never change a record, grant permissions, or approve an operational action.',
	market_information_summary:'Separate supplied provider facts from generated analysis. Never invent prices, events, sources, or market activity.',
	notification_generation:'Draft concise notification text only. Never claim an unrecorded balance, approval, fill, or external transfer.',
	error_diagnosis:'Diagnose only from supplied error evidence. Do not claim a fix was applied or disclose secrets.',
	api_configuration_assistance:'Use official provider documentation and supplied configuration facts only. Never invent credentials or claim connectivity without a successful test.',
	operational_recommendations:'Offer non-binding operational suggestions only. Do not modify financial records, execute trades, or bypass security controls.',
	platform_help:'Platform explanations are generated assistance, not verified external information or an account decision.',
};

const featureSettingPrefix='aurevia.ai.feature.';

function sanitizeMessageContent(content:string){
	return content
		.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[redacted email]')
		.replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g,'[redacted phone or account number]')
		.replace(/\b(?:\d[ -]*?){13,19}\b/g,'[redacted payment number]')
		.replace(/\b(?:password|passcode|api[\s_-]?key|secret|token)\s*[:=]\s*\S+/gi,'[redacted credential]')
		.replace(/\bBearer\s+\S+/gi,'Bearer [redacted credential]');
}

export async function getAiServiceFeatures(){
	const settings=await db.systemSetting.findMany({
		where:{key:{in:AI_FEATURE_NAMES.map(service=>`${featureSettingPrefix}${service}`)}},
		select:{key:true,value:true},
	});
	const values=new Map(settings.map(setting=>[setting.key,setting.value]));
	return AI_FEATURE_NAMES.map(service=>{
		const value=values.get(`${featureSettingPrefix}${service}`);
		if(value!==undefined&&value!=='true'&&value!=='false')throw new Error('AI_FEATURE_SETTING_INVALID');
		return {id:service,...AI_SERVICE_FEATURES[service],enabled:value!=='false'};
	});
}

export async function isAiServiceEnabled(service:AiServiceName){
	const setting=await db.systemSetting.findUnique({where:{key:`${featureSettingPrefix}${service}`},select:{value:true}});
	if(!setting)return true;
	if(setting.value!=='true'&&setting.value!=='false')throw new Error('AI_FEATURE_SETTING_INVALID');
	return setting.value==='true';
}

export async function runAiService(service:AiServiceName,messages:AiMessage[],options:{actorId?:string;temperature?:number;maxTokens?:number}={}):Promise<AiResult>{
	if(!(await isAiServiceEnabled(service)))throw new Error('AI_FEATURE_DISABLED');
	rateLimit(`ai-service:${options.actorId||'anonymous'}:${service}`,60,60_000);
	const systemIndex=messages.findIndex(message=>message.role==='system');
	const guardedMessages=messages.map((message,index)=>index===systemIndex
		?{...message,content:`${message.content}\n\n${serviceRules[service]}`}
		:{...message,content:sanitizeMessageContent(message.content)});
	if(systemIndex<0)guardedMessages.unshift({role:'system',content:serviceRules[service]});
	return aiChat(guardedMessages,{...options,service});
}