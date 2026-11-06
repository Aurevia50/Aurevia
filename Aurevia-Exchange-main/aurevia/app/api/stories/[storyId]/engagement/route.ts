import {createHash,randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {Prisma,StoryEngagementType} from '@prisma/client';
import {cookies} from 'next/headers';
import {getServerSession} from 'next-auth';
import {z,ZodError} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {db} from '@/lib/db';
import {publicStoryWhere} from '@/lib/story-policy';

const visitorCookie='aurevia_story_visitor';
const actionSchema=z.object({type:z.nativeEnum(StoryEngagementType)});
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request:Request,{params}:{params:Promise<{storyId:string}>}){
	try{
		const {storyId}=await params;
		const {type}=actionSchema.parse(await request.json());
		const session=await getServerSession(authOptions);
		const userId=session?.user?.role==='USER'?session.user.id:null;
		const story=await db.story.findFirst({
			where:{id:storyId,...publicStoryWhere(new Date(),Boolean(userId))},
			select:{id:true,externalUrl:true},
		});
		if(!story)return NextResponse.json({error:'Story not found.'},{status:404});
		if(type===StoryEngagementType.LINK_CLICK&&!story.externalUrl)return NextResponse.json({error:'This story has no external link.'},{status:409});
		const cookieStore=await cookies();
		const existing=cookieStore.get(visitorCookie)?.value;
		const visitorId=existing&&uuidPattern.test(existing)?existing:randomUUID();
		const viewerIdentity=userId?`user:${userId}`:`visitor:${visitorId}`;
		const viewerKey=createHash('sha256').update(viewerIdentity).digest('hex');
		const now=new Date();
		const day=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
		try{
			await db.storyEngagement.create({data:{storyId:story.id,viewerKey,type,day}});
		}catch(error){
			if(!(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002'))throw error;
			const response=NextResponse.json({recorded:false},{headers:{'Cache-Control':'no-store'}});
			if(!userId&&visitorId!==existing)response.cookies.set(visitorCookie,visitorId,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:31536000});
			return response;
		}
		const response=NextResponse.json({recorded:true},{headers:{'Cache-Control':'no-store'}});
		if(!userId&&visitorId!==existing)response.cookies.set(visitorCookie,visitorId,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:31536000});
		return response;
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Choose a valid story engagement action.'},{status:400});
		console.error('Story engagement could not be recorded.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Unable to record story engagement.'},{status:503,headers:{'Cache-Control':'no-store'}});
	}
}
