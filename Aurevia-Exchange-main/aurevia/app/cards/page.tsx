'use client';

import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowRight,BadgeCheck,Clock3,CreditCard,Plus,ShieldCheck} from 'lucide-react';
import Nav from '@/components/Nav';
import AureviaCardVisual from '@/components/AureviaCardVisual';
import AureviaExchangeId from '@/components/AureviaExchangeId';

type Card={id:string;displayName:string;cardholderName:string;designTier:'SIGNATURE'|'GOLD'|'BLACK';referenceNumber:string;maskedPan:string;expiryMonth:number;expiryYear:number;status:string};
type AppRow={id:string;reference:string;status:string;designTier:string;priceSnapshot:string;currencySnapshot:string;catalogItem:{displayName:string}};

const readableStatus=(status:string)=>status.replaceAll('_',' ').toLowerCase().replace(/(^|\s)\S/g,letter=>letter.toUpperCase());

export default function CardsPage(){
	const [cards,setCards]=useState<Card[]>([]);
	const [applications,setApplications]=useState<AppRow[]>([]);
	const [aureviaExchangeId,setAureviaExchangeId]=useState<string|null>(null);
	const [error,setError]=useState('');
	const [loading,setLoading]=useState(true);

	const load=useCallback(async()=>{
		setLoading(true);
		try{
			const response=await fetch('/api/cards/mine',{cache:'no-store'});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to load cards.');
			setCards(result.cards||[]);
			setApplications(result.applications||[]);
			setAureviaExchangeId(result.aureviaExchangeId||null);
			setError('');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load cards.')}
		finally{setLoading(false)}
	},[]);

	useEffect(()=>{void load()},[load]);

	const pendingApplications=applications.filter(application=>['PENDING','PENDING_REVIEW','PROCESSING'].includes(application.status)).length;

	return <>
		<Nav/>
		<main className="account-page digital-cards-page">
			<header className="account-heading digital-cards-heading">
				<div><span className="account-kicker">AUREVIA · CARD CENTER</span><h1>Digital cards</h1><p>Your card designs, application status, and card details — together in one place.</p></div>
				<Link href="/cards/apply" className="digital-cards-primary"><Plus size={16}/> Explore card designs</Link>
			</header>

			<section className="digital-cards-intro" aria-label="Digital card overview">
				<div className="digital-cards-intro-copy"><span><CreditCard size={16}/> YOUR CARD SPACE</span><h2>A considered way to carry your Aurevia identity.</h2><p>Preview your issued cards, check application updates, and keep important reference details close at hand.</p></div>
				<div className="digital-cards-stats">
					<div><span>Issued cards</span><b>{loading?'—':cards.length}</b><small>Linked to your account</small></div>
					<div><span>Applications</span><b>{loading?'—':applications.length}</b><small>Submitted card requests</small></div>
					<div><span>In review</span><b>{loading?'—':pendingApplications}</b><small>Awaiting an application update</small></div>
				</div>
			</section>

			{loading&&<p className="digital-cards-feedback" role="status">Loading your card space…</p>}
			{error&&<div className="digital-cards-feedback is-error" role="alert"><span>{error}</span><button type="button" onClick={()=>void load()}>Try again</button></div>}

			{!loading&&cards.length===0&&applications.length===0&&(
				<section className="digital-cards-empty">
					<span className="digital-cards-empty-icon"><CreditCard size={22}/></span>
					<div><span className="digital-cards-section-kicker">A FRESH START</span><h2>Your card space is ready</h2><p>No cards or applications are linked to your account yet. Explore the available designs to review the current options and their details.</p></div>
					<Link href="/cards/apply" className="digital-cards-secondary">Explore available cards <ArrowRight size={15}/></Link>
				</section>
			)}

			{cards.length>0&&<section className="digital-cards-section" aria-labelledby="issued-cards-heading">
				<div className="digital-cards-section-heading"><div><span className="digital-cards-section-kicker">YOUR COLLECTION</span><h2 id="issued-cards-heading">Issued cards</h2><p>Choose a card to view its available details.</p></div><span className="digital-cards-count">{cards.length} {cards.length===1?'card':'cards'}</span></div>
				<div className="digital-card-list">{cards.map(card=>(
					<article key={card.id} className="digital-card-item">
						<div className="digital-card-preview"><div className="digital-card-topline"><span>YOUR AUREVIA CARD</span><span className={`digital-card-status status-${card.status.toLowerCase().replaceAll('_','-')}`}><i/>{readableStatus(card.status)}</span></div><AureviaCardVisual designTier={card.designTier} cardholderName={card.cardholderName} maskedPan={card.maskedPan} expiryMonth={card.expiryMonth} expiryYear={card.expiryYear} displayName={card.displayName}/><AureviaExchangeId id={aureviaExchangeId} className="mt-4"/></div>
						<div className="digital-card-details">
							<span className="digital-cards-section-kicker">CARD DETAILS</span><h3>{card.displayName}</h3><p className="digital-card-description">Your card is linked to your Aurevia account. The preview keeps the card number masked.</p>
							<dl><div><dt>Cardholder</dt><dd>{card.cardholderName}</dd></div><div><dt>Expiry</dt><dd>{String(card.expiryMonth).padStart(2,'0')}/{String(card.expiryYear).slice(-2)}</dd></div><div><dt>Reference</dt><dd>{card.referenceNumber}</dd></div><div><dt>Design</dt><dd>{readableStatus(card.designTier)}</dd></div></dl>
							<Link className="digital-card-details-link" href={`/cards/${card.id}`}>View card details <ArrowRight size={15}/></Link>
							<p className="digital-card-disclosure"><ShieldCheck size={14}/> In-platform card feature only. It is not a payment card and cannot be used on external card networks.</p>
						</div>
					</article>
				))}</div>
			</section>}

			{applications.length>0&&<section className="digital-cards-section digital-card-applications" aria-labelledby="card-applications-heading">
				<div className="digital-cards-section-heading"><div><span className="digital-cards-section-kicker">APPLICATION TRACKER</span><h2 id="card-applications-heading">Your applications</h2><p>Follow the latest recorded status for each card request.</p></div><BadgeCheck size={20} aria-hidden="true"/></div>
				<div className="digital-application-list">{applications.map(application=><article key={application.id} className="digital-application-row"><span className="digital-application-icon">{['PENDING','PENDING_REVIEW','PROCESSING'].includes(application.status)?<Clock3 size={17}/>:<CreditCard size={17}/>}</span><div className="digital-application-main"><b>{application.catalogItem.displayName}</b><span>Reference · {application.reference}</span></div><span className="digital-application-price">{application.priceSnapshot} {application.currencySnapshot}</span><span className={`digital-card-status status-${application.status.toLowerCase().replaceAll('_','-')}`}><i/>{readableStatus(application.status)}</span></article>)}</div>
				<p className="digital-applications-note">Application status reflects the latest information recorded by Aurevia. Submission does not mean a card has been issued.</p>
			</section>}
		</main>
	</>;
}
