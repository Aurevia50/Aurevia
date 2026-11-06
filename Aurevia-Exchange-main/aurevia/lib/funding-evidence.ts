import {hasMatchingFileExtension} from './private-storage';

export const maxFundingEvidenceBytes=5*1024*1024;

const receiptTypes={
	pdf:'application/pdf',
	png:'image/png',
	jpeg:'image/jpeg',
	webp:'image/webp',
} as const;

export class FundingEvidenceError extends Error {
	constructor(message:string,readonly status:number){
		super(message);
		this.name='FundingEvidenceError';
	}
}

export function validateFundingEvidence(file:File,bytes:Buffer,{imagesOnly=false}:{imagesOnly?:boolean}={}){
	if(file.size===0)throw new FundingEvidenceError('Choose a non-empty evidence file.',400);
	if(file.size>maxFundingEvidenceBytes||bytes.length>maxFundingEvidenceBytes)throw new FundingEvidenceError('Evidence must be 5 MB or smaller.',413);
	let format:keyof typeof receiptTypes|undefined;
	if(bytes.subarray(0,5).toString()==='%PDF-')format='pdf';
	else if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))format='png';
	else if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)format='jpeg';
	else if(bytes.length>=12&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')format='webp';
	if(!format||receiptTypes[format]!==file.type||!hasMatchingFileExtension(file.name,file.type)||(imagesOnly&&format==='pdf')){
		throw new FundingEvidenceError(imagesOnly?'Upload a valid PNG, JPEG, or WebP screenshot.':'Evidence must be a valid PDF, PNG, JPEG, or WebP file with a matching extension.',415);
	}
	return {contentType:receiptTypes[format]};
}
