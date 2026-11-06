import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminCommandCenter from '@/components/AdminCommandCenter';
import {requireAdmin} from '@/lib/auth';

export const dynamic='force-dynamic';

export default async function AdminCommandCenterPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main className="account-page"><header className="account-heading"><div><span className="account-kicker">AUREVIA · SYSTEM INTELLIGENCE</span><h1>AI &amp; API command center</h1><p>Provider health, AI usage, and protected configuration review.</p></div></header><AdminCommandCenter/></main></>;
}