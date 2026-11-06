import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth-options';
import {db} from '@/lib/db';
import {createPrivateSignedUrl,PrivateStorageError} from '@/lib/private-storage';
import {publicStoryWhere} from '@/lib/story-policy';

export async function GET(_request:Request,{params}:{params:Promise<{storyId:string;mediaId:string}>}){
	try{
		const {storyId,mediaId}=await params;
		const session=await getServerSession(authOptions);
		const includeMemberStories=session?.user?.role==='USER';
		const media=await db.storyMedia.findFirst({
			where:{id:mediaId,storyId,story:{is:publicStoryWhere(new Date(),Boolean(includeMemberStories))}},
			select:{id:true,storyId:true,storageKey:true},
		});
		if(!media)return NextResponse.json({error:'Story media not found.'},{status:404,headers:{'Cache-Control':'no-store'}});
		const url=await createPrivateSignedUrl('story',media.storyId,media.storageKey,300);
		return NextResponse.redirect(url,{status:307,headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof PrivateStorageError)return NextResponse.json({error:'Story media is temporarily unavailable.'},{status:error.status,headers:{'Cache-Control':'no-store'}});
		console.error('Public story media could not be loaded.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Story media is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});
	}
}
