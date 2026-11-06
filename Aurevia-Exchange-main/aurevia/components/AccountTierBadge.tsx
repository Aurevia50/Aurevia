import {Award} from 'lucide-react';

export default function AccountTierBadge({tier}:{tier:string}){
	if(!tier)return <span className="account-tier-badge is-unavailable">Tier unavailable</span>;
	return <span className="account-tier-badge" aria-label={`Current account tier: ${tier}`}><Award size={12} aria-hidden="true"/>{tier}</span>;
}
