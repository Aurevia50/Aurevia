export type PushBrowserFeatures={
	secureContext:boolean;
	serviceWorker:boolean;
	pushManager:boolean;
	notifications:boolean;
};

export function supportsBrowserPush(features:PushBrowserFeatures){
	return features.secureContext&&features.serviceWorker&&features.pushManager&&features.notifications;
}

export function requestPushPermission(notificationApi:Pick<typeof Notification,'permission'|'requestPermission'>){
	if(notificationApi.permission!=='default')return Promise.resolve(notificationApi.permission);
	return notificationApi.requestPermission();
}
