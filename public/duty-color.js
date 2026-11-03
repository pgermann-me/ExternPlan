const palette=['#a4470c','#2563eb','#0891b2','#7c3aed','#d97706','#9d174d'];
export function dutyColor(assignment,styles={}){
 const chosen=styles[assignment.assignment_id]?.color;
 if(/^#[0-9a-f]{6}$/i.test(chosen||''))return chosen;
 const hash=[...String(assignment.geodependency||assignment.function_id)].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);
 return palette[hash%palette.length];
}
