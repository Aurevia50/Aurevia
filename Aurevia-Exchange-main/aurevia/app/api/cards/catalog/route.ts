import {NextResponse} from 'next/server';
import {AccountMode} from '@prisma/client';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {ensureCardCatalog} from '@/lib/cards';
import {jsonSafe} from '@/lib/serializers';

export async function GET(){
	try{
		const user=await requireUser();
		const activeUser=await db.user.findUnique({where:{id:user.id},select:{accountMode:true,status:true}});
		if(!activeUser||activeUser.status!=='ACTIVE')return NextResponse.json({error:'This account is unavailable.'},{status:403});
		if(activeUser.accountMode!==AccountMode.REAL)return NextResponse.json({items:[]},{headers:{'Cache-Control':'private, no-store'}});
		await ensureCardCatalog();
		const items=await db.cardCatalogItem.findMany({where:{enabled:true},orderBy:{orderPrice:'asc'}});
		return NextResponse.json(jsonSafe({items}),{headers:{'Cache-Control':'private, no-store'}});
	}catch{
		return NextResponse.json({error:'Unauthorized'},{status:401});
	}
}
