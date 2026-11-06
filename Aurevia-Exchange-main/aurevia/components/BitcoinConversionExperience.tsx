'use client';

import Link from 'next/link';
import {ArrowLeftRight,TrendingUp} from 'lucide-react';
import Nav from '@/components/Nav';

export default function BitcoinConversionExperience(){
	return <><Nav/><main className="account-page">
		<header className="account-heading"><div><span className="account-kicker">ACCOUNT TOOLS</span><h1>Bitcoin conversion unavailable</h1><p>Currency conversion is not part of the DEMO trading workspace, and this route does not exchange or transfer REAL funds.</p></div><span className="status-pill mode-demo">TRADING ONLY</span></header>
		<section className="account-panel card p-5"><h2>Practice with supported orders</h2><p className="account-panel-subtitle">Use the trade terminal to place practice orders in your active account mode. No conversion or external transfer is available here.</p><div className="mt-4 flex flex-wrap gap-3"><Link className="btn bg-gold text-black" href="/trade"><TrendingUp size={15}/>Open trade terminal</Link><Link className="btn bg-white/5" href="/wallet"><ArrowLeftRight size={15}/>Back to wallet</Link></div></section>
	</main></>;
}
