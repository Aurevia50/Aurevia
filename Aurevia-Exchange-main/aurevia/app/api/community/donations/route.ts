import {AccountMode,CommunityCampaignStatus,NotificationType,Prisma} from '@prisma/client';
import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {balance,ensureSystemAccount,ensureUserLedger,postDoubleEntry,roundUsdAmount} from '@/lib/ledger';
import {createNotification} from '@/lib/notifications';
import {rateLimit} from '@/lib/rate-limit';
import {jsonSafe} from '@/lib/serializers';

const schema=z.object({
	campaignId:z.string().min(1).max(64),
	amount:z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/),
});

export async function POST(request:Request){
	try{
		const user=await requireUser();
		rateLimit(`community-donation:${user.id}`,10,60*60_000);
		const idempotencyKey=request.headers.get('Idempotency-Key')||'';
		if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))return NextResponse.json({error:'A valid idempotency key is required.'},{status:400});
		const input=schema.parse(await request.json());
		const amount=roundUsdAmount(input.amount);
		if(amount.lte(0))return NextResponse.json({error:'Donation amount must be greater than zero.'},{status:400});
		const result=await db.$transaction(async tx=>{
			const current=await tx.user.findUnique({where:{id:user.id},select:{status:true,accountMode:true,accountRestricted:true}});
			if(!current||current.status!=='ACTIVE')throw new Error('ACCOUNT_UNAVAILABLE');
			if(current.accountMode!==AccountMode.REAL)throw new Error('REAL_MODE_REQUIRED');
			if(current.accountRestricted)throw new Error('ACCOUNT_RESTRICTED');
			const replay=await tx.communityDonation.findUnique({where:{idempotencyKey},include:{campaign:{select:{title:true}}}});
			if(replay){
				if(replay.userId!==user.id)throw new Error('IDEMPOTENCY_KEY_CONFLICT');
				return {donation:replay,replayed:true};
			}
			const campaign=await tx.communityCampaign.findUnique({where:{id:input.campaignId}});
			if(!campaign||campaign.status!==CommunityCampaignStatus.ACTIVE)throw new Error('CAMPAIGN_UNAVAILABLE');
			const account=await ensureUserLedger(tx,user.id,AccountMode.REAL,'USD');
			const available=await balance(tx,account.id);
			if(available.lt(amount))throw new Error('INSUFFICIENT_WALLET_BALANCE');
			const fund=await ensureSystemAccount(tx,`SYSTEM:COMMUNITY_CAMPAIGN:${campaign.id}:REAL:USD`,`Community campaign fund: ${campaign.title}`,'USD',AccountMode.REAL);
			const ledgerReference=`COMMUNITY:DONATION:${idempotencyKey}`;
			await postDoubleEntry(tx,{reference:ledgerReference,description:`Member donation to community campaign: ${campaign.title}`,debitAccountId:account.id,creditAccountId:fund.id,amount});
			const donation=await tx.communityDonation.create({data:{userId:user.id,campaignId:campaign.id,amount,currency:'USD',accountMode:AccountMode.REAL,ledgerReference,idempotencyKey},include:{campaign:{select:{title:true}}}});
			await tx.auditLog.create({data:{actorId:user.id,action:'COMMUNITY_DONATION_POSTED',entity:'COMMUNITY_DONATION',entityId:donation.id,metadata:{campaignId:campaign.id,amount:amount.toFixed(2),currency:'USD',ledgerReference,accountMode:AccountMode.REAL}}});
			await createNotification(tx,{userId:user.id,type:NotificationType.SYSTEM,title:'Community contribution recorded',message:`Your ${amount.toFixed(2)} USD contribution to ${campaign.title} was posted to your REAL Aurevia ledger.`,dedupeKey:`community-donation:${donation.id}`,relatedEntity:'COMMUNITY_DONATION',relatedId:donation.id,actionUrl:'/community'});
			return {donation,replayed:false};
		},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5_000,timeout:15_000});
		return NextResponse.json(jsonSafe(result),{status:result.replayed?200:201,headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Enter a valid community campaign and USD amount.'},{status:400});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many contribution attempts. Please wait before trying again.'},{status:429});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='ACCOUNT_UNAVAILABLE')return NextResponse.json({error:'This account cannot contribute.'},{status:403});
		if(error instanceof Error&&error.message==='REAL_MODE_REQUIRED')return NextResponse.json({error:'Switch to REAL Mode to contribute from your wallet.'},{status:403});
		if(error instanceof Error&&error.message==='ACCOUNT_RESTRICTED')return NextResponse.json({error:'Community contributions are unavailable while this account is restricted.'},{status:403});
		if(error instanceof Error&&error.message==='CAMPAIGN_UNAVAILABLE')return NextResponse.json({error:'This campaign is no longer accepting contributions.'},{status:409});
		if(error instanceof Error&&error.message==='INSUFFICIENT_WALLET_BALANCE')return NextResponse.json({error:'Your available USD wallet balance is not sufficient for this contribution.'},{status:409});
		if(error instanceof Error&&error.message==='IDEMPOTENCY_KEY_CONFLICT')return NextResponse.json({error:'This request key has already been used.'},{status:409});
		if(error&&typeof error==='object'&&'code'in error&&String(error.code)==='P2034')return NextResponse.json({error:'Your wallet changed during the contribution. Refresh the balance and try again.'},{status:409});
		console.error('Community contribution failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to post this community contribution.'},{status:503});
	}
}
