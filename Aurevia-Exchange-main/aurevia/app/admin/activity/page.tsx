import {redirect} from 'next/navigation';
import AdminActivityManagementPanel from '@/components/AdminActivityManagementPanel';
import AdminNav from '@/components/AdminNav';
import {requireAdmin} from '@/lib/auth';

export default async function AdminActivityPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main><AdminActivityManagementPanel/></main></>;
}
