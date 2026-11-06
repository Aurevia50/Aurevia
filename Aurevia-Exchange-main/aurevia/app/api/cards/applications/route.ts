import {NextResponse} from 'next/server';
import {AccountMode,CardApplicationStatus,NotificationType} from '@prisma/client';
import {z,ZodError} from 'zod';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {assertNoDuplicatePending,createApplicationReference,ensureCardCatalog} from '@/lib/cards';
import {createNotification,notifyActiveAdmins} from '@/lib/notifications';
import {jsonSafe} from '@/lib/serializers';
import {rateLimit} from '@/lib/rate-limit';

const schema=z.object({
	catalogItemId:z.string().min(1),
	disclosureAccepted:z.literal(true),
	applicantNote:z.string().trim().max(1000).optional(),
});

export async function POST(request:Request){
	try{
		const user=await requireUser();
		const activeUser=await db.user.findUnique({where:{id:user.id},select:{accountMode:true,status:true}});
		if(!activeUser||activeUser.status!=='ACTIVE')return NextResponse.json({error:'This account is unavailable.'},{status:403});
		if(activeUser.accountMode!==AccountMode.REAL)return NextResponse.json({error:'Card applications are available in REAL mode only.'},{status:403});
		rateLimit(`card-apply:${user.id}`,8,3600000);
		await ensureCardCatalog();
		const input=schema.parse(await request.json());
		const product=await db.cardCatalogItem.findFirst({where:{id:input.catalogItemId,enabled:true}});
		if(!product)return NextResponse.json({error:'Selected card is unavailable.'},{status:404});
		await assertNoDuplicatePending(user.id,product.id,product.allowMultiple);
		const cardholderName=(user.name||user.email?.split('@')[0]||'Cardholder').trim().slice(0,120);
		const application=await db.$transaction(async tx=>{
			const current=await tx.user.findUniqueOrThrow({where:{id:user.id},select:{accountMode:true,status:true}});
			if(current.status!=='ACTIVE')throw new Error('ACCOUNT_UNAVAILABLE');
			if(current.accountMode!==AccountMode.REAL)throw new Error('REAL_MODE_REQUIRED');
			const created=await tx.cardApplication.create({
				data:{
					reference:createApplicationReference(),
					userId:user.id,
					catalogItemId:product.id,
					designTier:product.designTier,
					cardholderName,
					status:CardApplicationStatus.SUBMITTED,
					priceSnapshot:product.orderPrice,
					currencySnapshot:product.currency,
					disclosureAccepted:true,
					applicantNote:input.applicantNote||null,
					submittedAt:new Date(),
				},
			});
			await tx.auditLog.create({data:{actorId:user.id,action:'CARD_APPLICATION_SUBMITTED',entity:'CARD_APPLICATION',entityId:created.id,metadata:{reference:created.reference,catalogItemId:product.id,price:product.orderPrice.toString(),currency:product.currency}}});
			await createNotification(tx,{userId:user.id,type:NotificationType.CARD,title:'Card application submitted',message:`Your application ${created.reference} was submitted for review.`,dedupeKey:`card-app:${created.id}:submitted`,actionUrl:'/cards'});
			await notifyActiveAdmins(tx,{type:NotificationType.CARD,title:'Card application received',message:`A card application was submitted (${created.reference}).`,dedupeKey:`card-app:${created.id}:admin`,relatedEntity:'CARD_APPLICATION',relatedId:created.id,actionUrl:'/admin/cards'});
			return created;
		});
		return NextResponse.json(jsonSafe(application),{status:201,headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='REAL_MODE_REQUIRED')return NextResponse.json({error:'Card applications are available in REAL mode only.'},{status:403});
		if(error instanceof Error&&error.message==='ACCOUNT_UNAVAILABLE')return NextResponse.json({error:'This account is unavailable.'},{status:403});
		if(error instanceof ZodError)return NextResponse.json({error:'Accept the product terms and select a card.'},{status:400});
		if(error instanceof Error&&error.message==='DUPLICATE_PENDING_APPLICATION')return NextResponse.json({error:'You already have a pending application for this card.'},{status:409});
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many applications.'},{status:429});
		return NextResponse.json({error:'Unable to submit application.'},{status:500});
	}
}
