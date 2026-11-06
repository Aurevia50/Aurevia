import {describe,expect,it} from 'vitest';
import {groupByLocalDate,localDateBoundary} from '../lib/local-date';

describe('localDateBoundary',()=>{
	it('uses device-local midnight boundaries across daylight-saving changes',()=>{
		const previousTimezone=process.env.TZ;
		process.env.TZ='America/Los_Angeles';
		try{
			expect(localDateBoundary('2026-03-08')).toBe('2026-03-08T08:00:00.000Z');
			expect(localDateBoundary('2026-03-08',true)).toBe('2026-03-09T06:59:59.999Z');
					const groups=groupByLocalDate([
						{timestamp:'2026-03-08T07:59:59.999Z',id:'previous-day'},
						{timestamp:'2026-03-08T08:00:00.000Z',id:'start-of-day'},
						{timestamp:'2026-03-09T06:59:59.999Z',id:'end-of-day'},
					]);
					expect(groups.map(group=>group.key)).toEqual(['2026-03-07','2026-03-08']);
					expect(groups[1]?.items.map(item=>item.id)).toEqual(['start-of-day','end-of-day']);
		}finally{
			if(previousTimezone===undefined)delete process.env.TZ;
			else process.env.TZ=previousTimezone;
		}
	});

	it('rejects invalid and non-date values',()=>{
		expect(localDateBoundary('2026-02-30')).toBeNull();
		expect(localDateBoundary('not-a-date')).toBeNull();
	});
});