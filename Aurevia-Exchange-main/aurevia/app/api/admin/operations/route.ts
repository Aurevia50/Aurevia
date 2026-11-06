import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {jsonSafe} from '@/lib/serializers';

export async function GET(){
	try{
		await requireAdmin();
		const [orders,ledgerTransactions]=await Promise.all([
			db.order.findMany({include:{user:{select:{email:true,name:true}},instrument:{select:{symbol:true,name:true}},executions:{select:{quantity:true,price:true,fee:true,createdAt:true,providerExecutionId:true}}},orderBy:{createdAt:'desc'},take:100}),
			db.ledgerTransaction.findMany({include:{entries:{include:{account:{select:{code:true,name:true,currency:true,accountMode:true,user:{select:{email:true}}}}}}},orderBy:{createdAt:'desc'},take:100}),
		]);
		return NextResponse.json(jsonSafe({orders,ledgerTransactions}),{headers:{'Cache-Control':'private, no-store'}});
	}catch{return NextResponse.json({error:'Forbidden'},{status:403})}
}