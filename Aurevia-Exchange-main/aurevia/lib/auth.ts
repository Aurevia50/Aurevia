import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth-options';

export function authFailureStatus(error:unknown):401|403|null{
	if(!(error instanceof Error))return null;
	if(error.message==='UNAUTHORIZED')return 401;
	if(error.message==='FORBIDDEN')return 403;
	return null;
}

export async function requireUser(){
	const session=await getServerSession(authOptions);
	if(!session?.user?.id)throw new Error('UNAUTHORIZED');
	if(!/^[a-f0-9]{64}$/.test(session.user.sessionHash))throw new Error('UNAUTHORIZED');
	if(session.user.role!=='USER')throw new Error('FORBIDDEN');
	return session.user;
}

export async function requireAdmin(){
	const session=await getServerSession(authOptions);
	if(!session?.user?.id)throw new Error('UNAUTHORIZED');
	if(session.user.role!=='ADMIN')throw new Error('FORBIDDEN');
	return session.user;
}
