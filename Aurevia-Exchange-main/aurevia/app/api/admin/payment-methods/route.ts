import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';

export async function GET(){
	try{
		await requireAdmin();
		await db.paymentMethod.count();
		return NextResponse.json([],{headers:{'Cache-Control':'private, no-store'}});
	}catch{
		return NextResponse.json({error:'Forbidden'},{status:403});
	}
}

export async function POST(){
	try{
		await requireAdmin();
		return NextResponse.json({error:'External payment processing is disabled. Funding requests use internal ledger records only.'},{status:409});
	}catch(error){
		const status=error instanceof Error&&error.message==='UNAUTHORIZED'?401:403;
		return NextResponse.json({error:status===401?'Unauthorized':'Forbidden'},{status});
	}
}

export async function PATCH(){
	try{
		await requireAdmin();
		return NextResponse.json({error:'External payment processing is disabled. Existing records are retained for historical references.'},{status:409});
	}catch(error){
		const status=error instanceof Error&&error.message==='UNAUTHORIZED'?401:403;
		return NextResponse.json({error:status===401?'Unauthorized':'Forbidden'},{status});
	}
}