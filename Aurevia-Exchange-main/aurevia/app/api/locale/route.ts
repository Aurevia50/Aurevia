import {NextResponse} from 'next/server';
import {isLocale,locales} from '@/lib/i18n';

export function GET(){return NextResponse.json({locales})}
export async function POST(request:Request){const body=await request.json().catch(()=>({}));const locale=body?.locale;if(!isLocale(locale))return NextResponse.json({error:'Unsupported locale'},{status:400});return NextResponse.json({locale});}
