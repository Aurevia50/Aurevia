import {afterEach,describe,expect,it,vi} from 'vitest';
import {setMarketWatchlistUserScope,useMarketWatchlists} from '../lib/market-watchlists';

const localStore=new Map<string,string>();
const storage={
	getItem:(key:string)=>localStore.get(key)??null,
	setItem:(key:string,value:string)=>{localStore.set(key,value)},
	removeItem:(key:string)=>{localStore.delete(key)},
};

afterEach(async()=>{
	await setMarketWatchlistUserScope(null);
	localStore.clear();
	vi.unstubAllGlobals();
});

describe('per-account market watchlists',()=>{
	it('renames the legacy Spanish default watchlist in English',async()=>{
		vi.stubGlobal('localStorage',storage);
		localStore.set('aurevia-live-market-watchlists',JSON.stringify({state:{watchlists:[{id:'market-default',name:'Mi lista de control',symbols:['DJI']}],activeWatchlistId:'market-default',selectedSymbol:'DJI'},version:0}));
		await setMarketWatchlistUserScope(null);
		expect(useMarketWatchlists.getState().watchlists[0].name).toBe('My Watchlist');
	});

	it('keeps saved watchlists separate when users share a browser',async()=>{
		vi.stubGlobal('localStorage',storage);
		await setMarketWatchlistUserScope('user-a');
		useMarketWatchlists.getState().createWatchlist('User A private list');
		useMarketWatchlists.getState().addSymbol('AAPL');

		await setMarketWatchlistUserScope('user-b');
		expect(useMarketWatchlists.getState().watchlists.map(list=>list.name)).toEqual(['My Watchlist']);
		expect(useMarketWatchlists.getState().watchlists.flatMap(list=>list.symbols)).not.toContain('AAPL');

		useMarketWatchlists.getState().createWatchlist('User B private list');
		useMarketWatchlists.getState().addSymbol('MSFT');
		await setMarketWatchlistUserScope('user-a');
		expect(useMarketWatchlists.getState().watchlists.map(list=>list.name)).toContain('User A private list');
		expect(useMarketWatchlists.getState().watchlists.flatMap(list=>list.symbols)).toContain('AAPL');
		expect(useMarketWatchlists.getState().watchlists.map(list=>list.name)).not.toContain('User B private list');
	});
});
