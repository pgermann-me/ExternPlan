// Replace this adapter with a real ELS transport. Return success only after acknowledgement.
export const simulatedElsAdapter = {
  syncPerson(els, person) {
    els.people[person.employee_id]={employee_id:person.employee_id,name:person.name,contacts:person.contacts,status:'Import bestätigt'};
  },
  applyAssignment(els, change) {
    const current=els.assignments[change.assignment_id];
    if(current && current.revision>=change.revision)return {acknowledged:true,stale:true};
    if(change.action!=='delete'&&!els.people[change.employee_id])return {acknowledged:false,error:'Person im ELS fehlt'};
    els.assignments[change.assignment_id]={...change,status:'Import bestätigt',deleted:change.action==='delete'};
    return {acknowledged:true};
  }
};
