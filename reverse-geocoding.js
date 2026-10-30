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
// One queue and cache per server instance: no browser calls, keys, identities or
// duty details are sent to the external provider. Only explicit clicked points.
export function createReverseGeocoder({fetchImpl=fetch,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),endpoint='https://nominatim.openstreetmap.org/reverse',userAgent='ExternPlan/1.0 (on-call planning; reverse geocoding)',interval=1100,ttl=86400000,maxCache=500,maxQueue=5}={}){
 const base=new URL(endpoint);if(base.protocol!=='https:')throw Error('Adressdienst benötigt HTTPS');
 const cache=new Map(),pending=new Map();let tail=Promise.resolve(),nextStart=0;
 return async(lat,lng)=>{
  const [latitude,longitude]=coordinateKey(lat,lng),key=latitude+','+longitude,cached=cache.get(key);
  if(cached&&cached.expires>now()){cache.delete(key);cache.set(key,cached);return cached.result;}
  cache.delete(key);if(pending.has(key))return pending.get(key);
  if(pending.size>=maxQueue)throw fail('Die Adresssuche ist ausgelastet. Bitte gleich nochmals versuchen.',429);
  const request=tail.then(async()=>{
   const delay=nextStart-now();if(delay>0)await wait(delay);nextStart=now()+interval;
   const url=new URL(base);url.searchParams.set('format','jsonv2');url.searchParams.set('lat',latitude);url.searchParams.set('lon',longitude);url.searchParams.set('zoom','18');url.searchParams.set('addressdetails','1');url.searchParams.set('accept-language','de-CH,de');
   let result;
   try{
    const response=await fetchImpl(url,{headers:{'User-Agent':userAgent,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(6000)});
    if(response.status===404)result=addressResult(null,latitude,longitude);
    else{if(!response.ok)throw Error('provider unavailable');const data=await response.json();if(data?.error)result=addressResult(null,latitude,longitude);else result=addressResult(data,latitude,longitude);}
   }catch{throw fail('Die Adresse konnte beim Kartendienst momentan nicht ermittelt werden.');}
   cache.set(key,{result,expires:now()+ttl});while(cache.size>maxCache)cache.delete(cache.keys().next().value);
   return result;
  });
  tail=request.catch(()=>{});pending.set(key,request);
  try{return await request;}finally{pending.delete(key);}
 };
}
