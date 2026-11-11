import {NextResponse} from 'next/server';
import {AccountMode} from '@prisma/client';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {createDiditSession,diditIsConfigured,mapDiditKycStatus} from '@/lib/didit';
import {getServerConfiguration} from '@/lib/config/env';
import {Prisma} from '@prisma/client';
import {rateLimit} from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const user = await requireUser();
    try {
      rateLimit(`didit-session:${user.id}`,5,60*60_000);
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMITED') {
        return NextResponse.json({error:'Too many verification attempts. Try again later.'},{status:429});
      }
      throw error;
    }
    if (!diditIsConfigured()) {
      return NextResponse.json({error:'Didit identity verification is not configured. Contact support; no verification was started.'},{status:503});
    }
    const account=await db.user.findUnique({
      where:{id:user.id},
      select:{status:true,accountMode:true,kycStatus:true,email:true,phone:true},
    });
    if(!account||account.status!=='ACTIVE')return NextResponse.json({error:'This account is unavailable.'},{status:403});
    if(account.accountMode!==AccountMode.REAL)return NextResponse.json({error:'Identity verification is available in REAL mode only.'},{status:403});
    if(account.kycStatus==='APPROVED')return NextResponse.json({error:'Identity verification is already approved.'},{status:409});

    const config=getServerConfiguration();
    if(!config.app.url)throw new Error('DIDIT_CALLBACK_URL_INVALID');
    const callback=new URL('/auth/didit/callback',config.app.url).toString();
    const attempt=await db.$transaction(async tx=>{
      const current=await tx.user.findUniqueOrThrow({where:{id:user.id},select:{status:true,accountMode:true,kycStatus:true}});
      if(current.status!=='ACTIVE')throw new Error('ACCOUNT_UNAVAILABLE');
      if(current.accountMode!==AccountMode.REAL)throw new Error('REAL_MODE_REQUIRED');
      if(current.kycStatus==='APPROVED')throw new Error('KYC_ALREADY_APPROVED');
      const verification=await tx.diditVerificationSession.create({
        data:{
          userId:user.id,
          workflowId:getServerConfiguration().didit.workflowId,
          vendorData:user.id,
          status:'PENDING',
          environment:getServerConfiguration().didit.environment,
        },
      });
      await tx.user.update({where:{id:user.id},data:{kycStatus:'PENDING',verifiedAt:null}});
      return verification;
    });

    try{
      const result=await createDiditSession({
        vendorData:user.id,
        callback,
        email:account.email,
        ...(account.phone?{phone:account.phone}:{}),
      });
      const sessionStatus=mapDiditKycStatus(result.status);
      const completionDate=['APPROVED','DECLINED','EXPIRED','ABANDONED'].includes(result.status)?new Date():null;
      try{
        await db.diditVerificationSession.update({
          where:{id:attempt.id},
          data:{sessionId:result.sessionId,status:sessionStatus,completedAt:completionDate},
        });
      }catch(error){
        if(!(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002'))throw error;
        const existing=await db.diditVerificationSession.findUnique({where:{sessionId:result.sessionId},select:{id:true}});
        if(!existing)throw error;
        await db.$transaction(async tx=>{
          await tx.diditVerificationSession.delete({where:{id:attempt.id}});
          await tx.diditVerificationSession.update({where:{id:existing.id},data:{status:sessionStatus,completedAt:completionDate}});
        });
      }
      return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
    }catch(error){
      await db.diditVerificationSession.update({where:{id:attempt.id},data:{status:'FAILED',completedAt:new Date()}});
      throw error;
    }
  } catch (error) {
    if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
    if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
    if(error instanceof Error&&error.message==='ACCOUNT_UNAVAILABLE')return NextResponse.json({error:'This account is unavailable.'},{status:403});
    if(error instanceof Error&&error.message==='REAL_MODE_REQUIRED')return NextResponse.json({error:'Identity verification is available in REAL mode only.'},{status:403});
    if(error instanceof Error&&error.message==='KYC_ALREADY_APPROVED')return NextResponse.json({error:'Identity verification is already approved.'},{status:409});
    if(error instanceof Error&&error.message.startsWith('DIDIT_'))return NextResponse.json({error:'Didit identity verification could not be started. Contact support if this continues.'},{status:503});
    console.error('[didit-session] Unable to start a verification session.',{errorType:error instanceof Error?error.name:'UnknownError'});
    return NextResponse.json({error:'Unable to start Didit verification right now.'},{status:503});
  }
}
