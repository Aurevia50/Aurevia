import {NextResponse} from 'next/server';

export async function POST(){
	return NextResponse.json({error:'Akedly callbacks are no longer active. Start identity verification from /kyc.'},{status:410});
}
