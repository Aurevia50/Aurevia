import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminOperationsPanel from '@/components/AdminOperationsPanel';
import {requireAdmin} from '@/lib/auth';

export default async function AdminOperationsPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main className="account-page"><header className="account-heading"><div><span className="account-kicker">SERVICE &amp; SYSTEM</span><h1>Orders and ledger</h1><p>Inspect persisted order execution and double-entry ledger records.</p></div></header><AdminOperationsPanel/></main></>;
}