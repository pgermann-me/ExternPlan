// Input rows are local files, not a live SAP connection. Mapping is explicit, never guessed.
export function normalizeSapPerson(row,mapping){
 const get=key=>row[mapping[key]];
 const employee_id=String(get('employee_id')??'').trim();
 const department_id=String(get('department_id')??'').trim();
 if(!employee_id||!get('name')||!department_id)throw Error('SAP benötigt persID, Name und Abteilung');
 const contacts=get('contacts')??[];
 return {employee_id,name:String(get('name')),source:'SAP',external_id:String(get('external_id')??employee_id),department_id,group_id:null,contacts:typeof contacts==='string'?JSON.parse(contacts):contacts};
}
