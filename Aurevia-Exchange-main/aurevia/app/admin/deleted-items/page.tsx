import {redirect} from 'next/navigation';
import AdminDeletedItemsPanel from '@/components/AdminDeletedItemsPanel';
import AdminNav from '@/components/AdminNav';
import {requireAdmin} from '@/lib/auth';

export default async function AdminDeletedItemsPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main><AdminDeletedItemsPanel/></main></>;
}
