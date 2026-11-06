import {NextResponse} from 'next/server';
import {getPublishedClientStories} from '@/lib/client-stories';

export const dynamic='force-dynamic';

export async function GET(){
	return NextResponse.json(await getPublishedClientStories(),{headers:{'Cache-Control':'no-store'}});
}