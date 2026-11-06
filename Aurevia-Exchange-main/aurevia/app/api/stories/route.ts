import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth-options';
import {db} from '@/lib/db';
import {jsonSafe} from '@/lib/serializers';
import {publicStoryWhere} from '@/lib/story-policy';

export const dynamic='force-dynamic';

export async function GET(){
	try{
		const session=await getServerSession(authOptions);
		const includeMemberStories=session?.user?.role==='USER';
		const stories=await db.story.findMany({
			where:publicStoryWhere(new Date(),includeMemberStories),
			include:{category:{select:{id:true,name:true,slug:true}},media:{orderBy:[{displayOrder:'asc'},{createdAt:'asc'}]}},
			orderBy:[{displayOrder:'asc'},{publishedAt:'desc'},{publishAt:'desc'}],
			take:100,
		});
		const result=stories.map(story=>({
			id:story.id,
			title:story.title,
			description:story.description,
			category:story.category,
			externalUrl:story.externalUrl,
			publishedAt:story.publishedAt??story.publishAt,
			media:story.media.map(media=>({
				id:media.id,
				type:media.type,
				mimeType:media.mimeType,
				altText:media.altText,
				displayOrder:media.displayOrder,
				url:`/api/stories/${encodeURIComponent(story.id)}/media/${encodeURIComponent(media.id)}`,
			})),
		}));
		return NextResponse.json(jsonSafe(result),{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		console.error('Public stories could not be loaded.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Stories are temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});
	}
}
