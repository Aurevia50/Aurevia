import {NextResponse} from 'next/server';
import {getSupportContact} from '@/lib/config';

export const dynamic='force-dynamic';
export const revalidate=0;

export async function GET(){
	const contact=getSupportContact();
	return NextResponse.json({email:contact.email,complaintsEmail:contact.complaintsEmail,phone:contact.phone});
}