import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminStoriesPanel from '@/components/AdminStoriesPanel';
import {requireAdmin} from '@/lib/auth';

export default async function AdminStoriesPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main className="account-page"><AdminStoriesPanel/></main></>;
}
