import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth-options';
import {db} from '@/lib/db';
import {getCurrentMandatoryTerms} from '@/lib/managed-notice-policy';
import {CURRENT_TERMS_VERSION} from '@/lib/policy-consent';

export function authFailureStatus(error:unknown):401|403|null{
	if(!(error instanceof Error))return null;
	if(error.message==='UNAUTHORIZED')return 401;
	if(error.message==='FORBIDDEN')return 403;
	return null;
}

export async function assertCurrentTermsAccepted(userId:string){
	const currentTerms=await getCurrentMandatoryTerms();
	const version=currentTerms?.version||CURRENT_TERMS_VERSION;
	const acceptance=await db.termsAcceptance.findUnique({
		where:{userId_version:{userId,version}},
		select:{version:true},
	});
	if(acceptance?.version!==version)throw new Error('FORBIDDEN');
}

export async function requireUser(options:{skipTermsAcceptance?:boolean}={}){
	const session=await getServerSession(authOptions);
	if(!session?.user?.id)throw new Error('UNAUTHORIZED');
	if(!/^[a-f0-9]{64}$/.test(session.user.sessionHash))throw new Error('UNAUTHORIZED');
	if(session.user.role!=='USER')throw new Error('FORBIDDEN');
	if(!options.skipTermsAcceptance)await assertCurrentTermsAccepted(session.user.id);
	return session.user;
}

export async function requireAdmin(options:{skipTermsAcceptance?:boolean}={}){
	const session=await getServerSession(authOptions);
	if(!session?.user?.id)throw new Error('UNAUTHORIZED');
	if(session.user.role!=='ADMIN')throw new Error('FORBIDDEN');
	if(!options.skipTermsAcceptance)await assertCurrentTermsAccepted(session.user.id);
	return session.user;
}
