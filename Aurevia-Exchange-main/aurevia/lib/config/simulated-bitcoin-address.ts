export const SIMULATED_BTC_ADDRESS_SETTING='SIMULATED_BTC_DEPOSIT_ADDRESS';
import {address as bitcoinAddress,networks} from 'bitcoinjs-lib';



export function isBitcoinMainnetAddress(value:string){
	if(value!==value.trim()||value.length<14||value.length>90)return false;
	try{bitcoinAddress.toOutputScript(value,networks.bitcoin);return true}
	catch{return false}
}
