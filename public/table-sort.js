const collator=new Intl.Collator('de-CH',{sensitivity:'base',numeric:true});
// Reorder existing rows so row actions, filters and selections remain intact.
export function bindTableSort(table,{columns,preference={}}){
 const headers=[...table.tHead.rows[0].cells];
 function apply(){
  for(const column of columns){const header=headers[column],active=preference.column===column;header.setAttribute('aria-sort',active?(preference.direction==='desc'?'descending':'ascending'):'none');header.querySelector('button').title=active&&preference.direction!=='desc'?'Absteigend sortieren':'Aufsteigend sortieren';}
  if(!columns.includes(preference.column))return;
  const body=table.tBodies[0],rows=[...body.rows],data=rows.filter(row=>row.cells.length>preference.column&&row.cells[0].colSpan===1),other=rows.filter(row=>!data.includes(row));
  const text=row=>(row.cells[preference.column].textContent||'').replace(/\s+/g,' ').trim();data.sort((a,b)=>collator.compare(text(a),text(b))*(preference.direction==='desc'?-1:1));
  const fragment=document.createDocumentFragment();for(const row of [...data,...other])fragment.append(row);body.append(fragment);
 }
 for(const column of columns){const header=headers[column],label=header.textContent.trim(),button=document.createElement('button');button.type='button';button.className='table-sort-button';button.textContent=label;button.setAttribute('aria-label',label+' alphabetisch sortieren');header.classList.add('sortable-heading');header.replaceChildren(button);button.onclick=()=>{preference.direction=preference.column===column&&preference.direction!=='desc'?'desc':'asc';preference.column=column;apply();};}
 apply();return {apply};
}
