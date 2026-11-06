import {redirect} from 'next/navigation';
import AdminKycReviewPanel from '@/components/AdminKycReviewPanel';
import AdminNav from '@/components/AdminNav';
import {requireAdmin} from '@/lib/auth';

export default async function PendingKycPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main className="account-page"><header className="account-heading"><div><span className="account-kicker">ACCOUNT REVIEW</span><h1>Identity verification</h1><p>Review submitted profiles and identity documents.</p></div></header><AdminKycReviewPanel/></main></>;
}