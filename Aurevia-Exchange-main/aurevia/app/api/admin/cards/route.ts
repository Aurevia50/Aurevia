import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {ensureCardCatalog} from '@/lib/cards';
import {jsonSafe} from '@/lib/serializers';

export async function GET(){
	try{
		await requireAdmin();
		await ensureCardCatalog();
		const [catalog,applications,cards]=await Promise.all([
			db.cardCatalogItem.findMany({orderBy:{orderPrice:'asc'}}),
			db.cardApplication.findMany({include:{user:{select:{id:true,email:true,name:true}},catalogItem:{select:{displayName:true,key:true}},issuedCard:true},orderBy:{createdAt:'desc'},take:200}),
			db.simulatedCard.findMany({include:{user:{select:{email:true,name:true}}},orderBy:{issuedAt:'desc'},take:200}),
		]);
		return NextResponse.json(jsonSafe({catalog,applications,cards}),{headers:{'Cache-Control':'private, no-store'}});
	}catch{
		return NextResponse.json({error:'Forbidden'},{status:403});
	}
}
