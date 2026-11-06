import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {jsonSafe} from '@/lib/serializers';
const schema=z.object({symbol:z.string().min(3).max(20).regex(/^[A-Z0-9/_-]+$/),name:z.string().min(2).max(120),baseAsset:z.string().min(1).max(20),quoteAsset:z.string().min(1).max(20),price:z.number().positive(),leverage:z.number().positive().max(100),makerFee:z.number().min(0).max(1),takerFee:z.number().min(0).max(1),enabled:z.boolean().default(true)});
export async function GET(){try{await requireAdmin();return NextResponse.json(jsonSafe(await db.instrument.findMany({orderBy:{symbol:'asc'}})));}catch{return NextResponse.json({error:'Forbidden'},{status:403})}}
export async function POST(req:Request){try{const admin=await requireAdmin();const p=schema.parse(await req.json());const i=await db.instrument.create({data:p});await db.auditLog.create({data:{actorId:admin.id,action:'INSTRUMENT_CREATE',entity:'INSTRUMENT',entityId:i.id,metadata:p}});return NextResponse.json(jsonSafe(i),{status:201});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Invalid instrument'},{status:400})}}
export async function PATCH(req:Request){try{const admin=await requireAdmin();const body=await req.json();if(typeof body.id!=='string')throw new Error('INSTRUMENT_ID_REQUIRED');const {id,...rest}=body;const p=schema.partial().parse(rest);const i=await db.instrument.update({where:{id},data:p});await db.auditLog.create({data:{actorId:admin.id,action:'INSTRUMENT_UPDATE',entity:'INSTRUMENT',entityId:id,metadata:p}});return NextResponse.json(jsonSafe(i));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Invalid update'},{status:400})}}
