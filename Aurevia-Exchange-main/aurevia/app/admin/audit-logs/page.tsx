import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminAuditLogPanel from '@/components/AdminAuditLogPanel';
import {requireAdmin} from '@/lib/auth';

export default async function AdminAuditLogsPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main><AdminAuditLogPanel/></main></>;
}