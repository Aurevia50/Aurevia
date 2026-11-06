export function resolveClientStoryImage(reference:string|null){
	if(!reference||!reference.startsWith('/client-stories/'))return null;
	if(reference.includes('..')||reference.includes('\\'))return null;
	return reference;
}