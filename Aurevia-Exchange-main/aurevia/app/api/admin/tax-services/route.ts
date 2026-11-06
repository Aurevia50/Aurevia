import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {TaxServiceType} from '@prisma/client';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {jsonSafe} from '@/lib/serializers';

export async function GET(){
	try{
		await requireAdmin();
		const [settings,access,cases]=await Promise.all([
			db.taxModuleSettings.findUnique({where:{id:'default'}}),
			db.taxServiceAccess.findMany({include:{user:{select:{id:true,email:true,name:true}},grantedBy:{select:{email:true,name:true}}},orderBy:{updatedAt:'desc'},take:200}),
			db.taxCase.findMany({
				include:{user:{select:{id:true,email:true,name:true}}},
				orderBy:[{status:'asc'},{updatedAt:'desc'}],
				take:200,
			}),
		]);
		return NextResponse.json(jsonSafe({
			settings:settings||{id:'default',enabled:false},
			access,
			cases,
		}),{headers:{'Cache-Control':'private, no-store'}});
	}catch{
		return NextResponse.json({error:'Forbidden'},{status:403});
	}
}

const settingsSchema=z.object({
	enabled:z.boolean(),
});

const accessSchema=z.object({
	userId:z.string().min(1),
	enabled:z.boolean(),
	allowedServices:z.array(z.nativeEnum(TaxServiceType)).optional(),
	note:z.string().trim().max(500).optional(),
});

export async function PATCH(request:Request){
	try{
		const admin=await requireAdmin();
		const body=await request.json();
		if(body&&typeof body==='object'&&'enabled' in body&&!('userId' in body)){
			const input=settingsSchema.parse(body);
			const settings=await db.taxModuleSettings.upsert({
				where:{id:'default'},
				create:{id:'default',enabled:input.enabled,updatedBy:admin.id},
				update:{enabled:input.enabled,updatedBy:admin.id},
			});
			await db.auditLog.create({data:{actorId:admin.id,action:input.enabled?'TAX_MODULE_ENABLED':'TAX_MODULE_DISABLED',entity:'TAX_MODULE',entityId:'default',metadata:{enabled:input.enabled}}});
			return NextResponse.json(jsonSafe(settings),{headers:{'Cache-Control':'private, no-store'}});
		}
		const input=accessSchema.parse(body);
		const user=await db.user.findUnique({where:{id:input.userId},select:{id:true,role:true}});
		if(!user||user.role!=='USER')return NextResponse.json({error:'Invalid user.'},{status:409});
		const access=await db.taxServiceAccess.upsert({
			where:{userId:input.userId},
			create:{
				userId:input.userId,
				enabled:input.enabled,
				allowedServices:JSON.stringify(input.allowedServices||Object.values(TaxServiceType)),
				grantedById:admin.id,
				note:input.note||null,
				revokedAt:input.enabled?null:new Date(),
			},
			update:{
				enabled:input.enabled,
				allowedServices:input.allowedServices?JSON.stringify(input.allowedServices):undefined,
				grantedById:admin.id,
				note:input.note||null,
				revokedAt:input.enabled?null:new Date(),
			},
		});
		await db.auditLog.create({data:{actorId:admin.id,action:input.enabled?'TAX_ACCESS_GRANTED':'TAX_ACCESS_REVOKED',entity:'TAX_ACCESS',entityId:access.id,metadata:{userId:input.userId,enabled:input.enabled}}});
		return NextResponse.json(jsonSafe(access),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Invalid request.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		return NextResponse.json({error:'Unable to update tax settings.'},{status:500});
	}
}
