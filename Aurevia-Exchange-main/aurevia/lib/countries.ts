import {getCountries,getCountryCallingCode} from 'libphonenumber-js';
import type {CountryCode} from 'libphonenumber-js';

export type SupportedCountry={code:CountryCode;name:string;dialCode:string;flag:string};
export const ibanCountryCodes=new Set('AD AE AL AT AZ BA BE BG BH BR BY CH CR CY CZ DE DK DO EE EG ES FI FO FR GB GE GI GL GR GT HR HU IE IL IQ IS IT JO KW KZ LB LC LI LT LU LV MC MD ME MK MR MT MU NL NO PK PL PS PT QA RO RS SA SC SD SE SI SK SM ST TL TN TR UA VA VG XK'.split(' '));

function flagFor(code:string){
	return [...code.toUpperCase()].map(character=>String.fromCodePoint(character.charCodeAt(0)+127397)).join('');
}

const regionNames=new Intl.DisplayNames(['en'],{type:'region'});

export const supportedCountries:SupportedCountry[]=getCountries().map(code=>({
	code,
	name:regionNames.of(code)||code,
	dialCode:`+${getCountryCallingCode(code)}`,
	flag:flagFor(code),
})).sort((left,right)=>left.code==='US'?-1:right.code==='US'?1:left.name.localeCompare(right.name,'en'));

export function findCountry(value:string){
	return supportedCountries.find(country=>country.code===value)||null;
}

export function countrySearchMatches(country:SupportedCountry,query:string){
	const search=query.trim().toLocaleLowerCase();
	if(!search)return true;
	const dialSearch=search.replace(/[\s()-]/g,'');
	return country.name.toLocaleLowerCase().includes(search)||country.code.toLocaleLowerCase().includes(search)||country.dialCode.includes(dialSearch);
}