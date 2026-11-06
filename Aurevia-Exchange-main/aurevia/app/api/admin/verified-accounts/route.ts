import {NextResponse} from 'next/server';
import {KycStatus,Prisma,UserStatus} from '@prisma/client';
import {z} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';

const querySchema=z.object({
	page:z.coerce.number().int().min(1).default(1),
	search:z.string().trim().max(120).default(''),
	tier:z.coerce.number().int().min(1).max(3).optional(),
	status:z.nativeEnum(UserStatus).optional(),
});
const pageSize=25;

export async function GET(request:Request){
	try{
		await requireAdmin();
		const params=Object.fromEntries(new URL(request.url).searchParams);
		const input=querySchema.parse(params);
		const where:Prisma.UserWhereInput={
			kycStatus:KycStatus.APPROVED,
			...(input.tier?{approvedTier:input.tier}:{}),
			...(input.status?{status:input.status}:{}),
			...(input.search?{OR:[
				{id:{contains:input.search,mode:'insensitive'}},
				{email:{contains:input.search,mode:'insensitive'}},
				{name:{contains:input.search,mode:'insensitive'}},
			]}:{}),
		};
		const [total,users]=await Promise.all([
			db.user.count({where}),
			db.user.findMany({
				where,
				select:{
					id:true,email:true,name:true,status:true,accountMode:true,approvedTier:true,kycStatus:true,createdAt:true,
					kyc:{select:{legalName:true,dob:true,address:true,idType:true,idNumber:true,submittedAt:true,reviewedAt:true,reviewNote:true}},
					kycDocuments:{select:{id:true,kind:true,filename:true,mimeType:true,size:true,status:true,uploadedAt:true,reviewedAt:true,reviewNote:true},orderBy:{uploadedAt:'desc'}},
				},
				orderBy:[{kyc:{reviewedAt:'desc'}},{createdAt:'desc'}],
				skip:(input.page-1)*pageSize,
				take:pageSize,
			}),
		]);
		const approvals=users.length?await db.auditLog.findMany({
			where:{entity:'USER',entityId:{in:users.map(user=>user.id)},action:'KYC_APPROVED'},
			select:{entityId:true,createdAt:true,actor:{select:{name:true,email:true}}},
			orderBy:{createdAt:'desc'},
			distinct:['entityId'],
		}):[];
		const approvalByUser=new Map(approvals.map(approval=>[approval.entityId,approval]));
		const items=users.map(user=>({
			...user,
			approval:approvalByUser.get(user.id)?{
				at:approvalByUser.get(user.id)!.createdAt,
				reviewedBy:approvalByUser.get(user.id)!.actor,
			}:null,
		}));
		return NextResponse.json({items,total,page:input.page,pageSize,totalPages:Math.ceil(total/pageSize)},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof z.ZodError)return NextResponse.json({error:'Invalid search or filter values.'},{status:400});
		return NextResponse.json({error:'Verified accounts are temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}