'use client';

import Link from 'next/link';
import {useSession} from 'next-auth/react';
import {ArrowRight,ArrowUpRight,LayoutDashboard,Wallet} from 'lucide-react';
import {useLocale} from '@/lib/i18n-context';

type Variant='hero'|'cta'|'trade'|'market';

export default function HomeAccountActions({variant}:{variant:Variant}){
	const {data,status}=useSession();
	const {translate}=useLocale();
	if(status==='loading')return <div className="home-auth-actions" aria-busy="true" aria-label={translate('restoringSession')}/>;
	if(status==='authenticated'&&data?.user){
		if(variant==='trade'&&data.user.accountMode==='DEMO')return <Link href="/trade" className="text-link">{translate('openDemoTrade')} <ArrowRight size={16}/></Link>;
		if(variant==='trade')return <Link href="/wallet" className="text-link">{translate('reviewRealAccountActivity')} <ArrowRight size={16}/></Link>;
		if(variant==='market')return <Link href="/trade" className="asset-link">{translate('openTradingWorkspace')} <ArrowUpRight size={15}/></Link>;
		return <div className="home-auth-actions"><Link href="/dashboard" className="button-primary"><LayoutDashboard size={16}/> {translate('dashboard')}</Link><Link href="/wallet" className="button-secondary"><Wallet size={16}/> {data.user.accountMode} {translate('account')}</Link></div>;
	}
	if(variant==='trade')return <Link href="/login?callbackUrl=%2Ftrade" className="text-link">{translate('viewTradingWorkspace')} <ArrowRight size={16}/></Link>;
	if(variant==='market')return <Link href="/login?callbackUrl=%2Ftrade" className="asset-link">{translate('exploreDemo')} <ArrowUpRight size={15}/></Link>;
	return <div className="home-auth-actions"><Link href="/register" className="button-primary">{translate('openAccount')} <ArrowUpRight size={17}/></Link><Link href="/login" className="button-secondary">{translate('signIn')} <ArrowRight size={16}/></Link></div>;
}