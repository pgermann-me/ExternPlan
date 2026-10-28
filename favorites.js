import {withRegionGroups} from './public/region-groups.js';
import {favoriteSchedule,favoriteWeeklyWindows} from './public/favorite-time.js';
import {personRegionPriority,personGroupIds,personDepartmentIds,allowedFunctionRegions,validatePlanningGroup,scopeAllows} from './public/organization.js';
import {DateTime} from 'luxon';
import {id,instant,iso,validateAssignment,change,audit,zone} from './domain.js';
const defaultColor='#2563eb';
export function orderedFavorites(s){return (s.favorites||[]).map((f,index)=>({f,index})).filter(({f})=>!f.deleted_at).sort((a,b)=>(a.f.sort_order??a.index)-(b.f.sort_order??b.index)||a.index-b.index).map(({f})=>f);}
const live=x=>!x.deleted_at;
const scopeTypes={function:'functions',department:'departments',group:'groups'};
function continuousDuration(p){
 const dates=['start_date','end_date'].map(key=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(p[key]||''))throw Error('Startdatum und Enddatum als YYYY-MM-DD erforderlich');const d=DateTime.fromISO(p[key],{zone});if(!d.isValid)throw Error('Ungültiges Start- oder Enddatum');return d;});
 if(dates[1]<dates[0])throw Error('Enddatum muss am oder nach dem Startdatum liegen');
 const days=dates[1].diff(dates[0],'days').days+1;
 if(days>366)throw Error('Immer darf höchstens 366 Kalendertage umfassen');
 return days*1440-1;
}
export function validateFavorite(s,p){
 s=withRegionGroups(s);
 if(typeof p.name!=='string'||!p.name.trim())throw Error('Name des Favoritendienstes erforderlich');
 const collection=scopeTypes[p.scope_type];
 if(!collection||!s[collection].some(x=>x.id===p.scope_id&&live(x)))throw Error('Funktion, Abteilung oder Gruppe für den Favoriten wählen');
 const fn=s.functions.find(f=>f.id===p.function_id&&live(f));if(fn?.region_group_ids?.length&&!fn.geo_ids.length)throw Error('Die Gebietsgruppen der Funktion enthalten noch keine Gebiete');if(!fn)throw Error('Pikett-Funktion fehlt oder wurde gelöscht');if(fn.duty_time_model==='always')throw Error('Für Funktionen mit Zeitbereich Immer werden keine Dienste geplant');
 const context={group_id:p.scope_type==='group'?p.scope_id:null,department_id:p.scope_type==='department'?p.scope_id:null,function_id:fn.id};
 if(!scopeAllows(fn,context,s.groups)||p.region_ids?.some(id=>{const r=s.regions.find(r=>r.id===id);return r&&!scopeAllows(r,context,s.groups);}))throw Error('Favorit passt nicht zu den Einschränkungen der Funktion oder Gebiete');
 if(p.scope_type==='function'&&p.scope_id!==p.function_id)throw Error('Ein Funktionsfavorit muss diese Funktion verwenden');
 if(p.schedule_mode&&!['single','weekly','continuous'].includes(p.schedule_mode))throw Error('Unbekanntes Zeitmodell');
 if(p.schedule_mode==='weekly')favoriteWeeklyWindows(p.weekly_windows);
 if(p.schedule_mode==='continuous'&&continuousDuration(p)!==p.duration_minutes)throw Error('Zeitraum und Dauer passen nicht zusammen');
 if(!Number.isSafeInteger(p.duration_minutes)||p.duration_minutes<=0)throw Error('Dienstdauer muss mindestens eine ganze Minute betragen');
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start_time||''))throw Error('Beginn als HH:mm erforderlich');
 if(p.start_weekday!=null&&(!Number.isInteger(p.start_weekday)||p.start_weekday<1||p.start_weekday>7))throw Error('Starttag muss Montag bis Sonntag oder beliebig sein');
 if(!Number.isInteger(p.priority)||p.priority<1)throw Error('Zuteilungspriorität muss mindestens 1 sein');
 if(!/^#[0-9a-f]{6}$/i.test(p.color||defaultColor))throw Error('Ungültige Favoritenfarbe');
 if(!Array.isArray(p.region_ids)||new Set(p.region_ids).size!==p.region_ids.length)throw Error('Regionen dürfen nicht doppelt gewählt sein');
 if(fn.geo_ids.length){if(!p.region_ids.length||p.region_ids.some(g=>!fn.geo_ids.includes(g)||!s.regions.some(r=>r.id===g&&live(r))))throw Error('Mindestens eine gültige, der Funktion zugeordnete Region wählen');}
 if(p.scope_type==='group'&&p.region_ids.some(id=>!allowedFunctionRegions(fn,s.groups.find(g=>g.id===p.scope_id),s.regions).includes(id)))throw Error('Region ist der Gruppe nicht zugeordnet');
 else if(!fn.geo_ids.length&&p.region_ids.length)throw Error('Ortsunabhängige Funktion hat keine Regionen');
}
export function saveFavorite(s,input){
 s.favorites??=[];const existing=input.id?s.favorites.find(f=>f.id===input.id):null;
 if(input.id&&!existing)throw Error('Favorit nicht gefunden');if(existing?.deleted_at)throw Error('Favorit wurde gelöscht');
 if(existing&&input.revision!==existing.revision)throw Error('Favorit wurde inzwischen geändert. Neu laden.');
 const p={id:existing?.id||id(),name:String(input.name??'').trim(),scope_type:input.scope_type||'function',scope_id:input.scope_id||input.function_id,function_id:input.function_id,region_ids:input.region_ids,schedule_mode:input.schedule_mode||'single',start_date:input.schedule_mode==='continuous'?input.start_date:null,end_date:input.schedule_mode==='continuous'?input.end_date:null,weekly_windows:input.schedule_mode==='weekly'?favoriteWeeklyWindows(input.weekly_windows):[],duration_minutes:input.duration_minutes,start_time:input.start_time,start_weekday:input.start_weekday??null,priority:input.priority,color:input.color||defaultColor,sort_order:existing?.sort_order??(existing?s.favorites.indexOf(existing):Math.max(-1,...s.favorites.map((f,i)=>f.sort_order??i))+1),revision:(existing?.revision||0)+1};
 if(p.schedule_mode==='weekly')Object.assign(p,{start_time:p.weekly_windows[0].start_time,duration_minutes:p.weekly_windows[0].duration_minutes,start_weekday:null});
 if(p.schedule_mode==='continuous')Object.assign(p,{duration_minutes:continuousDuration(p),start_time:'00:00',start_weekday:null});
 validateFavorite(s,p);Object.assign(p,favoriteSchedule(p));if(existing)s.favorites[s.favorites.indexOf(existing)]=p;else s.favorites.push(p);audit(s,'favorite',existing?'update':'create',existing,p);return p;
}
export function removeFavorite(s,key,revision){const p=(s.favorites||[]).find(f=>f.id===key&&live(f));if(!p)throw Error('Favorit nicht gefunden');if(Number(revision)!==p.revision)throw Error('Favorit wurde inzwischen geändert');const before={...p};p.deleted_at=iso(Date.now());audit(s,'favorite','delete',before,{...p});return {ok:true};}
export function favoriteForPerson(s,f,p){
 if(f.scope_type==='function')return true;
 if(f.scope_type==='group')return personGroupIds(p).includes(f.scope_id);
 return personDepartmentIds(p,s.groups).includes(f.scope_id);
}
export function previewFavorite(s,key,input,now=Date.now()){
 let f=(s.favorites||[]).find(f=>f.id===key&&live(f));if(!f)throw Error('Favorit nicht gefunden');if(f.schedule_mode==='continuous')f={...f,start_time:'00:00',duration_minutes:continuousDuration(f),start_weekday:null};validateFavorite(s,f);
 if(input.revision!==f.revision)throw Error('Favorit wurde inzwischen geändert. Neu laden.');
 const person=s.people.find(p=>p.employee_id===input.employee_id&&!p.deleted_at);if(!person||!favoriteForPerson(s,f,person))throw Error('Person gehört nicht zum Bereich dieses Favoriten');
 validatePlanningGroup(s,{...input,function_id:f.function_id,region_ids:f.region_ids});
 const today=DateTime.fromMillis(now,{zone}).toISODate();
 const date=input.date||today;const d=DateTime.fromISO(date,{zone});
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!d.isValid)throw Error('Ungültiges Dienst-Datum');

 const windows=f.schedule_mode==='weekly'?favoriteWeeklyWindows(f.weekly_windows).flatMap(w=>w.weekdays.map(day=>({...w,date:d.startOf('week').plus({days:day-1})}))):[{...f,date:f.schedule_mode==='continuous'?DateTime.fromISO(f.start_date,{zone}):f.start_weekday?d.startOf('week').plus({days:f.start_weekday-1}):d}];
 const segments=[];let overallStart=Infinity,overallEnd=-Infinity;
 for(const window of windows){
 const time=(!['weekly','continuous'].includes(f.schedule_mode)&&input.start_time)||window.start_time;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Beginn als HH:mm erforderlich');
 const offset=input.start_offset||'';if(!['','+01:00','+02:00'].includes(offset))throw Error('Sommer-/Winterzeit-Auswahl ungültig');
 const local=`${window.date.toISODate()}T${time}:00`;const start=instant(local+offset);if(iso(start).slice(0,19)!==local)throw Error('Ausgewählte Sommer-/Winterzeit passt nicht zur Schweizer Uhrzeit');
 const schedule=favoriteSchedule(window,time),endDate=window.date.plus({days:schedule.end_day_offset}).toISODate();if(!endDate)throw Error('Dienstdauer ist zu gross');
 const endOffset=input.end_offset||'';if(!['','+01:00','+02:00'].includes(endOffset))throw Error('Sommer-/Winterzeit-Auswahl für Ende ungültig');
 const endLocal=`${endDate}T${schedule.end_time}:00`;let end;
 try{end=instant(endLocal+endOffset);}catch(error){throw Error('Dienstende: '+error.message);}
 if(iso(end).slice(0,19)!==endLocal)throw Error('Ausgewählte Sommer-/Winterzeit passt nicht zur Schweizer Endzeit');
 if(end<=start)throw Error('Ende muss nach Beginn liegen');
 overallStart=Math.min(overallStart,start);overallEnd=Math.max(overallEnd,end);
 for(let from=start;from<end;){
  // Immer is stored as one interval; other time models retain their existing pieces.
  const to=f.schedule_mode==='continuous'?end:Math.min(from+86400000,end);
  if(segments.length>=(f.schedule_mode==='continuous'?368:366))throw Error('Zu viele Teilstücke pro Region');
  segments.push({start_on:iso(from),end_on:iso(to)});from=to;
 }
 }
 const regions=f.region_ids.length?f.region_ids:[null];const working={...s,assignments:[...s.assignments]};const assignments=[],warnings=[];let already_planned=0;
 for(const geo of regions)for(const segment of segments){if(['weekly','continuous'].includes(f.schedule_mode)&&s.assignments.some(a=>a.employee_id===person.employee_id&&a.function_id===f.function_id&&a.geodependency===geo&&a.priority===personRegionPriority(person,f.function_id,geo,f.priority)&&instant(a.start_on)===instant(segment.start_on)&&instant(a.end_on)===instant(segment.end_on))){already_planned++;continue;}const result=validateAssignment(working,{employee_id:person.employee_id,function_id:f.function_id,geodependency:geo,priority:personRegionPriority(person,f.function_id,geo,f.priority),...segment});assignments.push(result.assignment);working.assignments.push(result.assignment);warnings.push(...result.warnings);}
 return {favorite_id:f.id,start_on:iso(overallStart),end_on:iso(overallEnd),segments_per_region:segments.length,already_planned,assignments,warnings:[...new Set(warnings)]};
}
export function applyFavorite(s,key,input,now=Date.now()){
 const result=previewFavorite(s,key,input,now);
 if(!result.assignments.length)return result;
 const f=s.favorites.find(f=>f.id===key);s.assignment_styles??={};
 for(const a of result.assignments){s.assignment_styles[a.assignment_id]={favorite_id:f.id,color:f.color||defaultColor};s.assignments.push(a);change(s,'create',a);audit(s,'assignment','create',null,a);}
 audit(s,'favorite','apply',null,{name:f.name,employee_id:input.employee_id,start_on:result.start_on,end_on:result.end_on,count:result.assignments.length,already_planned:result.already_planned});
 return result;
}

export function reorderFavorites(s,ids,expected){
 const current=orderedFavorites(s),currentIds=current.map(f=>f.id);
 if(!Array.isArray(ids)||ids.length!==currentIds.length||new Set(ids).size!==ids.length||ids.some(id=>!currentIds.includes(id)))throw Error('Reihenfolge muss alle aktiven Favoriten genau einmal enthalten');
 if(!Array.isArray(expected)||JSON.stringify(expected)!==JSON.stringify(currentIds))throw Error('Favoritenliste wurde inzwischen geändert. Neu laden.');
 const before=current.map(f=>({name:f.name}));ids.forEach((id,index)=>{s.favorites.find(f=>f.id===id).sort_order=index;});
 audit(s,'favorite','reorder',before,orderedFavorites(s).map(f=>({name:f.name})));return {ok:true};
}
