import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminReceiptReviewPanel from '@/components/AdminReceiptReviewPanel';
import {requireAdmin} from '@/lib/auth';

export default async function AdminReceiptsPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main className="account-page"><header className="account-heading"><div><span className="account-kicker">SERVICE &amp; SYSTEM</span><h1>Receipt review</h1><p>Find transaction receipts and private funding evidence.</p></div></header><AdminReceiptReviewPanel/></main></>;
}