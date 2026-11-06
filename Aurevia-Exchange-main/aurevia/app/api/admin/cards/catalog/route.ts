import {NextResponse} from 'next/server';
import {Prisma} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {jsonSafe} from '@/lib/serializers';

const schema=z.object({
	id:z.string().min(1),
	orderPrice:z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
	enabled:z.boolean().optional(),
	allowMultiple:z.boolean().optional(),
	displayName:z.string().trim().min(2).max(80).optional(),
	description:z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(request:Request){
	try{
		const admin=await requireAdmin();
		const input=schema.parse(await request.json());
		const current=await db.cardCatalogItem.findUnique({where:{id:input.id}});
		if(!current)return NextResponse.json({error:'Not found'},{status:404});
		const updated=await db.$transaction(async tx=>{
			const item=await tx.cardCatalogItem.update({
				where:{id:current.id},
				data:{
					orderPrice:input.orderPrice?new Prisma.Decimal(input.orderPrice):undefined,
					enabled:input.enabled,
					allowMultiple:input.allowMultiple,
					displayName:input.displayName,
					description:input.description===undefined?undefined:input.description,
					updatedById:admin.id,
				},
			});
			await tx.auditLog.create({data:{actorId:admin.id,action:'CARD_CATALOG_UPDATED',entity:'CARD_CATALOG',entityId:item.id,metadata:{orderPrice:item.orderPrice.toString(),enabled:item.enabled,allowMultiple:item.allowMultiple}}});
			return item;
		});
		return NextResponse.json(jsonSafe(updated),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Invalid catalog update.'},{status:400});
		return NextResponse.json({error:'Unable to update catalog.'},{status:500});
	}
}
