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
 const t=favoriteSchedule(f),days=['Mo','Di','Mi','Do','Fr','Sa','So'];
 const endDay=f.start_weekday?' '+days[(f.start_weekday-1+t.end_day_offset)%7]:'';
 const end=t.end_day_offset===0?'↓'+endDay:t.end_day_offset===1?'→'+endDay:`→${endDay} (+${t.end_day_offset} Tage)`;
 return `${f.start_weekday?days[f.start_weekday-1]+' ':''}↓ ${t.start_time} – ${end} ${t.end_time}`;
}
