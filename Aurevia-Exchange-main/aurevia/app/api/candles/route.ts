import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {jsonSafe} from '@/lib/serializers';

export async function GET(req:Request){
  const url=new URL(req.url); const instrumentId=url.searchParams.get('instrumentId');
  const range=url.searchParams.get('range');
  const rangeDays:Record<string,number>={'1d':1,'5d':5,'1m':30,'3m':90,'1y':365,'max':3650};
  if(range&&!Object.hasOwn(rangeDays,range))return NextResponse.json({error:'Unsupported candle range.'},{status:400});
  const limit=Math.min(Math.max(Number(url.searchParams.get('limit')||120),1),500);
  if(!instrumentId)return NextResponse.json({error:'instrumentId is required'},{status:400});
  const days=range?rangeDays[range]:null;
  const rows=await db.candle.findMany({
    where:{instrumentId,...(days?{ts:{gte:new Date(Date.now()-days*86_400_000)}}:{})},
    orderBy:{ts:'desc'},
    take:limit,
  });
  return NextResponse.json(jsonSafe(rows.reverse()));
}
