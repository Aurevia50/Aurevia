export function formatUsd(value:number|string,locale='en-US'){
	return new Intl.NumberFormat(locale,{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value));
}
