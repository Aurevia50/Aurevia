import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';

export async function GET(){
	try{
		await requireAdmin();
		const [audit,notification]=await Promise.all([
			db.auditLog.findFirst({orderBy:{createdAt:'desc'},select:{createdAt:true}}),
			db.notification.findFirst({orderBy:{createdAt:'desc'},select:{createdAt:true}}),
		]);
		const latest=[audit?.createdAt,notification?.createdAt].filter((value):value is Date=>Boolean(value)).sort((left,right)=>right.getTime()-left.getTime())[0]??null;
		return NextResponse.json({latestActivityAt:latest?.toISOString()??null},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		console.error('Admin activity notification status unavailable.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to check administrator activity.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}
