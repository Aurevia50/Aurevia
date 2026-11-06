import {describe,expect,it} from 'vitest';
import {sizeDemoRecommendation} from '@/lib/demo-ai-config';

describe('DEMO recommendation sizing',()=>{
	it('caps risk-adjusted orders by configured notional and available cash',()=>{
		const quantity=sizeDemoRecommendation({
			price:100,
			balance:200,
			takerFee:0.01,
			riskPerTrade:0.01,
			maxPositionUsd:50,
			stopLossPercent:0.1,
			slippageBps:10,
		});

		expect(quantity).toBe(0.2);
	});

	it('never recommends selling more than the owned simulated position',()=>{
		const quantity=sizeDemoRecommendation({
			price:100,
			balance:5000,
			takerFee:0.001,
			riskPerTrade:0.01,
			maxPositionUsd:500,
			stopLossPercent:0.02,
			slippageBps:5,
			availableQuantity:0.25,
		});

		expect(quantity).toBe(0.25);
	});

	it('returns no order size for invalid or unavailable simulated funds',()=>{
		expect(sizeDemoRecommendation({
			price:100,
			balance:0,
			takerFee:0.001,
			riskPerTrade:0.01,
			maxPositionUsd:500,
			stopLossPercent:0.02,
			slippageBps:5,
		})).toBe(0);
	});
});
