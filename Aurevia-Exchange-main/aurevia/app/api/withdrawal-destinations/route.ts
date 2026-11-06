import {NextResponse} from 'next/server';
import {AccountMode,FundingStatus} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {rateLimit} from '@/lib/rate-limit';
import {encryptWithdrawalDestination,maskedDestination,parseWithdrawalDestination} from '@/lib/withdrawal-destinations';

const idSchema=z.object({id:z.string().min(1).max(64)});
const busyStatuses=[FundingStatus.PENDING,FundingStatus.PENDING_REVIEW,FundingStatus.APPROVED,FundingStatus.PROCESSING];

async function activeRealUser(userId:string){
	const user=await db.user.findUnique({where:{id:userId},select:{accountMode:true,status:true,role:true}});
	if(!user||user.status!=='ACTIVE'||user.role!=='USER')throw new Error('ACCOUNT_UNAVAILABLE');
	if(user.accountMode!==AccountMode.REAL)throw new Error('REAL_MODE_REQUIRED');
	return user;
}

export async function GET(){
	try{
		const user=await requireUser();
		const active=await activeRealUser(user.id);
		if(active.accountMode!==AccountMode.REAL)return NextResponse.json({destinations:[]});
		const destinations=await db.withdrawalDestination.findMany({
			where:{userId:user.id,accountMode:AccountMode.REAL},
			select:{id:true,type:true,nickname:true,countryCode:true,network:true,asset:true,maskedLabel:true,createdAt:true,updatedAt:true},
			orderBy:{updatedAt:'desc'},
		});
		return NextResponse.json({destinations},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='REAL_MODE_REQUIRED')return NextResponse.json({destinations:[]});
		return NextResponse.json({error:'Withdrawal destinations are unavailable.'},{status:503});
	}
}

export async function POST(request:Request){
	try{
		const user=await requireUser();
		await activeRealUser(user.id);
		rateLimit(`withdrawal-destination:${user.id}`,20,60_000);
		const parsed=parseWithdrawalDestination(await request.json());
		if(!parsed.success)return NextResponse.json({error:'Check the destination fields.',issues:parsed.error.issues.map(issue=>({path:issue.path,message:issue.message}))},{status:400});
		const encrypted=encryptWithdrawalDestination(parsed.data);
		const destination=await db.withdrawalDestination.create({data:{
			userId:user.id,accountMode:AccountMode.REAL,type:parsed.data.type,nickname:parsed.data.nickname,
			countryCode:parsed.data.countryCode,network:parsed.data.network||null,asset:parsed.data.asset||null,
			maskedLabel:maskedDestination(parsed.data),...encrypted,
		},select:{id:true,type:true,nickname:true,countryCode:true,network:true,asset:true,maskedLabel:true,createdAt:true,updatedAt:true}});
		return NextResponse.json({destination},{status:201,headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Enter a valid destination.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='REAL_MODE_REQUIRED')return NextResponse.json({error:'Withdrawal destinations are available in REAL Mode only.'},{status:403});
		if(error instanceof Error&&error.message==='ACCOUNT_UNAVAILABLE')return NextResponse.json({error:'Account is unavailable.'},{status:403});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many destination changes. Try again shortly.'},{status:429});
		if(error instanceof Error&&error.message==='WITHDRAWAL_DESTINATION_ENCRYPTION_KEY_REQUIRED')return NextResponse.json({error:'Secure destination storage is not configured. Contact Aurevia support.'},{status:503});
		console.error('Withdrawal destination save failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to save this destination.'},{status:503});
	}
}

export async function PATCH(request:Request){
	try{
		const user=await requireUser();
		await activeRealUser(user.id);
		rateLimit(`withdrawal-destination:${user.id}`,20,60_000);
		const body=await request.json();
		const {id}=idSchema.parse(body);
		const parsed=parseWithdrawalDestination(body.destination);
		if(!parsed.success)return NextResponse.json({error:'Check the destination fields.',issues:parsed.error.issues.map(issue=>({path:issue.path,message:issue.message}))},{status:400});
		const current=await db.withdrawalDestination.findFirst({where:{id,userId:user.id,accountMode:AccountMode.REAL},select:{id:true}});
		if(!current)return NextResponse.json({error:'Destination not found.'},{status:404});
		const attached=await db.fundingRequest.findFirst({where:{withdrawalDestinationId:id,status:{in:busyStatuses}},select:{id:true}});
		if(attached)return NextResponse.json({error:'This destination is attached to a pending withdrawal and cannot be changed.'},{status:409});
		const encrypted=encryptWithdrawalDestination(parsed.data);
		const destination=await db.withdrawalDestination.update({where:{id},data:{
			type:parsed.data.type,nickname:parsed.data.nickname,countryCode:parsed.data.countryCode,
			network:parsed.data.network||null,asset:parsed.data.asset||null,maskedLabel:maskedDestination(parsed.data),...encrypted,
		},select:{id:true,type:true,nickname:true,countryCode:true,network:true,asset:true,maskedLabel:true,createdAt:true,updatedAt:true}});
		return NextResponse.json({destination},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Enter a valid destination.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='REAL_MODE_REQUIRED')return NextResponse.json({error:'Withdrawal destinations are available in REAL Mode only.'},{status:403});
		if(error instanceof Error&&error.message==='ACCOUNT_UNAVAILABLE')return NextResponse.json({error:'Account is unavailable.'},{status:403});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many destination changes. Try again shortly.'},{status:429});
		if(error instanceof Error&&error.message==='WITHDRAWAL_DESTINATION_ENCRYPTION_KEY_REQUIRED')return NextResponse.json({error:'Secure destination storage is not configured. Contact Aurevia support.'},{status:503});
		console.error('Withdrawal destination update failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to update this destination.'},{status:503});
	}
}

export async function DELETE(request:Request){
	try{
		const user=await requireUser();
		await activeRealUser(user.id);
		rateLimit(`withdrawal-destination:${user.id}`,20,60_000);
		const {id}=idSchema.parse(await request.json());
		const destination=await db.withdrawalDestination.findFirst({where:{id,userId:user.id,accountMode:AccountMode.REAL},select:{id:true}});
		if(!destination)return NextResponse.json({error:'Destination not found.'},{status:404});
		const attached=await db.fundingRequest.findFirst({where:{withdrawalDestinationId:id,status:{in:busyStatuses}},select:{id:true}});
		if(attached)return NextResponse.json({error:'This destination is attached to a pending withdrawal and cannot be removed.'},{status:409});
		await db.withdrawalDestination.delete({where:{id}});
		return NextResponse.json({ok:true});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Choose a valid destination.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='REAL_MODE_REQUIRED')return NextResponse.json({error:'Withdrawal destinations are available in REAL Mode only.'},{status:403});
		if(error instanceof Error&&error.message==='ACCOUNT_UNAVAILABLE')return NextResponse.json({error:'Account is unavailable.'},{status:403});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many destination changes. Try again shortly.'},{status:429});
		return NextResponse.json({error:'Unable to remove this destination.'},{status:503});
	}
}
