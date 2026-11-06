import {NextResponse} from 'next/server';
import {AccountMode} from '@prisma/client';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {activityCategoryLabel,getUserActivity,isActivityCategory} from '@/lib/activity';

export const dynamic='force-dynamic';

export async function GET(request:Request){
  try{
    const user=await requireUser();
    const activeUser=await db.user.findUnique({where:{id:user.id},select:{accountMode:true,status:true}});
    if(!activeUser||activeUser.status!=='ACTIVE')return NextResponse.json({error:'Unauthorized'},{status:401});
    const params=new URL(request.url).searchParams;
    const category=params.get('category')||'all';
    const rawLimit=params.get('limit')||'20';
    const limit=Math.min(100,Math.max(1,Number.parseInt(rawLimit,10)||20));
    const rawOffset=Number.parseInt(params.get('offset')||'0',10);
    const offset=Math.min(1000,Math.max(0,Number.isFinite(rawOffset)?rawOffset:0));
    const state=params.get('state')||'active';
    if(!['active','archived','hidden','all'].includes(state))return NextResponse.json({error:'Unsupported activity state.'},{status:400});
    const parseDate=(value:string|null)=>value?new Date(value):undefined;
    const dateFrom=parseDate(params.get('dateFrom'));
    const dateTo=parseDate(params.get('dateTo'));
    if((dateFrom&&Number.isNaN(dateFrom.getTime()))||(dateTo&&Number.isNaN(dateTo.getTime()))||(dateFrom&&dateTo&&dateFrom>dateTo))return NextResponse.json({error:'Invalid activity date range.'},{status:400});
    if(!isActivityCategory(category))return NextResponse.json({error:'Unsupported activity category.'},{status:400});
    const mode:AccountMode=activeUser.accountMode;
    const result=await getUserActivity(user.id,mode,category,limit,{
      search:(params.get('search')||'').slice(0,120),
      status:(params.get('status')||'').slice(0,40),
      dateFrom,
      dateTo,
      state:state as 'active'|'archived'|'hidden'|'all',
      offset,
    });
    return NextResponse.json({data:result,category,categoryLabel:activityCategoryLabel(category),accountMode:mode},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    return NextResponse.json({error:error instanceof Error&&error.message==='UNAUTHORIZED'?'Unauthorized':'Unable to load account activity.'},{status:error instanceof Error&&error.message==='UNAUTHORIZED'?401:503});
  }
}
