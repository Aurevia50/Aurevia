'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight,ExternalLink} from 'lucide-react';
import type {PublicResourceLink,PublicResourcePlacement} from '@/lib/public-resource-links';

export default function PublicResourceLinks({placement='RESOURCES'}:{placement?:PublicResourcePlacement}){
	const [links,setLinks]=useState<PublicResourceLink[]>([]);

	useEffect(()=>{
		let active=true;
		void fetch('/api/public-links',{cache:'no-store'}).then(async response=>{
			const result=await response.json();
			if(!active||!response.ok)return;
			setLinks(Array.isArray(result.links)?result.links.filter((link:PublicResourceLink)=>link.placement===placement):[]);
		}).catch(()=>{});
		return ()=>{active=false};
	},[placement]);

	if(!links.length)return null;

	return (
		<section className="home-section public-resource-links" aria-label={placement==='NEWS_UPDATES'?'News & Updates links':'Resource links'}>
			<div className="section-heading">
				<div>
					<p className="eyebrow">{placement==='NEWS_UPDATES'?'NEWS & UPDATES':'RESOURCES'}</p>
					<h2>{placement==='NEWS_UPDATES'?'More updates':'Explore more'}</h2>
				</div>
			</div>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{links.map(link=>{
					const internal=link.url.startsWith('/');
					const className='card public-resource-link p-4 flex flex-col gap-2 min-h-[96px]';
					const body=(
						<>
							<span className="font-semibold text-[#f4f7f5] flex items-center gap-2">{link.title}{internal?<ArrowUpRight size={14}/>:<ExternalLink size={14}/>}</span>
							{link.description&&<span className="text-sm muted">{link.description}</span>}
						</>
					);
					return internal?(
						<Link key={link.id} href={link.url} className={className}>{body}</Link>
					):(
						<a key={link.id} href={link.url} className={className} target="_blank" rel="noopener noreferrer">{body}</a>
					);
				})}
			</div>
			{placement==='RESOURCES'&&<div className="mt-4">
				<Link href="/" className="text-link">Return to Aurevia home</Link>
			</div>}
		</section>
	);
}
