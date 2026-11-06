import {describe,expect,it} from 'vitest';
import {parsePublicResourceLinks} from '../lib/public-resource-links';

describe('public resource link placement',()=>{
	it('keeps existing configured links in Resources by default',()=>{
		expect(parsePublicResourceLinks(JSON.stringify([{id:'legacy',title:'Legacy',url:'https://example.com'}]))).toEqual([
			{id:'legacy',title:'Legacy',url:'https://example.com',placement:'RESOURCES'},
		]);
	});

	it('preserves News & Updates placement for configured links',()=>{
		expect(parsePublicResourceLinks(JSON.stringify([{id:'news',title:'News',url:'https://example.com',placement:'NEWS_UPDATES'}]))).toEqual([
			{id:'news',title:'News',url:'https://example.com',placement:'NEWS_UPDATES'},
		]);
	});
});
