export const AUTH_SESSION_MAX_AGE_SECONDS=8*60*60;

export function isAuthSessionExpired(updatedAt:Date|null,now=Date.now()){
	return !updatedAt||now-updatedAt.getTime()>=AUTH_SESSION_MAX_AGE_SECONDS*1000;
}