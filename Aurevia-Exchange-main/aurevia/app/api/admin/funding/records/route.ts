import {NextResponse} from 'next/server';
import {FundingStatus,FundingType,Prisma} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {jsonSafe} from '@/lib/serializers';

const querySchema=z.object({
	type:z.nativeEnum(FundingType),
	status:z.string().max(100).optional(),
	search:z.string().trim().max(120).default(''),
	page:z.coerce.number().int().min(1).default(1),
	sort:z.enum(['asc','desc']).default('desc'),
});
const pageSize=25;

export async function GET(request:Request){
	try{
		await requireAdmin();
		const params=Object.fromEntries(new URL(request.url).searchParams);
		const input=querySchema.parse(params);
		const statuses=input.status?z.array(z.nativeEnum(FundingStatus)).parse(input.status.split(',')):[];
		const search=input.search;
		const where:Prisma.FundingRequestWhereInput={
			type:input.type,
			...(statuses.length?{status:{in:statuses}}:{}),
			...(search?{OR:[{id:{contains:search,mode:'insensitive'}},{user:{email:{contains:search,mode:'insensitive'}}},{user:{name:{contains:search,mode:'insensitive'}}},{transactionReference:{contains:search,mode:'insensitive'}}]}:{}),
		};
		const [total,requests]=await Promise.all([
			db.fundingRequest.count({where}),
			db.fundingRequest.findMany({where,include:{user:{select:{id:true,name:true,email:true}},paymentMethod:{select:{name:true}},withdrawalDestination:{select:{type:true,nickname:true,countryCode:true,network:true,asset:true,maskedLabel:true}},withdrawalDestinationSnapshot:{select:{type:true,nickname:true,countryCode:true,network:true,asset:true,maskedLabel:true}}},orderBy:{createdAt:input.sort},skip:(input.page-1)*pageSize,take:pageSize}),
		]);
		const items=requests.map(({receiptKey,withdrawalDestinationSnapshot,...request})=>({...request,withdrawalDestination:withdrawalDestinationSnapshot||request.withdrawalDestination,hasReceipt:Boolean(receiptKey)}));
		return NextResponse.json(jsonSafe({items,total,page:input.page,pageSize,totalPages:Math.ceil(total/pageSize)}),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof ZodError)return NextResponse.json({error:'Invalid funding search or filter values.'},{status:400});
		return NextResponse.json({error:'Funding records are temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}