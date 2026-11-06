export function localDateBoundary(value:string,endOfDay=false):string|null{
	const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if(!match)return null;
	const boundary=new Date(`${value}T00:00:00`);
	if(Number.isNaN(boundary.getTime())||boundary.getFullYear()!==Number(match[1])||boundary.getMonth()+1!==Number(match[2])||boundary.getDate()!==Number(match[3]))return null;
	if(endOfDay){
		boundary.setDate(boundary.getDate()+1);
		boundary.setTime(boundary.getTime()-1);
	}
	return boundary.toISOString();
}

export function groupByLocalDate<T extends {timestamp:string}>(items:T[]){
	const groups:Array<{key:string;label:string;items:T[]}> = [];
	for(const item of items){
		const date=new Date(item.timestamp);
		const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
		const existing=groups.at(-1);
		if(existing?.key===key)existing.items.push(item);
		else groups.push({key,label:new Intl.DateTimeFormat(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'}).format(date),items:[item]});
	}
	return groups;
}