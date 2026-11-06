import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth-options';
import {safeInternalPath} from '@/lib/navigation';

export const dynamic='force-dynamic';

export async function GET(request:Request){
	const requested=new URL(request.url).searchParams.get('to')||'/dashboard';
	const destination=safeInternalPath(requested);
	const session=await getServerSession(authOptions);
	const target=session?.user?.id
		?destination
		:`/login?callbackUrl=${encodeURIComponent(destination)}`;
	return NextResponse.redirect(new URL(target,request.url),{headers:{'Cache-Control':'no-store'}});
}
