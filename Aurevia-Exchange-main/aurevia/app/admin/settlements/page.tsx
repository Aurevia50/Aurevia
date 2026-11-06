import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminFundingRecordsPanel from '@/components/AdminFundingRecordsPanel';
import {requireAdmin} from '@/lib/auth';

export default async function SettlementsPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main><AdminFundingRecordsPanel title="Settled withdrawals" description="Completed internal withdrawal settlements with durable transaction references." type="WITHDRAWAL" initialStatuses="COMPLETED"/></main></>;
}