import {NextResponse} from 'next/server';

export async function POST(){
	return NextResponse.json({error:'Akedly phone attempts are no longer active. Use SMS phone verification instead.'},{status:410});
}
