import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminFundingRecordsPanel from '@/components/AdminFundingRecordsPanel';
import {requireAdmin} from '@/lib/auth';

export default async function ApprovedDepositsPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main><AdminFundingRecordsPanel title="Approved deposits" description="Approved internal funding records, searchable by account, reference, and status." type="DEPOSIT" initialStatuses="APPROVED"/></main></>;
}