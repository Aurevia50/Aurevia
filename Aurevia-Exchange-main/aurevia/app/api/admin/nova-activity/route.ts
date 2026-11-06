import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';

export const dynamic='force-dynamic';

function metadataRecord(value:unknown):Record<string,unknown>{
	return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}

function safeText(value:unknown,maxLength=80):string|null{
	return typeof value==='string'&&value.length<=maxLength&&/^[A-Za-z0-9._:/ -]+$/.test(value)?value:null;
}

function marketSource(value:unknown):string|null{
	return value==='Finnhub'||value==='Yahoo Finance'||value==='Alpaca Crypto'?value:null;
}

export async function GET(){
	try{
		await requireAdmin();
		const since=new Date(Date.now()-30*24*60*60*1000);
		const records=await db.auditLog.findMany({
			where:{entity:'NOVA_ACTIVITY',createdAt:{gte:since}},
			select:{id:true,actorId:true,action:true,entityId:true,metadata:true,createdAt:true},
			orderBy:{createdAt:'desc'},
			take:100,
		});
		const events=records.map(record=>{
			const metadata=metadataRecord(record.metadata);
			const eventTypes=Array.isArray(metadata.eventTypes)
				?metadata.eventTypes.filter((event):event is string=>typeof event==='string'&&/^[A-Z_]{2,64}$/.test(event)).slice(0,20)
				:[];
			return {
				id:record.id,
				userId:record.actorId,
				conversationId:safeText(record.entityId,64),
				action:record.action==='NOVA_USER_CONTEXT_LOOKUP'||record.action==='NOVA_MARKET_DATA_LOOKUP'?record.action:'NOVA_ACTIVITY',
				eventTypes,
				accountMode:metadata.accountMode==='DEMO'||metadata.accountMode==='REAL'?metadata.accountMode:null,
				symbol:safeText(metadata.symbol,16),
				source:marketSource(metadata.source),
				freshness:metadata.freshness==='STALE'||metadata.freshness==='UNVERIFIED'||metadata.freshness==='UNAVAILABLE'?metadata.freshness:null,
				externalAction:metadata.externalAction===true,
				providerResult:metadata.providerResult==='quote-returned'||metadata.providerResult==='unavailable'||metadata.providerResult==='not-applicable'?metadata.providerResult:null,
				createdAt:record.createdAt,
			};
		});
		return NextResponse.json(events,{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		console.error('Nova activity report could not be loaded.');
		return NextResponse.json({error:'Nova activity is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}
