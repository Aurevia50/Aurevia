import Link from 'next/link';
import {ArrowLeft} from 'lucide-react';
import AdminNav from '@/components/AdminNav';
import AdminInvestmentPanel from '@/components/AdminInvestmentPanel';

export default function AdminInvestmentsPage(){return <><AdminNav/><main className="account-page admin-investments-page"><AdminInvestmentPanel/><div className="mt-4"><Link href="/admin" className="text-link"><ArrowLeft size={14}/> Admin home</Link></div></main></>;}