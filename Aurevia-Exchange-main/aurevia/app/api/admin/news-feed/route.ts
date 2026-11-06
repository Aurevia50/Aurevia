import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {ensureDefaultNewsSources,syncAllEnabledNewsSources,syncNewsSource} from '@/lib/news-feed/sync';
import {jsonSafe} from '@/lib/serializers';

export async function GET(){
	try{
		await requireAdmin();
		await ensureDefaultNewsSources();
		const sources=await db.newsFeedSource.findMany({orderBy:{displayName:'asc'}});
		return NextResponse.json(jsonSafe({sources}),{headers:{'Cache-Control':'private, no-store'}});
	}catch{
		return NextResponse.json({error:'Forbidden'},{status:403});
	}
}

const syncSchema=z.object({
	sourceId:z.string().min(1).optional(),
	forceAll:z.boolean().optional(),
});

export async function POST(request:Request){
	try{
		await requireAdmin();
		const input=syncSchema.parse(await request.json().catch(()=>({})));
		await ensureDefaultNewsSources();
		if(input.sourceId){
			const result=await syncNewsSource(input.sourceId);
			return NextResponse.json(jsonSafe(result),{headers:{'Cache-Control':'private, no-store'}});
		}
		const results=await syncAllEnabledNewsSources();
		return NextResponse.json(jsonSafe({results}),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Invalid sync request.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='SOURCE_NOT_FOUND')return NextResponse.json({error:'Source not found.'},{status:404});
		console.error('admin news sync failed',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to synchronize news sources.'},{status:503});
	}
}
