import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {SUPPORTED_CURRENCIES} from '@/lib/config/simulation';

const schema=z.object({currency:z.enum(SUPPORTED_CURRENCIES)});

export async function GET(){
	try{
		const user=await requireUser();
		const preference=await db.user.findUniqueOrThrow({where:{id:user.id},select:{preferredDisplayCurrency:true}});
		return NextResponse.json({currency:preference.preferredDisplayCurrency},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		return NextResponse.json({error:'Display currency preference is unavailable.'},{status:503});
	}
}

export async function PATCH(request:Request){
	try{
		const user=await requireUser();
		const input=schema.parse(await request.json());
		await db.$transaction(async tx=>{
			const current=await tx.user.findUniqueOrThrow({where:{id:user.id},select:{preferredDisplayCurrency:true}});
			if(current.preferredDisplayCurrency===input.currency)return;
			await tx.user.update({where:{id:user.id},data:{preferredDisplayCurrency:input.currency}});
			await tx.auditLog.create({data:{actorId:user.id,action:'DISPLAY_CURRENCY_CHANGED',entity:'USER',entityId:user.id,metadata:{previousCurrency:current.preferredDisplayCurrency,newCurrency:input.currency,ledgerChanged:false}}});
		});
		return NextResponse.json({currency:input.currency},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Choose one of the supported display currencies.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		return NextResponse.json({error:'Unable to save display currency preference.'},{status:503});
	}
}
