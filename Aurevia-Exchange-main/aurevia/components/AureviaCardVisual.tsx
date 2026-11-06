'use client';

import {useRef,useState,type MouseEvent} from 'react';
import {RotateCcw} from 'lucide-react';

type Props={
	designTier:'SIGNATURE'|'GOLD'|'BLACK';
	cardholderName:string;
	maskedPan?:string;
	expiryMonth?:number;
	expiryYear?:number;
	displayName?:string;
	className?:string;
};

export default function AureviaCardVisual({designTier,cardholderName,maskedPan='•••• •••• •••• ••••',expiryMonth,expiryYear,displayName='Aurevia',className=''}:Props){
	const ref=useRef<HTMLDivElement>(null);
	const [flipped,setFlipped]=useState(false);

	function onMove(event:MouseEvent<HTMLDivElement>){
		if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
		const el=ref.current;if(!el)return;
		const rect=el.getBoundingClientRect();
		const x=(event.clientX-rect.left)/rect.width-0.5;
		const y=(event.clientY-rect.top)/rect.height-0.5;
		el.style.transform=`rotateX(${(-y*8).toFixed(2)}deg) rotateY(${(x*12).toFixed(2)}deg)`;
	}
	function onLeave(){
		const el=ref.current;if(!el)return;
		el.style.transform='rotateX(0deg) rotateY(0deg)';
	}

	const expiry=expiryMonth&&expiryYear?`${String(expiryMonth).padStart(2,'0')}/${String(expiryYear).slice(-2)}`:'••/••';

	return (
		<div className={`aurevia-card-stage ${className}`} onMouseMove={onMove} onMouseLeave={onLeave}>
			<div ref={ref} className={`aurevia-card aurevia-card--${designTier.toLowerCase()}${flipped?' is-flipped':''}`} role="img" aria-label={`${displayName} card for ${cardholderName}, ${flipped?'back':'front'} side`}>
				<div className="aurevia-card-face aurevia-card-face-front" aria-hidden={flipped}>
					<div className="aurevia-card-sheen" aria-hidden="true"/>
					<div className="aurevia-card-top">
						<span className="aurevia-card-brand">AUREVIA</span>
						<span className="aurevia-card-tier">{displayName}</span>
					</div>
					<div className="aurevia-card-chip-row" aria-hidden="true">
						<span className="aurevia-card-chip"/>
						<span className="aurevia-card-contactless"/>
					</div>
					<p className="aurevia-card-pan">{maskedPan}</p>
					<div className="aurevia-card-bottom">
						<div>
							<span className="aurevia-card-label">Cardholder</span>
							<span className="aurevia-card-name">{cardholderName}</span>
						</div>
						<div>
							<span className="aurevia-card-label">Valid</span>
							<span className="aurevia-card-name">{expiry}</span>
						</div>
					</div>
				</div>
				<div className="aurevia-card-face aurevia-card-face-back" aria-hidden={!flipped}>
					<div className="aurevia-card-magnetic-stripe" aria-hidden="true"/>
					<div className="aurevia-card-back-details">
						<div className="aurevia-card-signature"><span>AUTHORIZED SIGNATURE</span><b>•••• ••••</b></div>
						<div className="aurevia-card-hologram" aria-hidden="true">A</div>
					</div>
					<div className="aurevia-card-back-brand"><strong>AUREVIA</strong><span>EXCHANGE</span></div>
					<p className="aurevia-card-back-note">Virtual account card · For in-platform use only</p>
				</div>
			</div>
			<button type="button" className="aurevia-card-flip" aria-pressed={flipped} onClick={()=>setFlipped(value=>!value)}><RotateCcw size={14} aria-hidden="true"/>{flipped?'Show front':'Flip card'}</button>
		</div>
	);
}
