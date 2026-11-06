import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {activitySourceSchemaValues,hideEligibleActivityHistory,permanentlyDeleteActivityNotification,updateActivityVisibility,type ActivityVisibilityAction} from '@/lib/activity-management';

export const dynamic='force-dynamic';

const itemSchema=z.object({source:z.enum(activitySourceSchemaValues),id:z.string().min(1).max(128)});
const requestSchema=z.discriminatedUnion('action',[
	z.object({action:z.enum(['archive','restore','hide','unhide','permanently-delete']),items:z.array(itemSchema).min(1).max(100)}),
	z.object({action:z.literal('clear')}),
]);

export async function POST(request:Request){
	try{
		const user=await requireUser();
		const input=requestSchema.parse(await request.json());
		const account=await db.user.findUnique({where:{id:user.id},select:{accountMode:true,status:true}});
		if(!account||account.status!=='ACTIVE')return NextResponse.json({error:'Active account not found.'},{status:403});
		if(input.action==='clear'){
			const results=await db.$transaction(tx=>hideEligibleActivityHistory(tx,user.id,account.accountMode),{isolationLevel:'Serializable',maxWait:5_000,timeout:15_000});
			return NextResponse.json({action:'clear',affected:results.affected,capped:results.capped});
		}
		const unique=[...new Map(input.items.map(item=>[`${item.source}:${item.id}`,item])).values()];
		const results=await db.$transaction(async tx=>Promise.all(unique.map(item=>input.action==='permanently-delete'
			?item.source==='notification'
				?permanentlyDeleteActivityNotification(tx,user.id,account.accountMode,item.id)
				:{eligible:false,reason:'Only eligible read notifications can be permanently deleted.'}
			:updateActivityVisibility(tx,{userId:user.id,accountMode:account.accountMode,source:item.source,id:item.id,action:input.action as ActivityVisibilityAction})
		)),{isolationLevel:'Serializable',maxWait:5_000,timeout:15_000});
		const affected=results.filter(result=>result.eligible).length;
		return NextResponse.json({action:input.action,affected,results:results.map((result,index)=>({...unique[index],...result}))});
	}catch(error){
		if(error instanceof ZodError)return NextResponse.json({error:'Choose a valid action and between 1 and 100 activity items.'},{status:400});
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({error:'Forbidden'},{status:403});
		console.error(`User activity management failed (${error instanceof Error?error.name:'UnknownError'}).`);
		return NextResponse.json({error:'Unable to update account activity.'},{status:500});
	}
}
