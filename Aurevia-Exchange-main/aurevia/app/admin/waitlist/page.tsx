import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminWaitlistPanel from '@/components/AdminWaitlistPanel';
import {requireAdmin} from '@/lib/auth';

export default async function AdminWaitlistPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main><AdminWaitlistPanel/></main></>;
}