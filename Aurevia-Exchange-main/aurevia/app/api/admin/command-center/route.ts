import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {getAiEngineStatus} from '@/lib/ai-gateway';
import {getAiServiceFeatures} from '@/lib/ai-services';
import {aiCredentialProposalSettingPrefix} from '@/lib/ai-credential-vault';
import {getIntegrationInventory} from '@/lib/integration-manager';

export const dynamic='force-dynamic';

function safeProposal(value:string){
	try{
		const proposal=JSON.parse(value) as {provider?:string;submittedBy?:string;submittedAt?:string;status?:string};
		return {provider:proposal.provider||'unknown',submittedBy:proposal.submittedBy||'unknown',submittedAt:proposal.submittedAt||null,status:proposal.status||'UNKNOWN'};
	}catch{return {provider:'unknown',submittedBy:'unknown',submittedAt:null,status:'INVALID'};}
}

export async function GET(){
	try{
		await requireAdmin();
		const prefix=aiCredentialProposalSettingPrefix();
		const aiStatus=getAiEngineStatus();
		const [integrations,ai,usageRows,historyRows,proposalRows,aiFeatures]=await Promise.all([
			getIntegrationInventory(aiStatus),
			aiStatus,
			db.auditLog.findMany({where:{entity:'AI_USAGE'},select:{id:true,action:true,metadata:true,createdAt:true},orderBy:{createdAt:'desc'},take:100}),
			db.auditLog.findMany({where:{entity:'INTEGRATION_HEALTH'},select:{id:true,action:true,metadata:true,createdAt:true},orderBy:{createdAt:'desc'},take:100}),
			db.systemSetting.findMany({where:{key:{startsWith:prefix}},select:{key:true,value:true},orderBy:{updatedAt:'desc'},take:50}),
			getAiServiceFeatures(),
		]);
		const usage=usageRows.map(row=>({id:row.id,action:row.action,metadata:row.metadata,createdAt:row.createdAt}));
		const successful=usageRows.filter(row=>row.action==='AI_REQUEST_COMPLETED');
		const failed=usageRows.length-successful.length;
		const totalTokens=usageRows.reduce((total,row)=>{
			const metadata=row.metadata&&typeof row.metadata==='object'?row.metadata as Record<string,unknown>:{};
			const value=metadata.totalTokens;
			return total+(typeof value==='number'&&Number.isFinite(value)?value:0);
		},0);
		return NextResponse.json({
			checkedAt:new Date().toISOString(),integrations,ai,aiFeatures,
			usage:{window:'latest 100 records',requests:usageRows.length,succeeded:successful.length,failed,totalTokens,rateLimit:'AI routes apply per-user or per-admin rate limits; provider limits may also apply.',recent:usage},
			healthHistory:historyRows.map(row=>({id:row.id,action:row.action,metadata:row.metadata,createdAt:row.createdAt})),
			approvalQueue:proposalRows.map(row=>({id:row.key.slice(prefix.length),...safeProposal(row.value)})).filter(proposal=>proposal.status==='PENDING'),
		},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		const status=error instanceof Error&&error.message==='UNAUTHORIZED'?401:error instanceof Error&&error.message==='FORBIDDEN'?403:503;
		return NextResponse.json({error:status===401?'Unauthorized':status===403?'Forbidden':'Command center is temporarily unavailable.'},{status,headers:{'Cache-Control':'private, no-store'}});
	}
}