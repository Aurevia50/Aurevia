import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z,ZodError} from 'zod';
import {authFailureStatus,requireAdmin,requireUser} from '@/lib/auth';
import {authOptions} from '@/lib/auth-options';
import {db} from '@/lib/db';
import {isSameOriginRequest} from '@/lib/push-notifications';
import {CURRENT_TERMS_VERSION,hasAcceptedCurrentTerms} from '@/lib/policy-consent';
import {getCurrentMandatoryTerms} from '@/lib/managed-notice-policy';

const acceptanceSchema=z.object({
	version:z.string().min(1).max(64),
	accepted:z.literal(true),
}).strict();
const privateHeaders={'Cache-Control':'private, no-store'};

async function requireTermsAccount(){
	const session=await getServerSession(authOptions);
	return session?.user?.role==='ADMIN'
		?requireAdmin({skipTermsAcceptance:true})
		:requireUser({skipTermsAcceptance:true});
}

export async function GET(){
	try{
		const user=await requireTermsAccount();
		const currentTerms=await getCurrentMandatoryTerms();
		const version=currentTerms?.version||CURRENT_TERMS_VERSION;
		const acceptance=await db.termsAcceptance.findUnique({
			where:{userId_version:{userId:user.id,version}},
			select:{version:true,acceptedAt:true},
		});
		return NextResponse.json({
			version,
			accepted:hasAcceptedCurrentTerms(acceptance?.version,version),
			acceptedAt:acceptance?.acceptedAt??null,
		},{headers:privateHeaders});
	}catch(error){
		const status=authFailureStatus(error);
		if(status)return NextResponse.json({error:status===401?'Unauthorized':'Forbidden'},{status});
		console.error('Current terms acceptance could not be loaded.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'Terms acceptance status is temporarily unavailable.'},{status:503,headers:privateHeaders});
	}
}

export async function POST(request:Request){
	try{
		if(!isSameOriginRequest(request))return NextResponse.json({error:'A same-origin request is required.'},{status:403});
		const user=await requireTermsAccount();
		let payload:unknown;
		try{payload=await request.json()}
		catch{return NextResponse.json({error:'Confirm acceptance of the current Terms & Conditions.'},{status:400,headers:privateHeaders})}
		const input=acceptanceSchema.parse(payload);
		const currentTerms=await getCurrentMandatoryTerms();
		const version=currentTerms?.version||CURRENT_TERMS_VERSION;
		if(input.version!==version){
			return NextResponse.json({error:'The terms have changed. Review the current version before accepting.',version},{status:409,headers:privateHeaders});
		}
		await db.termsAcceptance.createMany({
			data:[{userId:user.id,version}],
			skipDuplicates:true,
		});
		const acceptance=await db.termsAcceptance.findUniqueOrThrow({
			where:{userId_version:{userId:user.id,version}},
			select:{version:true,acceptedAt:true},
		});
		return NextResponse.json({
			accepted:true,
			version:acceptance.version,
			acceptedAt:acceptance.acceptedAt,
		},{headers:privateHeaders});
	}catch(error){
		const status=authFailureStatus(error);
		if(status)return NextResponse.json({error:status===401?'Unauthorized':'Forbidden'},{status});
		if(error instanceof ZodError)return NextResponse.json({error:'Confirm acceptance of the current Terms & Conditions.'},{status:400,headers:privateHeaders});
		console.error('Terms acceptance could not be saved.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'We could not save your acceptance. Please try again.'},{status:503,headers:privateHeaders});
	}
}
