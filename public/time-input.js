const formats={datetime:{parts:[2,2,4,2,2],separators:['.','.',' ',':'],placeholder:'TT.MM.JJJJ HH:mm'},date:{parts:[2,2,4],separators:['.','.'],placeholder:'TT.MM.JJJJ'},time:{parts:[2,2],separators:[':'],placeholder:'HH:mm'}};
export function formatTimeInput(value,kind='datetime'){
 const format=formats[kind];if(!format)return String(value);
 const digits=String(value).replace(/\D/g,'').slice(0,format.parts.reduce((a,b)=>a+b,0));let result='',offset=0;
 for(let i=0;i<format.parts.length&&offset<digits.length;i++){
  const part=digits.slice(offset,offset+format.parts[i]);result+=part;offset+=part.length;
  if(part.length===format.parts[i]&&i<format.separators.length)result+=format.separators[i];
 }
 return result;
}
const digitCount=value=>(value.match(/\d/g)||[]).length;
function caretAfterDigits(value,count,afterSeparator){
 if(!count)return 0;let i=0;
 for(;i<value.length;i++)if(/\d/.test(value[i])&&!--count){i++;break;}
 if(afterSeparator)while(i<value.length&&/\D/.test(value[i]))i++;
 return i;
}
// Delegation also covers dialogs and fields inserted after the first render.
export function installTimeInputFormatting(root=document){
 const field=event=>{const input=event.target;return input?.matches?.('input[data-time-format]')&&['text','search','tel'].includes(input.type)&&formats[input.dataset.timeFormat]&&!input.disabled&&!input.readOnly?input:null;};
 const focus=event=>{const input=field(event);if(input){input.inputMode='numeric';if(!input.placeholder)input.placeholder=formats[input.dataset.timeFormat].placeholder;}};
 const format=event=>{
  const input=field(event);if(!input||event.isComposing)return;
  const raw=input.value,start=input.selectionStart??raw.length,end=input.selectionEnd??start,value=formatTimeInput(raw,input.dataset.timeFormat);
  if(raw===value)return;
  const deleting=event.inputType?.startsWith('delete');input.value=value;
  input.setSelectionRange(caretAfterDigits(value,digitCount(raw.slice(0,start)),!deleting),caretAfterDigits(value,digitCount(raw.slice(0,end)),!deleting));
 };
 const before=event=>{
  const input=field(event);if(!input||event.isComposing||!event.cancelable||input.selectionStart!==input.selectionEnd)return;
  const backward=event.inputType==='deleteContentBackward',forward=event.inputType==='deleteContentForward';if(!backward&&!forward)return;
  const value=input.value,caret=input.selectionStart;let index=backward?caret-1:caret;
  if(index<0||index>=value.length||/\d/.test(value[index]))return;
  while(index>=0&&index<value.length&&/\D/.test(value[index]))index+=backward?-1:1;
  if(index<0||index>=value.length)return;
  event.preventDefault();const remaining=value.slice(0,index)+value.slice(index+1),digitsBefore=digitCount(value.slice(0,backward?index:caret));input.value=formatTimeInput(remaining,input.dataset.timeFormat);
  const position=caretAfterDigits(input.value,digitsBefore,false);input.setSelectionRange(position,position);
  input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:event.inputType}));
 };
 root.addEventListener('focusin',focus,true);root.addEventListener('beforeinput',before,true);root.addEventListener('input',format,true);
 return ()=>{root.removeEventListener('focusin',focus,true);root.removeEventListener('beforeinput',before,true);root.removeEventListener('input',format,true);};
}
