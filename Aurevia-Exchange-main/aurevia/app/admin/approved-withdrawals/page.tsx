import {redirect} from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminFundingRecordsPanel from '@/components/AdminFundingRecordsPanel';
import {requireAdmin} from '@/lib/auth';

export default async function ApprovedWithdrawalsPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main><AdminFundingRecordsPanel title="Approved withdrawals" description="Approved and completed internal withdrawal records, with settlement references and timestamps." type="WITHDRAWAL" initialStatuses="APPROVED,COMPLETED"/></main></>;
}