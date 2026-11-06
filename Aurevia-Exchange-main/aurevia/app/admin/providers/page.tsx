import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminProvidersPanel from '@/components/AdminProvidersPanel';
import {requireAdmin} from '@/lib/auth';

export default async function AdminProvidersPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main className="account-page"><header className="account-heading"><div><span className="account-kicker">SERVICE &amp; SYSTEM</span><h1>Provider health</h1><p>Review configured service readiness and execution boundaries.</p></div></header><AdminProvidersPanel/></main></>;
}