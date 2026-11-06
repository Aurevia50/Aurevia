import type {IdentityComplianceProvider} from './contracts';

let identityProvider:IdentityComplianceProvider|null=null;

export function getIdentityComplianceProvider(){return identityProvider;}

export function registerIdentityComplianceProvider(provider:IdentityComplianceProvider){
	if(identityProvider)throw new Error('IDENTITY_PROVIDER_ALREADY_REGISTERED');
	identityProvider=provider;
}
