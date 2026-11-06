import Link from 'next/link';
import {ArrowRight,ChevronDown,Palette,ShieldCheck,WalletCards} from 'lucide-react';
import Nav from '@/components/Nav';
import ThemeToggle from '@/components/ThemeToggle';

export default function AboutMe(){
	return <><Nav/><main className="account-page about-account-page">
		<header className="about-account-heading"><div><span className="account-kicker">ACCOUNT · YOUR PREFERENCES</span><h1>Your account, your way.</h1><p>Manage how Aurevia looks and get clear answers about account policies.</p></div><Link href="/settings#profile" className="about-account-profile-link">Manage profile <ArrowRight size={15}/></Link></header>

		<section className="about-policy-overview" aria-label="Account policy overview">
			<div><span><WalletCards size={16}/> REAL ACCOUNT WITHDRAWALS</span><h2>Know the essentials before you request a withdrawal.</h2><p>Review the limits and payout estimate in your wallet before confirming a request.</p><Link href="/wallet?action=WITHDRAWAL">Open withdrawal workflow <ArrowRight size={14}/></Link></div>
			<div className="about-policy-metrics"><article><span>Minimum request</span><b>$30,000</b><small>USD gross request</small></article><article><span>Maximum request</span><b>$300,000</b><small>USD gross request</small></article><article><span>Keep available</span><b>$300</b><small>After reservations</small></article></div>
		</section>

		<div className="about-account-grid">
			<section className="about-account-panel" aria-labelledby="withdrawal-policy-title">
				<div className="about-account-panel-heading"><span className="about-account-icon"><WalletCards size={18}/></span><div><span className="account-kicker">THE IMPORTANT DETAILS</span><h2 id="withdrawal-policy-title">Withdrawal policy</h2><p>Applies to REAL account withdrawals.</p></div></div>
				<div className="about-policy-points"><article><b>Minimum remaining balance</b><p>At least $300 must remain after the requested withdrawal, pending withdrawal reservations, and open order reservations. Your wallet shows your eligible balance before submission.</p></article><article><b>Commission and payout estimate</b><p>A 10% commission is deducted from the gross request. The estimated net payout appears before confirmation.</p></article><article><b>Review and processing</b><p>Withdrawals are subject to account eligibility and administrator review. Approval alone does not release funds or charge the commission.</p></article></div>
				<details className="about-policy-details"><summary>More about timing, failed requests, and fees <ChevronDown size={16}/></summary><div><p>The commission is recorded only after an administrator confirms that the external payout was processed. Rejected, cancelled, or failed requests incur no commission.</p><p>No separate BTC or other advance payment is required to request or receive a withdrawal.</p></div></details>
			</section>

			<section className="about-account-panel about-theme-panel" aria-labelledby="theme-policy-title">
				<div className="about-account-panel-heading"><span className="about-account-icon"><Palette size={18}/></span><div><span className="account-kicker">MAKE IT YOURS</span><h2 id="theme-policy-title">Appearance</h2><p>Your preferred theme syncs across devices.</p></div></div>
				<div className="about-theme-control"><p>Choose the look and feel used across the platform.</p><ThemeToggle/></div>
			</section>

			<section className="about-account-panel about-platform-panel" aria-labelledby="platform-policy-title">
				<div className="about-account-panel-heading"><span className="about-account-icon"><ShieldCheck size={18}/></span><div><span className="account-kicker">HELPFUL REFERENCES</span><h2 id="platform-policy-title">Platform information</h2><p>Policies and disclosures, all in one place.</p></div></div>
				<div className="about-policy-links"><Link href="/terms"><span><b>Terms of use</b><small>Platform terms and conditions</small></span><ArrowRight size={15}/></Link><Link href="/privacy"><span><b>Privacy overview</b><small>How account information is handled</small></span><ArrowRight size={15}/></Link><Link href="/risk-disclosure"><span><b>Risk disclosure</b><small>Important information about investing</small></span><ArrowRight size={15}/></Link><Link href="/settings#security"><span><b>Account security</b><small>Review your available protections</small></span><ArrowRight size={15}/></Link></div>
			</section>
		</div>
	</main></>;
}
