'use client';

import {useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';

function dateKey(date:Date){
	return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export default function LocalClockCalendar(){
	const [now,setNow]=useState(()=>new Date());
	const [selectedDate,setSelectedDate]=useState(()=>new Date());
	const [displayMonth,setDisplayMonth]=useState(()=>{
		const today=new Date();
		return new Date(today.getFullYear(),today.getMonth(),1);
	});
	useEffect(()=>{
		const timer=window.setInterval(()=>setNow(new Date()),1000);
		return()=>window.clearInterval(timer);
	},[]);

	const seconds=now.getSeconds();
	const minutes=now.getMinutes()+seconds/60;
	const hours=now.getHours()%12+minutes/60;
	const monthName=new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(displayMonth);
	const timeText=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(now);
	const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Device local time';
	const selectedKey=dateKey(selectedDate);
	const todayKey=dateKey(now);
	const firstWeekday=new Date(displayMonth.getFullYear(),displayMonth.getMonth(),1).getDay();
	const dates=Array.from({length:42},(_,index)=>new Date(displayMonth.getFullYear(),displayMonth.getMonth(),index-firstWeekday+1));
	const weekdays=Array.from({length:7},(_,index)=>new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(new Date(2026,0,4+index)));

	function navigateMonth(amount:number){
		setDisplayMonth(current=>new Date(current.getFullYear(),current.getMonth()+amount,1));
	}
	function selectDate(date:Date){
		setSelectedDate(date);
		setDisplayMonth(new Date(date.getFullYear(),date.getMonth(),1));
	}
	function selectToday(){
		const today=new Date();
		setNow(today);
		setSelectedDate(today);
		setDisplayMonth(new Date(today.getFullYear(),today.getMonth(),1));
	}

	return <section className="user-dashboard-panel local-clock-calendar" aria-labelledby="local-clock-calendar-heading">
		<header className="user-dashboard-panel-heading"><div><span className="user-dashboard-eyebrow">DEVICE LOCAL TIME</span><h2 id="local-clock-calendar-heading">Your time</h2></div></header>
		<div className="local-clock-calendar-body">
			<div className="local-clock-column">
				<div className="local-analog-clock" role="img" aria-label={`Analog clock showing ${timeText}`}>
					<span className="local-clock-number local-clock-number-12">12</span><span className="local-clock-number local-clock-number-3">3</span><span className="local-clock-number local-clock-number-6">6</span><span className="local-clock-number local-clock-number-9">9</span>
					<span className="local-clock-hand local-clock-hour-hand" style={{transform:`translateX(-50%) rotate(${hours*30}deg)`}}/><span className="local-clock-hand local-clock-minute-hand" style={{transform:`translateX(-50%) rotate(${minutes*6}deg)`}}/><span className="local-clock-hand local-clock-second-hand" style={{transform:`translateX(-50%) rotate(${seconds*6}deg)`}}/><span className="local-clock-center"/>
				</div>
				<time className="local-clock-digital" dateTime={now.toISOString()}>{timeText}</time>
				<span className="local-clock-zone">{timeZone}</span>
			</div>
			<div className="local-calendar">
				<div className="local-calendar-heading"><button type="button" aria-label="Previous month" onClick={()=>navigateMonth(-1)}><ChevronLeft size={15}/></button><b>{monthName}</b><button type="button" aria-label="Next month" onClick={()=>navigateMonth(1)}><ChevronRight size={15}/></button></div>
				<div className="local-calendar-weekdays" aria-hidden="true">{weekdays.map((day,index)=><span key={`${day}-${index}`}>{day}</span>)}</div>
				<div className="local-calendar-days">{dates.map(date=>{
					const key=dateKey(date);
					return <button type="button" key={key} className={`local-calendar-day ${date.getMonth()!==displayMonth.getMonth()?'is-outside':''} ${key===selectedKey?'is-selected':''} ${key===todayKey?'is-today':''}`} aria-label={date.toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'})} aria-pressed={key===selectedKey} aria-current={key===todayKey?'date':undefined} onClick={()=>selectDate(date)}>{date.getDate()}</button>;
				})}</div>
				<div className="local-calendar-footer"><span>{selectedDate.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</span><button type="button" onClick={selectToday}>Today</button></div>
			</div>
		</div>
	</section>;
}