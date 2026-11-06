import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminPositionsPanel from '@/components/AdminPositionsPanel';
import {requireAdmin} from '@/lib/auth';

export default async function AdminPositionsPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main className="account-page"><header className="account-heading"><div><span className="account-kicker">WORKSPACE · RISK</span><h1>Open positions</h1><p>Review customer positions and close them through the internal ledger.</p></div></header><AdminPositionsPanel/></main></>;
}
