import {describe,expect,it,vi} from 'vitest';
import {NotificationType} from '@prisma/client';
import {createNotification,notifyActiveUsers} from '@/lib/notifications';

describe('notification push outbox idempotency',()=>{
	it('uses the in-app notification id as the unique push event identity',async()=>{
		const notificationUpsert=vi.fn().mockResolvedValue({id:'notification-1'});
		const outboxUpsert=vi.fn().mockResolvedValue({});
		const tx={notification:{upsert:notificationUpsert},pushOutbox:{upsert:outboxUpsert}} as never;
		const event={
			userId:'user-1',type:NotificationType.DEPOSIT,title:'Deposit received',message:'Review the request.',
			dedupeKey:'funding:deposit-1:submitted',actionUrl:'/wallet/transactions/deposit-1',
		};
		await createNotification(tx,event);
		await createNotification(tx,event);
		expect(notificationUpsert).toHaveBeenCalledTimes(2);
		expect(outboxUpsert).toHaveBeenNthCalledWith(1,{
			where:{notificationId:'notification-1'},update:{},create:{notificationId:'notification-1',userId:'user-1'},
		});
		expect(outboxUpsert).toHaveBeenNthCalledWith(2,{
			where:{notificationId:'notification-1'},update:{},create:{notificationId:'notification-1',userId:'user-1'},
		});
	});

	it('queues active-user announcements once per user with the notification',async()=>{
		const createMany=vi.fn().mockResolvedValue({count:2});
		const findMany=vi.fn().mockResolvedValue([{id:'notice-1',userId:'user-1'},{id:'notice-2',userId:'user-2'}]);
		const outboxCreateMany=vi.fn().mockResolvedValue({count:2});
		const tx={
			user:{findMany:vi.fn().mockResolvedValue([{id:'user-1'},{id:'user-2'}])},
			notification:{createMany,findMany},
			pushOutbox:{createMany:outboxCreateMany},
		} as never;
		await notifyActiveUsers(tx,{
			type:NotificationType.ANNOUNCEMENT,title:'New announcement',message:'A public update.',
			dedupeKey:'broadcast:one:published',relatedEntity:'BROADCAST',relatedId:'broadcast-1',actionUrl:'/broadcasts',
		});
		expect(createMany).toHaveBeenCalledWith({data:expect.arrayContaining([
			expect.objectContaining({userId:'user-1',type:NotificationType.ANNOUNCEMENT,dedupeKey:'broadcast:one:published:user-1'}),
			expect.objectContaining({userId:'user-2',type:NotificationType.ANNOUNCEMENT,dedupeKey:'broadcast:one:published:user-2'}),
		]),skipDuplicates:true});
		expect(outboxCreateMany).toHaveBeenCalledWith({data:expect.arrayContaining([
			expect.objectContaining({notificationId:'notice-1',userId:'user-1'}),
			expect.objectContaining({notificationId:'notice-2',userId:'user-2'}),
		]),skipDuplicates:true});
	});
});
