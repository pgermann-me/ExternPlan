const $=selector=>document.querySelector(selector);let mode='login';
async function request(path,body){const response=await fetch('/api/auth/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Error(data.error||'Anmeldung fehlgeschlagen');return data;}
function showMode(next,source){
 mode=next;const setup=mode==='setup',change=mode==='change';$('#setup-fields').hidden=!setup;$('#email-field').hidden=change;$('#login-email').required=!change;$('#new-password-fields').hidden=!change;$('#new-password').required=change;$('#confirm-password').required=change;
 for(const id of ['setup-secret','first-name','last-name'])$('#'+id).required=setup;
 $('#login-title').textContent=setup?'Ersten Admin einrichten':change?'Passwort ändern':'Anmelden';$('#login-description').textContent=setup?'Einmalig den ersten persönlichen Admin-Zugang erstellen.':change?'Bitte das vorläufige Passwort durch ein eigenes Passwort ersetzen.':'Mit E-Mail-Adresse und Passwort anmelden.';
 $('#setup-secret-label').textContent=source==='existing_password'?'Bisheriges Zugangspasswort':'Einrichtungsschlüssel';$('#password-label').textContent=change?'Vorläufiges Passwort':setup?'Eigenes Passwort · mindestens 12 Zeichen':'Passwort';$('#login-password').minLength=setup?12:1;$('#login-password').autocomplete=setup?'new-password':'current-password';$('#login-submit').textContent=setup?'Admin-Zugang erstellen':change?'Passwort speichern':'Anmelden';$('#login-cancel').hidden=!change;
}
$('#login-form').onsubmit=async event=>{
 event.preventDefault();$('#login-message').textContent='';$('#login-submit').disabled=true;
 try{const data=Object.fromEntries(new FormData(event.currentTarget));let result;
  if(mode==='change'){if(data.new_password!==data.confirm_password)throw Error('Die neuen Passwörter stimmen nicht überein');result=await request('password',{current_password:data.password,password:data.new_password});}
  else result=await request(mode==='setup'?'setup':'login',data);
  if(result.user.must_change_password){showMode('change');$('#new-password').focus();}else location.replace('/');
 }catch(error){$('#login-message').textContent=error.message;}finally{$('#login-submit').disabled=false;}
};
$('#login-cancel').onclick=async()=>{await request('logout',{});location.reload();};
try{const session=await request('session');if(session.user?.must_change_password)showMode('change');else if(session.user)location.replace('/');else showMode(session.needs_setup?'setup':'login',session.setup_source);}catch(error){$('#login-message').textContent=error.message;}
