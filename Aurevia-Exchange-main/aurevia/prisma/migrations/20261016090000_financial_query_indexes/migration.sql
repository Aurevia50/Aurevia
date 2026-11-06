CREATE INDEX IF NOT EXISTS "FundingRequest_userId_accountMode_currency_type_status_idx"
ON "FundingRequest"("userId", "accountMode", "currency", "type", "status");

CREATE INDEX IF NOT EXISTS "Order_userId_instrumentId_accountMode_side_status_idx"
ON "Order"("userId", "instrumentId", "accountMode", "side", "status");

CREATE INDEX IF NOT EXISTS "Position_userId_instrumentId_accountMode_side_status_idx"
ON "Position"("userId", "instrumentId", "accountMode", "side", "status");

CREATE INDEX IF NOT EXISTS "InvestmentRequest_accountMode_status_maturesAt_idx"
ON "InvestmentRequest"("accountMode", "status", "maturesAt");