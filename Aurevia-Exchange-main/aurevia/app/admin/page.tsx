import {redirect} from 'next/navigation';
import AdminDashboard from '@/components/AdminDashboard';
import AdminNav from '@/components/AdminNav';
import {requireAdmin} from '@/lib/auth';

export const dynamic='force-dynamic';

export default async function Admin(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><AdminDashboard/></>;
}
