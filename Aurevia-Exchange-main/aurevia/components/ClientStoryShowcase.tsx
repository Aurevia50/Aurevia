'use client';

import {useEffect,useRef,useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {ArrowLeft,ArrowRight,ArrowUpRight,ShieldCheck} from 'lucide-react';
import {A11y,Autoplay,EffectFade} from 'swiper/modules';
import {Swiper,SwiperSlide} from 'swiper/react';
import type {Swiper as SwiperInstance} from 'swiper';

type ClientStory={
	id:string;
	displayName:string;
	country:string|null;
	cityOrRegion:string|null;
	title?:string|null;
	quote:string;
	imageUrl:string|null;
	rating?:number|null;
	verifiedClientStory?:boolean;
	verifiedCustomer?:boolean;
	externalSource?:string|null;
	externalUrl?:string|null;
	externalVerified?:boolean;
	withdrawalAmount?:string;
	currency?:string;
};

const AUTOPLAY_DELAY_MS=10_000;
const TRANSITION_MS=800;

export default function ClientStoryShowcase(){
	const [stories,setStories]=useState<ClientStory[]>([]);
	const [index,setIndex]=useState(0);
	const [loading,setLoading]=useState(true);
	const [error,setError]=useState('');
	const [reducedMotion,setReducedMotion]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
	const swiperRef=useRef<SwiperInstance|null>(null);

	useEffect(()=>{
		const media=window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotionPreference=()=>setReducedMotion(media.matches);
		updateMotionPreference();
		media.addEventListener('change',updateMotionPreference);
		let active=true;
		void fetch('/api/client-stories',{cache:'no-store'}).then(async response=>{
			const result=await response.json();
			if(!response.ok)throw new Error(typeof result?.error==='string'?result.error:'Stories unavailable');
			if(!active)return;
			const list:ClientStory[]=Array.isArray(result)?result:[];
			setStories(list);
			setError('');
		}).catch(exception=>{
			if(active)setError(exception instanceof Error?exception.message:'Stories unavailable.');
		}).finally(()=>{if(active)setLoading(false)});
		return ()=>{active=false;media.removeEventListener('change',updateMotionPreference)};
	},[]);

	const current=stories[index]??null;

	return (
		<section
			className="home-section client-stories-rotator"
			aria-labelledby="client-stories-heading"
		>
			<div className="section-heading">
				<div>
					<p className="eyebrow">CUSTOMER EXPERIENCES</p>
					<h2 id="client-stories-heading">Investment testimonials</h2>
					<p className="section-intro">Published customer experiences, shared with consent.</p>
				</div>
				<Link className="text-link" href="/client-stories">View all stories <ArrowUpRight size={14}/></Link>
			</div>

			{loading&&<p className="client-stories-empty text-sm" role="status">Loading customer stories…</p>}
			{!loading&&error&&<p className="client-stories-empty text-sm" role="alert">{error}</p>}

			{!loading&&!error&&current&&(
				<div className="client-story-carousel" role="region" aria-label="Customer testimonials" aria-roledescription="carousel">
					<Swiper
						modules={[A11y,Autoplay,EffectFade]}
						className="client-story-swiper"
						slidesPerView={1}
						loop={stories.length>1}
						effect="fade"
						fadeEffect={{crossFade:true}}
						speed={reducedMotion?0:TRANSITION_MS}
						autoplay={stories.length>1&&!reducedMotion?{
							delay:AUTOPLAY_DELAY_MS,
							disableOnInteraction:false,
							pauseOnMouseEnter:true,
							stopOnLastSlide:false,
						}:false}
						a11y={{enabled:true,containerMessage:'Customer testimonials',slideLabelMessage:'Testimonial {{index}} of {{slidesLength}}'}}
						onSwiper={swiper=>{swiperRef.current=swiper}}
						onSlideChange={swiper=>setIndex(swiper.realIndex)}
					>
						{stories.map((story,i)=>(
							<SwiperSlide key={story.id} role="group" aria-roledescription="slide" aria-label={`${i+1} of ${stories.length}`}>
								<article className="client-story-stage card p-5 sm:p-7">
									<div className="client-story-stage-grid">
										<div className="client-story-stage-portrait">
											<span className="client-story-avatar client-story-avatar-lg">
												{story.imageUrl?(
													<Image src={story.imageUrl} alt={`Portrait for ${story.displayName}`} width={160} height={160} unoptimized className="client-story-portrait"/>
												):(
													<span className="client-story-monogram client-story-monogram-lg" aria-hidden="true">{story.displayName.trim().charAt(0).toUpperCase()}</span>
												)}
											</span>
											{(story.verifiedClientStory||story.verifiedCustomer||story.externalVerified)&&<span className="client-story-verified"><ShieldCheck size={14}/> {story.verifiedClientStory?'Verified client story':story.verifiedCustomer?'Verified customer':'Source verified'}</span>}
										</div>
										<div className="client-story-stage-body">
											{story.title&&<p className="eyebrow">{story.title}</p>}
											{story.rating&&<p className="client-story-rating" aria-label={`Rated ${story.rating} out of 5`}>{'★'.repeat(story.rating)}<span className="sr-only">Rated {story.rating} out of 5</span></p>}
											<blockquote className="client-story-quote whitespace-pre-line break-words">“{story.quote}”</blockquote>
											<div className="mt-5">
												<h3 className="font-semibold text-lg">{story.displayName}</h3>
												{(story.cityOrRegion||story.country)&&<p className="muted text-sm">{[story.cityOrRegion,story.country].filter(Boolean).join(', ')}</p>}
												{story.externalSource&&<p className="mt-1 text-sm muted">Source: {story.externalSource.replaceAll('_',' ')}{story.externalUrl&&<> · <a className="text-link" href={story.externalUrl} target="_blank" rel="noopener noreferrer">Original source <ArrowUpRight size={12} className="inline"/></a></>}</p>}
												{story.withdrawalAmount&&<p className="mt-3 text-sm gold">Verified withdrawal · {Number(story.withdrawalAmount).toLocaleString()} {story.currency}</p>}
											</div>
										</div>
									</div>
								</article>
							</SwiperSlide>
						))}
					</Swiper>
					{stories.length>1&&<div className="client-story-controls">
						<button type="button" className="client-story-nav-btn" aria-label="Previous testimonial" onClick={()=>swiperRef.current?.slidePrev()}><ArrowLeft size={16}/></button>
						<div className="client-story-dots" role="group" aria-label="Choose testimonial">
							{stories.map((story,i)=><button key={story.id} type="button" className={`client-story-dot ${i===index?'is-active':''}`} aria-pressed={i===index} aria-label={`Show testimonial ${i+1} of ${stories.length}`} onClick={()=>swiperRef.current?.slideToLoop(i)}/>)}
						</div>
						<button type="button" className="client-story-nav-btn" aria-label="Next testimonial" onClick={()=>swiperRef.current?.slideNext()}><ArrowRight size={16}/></button>
						<span className="client-story-count muted text-xs" aria-live="polite">{index+1} / {stories.length}</span>
					</div>}
				</div>
			)}

			{!loading&&!error&&!stories.length&&(
				<div className="client-stories-empty card p-6">
					<span className="client-story-verified"><ShieldCheck size={14}/> Consent-first publication</span>
					<p className="mt-3 max-w-2xl text-sm leading-7 muted">
						No published client stories yet. When administrators publish consented profiles under <strong>Admin → Client stories</strong>, they will rotate here automatically.
					</p>
				</div>
			)}
		</section>
	);
}
