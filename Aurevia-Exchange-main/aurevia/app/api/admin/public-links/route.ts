import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {isSafePublicUrl,parsePublicResourceLinks,PUBLIC_RESOURCE_LINKS_KEY,type PublicResourceLink} from '@/lib/public-resource-links';

const itemSchema=z.object({
	id:z.string().min(1).optional(),
	title:z.string().trim().min(2).max(120),
	url:z.string().trim().min(1).max(500),
	description:z.string().trim().max(300).optional(),
	placement:z.enum(['RESOURCES','NEWS_UPDATES']).default('RESOURCES'),
});

const bodySchema=z.object({
	links:z.array(itemSchema).max(40),
});

export async function GET(){
	try{
		await requireAdmin();
		const setting=await db.systemSetting.findUnique({where:{key:PUBLIC_RESOURCE_LINKS_KEY},select:{value:true,updatedAt:true}});
		return NextResponse.json({links:parsePublicResourceLinks(setting?.value),updatedAt:setting?.updatedAt??null},{headers:{'Cache-Control':'private, no-store'}});
	}catch{
		return NextResponse.json({error:'Forbidden'},{status:403});
	}
}

export async function PUT(request:Request){
	try{
		const admin=await requireAdmin();
		const input=bodySchema.parse(await request.json());
		const links:PublicResourceLink[]=[];
		for(const item of input.links){
			if(!isSafePublicUrl(item.url))return NextResponse.json({error:`Invalid URL for "${item.title}". Use https:// or a site path starting with /.`,},{status:400});
			links.push({
				id:item.id||randomUUID(),
				title:item.title.trim(),
				url:item.url.trim(),
				...(item.description?.trim()?{description:item.description.trim()}:{}),
				placement:item.placement,
			});
		}
		const value=JSON.stringify(links);
		await db.$transaction(async tx=>{
			await tx.systemSetting.upsert({
				where:{key:PUBLIC_RESOURCE_LINKS_KEY},
				create:{key:PUBLIC_RESOURCE_LINKS_KEY,value},
				update:{value},
			});
			await tx.auditLog.create({data:{actorId:admin.id,action:'PUBLIC_RESOURCE_LINKS_UPDATED',entity:'SYSTEM_SETTING',entityId:PUBLIC_RESOURCE_LINKS_KEY,metadata:{count:links.length}}});
		});
		return NextResponse.json({links},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Invalid link list.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		return NextResponse.json({error:'Unable to save links.'},{status:500});
	}
}
