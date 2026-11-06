import {AccountMode} from '@prisma/client';
import {NextResponse} from 'next/server';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';

export async function POST(){
	try{
		const user=await requireUser();
		const activeUser=await db.user.findUnique({where:{id:user.id},select:{accountMode:true,status:true}});
		if(!activeUser||activeUser.status!=='ACTIVE')return NextResponse.json({error:'Unauthorized'},{status:401});
		return activeUser.accountMode===AccountMode.DEMO
			?NextResponse.json({error:'Currency conversion is not part of DEMO trading. Place DEMO orders in the trade terminal.'},{status:403})
			:NextResponse.json({error:'Bitcoin conversion is not available in REAL mode.'},{status:409});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		console.error('Bitcoin conversion access check failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Bitcoin conversion is unavailable.'},{status:503});
	}
}
