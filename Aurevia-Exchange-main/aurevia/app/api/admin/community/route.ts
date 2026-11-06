import {CommunityCampaignStatus,Prisma} from '@prisma/client';
import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {jsonSafe} from '@/lib/serializers';

const createSchema=z.object({
	title:z.string().trim().min(3).max(120),
	description:z.string().trim().min(10).max(3000),
	status:z.nativeEnum(CommunityCampaignStatus).default(CommunityCampaignStatus.DRAFT),
});
const updateSchema=z.object({id:z.string().min(1),status:z.nativeEnum(CommunityCampaignStatus)});

export async function GET(){
	try{
		await requireAdmin();
		const campaigns=await db.communityCampaign.findMany({
			include:{createdBy:{select:{name:true,email:true}},_count:{select:{donations:true}}},
			orderBy:{createdAt:'desc'},
		});
		const totals=campaigns.length?await db.communityDonation.groupBy({by:['campaignId'],where:{campaignId:{in:campaigns.map(campaign=>campaign.id)}},_sum:{amount:true}}):[];
		const totalById=new Map(totals.map(item=>[item.campaignId,item._sum.amount??new Prisma.Decimal(0)]));
		return NextResponse.json(jsonSafe(campaigns.map(({_count,...campaign})=>({...campaign,donationCount:_count.donations,raisedAmount:totalById.get(campaign.id)??new Prisma.Decimal(0)}))),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		console.error('Community campaign administration unavailable.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Community campaigns are temporarily unavailable.'},{status:503});
	}
}

export async function POST(request:Request){
	try{
		const admin=await requireAdmin();
		const input=createSchema.parse(await request.json());
		const campaign=await db.$transaction(async tx=>{
			const created=await tx.communityCampaign.create({data:{...input,createdById:admin.id}});
			await tx.auditLog.create({data:{actorId:admin.id,action:'COMMUNITY_CAMPAIGN_CREATED',entity:'COMMUNITY_CAMPAIGN',entityId:created.id,metadata:{title:created.title,status:created.status}}});
			return created;
		});
		return NextResponse.json(jsonSafe(campaign),{status:201,headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Enter a valid campaign title, description, and status.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		console.error('Community campaign creation failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to create the campaign.'},{status:503});
	}
}

export async function PATCH(request:Request){
	try{
		const admin=await requireAdmin();
		const input=updateSchema.parse(await request.json());
		const campaign=await db.$transaction(async tx=>{
			const current=await tx.communityCampaign.findUnique({where:{id:input.id}});
			if(!current)throw new Error('CAMPAIGN_NOT_FOUND');
			if(current.status===CommunityCampaignStatus.CLOSED&&input.status!==CommunityCampaignStatus.CLOSED)throw new Error('CAMPAIGN_CLOSED');
			const updated=await tx.communityCampaign.update({where:{id:current.id},data:{status:input.status}});
			await tx.auditLog.create({data:{actorId:admin.id,action:'COMMUNITY_CAMPAIGN_STATUS_CHANGED',entity:'COMMUNITY_CAMPAIGN',entityId:updated.id,metadata:{previousStatus:current.status,status:updated.status}}});
			return updated;
		});
		return NextResponse.json(jsonSafe(campaign),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Enter a valid campaign and status.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='CAMPAIGN_NOT_FOUND')return NextResponse.json({error:'Campaign not found.'},{status:404});
		if(error instanceof Error&&error.message==='CAMPAIGN_CLOSED')return NextResponse.json({error:'Closed campaigns cannot be reopened.'},{status:409});
		console.error('Community campaign update failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to update the campaign.'},{status:503});
	}
}
