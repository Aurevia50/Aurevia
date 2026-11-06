import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';

export const dynamic='force-dynamic';

const schema=z.object({
	auditLogId:z.string().min(1).max(128),
	hidden:z.boolean(),
});

export async function POST(request:Request){
	try{
		const admin=await requireAdmin();
		const {auditLogId,hidden}=schema.parse(await request.json());
		const auditLog=await db.auditLog.findUnique({where:{id:auditLogId},select:{id:true}});
		if(!auditLog)return NextResponse.json({error:'Activity record not found.'},{status:404});
		if(hidden){
			await db.adminDashboardActivityDismissal.upsert({
				where:{auditLogId},
				create:{auditLogId,hiddenById:admin.id},
				update:{hiddenById:admin.id,hiddenAt:new Date(),restoredById:null,restoredAt:null},
			});
		}else{
			await db.adminDashboardActivityDismissal.updateMany({
				where:{auditLogId,restoredAt:null},
				data:{restoredAt:new Date(),restoredById:admin.id},
			});
		}
		return NextResponse.json({auditLogId,hidden});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'A valid activity record and visibility state are required.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		console.error(`Admin activity visibility update failed (${error instanceof Error?error.name:'UnknownError'}).`);
		return NextResponse.json({error:'Unable to update activity visibility.'},{status:500});
	}
}
