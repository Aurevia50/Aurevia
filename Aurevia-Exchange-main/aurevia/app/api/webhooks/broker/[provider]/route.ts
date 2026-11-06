import {NextResponse} from 'next/server';

export const dynamic='force-dynamic';

export async function POST(){
	return NextResponse.json({error:'Broker webhook processing is disabled. Internal ledger transactions do not accept broker callbacks.'},{status:503,headers:{'Cache-Control':'no-store'}});
}
