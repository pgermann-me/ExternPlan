const fail=(message,status=503)=>{const error=Error(message);error.status=status;return error;};
export function coordinateKey(lat,lng){
 for(const [value,limit] of [[lat,90],[lng,180]])if(typeof value!=='string'&&typeof value!=='number'||String(value).trim()===''||!Number.isFinite(Number(value))||Math.abs(Number(value))>limit)throw fail('Ungültiger Kartenpunkt',400);
 return [Number(lat).toFixed(6),Number(lng).toFixed(6)];
}
export function addressResult(data,lat,lng){
 const address=data?.address||{},road=address.road||address.pedestrian||address.residential||address.footway||address.path;
 const place=address.city||address.town||address.village||address.municipality||address.hamlet;
 const street=[road,address.house_number].filter(Boolean).join(' '),locality=[address.postcode,place].filter(Boolean).join(' ');
 const label=[street,locality].filter(Boolean).join(', ')||data?.display_name||null;
 return {point:{lat:Number(lat),lng:Number(lng)},label:typeof label==='string'?label.slice(0,1000):null,kind:road&&address.house_number?'address':'place',source:'OpenStreetMap / Nominatim',attribution:'© OpenStreetMap contributors'};
}
export function searchQuery(value){
 if(typeof value!=='string')throw fail('Adresse als Text eingeben',400);
 const query=value.trim().replace(/\s+/g,' ');if(query.length<3||query.length>300)throw fail('Adresse mit 3 bis 300 Zeichen eingeben',400);return query;
}
export function searchResults(data){
 if(!Array.isArray(data))throw Error('Ungültige Antwort des Adressdienstes');
 return data.slice(0,5).flatMap(item=>{
  try{const [lat,lng]=coordinateKey(item.lat,item.lon),result=addressResult(item,lat,lng);return result.label?[{...result,label:String(item.display_name||result.label).slice(0,1000)}]:[];}catch{return [];}
 });
}
// Reverse and explicit address searches share one bounded cache and queue.
export function createGeocoder({fetchImpl=fetch,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),endpoint='https://nominatim.openstreetmap.org/reverse',searchEndpoint,userAgent='ExternPlan/1.0 (on-call planning; geocoding)',interval=1100,ttl=86400000,maxCache=500,maxQueue=5}={}){
 const base=new URL(endpoint),searchBase=searchEndpoint?new URL(searchEndpoint):new URL(base);if(!searchEndpoint)searchBase.pathname=searchBase.pathname.replace(/reverse\/?$/,'search');
 if(base.protocol!=='https:'||searchBase.protocol!=='https:')throw Error('Adressdienst benötigt HTTPS');
 const cache=new Map(),pending=new Map();let tail=Promise.resolve(),nextStart=0;
 const request=async(key,url,parse)=>{
  const cached=cache.get(key);if(cached&&cached.expires>now()){cache.delete(key);cache.set(key,cached);return cached.result;}
  cache.delete(key);if(pending.has(key))return pending.get(key);
  if(pending.size>=maxQueue)throw fail('Die Adresssuche ist ausgelastet. Bitte gleich nochmals versuchen.',429);
  const operation=tail.then(async()=>{
   const delay=nextStart-now();if(delay>0)await wait(delay);nextStart=now()+interval;
   url.searchParams.set('format','jsonv2');url.searchParams.set('addressdetails','1');url.searchParams.set('accept-language','de-CH,de');
   let result;
   try{
    const response=await fetchImpl(url,{headers:{'User-Agent':userAgent,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(6000)});
    if(response.status===404)result=parse(null);
    else{if(!response.ok)throw Error('provider unavailable');const data=await response.json();result=parse(data?.error?null:data);}
   }catch{throw fail('Die Adresse konnte beim Kartendienst momentan nicht ermittelt werden.');}
   cache.set(key,{result,expires:now()+ttl});while(cache.size>maxCache)cache.delete(cache.keys().next().value);return result;
  });
  tail=operation.catch(()=>{});pending.set(key,operation);try{return await operation;}finally{pending.delete(key);}
 };
 return {
  reverse:async(lat,lng)=>{const [latitude,longitude]=coordinateKey(lat,lng),url=new URL(base);url.searchParams.set('lat',latitude);url.searchParams.set('lon',longitude);url.searchParams.set('zoom','18');return request('reverse:'+latitude+','+longitude,url,data=>addressResult(data,latitude,longitude));},
  search:async(value)=>{const query=searchQuery(value),url=new URL(searchBase);url.searchParams.set('q',query);url.searchParams.set('limit','5');url.searchParams.set('viewbox','8.78,47.60,9.70,46.85');return request('search:'+query.toLocaleLowerCase('de-CH'),url,data=>({results:data===null?[]:searchResults(data),source:'OpenStreetMap / Nominatim',attribution:'© OpenStreetMap contributors'}));}
 };
}
export const createReverseGeocoder=options=>createGeocoder(options).reverse;
