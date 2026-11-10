// Legacy fallback until an administrator publishes the first managed Terms version.
export const CURRENT_TERMS_VERSION='2026-10-27';

export function hasAcceptedCurrentTerms(acceptedVersion:string|null|undefined,currentVersion=CURRENT_TERMS_VERSION){
	return acceptedVersion===currentVersion;
}
