const formatter=new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function swissTime(value){
 if(!value)return '—';
 const date=new Date(value);if(Number.isNaN(date.valueOf()))return String(value);
 const p=Object.fromEntries(formatter.formatToParts(date).map(p=>[p.type,p.value]));
 return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}
export function swissDate(value){if(!value)return '';const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}.${m[2]}.${m[1]}`:swissTime(value).split(' ')[0];}
export function localDate(value){
 const m=String(value).trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);if(!m)throw Error('Datum als TT.MM.JJJJ eingeben');
 const iso=`${m[3]}-${m[2]}-${m[1]}`;const date=new Date(iso+'T00:00:00Z');
 if(Number.isNaN(date.valueOf())||date.toISOString().slice(0,10)!==iso)throw Error('Ungültiges Datum');return iso;
}
export function localDateTime(value){
 const m=String(value).trim().match(/^(\d{2}\.\d{2}\.\d{4}) (\d{2}):(\d{2})$/);
 if(!m||Number(m[2])>23||Number(m[3])>59)throw Error('Zeit als TT.MM.JJJJ HH:mm eingeben');
 return `${localDate(m[1])}T${m[2]}:${m[3]}:00`;
}
export function displayTimes(value){
 if(Array.isArray(value))return value.map(displayTimes);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,displayTimes(v)]));
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value))return swissTime(value);
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return swissDate(value);
 return value;
}
