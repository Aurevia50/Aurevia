/**
 * Configured feed sources.
 * Federal Reserve directory: https://www.federalreserve.gov/feeds/feeds.htm
 * Selected actual XML feed (All Press Releases): https://www.federalreserve.gov/feeds/press_all.xml
 */
export const FED_PRESS_ALL_RSS_URL='https://www.federalreserve.gov/feeds/press_all.xml';

export const DEFAULT_NEWS_SOURCES=[
	{
		key:'federal-reserve-press-all',
		displayName:'Federal Reserve',
		providerType:'RSS' as const,
		category:'ECONOMIC_NEWS' as const,
		feedUrl:FED_PRESS_ALL_RSS_URL,
		enabled:true,
		pollIntervalMinutes:15,
	},
	{
		key:'gnews-economy',
		displayName:'GNews',
		providerType:'GNEWS' as const,
		category:'MARKET_NEWS' as const,
		feedUrl:null,
		enabled:true,
		pollIntervalMinutes:15,
	},
];
