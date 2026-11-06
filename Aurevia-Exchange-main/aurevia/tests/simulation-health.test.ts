import {afterEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
	queryRaw:vi.fn(),
	ledgerAccountCount:vi.fn(),
	ledgerTransactionFindMany:vi.fn(),
	instrumentFindFirst:vi.fn(),
	orderCount:vi.fn(),
	executionCount:vi.fn(),
	fundingRequestCount:vi.fn(),
	investmentRequestCount:vi.fn(),
	nextPrice:vi.fn(),
}));

vi.mock('../lib/db',()=>({db:{
	$queryRaw:mocks.queryRaw,
	ledgerAccount:{count:mocks.ledgerAccountCount},
	ledgerTransaction:{findMany:mocks.ledgerTransactionFindMany,count:vi.fn()},
	instrument:{findFirst:mocks.instrumentFindFirst},
	order:{count:mocks.orderCount},
	execution:{count:mocks.executionCount},
	fundingRequest:{count:mocks.fundingRequestCount},
	investmentRequest:{count:mocks.investmentRequestCount},
}}));
vi.mock('../lib/market',()=>({nextPrice:mocks.nextPrice}));

import {getInternalSimulationHealth} from '../lib/providers/simulation-health';

afterEach(()=>vi.clearAllMocks());

function configureHealthyChecks(){
	mocks.queryRaw.mockResolvedValue([{ '?column?':1 }]);
	mocks.ledgerAccountCount.mockResolvedValue(1);
	mocks.ledgerTransactionFindMany.mockResolvedValue([]);
	mocks.instrumentFindFirst.mockResolvedValue({price:'100',updatedAt:new Date()});
	mocks.orderCount.mockResolvedValue(0);
	mocks.executionCount.mockResolvedValue(0);
	mocks.fundingRequestCount.mockResolvedValue(0);
	mocks.investmentRequestCount.mockResolvedValue(0);
	mocks.nextPrice.mockReturnValue(100.1);
}

describe('internal simulation service health',()=>{
	it('checks database-backed services and keeps every external money capability disabled',async()=>{
		configureHealthyChecks();
		const health=await getInternalSimulationHealth(true);
		expect(health).toMatchObject({
			simulationEngine:'AVAILABLE',accountLedger:'AVAILABLE',adminAuthorization:'AVAILABLE',
			simulatedTradeExecution:'AVAILABLE',simulatedDepositsAndWithdrawals:'AVAILABLE',simulatedInvestmentSettlement:'AVAILABLE',
			externalBrokerExecution:'DISABLED',externalPaymentProcessing:'DISABLED',externalInvestmentSettlement:'DISABLED',externalMoneyMovement:'DISABLED',
		});
		expect(mocks.queryRaw).toHaveBeenCalledOnce();
		expect(mocks.ledgerTransactionFindMany).toHaveBeenCalledOnce();
		expect(mocks.instrumentFindFirst).toHaveBeenCalledOnce();
	});

	it('reports ledger and market failures instead of inferring availability from simulation configuration',async()=>{
		configureHealthyChecks();
		mocks.ledgerTransactionFindMany.mockResolvedValue([{entries:[{type:'DEBIT',amount:{toString:()=> '10'}},{type:'CREDIT',amount:{toString:()=> '9'}}]}]);
		mocks.instrumentFindFirst.mockResolvedValue(null);
		const health=await getInternalSimulationHealth(true);
		expect(health.accountLedger).toBe('UNAVAILABLE');
		expect(health.simulatedTradeExecution).toBe('UNAVAILABLE');
		expect(health.simulationEngine).toBe('UNAVAILABLE');
		expect(health.simulatedDepositsAndWithdrawals).toBe('UNAVAILABLE');
	});

	it('reports database outage and unavailable administrator authorization',async()=>{
		configureHealthyChecks();
		mocks.queryRaw.mockRejectedValue(new Error('database offline'));
		const health=await getInternalSimulationHealth(false);
		expect(health.database).toBe('UNAVAILABLE');
		expect(health.simulationEngine).toBe('UNAVAILABLE');
		expect(health.adminAuthorization).toBe('UNAVAILABLE');
		expect(health.externalBrokerExecution).toBe('DISABLED');
	});
});
