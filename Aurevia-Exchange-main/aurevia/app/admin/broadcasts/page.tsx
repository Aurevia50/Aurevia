import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminBroadcastsPanel from '@/components/AdminBroadcastsPanel';
import {requireAdmin} from '@/lib/auth';

export default async function AdminBroadcastsPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main><AdminBroadcastsPanel/></main></>;
}