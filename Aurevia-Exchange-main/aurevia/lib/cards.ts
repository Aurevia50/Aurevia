import {randomBytes} from 'node:crypto';
import {CardApplicationStatus,CardDesignTier,Prisma} from '@prisma/client';
import {db} from '@/lib/db';

export const DEFAULT_CARD_CATALOG=[
	{key:'aurevia-signature',designTier:CardDesignTier.SIGNATURE,displayName:'Aurevia Signature',description:'Deep forest finish with gold detailing.',orderPrice:'25.00',currency:'USD'},
	{key:'aurevia-gold',designTier:CardDesignTier.GOLD,displayName:'Aurevia Gold',description:'Metallic gold accent tier.',orderPrice:'49.00',currency:'USD'},
	{key:'aurevia-black',designTier:CardDesignTier.BLACK,displayName:'Aurevia Black',description:'Near-black premium finish.',orderPrice:'79.00',currency:'USD'},
] as const;

export async function ensureCardCatalog(){
	for(const item of DEFAULT_CARD_CATALOG){
		await db.cardCatalogItem.upsert({
			where:{key:item.key},
			create:{
				key:item.key,
				designTier:item.designTier,
				displayName:item.displayName,
				description:item.description,
				orderPrice:new Prisma.Decimal(item.orderPrice),
				currency:item.currency,
				enabled:true,
				allowMultiple:false,
			},
			update:{displayName:item.displayName,description:item.description},
		});
	}
}

export function createApplicationReference(){
	return `CA-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function createCardReference(){
	return `AV${randomBytes(5).toString('hex').toUpperCase()}`;
}

export function createMaskedPan(){
	const last4=String(Math.floor(1000+Math.random()*9000));
	return {maskedPan:`•••• •••• •••• ${last4}`,last4};
}

export function defaultExpiry(){
	const now=new Date();
	return {expiryMonth:now.getUTCMonth()+1,expiryYear:now.getUTCFullYear()+4};
}

const pending:CardApplicationStatus[]=[CardApplicationStatus.DRAFT,CardApplicationStatus.SUBMITTED,CardApplicationStatus.UNDER_REVIEW,CardApplicationStatus.AWAITING_INFO];

export function isPendingApplication(status:CardApplicationStatus){
	return pending.includes(status);
}

export async function assertNoDuplicatePending(userId:string,catalogItemId:string,allowMultiple:boolean){
	if(allowMultiple)return;
	const existing=await db.cardApplication.findFirst({
		where:{userId,catalogItemId,status:{in:pending}},
		select:{id:true},
	});
	if(existing)throw new Error('DUPLICATE_PENDING_APPLICATION');
}
