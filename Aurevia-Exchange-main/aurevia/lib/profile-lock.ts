export const PROFILE_LOCK_MONTHS=2;

/** End of the post-verification lock window (verifiedAt + 2 months). */
export function profileEditDeadline(verifiedAt:Date|null){
	if(!verifiedAt)return null;
	const year=verifiedAt.getUTCFullYear();
	const month=verifiedAt.getUTCMonth()+PROFILE_LOCK_MONTHS;
	const day=verifiedAt.getUTCDate();
	const lastDay=new Date(Date.UTC(year,month+1,0)).getUTCDate();
	const deadline=new Date(Date.UTC(year,month,Math.min(day,lastDay),verifiedAt.getUTCHours(),verifiedAt.getUTCMinutes(),verifiedAt.getUTCSeconds(),verifiedAt.getUTCMilliseconds()));
	return deadline;
}

/**
 * After verification completes, personal profile fields stay locked until the deadline.
 * Locked while verifiedAt is set and now is still within the 2-month window.
 */
export function isProfileLocked(verifiedAt:Date|null,now=new Date()){
	if(!verifiedAt)return false;
	const deadline=profileEditDeadline(verifiedAt);
	if(!deadline)return false;
	return now<deadline;
}
