export const contactFields=[
 {type:'phone_mobile',label:'Telefon Mobil',input:'tel',aliases:['phone_mobile','Telefon Mobil','mobile']},
 {type:'phone_business',label:'Telefon Geschäft',input:'tel',aliases:['phone_business','Telefon Geschäft','business']},
 {type:'phone_private',label:'Telefon Privat',input:'tel',aliases:['phone_private','Telefon Privat','private']},
 {type:'email',label:'E-Mail',input:'email',aliases:['email','E-Mail','Email']}
];
export function sortedContacts(contacts){
 const rank=c=>{const i=contactFields.findIndex(f=>f.aliases.includes(c.type));return i<0?contactFields.length:i;};
 const priority=c=>Number(c.priority)>0?Number(c.priority):Infinity;
 return [...contacts].sort((a,b)=>(priority(a)-priority(b)||rank(a)-rank(b)));
}
export function contactName(type){return contactFields.find(f=>f.aliases.includes(type))?.label||type;}
export const businessAddressFields=[['street','Strasse'],['streetNumber','Hausnummer'],['zipCode','PLZ'],['city','Ort'],['additionalInfo','Adresszusatz'],['country','Land (optional)']];
