import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {Prisma} from '@prisma/client';

export const dynamic='force-dynamic';

const categorySchema=z.object({name:z.string().trim().min(2).max(80),displayOrder:z.number().int().min(0).max(10000).optional()});

export async function GET(){
	try{
		await requireAdmin();
		const categories=await db.storyCategory.findMany({orderBy:[{displayOrder:'asc'},{name:'asc'}]});
		return NextResponse.json(categories,{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		console.error('Story categories could not be loaded.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Story categories are temporarily unavailable.'},{status:500});
	}
}

export async function POST(request:Request){
	try{
		const admin=await requireAdmin();
		const input=categorySchema.parse(await request.json());
		const slug=input.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'category';
		const order=input.displayOrder??((await db.storyCategory.aggregate({_max:{displayOrder:true}}))._max.displayOrder??0)+1;
		const category=await db.$transaction(async tx=>{
			const created=await tx.storyCategory.create({data:{name:input.name,slug,displayOrder:order}});
			await tx.auditLog.create({data:{actorId:admin.id,action:'STORY_CATEGORY_CREATED',entity:'STORY_CATEGORY',entityId:created.id,metadata:{name:created.name,slug:created.slug}}});
			return created;
		});
		return NextResponse.json(category,{status:201,headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		if(error instanceof ZodError)return NextResponse.json({error:'Enter a category name between 2 and 80 characters.'},{status:400});
		if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')return NextResponse.json({error:'A category with this name or URL key already exists.'},{status:409});
		console.error('Story category could not be created.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to create the story category.'},{status:500});
	}
}
