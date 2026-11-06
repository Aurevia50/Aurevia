import type {MarketDataProvider} from './contracts';

let marketDataProvider:MarketDataProvider|null=null;

export function getMarketDataProvider(){return marketDataProvider;}

export function registerMarketDataProvider(provider:MarketDataProvider){
	if(marketDataProvider)throw new Error('MARKET_DATA_PROVIDER_ALREADY_REGISTERED');
	marketDataProvider=provider;
}
