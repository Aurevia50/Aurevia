import {describe,expect,it} from 'vitest';
import {FundingEvidenceError,validateFundingEvidence} from '../lib/funding-evidence';

const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);

describe('funding evidence',()=>{
	it('accepts an image screenshot with matching content type and extension',()=>{
		const file=new File([pngSignature],'payment.png',{type:'image/png'});
		expect(validateFundingEvidence(file,pngSignature,{imagesOnly:true})).toEqual({contentType:'image/png'});
	});

	it('rejects PDF attachments when a deposit screenshot is required',()=>{
		const bytes=Buffer.from('%PDF-1.7');
		const file=new File([bytes],'payment.pdf',{type:'application/pdf'});
		expect(()=>validateFundingEvidence(file,bytes,{imagesOnly:true})).toThrow(FundingEvidenceError);
	});

	it('rejects mismatched file signatures, MIME types, and extensions',()=>{
		const file=new File([pngSignature],'payment.jpg',{type:'image/jpeg'});
		expect(()=>validateFundingEvidence(file,pngSignature,{imagesOnly:true})).toThrow(FundingEvidenceError);
	});
});
