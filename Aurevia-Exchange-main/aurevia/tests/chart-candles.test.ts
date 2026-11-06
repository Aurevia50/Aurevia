import {describe,expect,it} from 'vitest';
import {chartIntervalSeconds,updateChartCandle,type ChartCandle} from '@/lib/chart-candles';

const initial:ChartCandle[]=[{time:120,open:10,high:11,low:9,close:10.5,volume:12}];

describe('chart candle updates',()=>{
	it('converts provider intervals to candle durations',()=>{
		expect(chartIntervalSeconds('5m')).toBe(300);
		expect(chartIntervalSeconds('1h')).toBe(3_600);
		expect(chartIntervalSeconds('unknown')).toBe(60);
	});

	it('updates the forming interval candle without changing its open',()=>{
		const updated=updateChartCandle(initial,12,150_500,10,60);
		expect(updated).toEqual([{time:120,open:10,high:12,low:9,close:12,volume:12}]);
	});

	it('starts a candle at the next interval boundary and keeps the configured history length',()=>{
		const updated=updateChartCandle(initial,12,180_000,1,60);
		expect(updated).toEqual([{time:180,open:12,high:12,low:12,close:12,volume:null}]);
	});

	it('aggregates updates within a five-minute candle',()=>{
		const fiveMinuteInitial:ChartCandle[]=[{time:300,open:10,high:11,low:9,close:10.5,volume:12}];
		const updated=updateChartCandle(fiveMinuteInitial,12,540_000,10,300);
		expect(updated).toEqual([{time:300,open:10,high:12,low:9,close:12,volume:12}]);
	});

	it('ignores invalid prices and out-of-order ticks',()=>{
		expect(updateChartCandle(initial,0,180_000,10)).toBe(initial);
		expect(updateChartCandle(initial,12,119_000,10)).toBe(initial);
	});
});
