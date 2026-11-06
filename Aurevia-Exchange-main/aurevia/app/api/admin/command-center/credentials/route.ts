import {randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {aiCredentialProposalSettingPrefix,aiCredentialSettingKey,encryptAiCredential} from '@/lib/ai-credential-vault';

const proposalSchema=z.object({provider:z.enum(['openrouter','gemini','groq']),apiKey:z.string().trim().min(8).max(500)});
const decisionSchema=z.object({proposalId:z.string().min(8).max(80),decision:z.enum(['APPROVE','REJECT'])});

function responseError(error:unknown){
	if(error instanceof ZodError)return NextResponse.json({error:'Enter a supported provider and a valid credential.'},{status:400});
	if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
	if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
	if(error instanceof Error&&error.message==='AI_SECRETS_ENCRYPTION_KEY_REQUIRED')return NextResponse.json({error:'Secure credential storage is not configured. Add AI_SECRETS_ENCRYPTION_KEY in Render, or use Render environment settings directly.'},{status:503});
	return NextResponse.json({error:'Unable to process the credential change.'},{status:503});
}

export async function POST(request:Request){
	try{
		const admin=await requireAdmin();
		const input=proposalSchema.parse(await request.json());
		const id=randomUUID();
		const submittedAt=new Date().toISOString();
		const encrypted=encryptAiCredential(input.apiKey);
		await db.$transaction(async tx=>{
			await tx.systemSetting.create({data:{
				key:`${aiCredentialProposalSettingPrefix()}${id}`,
				value:JSON.stringify({provider:input.provider,submittedBy:admin.id,submittedAt,status:'PENDING',encrypted}),
			}});
			await tx.auditLog.create({data:{actorId:admin.id,action:'AI_CREDENTIAL_PROPOSED',entity:'AI_CREDENTIAL',entityId:id,metadata:{provider:input.provider,status:'PENDING'}}});
		});
		return NextResponse.json({proposal:{id,provider:input.provider,status:'PENDING',submittedAt},message:'Credential encrypted and submitted for approval.'},{status:201,headers:{'Cache-Control':'private, no-store'}});
	}catch(error){return responseError(error);}
}

export async function PATCH(request:Request){
	try{
		const admin=await requireAdmin();
		const input=decisionSchema.parse(await request.json());
		const key=`${aiCredentialProposalSettingPrefix()}${input.proposalId}`;
		const current=await db.systemSetting.findUnique({where:{key}});
		if(!current)return NextResponse.json({error:'Credential proposal not found.'},{status:404});
		const proposal=JSON.parse(current.value) as {provider:string;submittedBy:string;submittedAt:string;status:string;encrypted:unknown};
		if(proposal.status!=='PENDING')return NextResponse.json({error:'This credential proposal was already reviewed.'},{status:409});
		if(proposal.submittedBy===admin.id)return NextResponse.json({error:'A different administrator must review this credential proposal.'},{status:403});
		if(!['openrouter','gemini','groq'].includes(proposal.provider))return NextResponse.json({error:'Unsupported credential provider.'},{status:400});
		const status=input.decision==='APPROVE'?'APPROVED':'REJECTED';
		await db.$transaction(async tx=>{
			if(input.decision==='APPROVE')await tx.systemSetting.upsert({where:{key:aiCredentialSettingKey(proposal.provider as 'openrouter'|'gemini'|'groq')},create:{key:aiCredentialSettingKey(proposal.provider as 'openrouter'|'gemini'|'groq'),value:JSON.stringify(proposal.encrypted)},update:{value:JSON.stringify(proposal.encrypted)}});
			await tx.systemSetting.update({where:{key},data:{value:JSON.stringify({...proposal,status,reviewedBy:admin.id,reviewedAt:new Date().toISOString()})}});
			await tx.auditLog.create({data:{actorId:admin.id,action:`AI_CREDENTIAL_${status}`,entity:'AI_CREDENTIAL',entityId:input.proposalId,metadata:{provider:proposal.provider,submittedBy:proposal.submittedBy,decision:status}}});
		});
		return NextResponse.json({proposal:{id:input.proposalId,provider:proposal.provider,status}},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){return responseError(error);}
}