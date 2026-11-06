import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {parsePublicResourceLinks,PUBLIC_RESOURCE_LINKS_KEY} from '@/lib/public-resource-links';

export const dynamic='force-dynamic';

export async function GET(){
	const setting=await db.systemSetting.findUnique({where:{key:PUBLIC_RESOURCE_LINKS_KEY},select:{value:true}});
	const links=parsePublicResourceLinks(setting?.value);
	return NextResponse.json({links},{headers:{'Cache-Control':'public, max-age=30'}});
}
