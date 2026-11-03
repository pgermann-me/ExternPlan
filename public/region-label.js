// Hunting territories keep their stable Geo_ID visible in every region description.
export function hunterRegionName(id,name){
 if(!/^J\d{3}$/.test(id||''))return name;
 const description=String(name??'').trim().replace(/^(?:J\d{3}(?:\s*[·:–-]\s*|\s+|$))+/,'').trim();
 return description?id+' '+description:id;
}
