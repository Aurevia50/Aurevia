import {NextResponse} from 'next/server';
import {Prisma} from '@prisma/client';
import {ZodError} from 'zod';
import {db} from '@/lib/db';
import {rateLimit} from '@/lib/rate-limit';
import {waitlistSubmissionSchema} from '@/lib/waitlist';

export const dynamic='force-dynamic';

function clientIp(request:Request){
  const forwarded=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded||request.headers.get('x-real-ip')||'unknown';
}

export async function POST(request:Request){
  try{
    rateLimit(`waitlist:${clientIp(request)}`,3,60*60_000);
    const input=waitlistSubmissionSchema.parse(await request.json());
    const entry=await db.waitlistEntry.upsert({
      where:{email:input.email},
      update:{name:input.name,country:input.country,investorType:input.investorType,phone:input.phone??null,consent:true,source:input.source??null,status:'WAITING',deletedAt:null,deletedById:null,updatedAt:new Date()},
      create:{email:input.email,name:input.name,country:input.country,investorType:input.investorType,phone:input.phone??null,consent:true,source:input.source??null,status:'WAITING'},
    });
    return NextResponse.json({message:'You are on the Aurevia waitlist. Your request has been recorded.',entryId:entry.id,status:entry.status},{status:201});
  }catch(error){
    if(error instanceof ZodError)return NextResponse.json({error:'Check your name, email, country, investor type, phone, and consent.'},{status:400});
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P23505')return NextResponse.json({error:'This email address is already registered on the Aurevia waitlist.'},{status:409});
    if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many waitlist submissions. Please try again later.'},{status:429});
    return NextResponse.json({error:'We could not record your waitlist request. Please try again.'},{status:500});
  }
}
