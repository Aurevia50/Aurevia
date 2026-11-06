import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminSettingsPanel from '@/components/AdminSettingsPanel';
import {requireAdmin} from '@/lib/auth';

export default async function AdminSettingsPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main><AdminSettingsPanel/></main></>;
}
