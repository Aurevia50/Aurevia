import {AccountMode,OrderStatus,PositionStatus,Prisma} from '@prisma/client';

export const activitySourceSchemaValues=['order','position','investment','funding','ledger','notification'] as const;
export type ManagedActivitySource=typeof activitySourceSchemaValues[number];
export type ActivityVisibilityAction='archive'|'restore'|'hide'|'unhide';

export async function updateActivityVisibility(
  tx:Prisma.TransactionClient,
  input:{userId:string;accountMode:AccountMode;source:ManagedActivitySource;id:string;action:ActivityVisibilityAction},
){
  const {userId,accountMode,source,id,action}=input;
  if(accountMode===AccountMode.DEMO&&source!=='order'&&source!=='position'&&source!=='notification')return {eligible:false,reason:'DEMO activity management is limited to practice trades, positions, and mode-scoped notifications.'};
  if(source==='notification'){
    const row=await tx.notification.findFirst({where:{id,userId,OR:[{accountMode},{accountMode:null}]},select:{id:true}});
    if(!row)return {eligible:false,reason:'Notification not found for this account mode.'};
    if(action==='archive'||action==='restore'){
      const updated=await tx.notification.updateMany({where:{id,userId,OR:[{accountMode},{accountMode:null}],...(action==='restore'?{archivedAt:{not:null}}:{})},data:{archivedAt:action==='archive'?new Date():null}});
      return updated.count?{eligible:true,reason:null}:{eligible:false,reason:'Notification is no longer available to update.'};
    }
  }else if(source==='order'){
    const row=await tx.order.findFirst({where:{id,userId,accountMode},select:{id:true,status:true}});
    if(!row)return {eligible:false,reason:'Activity record not found for this account.'};
    if(row.status===OrderStatus.OPEN||row.status===OrderStatus.PARTIALLY_FILLED)return {eligible:false,reason:'An open order cannot be archived or removed from the feed.'};
  }else if(source==='position'){
    const row=await tx.position.findFirst({where:{id,userId,accountMode},select:{id:true,status:true}});
    if(!row)return {eligible:false,reason:'Activity record not found for this account.'};
    if(row.status===PositionStatus.OPEN)return {eligible:false,reason:'An open position cannot be archived or removed from the feed.'};
  }else if(source==='investment'){
    const row=await tx.investmentRequest.findFirst({where:{id,userId,accountMode},select:{id:true}});
    if(!row)return {eligible:false,reason:'Activity record not found for this account.'};
  }else if(source==='funding'){
    const row=await tx.fundingRequest.findFirst({where:{id,userId,accountMode},select:{id:true}});
    if(!row)return {eligible:false,reason:'Activity record not found for this account.'};
  }else{
    const row=await tx.ledgerEntry.findFirst({where:{transactionId:id,account:{userId,accountMode}},select:{id:true}});
    if(!row)return {eligible:false,reason:'Activity record not found for this account.'};
  }

  const archivedAt=action==='archive'?new Date():action==='restore'?null:undefined;
  const hiddenAt=action==='hide'?new Date():action==='unhide'||action==='restore'?null:undefined;
  await tx.activityVisibilityPreference.upsert({
    where:{userId_accountMode_sourceType_sourceId:{userId,accountMode,sourceType:source,sourceId:id}},
    create:{userId,accountMode,sourceType:source,sourceId:id,archivedAt:archivedAt??null,hiddenAt:hiddenAt??null},
    update:{...(archivedAt!==undefined?{archivedAt}:{}),...(hiddenAt!==undefined?{hiddenAt}:{})},
  });
  return {eligible:true,reason:null};
}

export async function permanentlyDeleteActivityNotification(tx:Prisma.TransactionClient,userId:string,accountMode:AccountMode,id:string){
  const where={id,userId,isRead:true,pushOutbox:null,OR:[{accountMode},{accountMode:null}]};
  const eligible=await tx.notification.findFirst({where,select:{id:true}});
  if(!eligible)return {eligible:false,reason:'Only read notifications without delivery history in this account mode may be permanently deleted.'};
  const deleted=await tx.notification.deleteMany({where});
  if(deleted.count)await tx.activityVisibilityPreference.deleteMany({where:{userId,sourceType:'notification',sourceId:id}});
  return deleted.count?{eligible:true,reason:null}:{eligible:false,reason:'Notification was changed or removed before deletion.'};
}

export async function hideEligibleActivityHistory(tx:Prisma.TransactionClient,userId:string,accountMode:AccountMode){
  const now=new Date();
  const cap=1000;
  const existing=await tx.activityVisibilityPreference.findMany({where:{userId,accountMode,hiddenAt:{not:null}},select:{sourceType:true,sourceId:true}});
  const hiddenBySource=new Map<string,string[]>();
  for(const item of existing){const ids=hiddenBySource.get(item.sourceType)||[];ids.push(item.sourceId);hiddenBySource.set(item.sourceType,ids);}
  const remaining=(sourceType:string)=>{const ids=hiddenBySource.get(sourceType)||[];return ids.length?{id:{notIn:ids}}:{}};
  const ledgerIds=hiddenBySource.get('ledger')||[];
  const remainingLedger=ledgerIds.length?{transactionId:{notIn:ledgerIds}}:{};
  const [orders,positions,investments,funding,ledger,notifications]=await Promise.all([
    tx.order.findMany({where:{userId,accountMode,status:{in:['FILLED','CANCELLED','REJECTED']},...remaining('order')},select:{id:true},take:cap}),
    tx.position.findMany({where:{userId,accountMode,status:'CLOSED',...remaining('position')},select:{id:true},take:cap}),
    accountMode===AccountMode.REAL?tx.investmentRequest.findMany({where:{userId,accountMode,...remaining('investment')},select:{id:true},take:cap}):[],
    accountMode===AccountMode.REAL?tx.fundingRequest.findMany({where:{userId,accountMode,...remaining('funding')},select:{id:true},take:cap}):[],
    accountMode===AccountMode.REAL?tx.ledgerEntry.findMany({where:{account:{userId,accountMode},...remainingLedger},select:{transactionId:true},distinct:['transactionId'],take:cap}):[],
    tx.notification.findMany({where:{userId,OR:[{accountMode},{accountMode:null}],...remaining('notification')},select:{id:true},take:cap}),
  ]);
  const records=[
    ...orders.map(item=>({sourceType:'order',sourceId:item.id})),
    ...positions.map(item=>({sourceType:'position',sourceId:item.id})),
    ...investments.map(item=>({sourceType:'investment',sourceId:item.id})),
    ...funding.map(item=>({sourceType:'funding',sourceId:item.id})),
    ...ledger.map(item=>({sourceType:'ledger',sourceId:item.transactionId})),
    ...notifications.map(item=>({sourceType:'notification',sourceId:item.id})),
  ];
  for(const sourceType of new Set(records.map(record=>record.sourceType))){
    const ids=records.filter(record=>record.sourceType===sourceType).map(record=>record.sourceId);
    await tx.activityVisibilityPreference.updateMany({where:{userId,accountMode,sourceType,sourceId:{in:ids}},data:{hiddenAt:now}});
  }
  if(records.length)await tx.activityVisibilityPreference.createMany({data:records.map(record=>({userId,accountMode,...record,hiddenAt:now})),skipDuplicates:true});
  return {affected:records.length,capped:[orders,positions,investments,funding,ledger,notifications].some(rows=>rows.length===cap),records};
}
