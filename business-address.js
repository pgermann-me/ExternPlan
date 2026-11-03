export function businessAddress(value,defaultType='BusinessStandort'){
 if(value==null)return null;
 if(typeof value!=='object'||Array.isArray(value))throw Error('Geschäftliche Adresse muss ein Objekt sein');
 const type=value.type||defaultType;if(!['BusinessStandort','BusinessPostal'].includes(type))throw Error('Unbekannte geschäftliche Adressart');
 const address={type};for(const key of ['street','streetNumber','additionalInfo','zipCode','city','country']){if(value[key]!=null&&typeof value[key]!=='string')throw Error('Adressfelder müssen Text sein');address[key]=(value[key]||'').trim();}
 return Object.entries(address).some(([key,value])=>key!=='type'&&value)?address:null;
}
