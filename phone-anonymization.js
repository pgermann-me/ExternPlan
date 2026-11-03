import {isPhoneContact} from './public/phone.js';
export const anonymizedPhone='[anonymisiert]';
const phoneKey=/^(?:phone|phones|phone_number|phoneNumber|telephone|telephone_number|tel|telefon|telefonnummer|natel|festnetz|fax|mobile|mobil|phone_mobile|phone_business|phone_private|tel_pikett)$/i;
const identifierKey=key=>/(?:^id$|_ids?$|Id$|ID$)/.test(key);
// Preserve identifiers and dates; phone fields are replaced independently of formatting.
const swissNumber=/(?<![\p{L}\p{N}@])(?:(?:\+41|0041)[ \t()./\-]*(?:\(0\)[ \t()./\-]*|0)?|0)[1-9](?:[ \t()./\-]*\d){8}(?![\p{L}\p{N}@])/gu;
const internationalNumber=/(?<![\p{L}\p{N}@])\+[1-9]\d{6,14}(?![\p{L}\p{N}@])/gu;
export function anonymizePhones(source){
 let replacements=0;
 const replace=value=>{if(value===null||value===undefined||value===''||value===anonymizedPhone)return value;replacements++;return anonymizedPhone;};
 function visit(value,key=''){
  if(phoneKey.test(key)&&(typeof value==='string'||typeof value==='number'))return replace(value);
  if(Array.isArray(value))return value.map(item=>visit(item,key));
  if(value&&typeof value==='object'){
   const phoneContact=isPhoneContact(value.type)||/^(?:telefon|phone|mobile|mobil|natel|fax)\b/i.test(String(value.type||''));
   const emailContact=/^(?:email|e-mail)$/i.test(String(value.type||''));
   return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,(/^(?:email|e_mail|e-mail)$/i.test(name)||emailContact&&name==='value')?item:(phoneContact&&name==='value'||phoneKey.test(name))&&(typeof item==='string'||typeof item==='number')?replace(item):visit(item,name)]));
  }
  if(typeof value!=='string'||identifierKey(key))return value;
  // Older imports can retain structured source data as a JSON string.
  if(/^[\[{]/.test(value.trim())){try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==='object'){const before=replacements,result=visit(parsed);return replacements!==before?JSON.stringify(result):value;}}catch{}}
  return value.replace(swissNumber,()=>{replacements++;return anonymizedPhone;}).replace(internationalNumber,()=>{replacements++;return anonymizedPhone;});
 }
 const result=visit(source);return {value:result,replacements};
}
