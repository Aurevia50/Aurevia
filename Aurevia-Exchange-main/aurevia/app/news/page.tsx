'use client';

import Link from 'next/link';
import Nav from '@/components/Nav';
import NewsFeedPanel from '@/components/NewsFeedPanel';
import PublicResourceLinks from '@/components/PublicResourceLinks';
import {ArrowUpRight,Newspaper,ShieldCheck} from 'lucide-react';

export default function NewsPage(){
	return <>
		<Nav/>
		<main className="account-page news-editorial-page">
			<header className="news-editorial-heading">
				<div><span className="account-kicker">AUREVIA · MARKET BRIEFING</span><h1>News &amp; perspective.</h1><p>Browse current headlines from configured publishers alongside resources shared by the Aurevia team.</p></div>
				<div className="news-editorial-mark" aria-hidden="true"><Newspaper size={26}/><span>NEWS<br/>&amp; UPDATES</span></div>
			</header>
			<div className="news-editorial-note"><ShieldCheck size={16}/><p>Articles link to their original publishers. News, summaries, and sentiment analysis are informational only—not verified facts, market signals, or investment recommendations.</p><Link href="/risk-disclosure">Risk disclosure <ArrowUpRight size={13}/></Link></div>
			<NewsFeedPanel/>
			<PublicResourceLinks placement="NEWS_UPDATES"/>
		</main>
	</>;
}
