import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {deletePrivateObject} from '@/lib/private-storage';
import {jsonSafe} from '@/lib/serializers';

export const dynamic='force-dynamic';

const itemTypeSchema=z.enum(['WAITLIST_ENTRY','CLIENT_STORY','BROADCAST']);
const actionSchema=z.object({
	action:z.enum(['restore','permanently-delete']),
	items:z.array(z.object({type:itemTypeSchema,id:z.string().min(1).max(128)})).min(1).max(100),
});
type DeletedItemType=z.infer<typeof itemTypeSchema>;

function deletedItemKey(item:{type:DeletedItemType;id:string}){
	return `${item.type}:${item.id}`;
}

function isDeletedItemType(value:string):value is DeletedItemType{
	return itemTypeSchema.safeParse(value).success;
}

export async function GET(request:Request){
	try{
		await requireAdmin();
		const params=new URL(request.url).searchParams;
		const search=(params.get('search')||'').trim().slice(0,120).toLocaleLowerCase();
		const selectedType=params.get('type');
		if(selectedType&&selectedType!=='ALL'&&!isDeletedItemType(selectedType))return NextResponse.json({error:'Invalid deleted-item type.'},{status:400});
		const types:DeletedItemType[]=selectedType&&selectedType!=='ALL'&&isDeletedItemType(selectedType)?[selectedType]:['WAITLIST_ENTRY','CLIENT_STORY','BROADCAST'];
		const [waitlist,stories,broadcasts]=await Promise.all([
			types.includes('WAITLIST_ENTRY')?db.waitlistEntry.findMany({where:{deletedAt:{not:null}},orderBy:{deletedAt:'desc'}}):[],
			types.includes('CLIENT_STORY')?db.clientStory.findMany({where:{deletedAt:{not:null}},orderBy:{deletedAt:'desc'}}):[],
			types.includes('BROADCAST')?db.broadcast.findMany({where:{deletedAt:{not:null}},orderBy:{deletedAt:'desc'}}):[],
		]);
		const items=[
			...waitlist.map(item=>({id:item.id,type:'WAITLIST_ENTRY' as const,displayName:item.name,details:`${item.email} · ${item.country} · ${item.investorType}`,deletedAt:item.deletedAt!,deletedById:item.deletedById,originalLocation:'/admin/waitlist'})),
			...stories.map(item=>({id:item.id,type:'CLIENT_STORY' as const,displayName:item.displayName,details:`${item.country}${item.cityOrRegion?` · ${item.cityOrRegion}`:''} · ${item.quote}`,deletedAt:item.deletedAt!,deletedById:item.deletedById,originalLocation:'/admin/content'})),
			...broadcasts.map(item=>({id:item.id,type:'BROADCAST' as const,displayName:item.title,details:`${item.status} · ${item.description}`,deletedAt:item.deletedAt!,deletedById:item.deletedById,originalLocation:'/admin/broadcasts'})),
		].filter(item=>!search||`${item.id} ${item.type} ${item.displayName} ${item.details} ${item.originalLocation}`.toLocaleLowerCase().includes(search)).sort((a,b)=>b.deletedAt.getTime()-a.deletedAt.getTime());
		const actorIds=[...new Set(items.map(item=>item.deletedById).filter((id):id is string=>Boolean(id)))];
		const actors=actorIds.length?await db.user.findMany({where:{id:{in:actorIds}},select:{id:true,name:true,email:true}}):[];
		const actorById=new Map(actors.map(actor=>[actor.id,actor]));
		return NextResponse.json(jsonSafe(items.map(({deletedById,...item})=>({...item,deletedBy:deletedById?actorById.get(deletedById)||null:null}))),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		return NextResponse.json({error:'Unable to load Deleted Items.'},{status:500});
	}
}

export async function POST(request:Request){
	try{
		const admin=await requireAdmin();
		const input=actionSchema.parse(await request.json());
		const items=[...new Map(input.items.map(item=>[deletedItemKey(item),item])).values()];
		const groupedItems=Object.fromEntries(
			(['WAITLIST_ENTRY','CLIENT_STORY','BROADCAST'] as const).map(type=>[type,items.filter(item=>item.type===type)]),
		);
		const privateImages:{ownerId:string;key:string}[]=[];
		await db.$transaction(async tx=>{
			const [waitlist,stories,broadcasts]=await Promise.all([
				groupedItems.WAITLIST_ENTRY.length?tx.waitlistEntry.findMany({where:{id:{in:groupedItems.WAITLIST_ENTRY.map(item=>item.id)},deletedAt:{not:null}},select:{id:true,email:true}}):[],
				groupedItems.CLIENT_STORY.length?tx.clientStory.findMany({where:{id:{in:groupedItems.CLIENT_STORY.map(item=>item.id)},deletedAt:{not:null}},select:{id:true,displayName:true,imageReference:true}}):[],
				groupedItems.BROADCAST.length?tx.broadcast.findMany({where:{id:{in:groupedItems.BROADCAST.map(item=>item.id)},deletedAt:{not:null}},select:{id:true,title:true}}):[],
			]);
			if(waitlist.length!==groupedItems.WAITLIST_ENTRY.length||stories.length!==groupedItems.CLIENT_STORY.length||broadcasts.length!==groupedItems.BROADCAST.length)throw new Error('DELETED_ITEM_NOT_FOUND');
			if(input.action==='permanently-delete')for(const story of stories){
				const prefix='storage://client-stories/';
				if(story.imageReference?.startsWith(prefix))privateImages.push({ownerId:story.id,key:story.imageReference.slice(prefix.length)});
			}
			const restore=input.action==='restore';
			const results=await Promise.all([
				groupedItems.WAITLIST_ENTRY.length?(restore
					?tx.waitlistEntry.updateMany({where:{id:{in:waitlist.map(item=>item.id)},deletedAt:{not:null}},data:{deletedAt:null,deletedById:null}})
					:tx.waitlistEntry.deleteMany({where:{id:{in:waitlist.map(item=>item.id)},deletedAt:{not:null}}})):null,
				groupedItems.CLIENT_STORY.length?(restore
					?tx.clientStory.updateMany({where:{id:{in:stories.map(item=>item.id)},deletedAt:{not:null}},data:{deletedAt:null,deletedById:null}})
					:tx.clientStory.deleteMany({where:{id:{in:stories.map(item=>item.id)},deletedAt:{not:null}}})):null,
				groupedItems.BROADCAST.length?(restore
					?tx.broadcast.updateMany({where:{id:{in:broadcasts.map(item=>item.id)},deletedAt:{not:null}},data:{deletedAt:null,deletedById:null}})
					:tx.broadcast.deleteMany({where:{id:{in:broadcasts.map(item=>item.id)},deletedAt:{not:null}}})):null,
			]);
			if(results.some((result,index)=>result&&result.count!==[groupedItems.WAITLIST_ENTRY.length,groupedItems.CLIENT_STORY.length,groupedItems.BROADCAST.length][index]))throw new Error('DELETED_ITEM_NOT_FOUND');
			await tx.auditLog.createMany({data:[
				...waitlist.map(record=>({actorId:admin.id,action:restore?'WAITLIST_ENTRY_RESTORED':'WAITLIST_ENTRY_PERMANENTLY_DELETED',entity:'WAITLIST_ENTRY',entityId:record.id,metadata:{email:record.email}})),
				...stories.map(record=>({actorId:admin.id,action:restore?'CLIENT_STORY_RESTORED':'CLIENT_STORY_PERMANENTLY_DELETED',entity:'CLIENT_STORY',entityId:record.id,metadata:{displayName:record.displayName}})),
				...broadcasts.map(record=>({actorId:admin.id,action:restore?'BROADCAST_RESTORED':'BROADCAST_PERMANENTLY_DELETED',entity:'BROADCAST',entityId:record.id,metadata:{title:record.title}})),
			]});
		},{isolationLevel:'Serializable',maxWait:5_000,timeout:15_000});
		const cleanupResults=await Promise.all(privateImages.map(image=>deletePrivateObject('clientStory',image.ownerId,image.key)));
		const cleanupFailures=cleanupResults.filter(success=>!success).length;
		return NextResponse.json({
			action:input.action,
			affected:items.length,
			...(cleanupFailures?{warning:`${cleanupFailures} private story image${cleanupFailures===1?'':'s'} could not be removed from storage. The database records were permanently deleted; verify storage cleanup.`}:{}),
		},{status:cleanupFailures?207:200});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Choose a valid action and between 1 and 100 deleted items.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof Error&&error.message==='DELETED_ITEM_NOT_FOUND')return NextResponse.json({error:'One or more items are no longer in Deleted Items. Refresh and try again.'},{status:409});
		return NextResponse.json({error:'Unable to update Deleted Items.'},{status:500});
	}
}
