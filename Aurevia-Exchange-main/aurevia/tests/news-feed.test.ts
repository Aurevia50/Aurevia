import {describe,expect,it} from 'vitest';
import {parseRssOrAtom} from '../lib/news-feed/rss';
import {assertPublicHttpsUrl} from '../lib/news-feed/safe-fetch';
import {FED_PRESS_ALL_RSS_URL,DEFAULT_NEWS_SOURCES} from '../lib/news-feed/sources';
import {isGnewsAllowed} from '../lib/news-feed/gnews';

describe('news feed RSS parser',()=>{
	it('parses rss items and strips markup',()=>{
		const xml=`<?xml version="1.0"?><rss><channel>
			<item>
				<title><![CDATA[Fed test &amp; title]]></title>
				<link>https://www.federalreserve.gov/newsevents/pressreleases/test.htm</link>
				<guid>https://www.federalreserve.gov/newsevents/pressreleases/test.htm</guid>
				<pubDate>Wed, 15 Oct 2025 12:00:00 GMT</pubDate>
				<description><![CDATA[<p>Summary <b>text</b></p>]]></description>
			</item>
			<item><title></title><link>https://example.com/x</link></item>
		</channel></rss>`;
		const items=parseRssOrAtom(xml);
		expect(items).toHaveLength(1);
		expect(items[0].title).toContain('Fed test');
		expect(items[0].summary).toBe('Summary text');
		expect(items[0].canonicalUrl).toMatch(/^https:\/\//);
		expect(items[0].publishedAt).toBeInstanceOf(Date);
	});

	it('dedupes by relying on stable external ids from guid/link',()=>{
		const xml=`<rss><channel>
			<item><title>One</title><link>https://www.federalreserve.gov/a</link><guid>id-1</guid></item>
			<item><title>Two</title><link>https://www.federalreserve.gov/b</link><guid>id-2</guid></item>
		</channel></rss>`;
		const items=parseRssOrAtom(xml);
		expect(new Set(items.map(i=>i.externalId)).size).toBe(2);
	});
});

describe('news feed URL safety',()=>{
	it('rejects non-https and localhost',async()=>{
		await expect(assertPublicHttpsUrl('http://example.com/x')).rejects.toThrow();
		await expect(assertPublicHttpsUrl('https://localhost/x')).rejects.toThrow();
	});
});

describe('configured sources',()=>{
	it('documents Federal Reserve press_all feed URL',()=>{
		expect(FED_PRESS_ALL_RSS_URL).toBe('https://www.federalreserve.gov/feeds/press_all.xml');
		expect(DEFAULT_NEWS_SOURCES.some(s=>s.key==='federal-reserve-press-all'&&s.enabled)).toBe(true);
	});
});

describe('gnews gating',()=>{
	it('requires api key',()=>{
		const previous=process.env.GNEWS_API_KEY;
		delete process.env.GNEWS_API_KEY;
		expect(isGnewsAllowed()).toBe(false);
		if(previous===undefined)delete process.env.GNEWS_API_KEY;
		else process.env.GNEWS_API_KEY=previous;
	});
});
