import {describe,expect,it} from 'vitest';
import {calculateTradePlan,formatTradePlan,hasDemoOrderIntent,missingTradePlanInputs,parseDemoOrderIntent,parseTradePlan,requestsUnsupportedOrderType} from '../lib/nova-assistant';

describe('Nova position sizing assistance',()=>{
	it('parses an explicit DEMO-order intent without creating an order',()=>{
		expect(parseDemoOrderIntent('prepare demo order: buy 2 E2EABCDEF/USD')).toEqual({side:'BUY',quantity:2,symbol:'E2EABCDEF/USD'});
		expect(parseDemoOrderIntent('sell -2 AAPL')).toBeNull();
		expect(hasDemoOrderIntent('prepare demo order: buy two AAPL')).toBe(true);
		expect(requestsUnsupportedOrderType('prepare limit order: buy 2 AAPL at $20')).toBe(true);
	});

	it('calculates user-supplied risk sizing and optional gross reward',()=>{
		const input=parseTradePlan('calculate position size: risk $100, entry $50, stop $45, target $60, long');
		expect(input).toEqual({risk:100,entry:50,stop:45,target:60,side:'LONG'});
		const plan=input&&calculateTradePlan(input);
		expect(plan).toEqual({side:'LONG',quantity:20,risk:100,entry:50,stop:45,target:60,potentialReward:200,rewardRiskRatio:2});
		expect(plan&&formatTradePlan(plan)).toContain('No order was prepared or submitted');
	});

	it('declines missing, non-positive, and equal entry/stop inputs',()=>{
		expect(parseTradePlan('calculate position size with risk $100 and entry $50')).toBeNull();
		expect(calculateTradePlan({risk:100,entry:50,stop:50})).toBeNull();
		expect(calculateTradePlan({risk:-100,entry:50,stop:45})).toBeNull();
		expect(missingTradePlanInputs('calculate position size, risk $100')).toContain('an entry price');
	});

	it('requires a direction and correctly oriented stop and target for risk/reward',()=>{
		expect(calculateTradePlan({risk:100,entry:50,stop:45,target:60})).toBeNull();
		expect(calculateTradePlan({risk:100,entry:50,stop:55,target:60,side:'LONG'})).toBeNull();
		expect(calculateTradePlan({risk:100,entry:50,stop:55,target:40,side:'SHORT'})).toMatchObject({side:'SHORT',quantity:20,potentialReward:200,rewardRiskRatio:2});
		expect(missingTradePlanInputs('calculate risk/reward: risk $100, entry $50, stop $45, target $60')).toContain('direction (LONG or SHORT)');
	});
});
