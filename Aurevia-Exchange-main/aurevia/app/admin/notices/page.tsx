import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminNoticesPanel from '@/components/AdminNoticesPanel';
import {requireAdmin} from '@/lib/auth';

export default async function AdminNoticesPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main><AdminNoticesPanel/></main></>;
}
