import {getServerConfiguration} from './config/env';

export function getSupportContact(){
	const config=getServerConfiguration().smtp;
	return {
		email:config.supportEmail||'aureviainvest@gmail.com',
		complaintsEmail:config.complaintsEmail||config.supportEmail||'aureviainvest@gmail.com',
		phone:config.supportPhone,
	};
}

export const verificationConfig={
	expiresInMinutes:10,
	resendCooldownSeconds:60,
	maxAttempts:5,
} as const;