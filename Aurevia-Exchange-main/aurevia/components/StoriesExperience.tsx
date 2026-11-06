'use client';

import Image from 'next/image';
import Link from 'next/link';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,ArrowUpRight,Pause,Play,Radio,X} from 'lucide-react';

export type StoryFeedItem={
	id:string;
	title:string;
	description:string;
	category:{id:string;name:string;slug:string};
	externalUrl:string|null;
	publishedAt:string|null;
	media:{id:string;type:'IMAGE'|'VIDEO';mimeType:string;altText:string|null;displayOrder:number;url:string}[];
};

type Props={mode?:'strip'|'page';stories?:StoryFeedItem[]};
type StoryFrame={story:StoryFeedItem;media:StoryFeedItem['media'][number]|null};

function formatPublicationDate(value:string|null){
	if(!value)return 'Publication date unavailable';
	const date=new Date(value);
	if(!Number.isFinite(date.getTime()))return 'Publication date unavailable';
	return new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric'}).format(date);
}

export function StoriesViewer({stories,initialIndex=0,onClose,trackEngagement=true}:{stories:StoryFeedItem[];initialIndex?:number;onClose:()=>void;trackEngagement?:boolean}){
	const frames=useMemo(()=>stories.reduce<StoryFrame[]>((result,story)=>{
		if(story.media.length)result.push(...story.media.map(media=>({story,media})));
		else result.push({story,media:null});
		return result;
	},[]),[stories]);
	const [frameIndex,setFrameIndex]=useState(initialIndex);
	const [progress,setProgress]=useState(0);
	const [paused,setPaused]=useState(false);
	const [videoDuration,setVideoDuration]=useState(15_000);
	const elapsed=useRef(0);
	const touchStart=useRef<number|null>(null);
	const videoRef=useRef<HTMLVideoElement|null>(null);
	const activeFrame=frames[frameIndex]??null;
	const activeStoryId=activeFrame?.story.id;
	const duration=activeFrame?.media?.type==='VIDEO'?videoDuration:6_000;

	const goTo=useCallback((index:number)=>{
		if(!frames.length)return;
		const next=(index+frames.length)%frames.length;
		elapsed.current=0;
		setProgress(0);
		setVideoDuration(15_000);
		setFrameIndex(next);
	},[frames.length]);

	const next=useCallback(()=>goTo(frameIndex+1),[frameIndex,goTo]);
	const previous=useCallback(()=>goTo(frameIndex-1),[frameIndex,goTo]);

	useEffect(()=>{
		if(!activeFrame||paused)return;
		const timer=window.setInterval(()=>{
			elapsed.current+=100;
			setProgress(Math.min(100,elapsed.current/duration*100));
			if(elapsed.current>=duration)next();
		},100);
		return ()=>window.clearInterval(timer);
	},[activeFrame,duration,next,paused]);

	useEffect(()=>{
		if(!videoRef.current)return;
		if(paused)videoRef.current.pause();
		else void videoRef.current.play().catch(()=>console.warn('Story video playback could not be resumed.'));
	},[activeFrame?.media?.id,paused]);

	useEffect(()=>{
		if(!activeStoryId||!trackEngagement)return;
		void fetch(`/api/stories/${encodeURIComponent(activeStoryId)}/engagement`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'VIEW'})})
			.then(response=>{if(!response.ok)throw new Error('View count unavailable')})
			.catch(()=>console.warn('Story view analytics could not be recorded.'));
	},[activeStoryId,trackEngagement]);

	useEffect(()=>{
		const originalOverflow=document.body.style.overflow;
		document.body.style.overflow='hidden';
		const handleKey=(event:KeyboardEvent)=>{
			if(event.key==='Escape')onClose();
			if(event.key==='ArrowRight')next();
			if(event.key==='ArrowLeft')previous();
			if(event.key===' '){event.preventDefault();setPaused(current=>!current)}
		};
		window.addEventListener('keydown',handleKey);
		return ()=>{document.body.style.overflow=originalOverflow;window.removeEventListener('keydown',handleKey)};
	},[next,onClose,previous]);

	if(!activeFrame)return null;
	const {story,media}=activeFrame;
	const framePercent=progress;
	return <div className="story-viewer-backdrop" role="presentation" onClick={onClose}>
		<section className="story-viewer" role="dialog" aria-modal="true" aria-label={`Story: ${story.title}`} onClick={event=>event.stopPropagation()} onTouchStart={event=>{touchStart.current=event.touches[0]?.clientX??null}} onTouchEnd={event=>{
			if(touchStart.current===null)return;
			const delta=event.changedTouches[0]?.clientX-touchStart.current;
			if(typeof delta==='number'&&Math.abs(delta)>50)(delta<0?next:previous)();
			touchStart.current=null;
		}}>
			<div className="story-viewer-progress" aria-label={`Story ${frameIndex+1} of ${frames.length}`}>
				{frames.map((frame,index)=><span className="story-progress-track" key={`${frame.story.id}:${frame.media?.id??'text'}`}><i style={{width:index<frameIndex?'100%':index===frameIndex?`${framePercent}%`:'0%'}}/></span>)}
			</div>
			<header className="story-viewer-header">
				<span className="story-viewer-brand"><span className="story-viewer-brand-mark">A</span><span><b>Aurevia</b><small>{story.category.name}</small></span></span>
				<div className="story-viewer-actions">
					<button type="button" aria-label={paused?'Resume story':'Pause story'} onClick={()=>setPaused(current=>!current)}>{paused?<Play size={18}/>:<Pause size={18}/>}</button>
					<button type="button" aria-label="Close stories" onClick={onClose}><X size={20}/></button>
				</div>
			</header>
			<div className="story-viewer-stage">
				{media?.type==='VIDEO'?<video ref={videoRef} key={media.id} className="story-viewer-media" src={media.url} aria-label={media.altText||story.title} autoPlay muted playsInline onLoadedMetadata={event=>{
					const seconds=event.currentTarget.duration;
					if(Number.isFinite(seconds)&&seconds>0)setVideoDuration(Math.min(Math.max(seconds*1000,3_000),60_000));
				}} onEnded={next}/>:media?.type==='IMAGE'?<Image key={media.id} className="story-viewer-media" src={media.url} alt={media.altText||story.title} fill priority unoptimized sizes="(max-width: 720px) 100vw, 680px"/>:<div className="story-viewer-no-media"><Radio size={36}/><span>Aurevia update</span></div>}
				<button type="button" className="story-viewer-nav story-viewer-prev" aria-label="Previous story" onClick={previous}><ArrowLeft size={20}/></button>
				<button type="button" className="story-viewer-nav story-viewer-next" aria-label="Next story" onClick={next}><ArrowRight size={20}/></button>
				<div className="story-viewer-copy">
					<span className="story-viewer-category">{story.category.name}</span>
					<h2>{story.title}</h2>
					<p>{story.description}</p>
					{story.externalUrl&&<a href={story.externalUrl} target="_blank" rel="noopener noreferrer" onClick={()=>void fetch(`/api/stories/${encodeURIComponent(story.id)}/engagement`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'LINK_CLICK'}),keepalive:true}).catch(()=>console.warn('Story link analytics could not be recorded.'))}>Learn more <ArrowUpRight size={15}/></a>}
				</div>
			</div>
			<footer className="story-viewer-footer"><span>{frameIndex+1} / {frames.length}</span><button type="button" onClick={()=>setPaused(current=>!current)}>{paused?<Play size={15}/>:<Pause size={15}/>} {paused?'Resume':'Pause'}</button></footer>
		</section>
	</div>;
}

export default function StoriesExperience({mode='strip',stories:providedStories}:Props){
	const [stories,setStories]=useState<StoryFeedItem[]>(providedStories??[]);
	const [loading,setLoading]=useState(!providedStories);
	const [error,setError]=useState('');
	const [selectedCategory,setSelectedCategory]=useState('');
	const [viewerIndex,setViewerIndex]=useState<number|null>(null);

	useEffect(()=>{
		if(providedStories)return;
		let active=true;
		void fetch('/api/stories',{cache:'no-store'}).then(async response=>{
			const result=await response.json();
			if(!response.ok)throw new Error(typeof result?.error==='string'?result.error:'Stories are temporarily unavailable.');
			if(active)setStories(Array.isArray(result)?result:[]);
		}).catch(exception=>{
			if(active)setError(exception instanceof Error?exception.message:'Stories are temporarily unavailable.');
		}).finally(()=>{if(active)setLoading(false)});
		return ()=>{active=false};
	},[providedStories]);

	const categories=useMemo(()=>Array.from(new Map(stories.map(story=>[story.category.id,story.category])).values()),[stories]);
	const visibleStories=selectedCategory?stories.filter(story=>story.category.id===selectedCategory):stories;
	const openStory=(storyId:string)=>{
		const index=stories.findIndex(story=>story.id===storyId);
		if(index>=0)setViewerIndex(index);
	};

	return <section className={`stories-section ${mode==='strip'?'stories-section-compact':'stories-section-page'}`} aria-labelledby={mode==='page'?'stories-page-title':'stories-strip-title'}>
		<header className="stories-section-heading">
			<div>{mode==='page'?<><p className="stories-eyebrow">UPDATES &amp; INSIGHTS</p><h1 id="stories-page-title">Stories</h1><p>Company updates, market context, and useful platform news.</p></>:<><p className="stories-eyebrow">UPDATES &amp; INSIGHTS</p><h2 id="stories-strip-title">From Aurevia</h2></>}</div>
			{mode==='strip'&&<Link href="/stories" className="stories-view-all">View all <ArrowRight size={14}/></Link>}
		</header>
		{mode==='page'&&categories.length>0&&<div className="stories-category-filters" aria-label="Filter stories by category">
			<button type="button" className={!selectedCategory?'is-active':''} onClick={()=>setSelectedCategory('')}>All stories</button>
			{categories.map(category=><button type="button" key={category.id} className={selectedCategory===category.id?'is-active':''} onClick={()=>setSelectedCategory(category.id)}>{category.name}</button>)}
		</div>}
		{loading&&<p className="stories-status" role="status">Loading stories…</p>}
		{error&&<p className="stories-status stories-error" role="alert">{error}</p>}
		{!loading&&!error&&stories.length===0&&<div className="stories-empty"><Radio size={18}/><span>There are no published stories at the moment.</span></div>}
		{!loading&&!error&&visibleStories.length>0&&<div className={mode==='strip'?'stories-strip':'stories-card-grid'}>
			{visibleStories.map((story,index)=>{
				const image=story.media.find(item=>item.type==='IMAGE');
				return <button type="button" className={mode==='strip'?'story-bubble':index===0?'story-card story-card-featured':'story-card'} key={story.id} onClick={()=>openStory(story.id)} aria-label={`Open ${story.title}`}>
					{mode==='strip'?<><span className="story-bubble-ring"><span className="story-bubble-inner">{image?<Image src={image.url} alt="" fill unoptimized sizes="84px"/>:<span className="story-bubble-letter">A</span>}</span></span><span className="story-bubble-title">{story.title}</span><small>{story.category.name}</small></>:<><span className="story-card-media">{image?<Image src={image.url} alt={image.altText||''} fill unoptimized sizes="(max-width: 720px) 100vw, 520px"/>:<span className="story-card-placeholder"><Radio size={22}/></span>}{story.media.some(item=>item.type==='VIDEO')&&<i className="story-card-video"><Play size={13} fill="currentColor"/></i>}</span><span className="story-card-content">{index===0&&<i>Featured story</i>}<small>{story.category.name}</small><b>{story.title}</b><time dateTime={story.publishedAt||undefined}>{formatPublicationDate(story.publishedAt)}</time><span>{story.description}</span><strong>{mode==='page'?'Read more':'Open story'} <ArrowRight size={13}/></strong></span></>}
				</button>;
			})}
		</div>}
		{viewerIndex!==null&&<StoriesViewer stories={stories} initialIndex={viewerIndex} onClose={()=>setViewerIndex(null)}/>}
	</section>;
}
