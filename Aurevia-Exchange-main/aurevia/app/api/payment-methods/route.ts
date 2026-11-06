import {NextResponse} from 'next/server';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {SUPPORTED_CURRENCIES} from '@/lib/config/simulation';
import {isBitcoinMainnetAddress,SIMULATED_BTC_ADDRESS_SETTING} from '@/lib/config/simulated-bitcoin-address';

export const dynamic='force-dynamic';

export async function GET(){
	try{
		const user=await requireUser();
		const currentUser=await db.user.findUnique({where:{id:user.id},select:{accountMode:true,status:true}});
		if(!currentUser||currentUser.status!=='ACTIVE')return NextResponse.json({error:'Funding options are unavailable.'},{status:403});
		if(currentUser.accountMode==='DEMO')return NextResponse.json({
			methods:[],
			fundingStatus:'DISABLED',
			simulationAvailable:true,
			supportedCurrencies:SUPPORTED_CURRENCIES,
			btcAddress:null,
			realFundingAvailable:false,
			realWithdrawalAvailable:false,
			manualDepositReviewAvailable:false,
			externalPaymentProcessing:'DISABLED',
		},{headers:{'Cache-Control':'private, no-store'}});
		const bitcoinSetting=await db.systemSetting.findUnique({where:{key:SIMULATED_BTC_ADDRESS_SETTING},select:{value:true}});
		const btcAddress=bitcoinSetting?.value||null;
		if(btcAddress&&!isBitcoinMainnetAddress(btcAddress))console.error('Configured BTC display address is invalid; withholding it from wallet options.');
		return NextResponse.json({
			methods:[],
			fundingStatus:'AVAILABLE',
			simulationAvailable:true,
			supportedCurrencies:SUPPORTED_CURRENCIES,
			btcAddress:btcAddress&&isBitcoinMainnetAddress(btcAddress)?btcAddress:null,
			realFundingAvailable:true,
			realWithdrawalAvailable:true,
			manualDepositReviewAvailable:true,
			externalPaymentProcessing:'DISABLED',
			internalLedgerOnly:true,
		},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
		return NextResponse.json({error:'Funding requests are temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}