import {NextResponse} from 'next/server';
import {BroadcastStatus} from '@prisma/client';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {jsonSafe} from '@/lib/serializers';

export const dynamic='force-dynamic';

export async function GET(){
	try{
		await requireUser();
		const broadcasts=await db.broadcast.findMany({
			where:{deletedAt:null,OR:[{status:BroadcastStatus.PUBLISHED},{status:BroadcastStatus.ENDED},{status:BroadcastStatus.SCHEDULED,startsAt:{gte:new Date()}}]},
			select:{id:true,title:true,description:true,streamUrl:true,startsAt:true,status:true,publishedAt:true,endedAt:true,createdAt:true,updatedAt:true},
			orderBy:[{startsAt:'asc'},{publishedAt:'desc'}],
			take:100,
		});
		return NextResponse.json(jsonSafe({eligibilityTier:1,broadcasts}),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		const status=error instanceof Error&&error.message==='UNAUTHORIZED'?401:500;
		return NextResponse.json({error:status===401?'Unauthorized':'Broadcasts are temporarily unavailable.'},{status,headers:{'Cache-Control':'private, no-store'}});
	}
}