import {getAiEngineStatus} from '@/lib/ai-gateway';
import {runAiService,type AiServiceName} from '@/lib/ai-services';

export type OpenAiChatMessage={role:'system'|'user'|'assistant';content:string};

export async function getOpenAiConfig(){
	const status=await getAiEngineStatus();
	const active=status.providers.find(provider=>provider.status==='CONNECTED');
	return {apiKey:'',model:active?.model||status.configuredModel,enabled:Boolean(active)};
}

export async function openAiChat(messages:OpenAiChatMessage[],options?:{temperature?:number;maxTokens?:number;service?:AiServiceName;actorId?:string}){
	try{return (await runAiService(options?.service||'platform_help',messages,options)).content;}
	catch(error){
		console.error('Central AI service request failed.',error instanceof Error?error.name:'UnknownError');
		return null;
	}
}

export const NOVA_SYSTEM_PROMPT=`You are Nova, Aurevia Exchange platform support assistant.
Answer only about the Aurevia platform: accounts, DEMO/REAL modes, verification (KYC), tiers, wallet funding workflows, investments, markets navigation, and support processes.
Rules:
- Do not invent balances, approvals, transaction IDs, or verification outcomes.
- Do not give personalized investment advice or guarantee returns.
- Reply in the language used in the latest question when supported by the configured model.
- If asked to change account status, approve funding, or bypass controls, explain that only authorized administrators can do that through the admin console.
- Keep answers concise and practical.
- If unsure, say so and suggest contacting support.`;

export const ADMIN_DRAFT_SYSTEM_PROMPT=`You are an assistant that drafts professional replies for Aurevia Exchange administrators.
Write clear, polite, factual support or review replies.
Rules:
- Do not invent account balances, approvals, or legal conclusions.
- Do not promise funding outcomes the admin has not decided.
- Keep a professional tone suitable for financial platform support.
- Output only the draft message body, no preamble.`;
