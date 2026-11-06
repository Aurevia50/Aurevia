import {NextResponse} from 'next/server';import {getMarket} from '@/lib/market';import {jsonSafe} from '@/lib/serializers';

export const dynamic='force-dynamic';

export async function GET(){
	try{return NextResponse.json(jsonSafe(await getMarket()),{headers:{'Cache-Control':'no-store'}})}
	catch(error){
		const code=error&&typeof error==='object'&&'code' in error&&/^[A-Z0-9_]{2,32}$/.test(String(error.code))?String(error.code):error instanceof Error?error.name:'UnknownError';
		console.error(`Market request unavailable (${code}).`);
		return NextResponse.json({error:'Market data is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});
	}
}
