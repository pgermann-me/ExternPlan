// Nominal hours/minutes define clock times, independently of daylight saving time.
export function favoriteSchedule(f,startTime=f.start_time){
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime||'')||!Number.isSafeInteger(f.duration_minutes)||f.duration_minutes<=0)throw Error('Gültige Startzeit und Dauer erforderlich');
 const [hours,minutes]=startTime.split(':').map(Number),total=hours*60+minutes+f.duration_minutes;
 if(!Number.isSafeInteger(total))throw Error('Dienstdauer ist zu gross');
 return {start_time:startTime,end_time:String(Math.floor(total%1440/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0'),end_day_offset:Math.floor(total/1440)};
}
export function favoriteDurationFromEnd(startTime,endTime,endDayOffset){
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime||'')||!/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(endTime||'')||!Number.isSafeInteger(endDayOffset)||endDayOffset<0)throw Error('Gültige Startzeit, Endzeit und Endtag erforderlich');
 const minutes=time=>{const [h,m]=time.split(':').map(Number);return h*60+m;};
 const duration=endDayOffset*1440+minutes(endTime)-minutes(startTime);
 if(!Number.isSafeInteger(duration)||duration<=0)throw Error('Das Ende muss nach dem Beginn liegen; Endtag prüfen');
 return duration;
}
export function favoriteTimeLabel(f){
 if(f.schedule_mode==='continuous'){const date=d=>String(d||'').split('-').reverse().join('.');return `Immer: ${date(f.start_date)} 00:00 – ${date(f.end_date)} 23:59`;}

 if(f.schedule_mode==='weekly')return favoriteWeeklyWindows(f.weekly_windows).map(w=>{const days=['Mo','Di','Mi','Do','Fr','Sa','So'],d=w.weekdays;const label=d.length>1&&d.at(-1)-d[0]===d.length-1?days[d[0]-1]+'–'+days[d.at(-1)-1]:d.map(n=>days[n-1]).join(', ');return label+': '+favoriteTimeLabel(w);}).join('; ');
 const t=favoriteSchedule(f),days=['Mo','Di','Mi','Do','Fr','Sa','So'];
 const endDay=f.start_weekday?' '+days[(f.start_weekday-1+t.end_day_offset)%7]:'';
 const end=t.end_day_offset===0?endDay.trim():t.end_day_offset===1?'⇒'+endDay:`⇒${endDay} (+${t.end_day_offset} Tage)`;
 return `${f.start_weekday?days[f.start_weekday-1]+' ':''}${t.start_time} – ${end?end+' ':''}${t.end_time}`;
}

export function favoriteWeeklyWindows(windows){
 if(!Array.isArray(windows)||!windows.length||windows.length>50)throw Error('Wochenmuster benötigt 1 bis 50 Zeitfenster');
 const result=windows.map(w=>{
  if(!Array.isArray(w.weekdays)||!w.weekdays.length||new Set(w.weekdays).size!==w.weekdays.length||w.weekdays.some(d=>!Number.isInteger(d)||d<1||d>7))throw Error('Für jedes Zeitfenster eindeutige Wochentage wählen');
  if(!Number.isInteger(w.end_day_offset)||w.end_day_offset<0||w.end_day_offset>7)throw Error('Endtag eines Wochenzeitfensters muss zwischen 0 und 7 liegen');
  const duration_minutes=favoriteDurationFromEnd(w.start_time,w.end_time,w.end_day_offset),schedule=favoriteSchedule({start_time:w.start_time,duration_minutes});
  return {weekdays:[...w.weekdays].sort((a,b)=>a-b),...schedule,duration_minutes};
 });
 const intervals=result.flatMap(w=>w.weekdays.map(day=>{const [h,m]=w.start_time.split(':').map(Number),start=(day-1)*1440+h*60+m;return [start,start+w.duration_minutes];}));
 for(let i=0;i<intervals.length;i++)for(let j=i;j<intervals.length;j++)for(const shift of [-10080,0,10080]){
  if(i===j&&shift===0)continue;const a=intervals[i],b=intervals[j];if(Math.max(a[0],b[0]+shift)<Math.min(a[1],b[1]+shift))throw Error('Zeitfenster des Wochenmusters überschneiden sich');
 }
 return result;
}
