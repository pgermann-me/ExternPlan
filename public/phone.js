const phoneTypes=new Set(['phone_mobile','phone_business','phone_private','phone','telefon','telefon mobil','telefon mobile','telefon geschäft','telefon geschaeft','telefon privat','mobile','mobil','business','private','natel','festnetz']);
export const isPhoneContact=type=>phoneTypes.has(String(type??'').trim().toLocaleLowerCase('de-CH'));
export function normalizePhone(value){
 if(typeof value!=='string')throw Error('Telefonnummer als Text eingeben');
 let number=value.trim();
 // The optional domestic trunk zero is not part of an international number.
 if(/^\+|^00/.test(number))number=number.replace(/\(\s*0\s*\)/g,'');
 number=number.replace(/[\s()./\-\u2010-\u2015]/g,'');
 if(number.startsWith('00'))number='+'+number.slice(2);
 if(/^0[1-9]\d{8}$/.test(number))number='+41'+number.slice(1);
 else if(/^[1-9]\d{8}$/.test(number))number='+41'+number;
 else if(/^41[1-9]\d{8}$/.test(number))number='+'+number;
 number=number.replace(/^\+410(?=\d{9}$)/,'+41');
 if(!/^\+[1-9]\d{6,14}$/.test(number)||number.startsWith('+41')&&!/^\+41[1-9]\d{8}$/.test(number))throw Error('Ungültige Telefonnummer. Schweizer Nummer z. B. 079 578 68 88 oder internationale Nummer mit +Ländervorwahl eingeben.');
 return number;
}
export function normalizePersonContacts(contacts,previous=[]){
 return contacts.map(contact=>{
  let value=contact.value;
  if(isPhoneContact(contact.type)){
   try{value=normalizePhone(value);}catch(error){
    // Retain unchanged historical free text when editing other personal details.
    if(!previous.some(old=>old.type===contact.type&&old.value===value))throw error;
   }
  }
  return {...contact,value,priority:contact.priority??0};
 });
}
