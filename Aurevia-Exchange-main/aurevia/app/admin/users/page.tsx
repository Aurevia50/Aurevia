import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminUsersPanel from '@/components/AdminUsersPanel';
import {requireAdmin} from '@/lib/auth';

export default async function AdminUsersPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main><AdminUsersPanel/></main></>;
}