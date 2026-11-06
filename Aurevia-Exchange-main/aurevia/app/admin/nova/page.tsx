import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminNovaActivityPanel from '@/components/AdminNovaActivityPanel';
import {requireAdmin} from '@/lib/auth';

export default async function AdminNovaPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main className="account-page"><header className="account-heading"><div><span className="account-kicker">SERVICE &amp; SYSTEM</span><h1>Nova activity</h1><p>Review redacted support-assistant actions.</p></div></header><AdminNovaActivityPanel/></main></>;
}