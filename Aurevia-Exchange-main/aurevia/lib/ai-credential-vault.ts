import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {db} from '@/lib/db';
import type {AiProvider} from '@/lib/ai-gateway';

const settingPrefix='aurevia.ai.credential.';

function encryptionKey(){
	const encoded=process.env.AI_SECRETS_ENCRYPTION_KEY?.trim()||'';
	const key=Buffer.from(encoded,'base64');
	if(key.length!==32||key.toString('base64')!==encoded)throw new Error('AI_SECRETS_ENCRYPTION_KEY_REQUIRED');
	return key;
}

export function encryptAiCredential(value:string){
	const iv=randomBytes(12);
	const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
	const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
	return {version:1,iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),authTag:cipher.getAuthTag().toString('base64')};
}

export function decryptAiCredential(record:unknown){
	if(!record||typeof record!=='object')throw new Error('AI_CREDENTIAL_RECORD_INVALID');
	const envelope=record as Record<string,unknown>;
	if(envelope.version!==1||typeof envelope.iv!=='string'||typeof envelope.ciphertext!=='string'||typeof envelope.authTag!=='string')throw new Error('AI_CREDENTIAL_RECORD_INVALID');
	try{
		const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(envelope.iv,'base64'));
		decipher.setAuthTag(Buffer.from(envelope.authTag,'base64'));
		return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]).toString('utf8');
	}catch(error){
		if(error instanceof Error&&error.message==='AI_SECRETS_ENCRYPTION_KEY_REQUIRED')throw error;
		throw new Error('AI_CREDENTIAL_DECRYPTION_FAILED');
	}
}

export async function getApprovedAiCredential(provider:AiProvider){
	const setting=await db.systemSetting.findUnique({where:{key:`${settingPrefix}${provider}`},select:{value:true}});
	if(!setting)return '';
	try{return decryptAiCredential(JSON.parse(setting.value));}
	catch{return '';}
}

export function aiCredentialSettingKey(provider:AiProvider){return `${settingPrefix}${provider}`;}

export function aiCredentialProposalSettingPrefix(){return `${settingPrefix}proposal.`;}