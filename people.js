// Existing combined names are retained verbatim; they are never guessed into components.
export function manualPerson(input, previous, employeeId) {
  const first_name=String(input.first_name??previous?.first_name??'').trim();
  const last_name=String(input.last_name??previous?.last_name??'').trim();
  if ((!previous || first_name || last_name) && (!first_name || !last_name)) {
    throw Error('Vorname und Name sind erforderlich');
  }
  return {
    ...previous,
    employee_id: previous?.employee_id || employeeId,
    first_name,
    last_name,
    name: first_name || last_name ? [first_name,last_name].filter(Boolean).join(' ') : previous.name,
    source:'manual',
    external_id:input.external_id||null,
    department_id:input.department_id||null,
    group_id:input.group_id||null,
    contacts:(input.contacts??previous?.contacts??[]).map(c=>({...c,priority:c.priority??0}))
  };
}
