'use client';
import {create} from 'zustand';

type MarketItem={id:string;symbol:string;price:number;change?:number};
type Store={markets:MarketItem[];setMarkets:(markets:MarketItem[])=>void;updatePrices:(updates:{symbol:string;price:number;change?:number}[])=>void};
export const useTradingStore=create<Store>((set)=>({markets:[],setMarkets:(markets)=>set({markets}),updatePrices:(updates)=>set((s)=>({markets:s.markets.map(m=>{const u=updates.find(x=>x.symbol===m.symbol);return u?{...m,price:u.price,change:u.change}:m})}))}));
