import Link from 'next/link';
import {Activity,ArrowDown,ArrowRight,BookOpen,Layers3,ShieldCheck,WalletCards} from 'lucide-react';
import InvestmentEducationAssistant from '@/components/InvestmentEducationAssistant';
import Nav from '@/components/Nav';

const pathways=[
	{number:'01',icon:BookOpen,title:'Build your foundation',description:'Get comfortable with the language of markets, assets, and investment orders.',topics:'Market basics · Asset classes · Order types',href:'#foundations'},
	{number:'02',icon:Activity,title:'Read market activity',description:'Learn what price changes and portfolio allocations can—and cannot—tell you.',topics:'Price movements · Time horizon · Diversification',href:'#market-context'},
	{number:'03',icon:ShieldCheck,title:'Understand risk',description:'Explore uncertainty, downside, and the role of careful, independent research.',topics:'Volatility · Concentration · Decision habits',href:'#risk'},
];

export default function Education(){
	return <><Nav/><main className="account-page education-hub-page">
		<header className="education-hub-heading"><div><span className="account-kicker">AUREVIA · LEARNING CENTER</span><h1>Build your market understanding.</h1><p>A practical guide to investing concepts, market language, and the tools available in Aurevia.</p><span className="education-updated">Education resource · Updated November 2026</span></div><div className="education-heading-mark" aria-hidden="true"><BookOpen size={31}/><span>LEARN<br/>WITH CLARITY</span></div></header>

		<section className="education-route-map" aria-label="Learning pathways">
			<div className="education-route-map-heading"><span>YOUR LEARNING PATH</span><small>Explore in any order</small></div>
			<div className="education-pathways">{pathways.map(({number,icon:Icon,title,description,topics,href})=><a href={href} className="education-pathway" key={number}><span className="education-pathway-top"><i>{number}</i><Icon size={17}/></span><b>{title}</b><p>{description}</p><small>{topics}</small><span className="education-pathway-link">Explore topic <ArrowRight size={14}/></span></a>)}</div>
		</section>

		<div className="education-main-grid">
			<div className="education-lessons">
				<section className="education-lesson" id="foundations"><span className="education-section-index">01 / THE FOUNDATIONS</span><h2>Start with the building blocks.</h2><p className="education-lesson-lead">A few core ideas make it easier to follow a market conversation and understand what a platform is showing you.</p><div className="education-concept-grid">
					<article><span>01</span><h3>Assets</h3><p>An asset is something that may hold or change in value. Different asset classes have different characteristics, risks, and market structures.</p></article>
					<article><span>02</span><h3>Orders</h3><p>An order is an instruction to buy or sell. Order types describe how that instruction is submitted; they do not guarantee a particular outcome.</p></article>
					<article><span>03</span><h3>Portfolio allocation</h3><p>Allocation describes how a portfolio is distributed across assets. A portfolio view is a snapshot, not a forecast of future results.</p></article>
				</div></section>

				<section className="education-lesson" id="market-context"><span className="education-section-index">02 / MARKET CONTEXT</span><h2>Put market activity in context.</h2><p className="education-lesson-lead">A price or chart represents observed market information. Interpreting it requires context, and no display can tell you with certainty what happens next.</p><div className="education-context-list">
					<article><span className="education-context-icon"><Activity size={17}/></span><div><h3>Price movement</h3><p>Prices can change quickly and move in either direction. A recent gain or decline alone does not establish value or predict the next move.</p></div></article>
					<article><span className="education-context-icon"><Layers3 size={17}/></span><div><h3>Diversification</h3><p>Holding different kinds of assets can change how a portfolio is exposed, but diversification cannot eliminate market risk or guarantee a profit.</p></div></article>
					<article><span className="education-context-icon"><WalletCards size={17}/></span><div><h3>Account activity</h3><p>Wallet funding requests, exchange balances, and investment activity are distinct records. Review the status and context shown for each before drawing conclusions.</p></div></article>
				</div></section>

				<section className="education-lesson" id="risk"><span className="education-section-index">03 / RISK & DECISIONS</span><h2>Make room for uncertainty.</h2><p className="education-lesson-lead">Investing involves risk, including the possible loss of principal. Build a habit of considering the downside as carefully as the opportunity.</p><div className="education-risk-grid"><article><ShieldCheck size={18}/><h3>Consider your time horizon</h3><p>Ask how long you can hold an investment and whether your plan accounts for short-term changes.</p></article><article><ArrowDown size={18}/><h3>Think about potential loss</h3><p>Consider how a decline could affect your finances before you make a decision.</p></article></div></section>

				<section className="education-lesson education-practice" id="practice"><span className="education-section-index">04 / LEARN BY EXPLORING</span><h2>Use the platform to learn.</h2><p className="education-lesson-lead">Explore platform features at your own pace. DEMO mode is intended for practice; it does not predict investment results or represent real market outcomes.</p><div className="education-platform-note"><ShieldCheck size={16}/><p>When enabled, REAL order routing is limited to the Alpaca sandbox; provider-confirmed fills update Aurevia ledger records. Wallet funding and withdrawal requests remain Aurevia ledger records, and external provider balances are not Aurevia wallet cash.</p></div><div className="education-practice-links"><Link href="/dashboard"><span><Activity size={17}/></span><b>Explore your dashboard</b><ArrowRight size={15}/></Link><Link href="/wallet"><span><WalletCards size={17}/></span><b>Review wallet activity</b><ArrowRight size={15}/></Link></div></section>
			</div>

			<aside className="education-side-rail"><section className="education-principles"><span className="education-section-index">KEEP IN MIND</span><h2>Learn with intention.</h2><ul><li>Look beyond a single data point.</li><li>Understand what an order or balance represents.</li><li>Consider risks and your own circumstances.</li><li>Verify important details before acting.</li></ul></section><div className="education-disclaimer"><ShieldCheck size={17}/><div><b>Independent learning, not personal advice</b><p>This material is general education only. It is not investment, financial, tax, or legal advice, and it does not account for your personal circumstances.</p></div></div></aside>
		</div>

		<section className="education-assistant-section" id="learning-assistant"><div className="education-assistant-intro"><span className="account-kicker">ASK A QUESTION</span><h2>Make a concept clearer.</h2><p>Ask about general investing terms or market concepts. Keep questions educational and avoid sharing personal or account information.</p></div><InvestmentEducationAssistant/></section>

		<footer className="education-hub-footer"><p>For learning purposes only. This page is not a recommendation to buy, sell, or hold any asset. Investments involve risk, including loss of principal. Consider independent research and professional guidance where appropriate.</p><Link href="/risk-disclosure">Read the risk disclosure <ArrowRight size={14}/></Link></footer>
	</main></>;
}
