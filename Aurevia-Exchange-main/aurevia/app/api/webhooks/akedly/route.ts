import {NextResponse} from 'next/server';

export async function POST(){
	return NextResponse.json({error:'Akedly webhooks are no longer active. Configure Didit at /api/webhooks/didit.'},{status:410});
}
