import {describe,expect,it} from 'vitest';
import {clampSupportChatPosition,dockSupportChatPosition,nearestSupportChatSide} from '@/lib/support-chat-position';

describe('support chat edge docking',()=>{
	const viewport={width:800,height:600};

	it('snaps a dragged widget to its nearest edge',()=>{
		expect(nearestSupportChatSide(80,false,viewport)).toBe('left');
		expect(nearestSupportChatSide(680,false,viewport)).toBe('right');
	});

	it('keeps the selected edge when the launcher opens as a panel',()=>{
		expect(dockSupportChatPosition({left:200,top:25},'left',true,viewport)).toEqual({left:12,top:25});
		expect(dockSupportChatPosition({left:200,top:25},'right',true,viewport)).toEqual({left:428,top:25});
	});

	it('clamps the widget within the viewport after resizing',()=>{
		expect(clampSupportChatPosition({left:900,top:900},true,viewport)).toEqual({left:428,top:28});
	});

	it('keeps the launcher and open panel above the mobile bottom navigation',()=>{
		const mobileViewport={width:390,height:844,bottomInset:90};
		expect(clampSupportChatPosition({left:500,top:800},false,mobileViewport)).toEqual({left:322,top:686});
		expect(clampSupportChatPosition({left:20,top:800},true,mobileViewport)).toEqual({left:18,top:182});
	});
});
