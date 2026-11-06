import {redirect} from 'next/navigation';
import AdminCommunityFinancePanel from '@/components/AdminCommunityFinancePanel';
import AdminNav from '@/components/AdminNav';
import {requireAdmin} from '@/lib/auth';

export const dynamic='force-dynamic';

export default async function AdminCommunityFinance(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><AdminCommunityFinancePanel/></>;
}
