const AUTH='/api/pin-auth';
const OVERLAY='ein-pin-overlay';
const ADMIN='ein-pin-admin-button';
const DEFAULT_PIN='0000';
const PIN_DIGITS=4;
const DEFAULT_USERS=[
  {externalKey:'manager',name:'Vadītājs',role:'manager',pinConfigured:true},
  {externalKey:'anna',name:'Anna Ozola',role:'employee',pinConfigured:true},
  {externalKey:'martins',name:'Mārtiņš Kalniņš',role:'employee',pinConfigured:true},
  {externalKey:'laura',name:'Laura Bērziņa',role:'employee',pinConfigured:true}
];
let state={users:DEFAULT_USERS,session:null,managerPinConfigured:true,defaultPin:DEFAULT_PIN,pinDigits:PIN_DIGITS};
let gateTimer=null;

const txt=v=>String(v??'').trim();
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const slug=v=>txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const userByKey=k=>state.users.find(u=>u.externalKey===k);
const userByName=n=>state.users.find(u=>u.name===n);

function keyForButton(button){
  if(button?.id==='startManager') return 'manager';
  if(txt(button?.dataset?.id)) return txt(button.dataset.id);
  const name=txt(button?.dataset?.loginUser||button?.textContent);
  return userByName(name)?.externalKey||(/vadīt/i.test(name)?'manager':`user-${slug(name)||'employee'}`);
}

function styles(){
  if(document.getElementById('ein-pin-styles')) return;
  const s=document.createElement('style');
  s.id='ein-pin-styles';
  s.textContent=`
  #${OVERLAY}{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(4,4,7,.8);backdrop-filter:blur(8px)}
  .ein-pin-card{width:min(520px,100%);max-height:92vh;overflow:auto;padding:24px;border:1px solid rgba(126,219,240,.28);border-radius:12px;background:linear-gradient(145deg,#17151c,#0c0b10);box-shadow:0 24px 80px rgba(0,0,0,.5);color:#f7f4fb;font-family:Georgia,'Times New Roman',serif}.ein-pin-card h2{margin:0 0 8px;font-size:28px}.ein-pin-card p{margin:0 0 16px;color:#aaa3b4;line-height:1.45}
  .ein-pin-form{display:grid;gap:12px}.ein-pin-input{width:100%;min-height:54px;padding:10px 14px;border:1px solid rgba(150,121,201,.35);border-radius:8px;background:#201d27;color:#fff;font:700 24px Verdana,sans-serif;letter-spacing:.25em;text-align:center}.ein-pin-actions{display:flex;gap:10px;flex-wrap:wrap}.ein-pin-actions button,.ein-pin-save,.ein-pin-reset{min-height:42px;padding:9px 14px;border-radius:7px;border:1px solid #7edbf0;background:#7edbf0;color:#0c0b10;font:700 14px Verdana,sans-serif;cursor:pointer}.ein-pin-actions .secondary,.ein-pin-reset{background:transparent;color:#f7f4fb;border-color:rgba(247,244,251,.28)}
  .ein-pin-error{min-height:20px;color:#ff9f91!important;font:700 13px Verdana,sans-serif}.ein-pin-success{color:#8be6c9!important}.ein-pin-badge{display:inline-block;margin-bottom:14px;padding:6px 9px;border:1px solid rgba(139,230,201,.24);border-radius:999px;color:#8be6c9;font:700 11px Verdana,sans-serif}
  .ein-pin-default-panel{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:14px 0 18px;padding:14px 16px;border:1px solid rgba(126,219,240,.35);border-radius:10px;background:rgba(126,219,240,.08)}.ein-pin-default-panel span{font:700 12px Verdana,sans-serif;color:#b9b3c4}.ein-pin-default-panel strong{font:800 24px Verdana,sans-serif;letter-spacing:.16em;color:#7edbf0}
  .ein-pin-row{padding:15px 0;border-top:1px solid rgba(150,121,201,.18)}.ein-pin-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.ein-pin-status{font:700 11px Verdana,sans-serif;color:#aaa3b4}.ein-pin-status.set{color:#8be6c9}.ein-pin-current{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:9px;padding:9px 11px;border-radius:7px;background:rgba(255,255,255,.035)}.ein-pin-current span{font:700 11px Verdana,sans-serif;color:#aaa3b4}.ein-pin-code{font:800 18px Verdana,sans-serif;letter-spacing:.14em;color:#fff}.ein-pin-code.custom{font-size:12px;letter-spacing:0;color:#cfc8da}
  .ein-pin-controls{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px}.ein-pin-controls input{min-width:0;min-height:42px;padding:8px 10px;border:1px solid rgba(150,121,201,.35);border-radius:7px;background:#201d27;color:#fff}.ein-pin-note{padding-top:12px;border-top:1px solid rgba(150,121,201,.18);font-size:12px!important}.ein-pin-login-hint{margin-top:-2px!important;font:700 12px Verdana,sans-serif;color:#7edbf0!important}#${ADMIN}{width:100%;margin-top:12px;min-height:46px;border:1px solid rgba(126,219,240,.5)!important;background:rgba(20,158,194,.12)!important;color:#7edbf0!important;font-weight:700}
  @media(max-width:560px){.ein-pin-card{padding:20px 16px}.ein-pin-default-panel{align-items:flex-start;flex-direction:column}.ein-pin-controls{grid-template-columns:1fr 1fr}.ein-pin-controls input{grid-column:1/-1}}
  `;
  document.head.appendChild(s);
}

function close(){document.getElementById(OVERLAY)?.remove()}
function modal(html,dismissable=true){
  close();styles();const o=document.createElement('div');o.id=OVERLAY;o.dataset.dismissable=dismissable?'1':'0';
  o.innerHTML=`<section class="ein-pin-card" role="dialog" aria-modal="true">${html}</section>`;
  o.addEventListener('click',e=>{if(dismissable&&e.target===o)close()});document.body.appendChild(o);return o;
}

async function api(action,body){
  const method=body?'POST':'GET';
  const r=await fetch(body?AUTH:`${AUTH}?action=${encodeURIComponent(action)}`,{method,credentials:'same-origin',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify({action,...body}):undefined});
  let p={};try{p=await r.json()}catch{}
  if(!r.ok){const e=new Error(p.error||`Auth ${r.status}`);e.code=p.code;e.payload=p;throw e}return p;
}
async function refresh(){const p=await api('users');state={...state,users:p.users||[],session:p.session||null,managerPinConfigured:!!p.managerPinConfigured};return state}
async function refreshAdmin(){const p=await api('adminUsers');state={...state,users:p.users||[],session:p.session||state.session,defaultPin:p.defaultPin||DEFAULT_PIN,pinDigits:p.pinDigits||PIN_DIGITS};return state}
function err(e){if(e?.code==='invalid_pin')return `Nepareizs PIN. Atlikuši mēģinājumi: ${e.payload?.attemptsRemaining??'—'}.`;if(e?.code==='pin_locked')return `Pārāk daudz mēģinājumu. Mēģini pēc ${e.payload?.retryAfterSeconds??30} s.`;if(e?.code==='pin_not_configured')return 'PIN vēl nav iestatīts.';if(e?.code==='manager_auth_required')return 'Nepieciešama vadītāja autentifikācija.';return e?.message||'Autentifikācijas kļūda.'}

function continueClick(button){close();if(!button)return;button.dataset.einPinVerified='1';setTimeout(()=>button.click(),0)}
function pinForm(user,{button=null,blocking=false,title=null}={}){
  const o=modal(`<div class="ein-pin-badge">🔐 Servera autentifikācija</div><h2>${esc(title||user.name)}</h2><p>Ievadi savu 4 ciparu PIN.</p><p class="ein-pin-login-hint">Ja PIN nav mainīts, noklusējuma kods ir ${DEFAULT_PIN}.</p><form class="ein-pin-form" autocomplete="off"><input class="ein-pin-input" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" autofocus><p class="ein-pin-error"></p><div class="ein-pin-actions"><button type="submit">Turpināt</button>${blocking?'<button class="secondary" type="button" data-return>Atgriezties</button>':'<button class="secondary" type="button" data-close>Atcelt</button>'}</div></form>`,!blocking);
  const form=o.querySelector('form'),input=o.querySelector('input'),msg=o.querySelector('.ein-pin-error'),submit=form.querySelector('[type=submit]');
  o.querySelector('[data-close]')?.addEventListener('click',close);o.querySelector('[data-return]')?.addEventListener('click',resetLogin);
  form.addEventListener('submit',async e=>{e.preventDefault();const pin=input.value.trim();if(!/^\d{4}$/.test(pin)){msg.textContent='PIN jābūt tieši 4 cipariem.';return}submit.disabled=true;try{await api('login',{externalKey:user.externalKey,pin});await refresh();continueClick(button)}catch(x){submit.disabled=false;input.value='';msg.textContent=err(x);input.focus()}});setTimeout(()=>input.focus(),40);
}

async function authorize(button){
  try{await refresh()}catch(e){modal(`<h2>Droša piekļuve nav pieejama</h2><p class="ein-pin-error">${esc(err(e))}</p><p>Piekļuve ir bloķēta, nevis pārslēgta uz nedrošu pārlūka režīmu.</p><div class="ein-pin-actions"><button class="secondary" data-close>Aizvērt</button></div>`).querySelector('[data-close]').addEventListener('click',close);return}
  const user=userByKey(keyForButton(button))||userByName(txt(button.dataset?.loginUser||button.textContent));
  if(!user){modal(`<h2>Lietotājs nav sinhronizēts</h2><p class="ein-pin-error">Vadītājam jāsinhronizē lietotājs serverī.</p><div class="ein-pin-actions"><button class="secondary" data-close>Aizvērt</button></div>`).querySelector('[data-close]').addEventListener('click',close);return}
  if(state.session?.externalKey===user.externalKey){continueClick(button);return}
  if(!user.pinConfigured){modal(`<h2>${esc(user.name)}</h2><p class="ein-pin-error">PIN vēl nav iestatīts.</p><p>Vadītājam jāatver “PIN kodi” un jāiestata piekļuve.</p><div class="ein-pin-actions"><button class="secondary" data-close>Aizvērt</button></div>`).querySelector('[data-close]').addEventListener('click',close);return}
  pinForm(user,{button});
}

async function resetLogin(){
  await api('logout',{}).catch(()=>null);try{const k='einsteins-ai-trainer-state-v1',v=JSON.parse(localStorage.getItem(k)||'{}');v.currentUserName=null;v.view='welcome';localStorage.setItem(k,JSON.stringify(v))}catch{}
  location.replace(`${location.origin}${location.pathname}`);
}
function intended(){
  const app=document.querySelector('.app');if(!app?.classList.contains('logged-in'))return null;if(app.classList.contains('manager-mode'))return state.users.find(u=>u.role==='manager');
  const b=[...document.querySelectorAll('[data-login-user].active')].find(x=>!x.closest('#managerLoginList'));return userByName(txt(b?.dataset?.loginUser||b?.textContent));
}
async function gate(){
  if(document.getElementById(OVERLAY)||!document.querySelector('.app')?.classList.contains('logged-in'))return;
  try{await refresh();const u=intended();if(u&&state.session?.externalKey===u.externalKey)return;if(!u){const o=modal(`<h2>Sesiju nevar apstiprināt</h2><p class="ein-pin-error">Pārlūka lietotājs neatbilst servera reģistram.</p><div class="ein-pin-actions"><button class="secondary" data-return>Atgriezties</button></div>`,false);o.querySelector('[data-return]').addEventListener('click',resetLogin);return}if(!u.pinConfigured){const o=modal(`<h2>Piekļuve bloķēta</h2><p class="ein-pin-error">${esc(u.name)}: PIN nav iestatīts serverī.</p><div class="ein-pin-actions"><button class="secondary" data-return>Atgriezties</button></div>`,false);o.querySelector('[data-return]').addEventListener('click',resetLogin);return}pinForm(u,{blocking:true,title:`${u.name} — sesijas pārbaude`})}catch(e){const o=modal(`<h2>Droša sesija nav pieejama</h2><p class="ein-pin-error">${esc(err(e))}</p><div class="ein-pin-actions"><button class="secondary" data-return>Atgriezties</button></div>`,false);o.querySelector('[data-return]').addEventListener('click',resetLogin)}
}
function scheduleGate(){clearTimeout(gateTimer);gateTimer=setTimeout(gate,70)}

async function requireManager(){await refresh();const m=state.users.find(u=>u.role==='manager');if(!m)throw new Error('Vadītāja profils nav serverī.');if(state.session?.role==='manager')return m;return new Promise((resolve,reject)=>{if(!m.pinConfigured){reject(new Error('Vadītāja PIN nav konfigurēts.'));return}const o=modal(`<div class="ein-pin-badge">🔐 Vadītāja apstiprinājums</div><h2>${esc(m.name)}</h2><p class="ein-pin-login-hint">Noklusējuma vadītāja PIN: ${DEFAULT_PIN}</p><form class="ein-pin-form"><input class="ein-pin-input" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autofocus><p class="ein-pin-error"></p><div class="ein-pin-actions"><button type="submit">Apstiprināt</button><button class="secondary" type="button" data-close>Atcelt</button></div></form>`);const f=o.querySelector('form'),i=o.querySelector('input'),msg=o.querySelector('.ein-pin-error');o.querySelector('[data-close]').addEventListener('click',()=>{close();reject(new Error('cancelled'))});f.addEventListener('submit',async e=>{e.preventDefault();if(!/^\d{4}$/.test(i.value.trim())){msg.textContent='PIN jābūt tieši 4 cipariem.';return}try{await api('login',{externalKey:m.externalKey,pin:i.value.trim()});await refresh();close();resolve(m)}catch(x){i.value='';msg.textContent=err(x)}})})}
async function syncVisible(){await refresh();if(state.session?.role!=='manager')return;const known=new Set(state.users.map(u=>u.externalKey));for(const b of document.querySelectorAll('#userList [data-login-user]')){const externalKey=keyForButton(b),name=txt(b.dataset.loginUser||b.textContent);if(externalKey&&name&&!known.has(externalKey)){await api('syncUser',{externalKey,name});known.add(externalKey)}}await refresh()}
function pinText(u){if(u.pinType==='default'&&u.pinDisplay)return u.pinDisplay;if(u.pinConfigured)return 'Pielāgots PIN';return 'Nav PIN'}
function pinClass(u){return u.pinType==='default'?'ein-pin-code':'ein-pin-code custom'}
function rows(){return state.users.map(u=>`<div class="ein-pin-row" data-row="${esc(u.externalKey)}"><div class="ein-pin-head"><strong>${esc(u.name)}</strong><span class="ein-pin-status ${u.pinConfigured?'set':''}">${u.pinConfigured?'PIN aktīvs':'PIN nav iestatīts'}</span></div><div class="ein-pin-current"><span>Pašreizējais PIN</span><strong class="${pinClass(u)}" data-current-pin>${esc(pinText(u))}</strong></div><div class="ein-pin-controls"><input type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="Jauns 4 ciparu PIN"><button class="ein-pin-save" data-save="${esc(u.externalKey)}">${u.pinConfigured?'Mainīt':'Saglabāt'}</button><button class="ein-pin-reset" data-remove="${esc(u.externalKey)}" ${u.role==='manager'||!u.pinConfigured?'disabled':''}>${u.role==='manager'?'Aizsargāts':'Noņemt'}</button></div></div>`).join('')}
function updateRow(row,u){if(!row||!u)return;const status=row.querySelector('.ein-pin-status'),current=row.querySelector('[data-current-pin]'),save=row.querySelector('[data-save]'),remove=row.querySelector('[data-remove]');status.textContent=u.pinConfigured?'PIN aktīvs':'PIN nav iestatīts';status.classList.toggle('set',!!u.pinConfigured);current.textContent=pinText(u);current.className=pinClass(u);save.textContent=u.pinConfigured?'Mainīt':'Saglabāt';remove.disabled=u.role==='manager'||!u.pinConfigured}
async function admin(){
  try{await requireManager();await syncVisible();await refreshAdmin()}catch(e){if(e.message==='cancelled')return;modal(`<h2>PIN pārvaldība nav pieejama</h2><p class="ein-pin-error">${esc(err(e))}</p><div class="ein-pin-actions"><button class="secondary" data-close>Aizvērt</button></div>`).querySelector('[data-close]').addEventListener('click',close);return}
  const o=modal(`<div class="ein-pin-badge">✓ Servera PIN pārvaldība</div><h2>PIN kodi</h2><p>Visi PIN kodi ir 4 ciparu. Noklusējuma kods ir redzams; pēc individuālas nomaiņas drošības dēļ tiek rādīts “Pielāgots PIN”.</p><div class="ein-pin-default-panel"><span>Noklusējuma PIN visiem jaunajiem lietotājiem</span><strong>${esc(state.defaultPin||DEFAULT_PIN)}</strong></div><p class="ein-pin-error" data-msg></p>${rows()}<p class="ein-pin-note">PIN datubāzē tiek glabāts tikai kā drošs jaucējkods. 5 nepareizi mēģinājumi → 30 sekunžu bloķēšana.</p><div class="ein-pin-actions"><button class="secondary" data-close>Aizvērt</button></div>`);const msg=o.querySelector('[data-msg]');o.querySelector('[data-close]').addEventListener('click',close);
  o.querySelectorAll('[data-save]').forEach(b=>b.addEventListener('click',async()=>{const row=b.closest('[data-row]'),i=row.querySelector('input'),pin=i.value.trim();if(!/^\d{4}$/.test(pin)){msg.className='ein-pin-error';msg.textContent='PIN jābūt tieši 4 cipariem.';return}try{await api('setPin',{targetExternalKey:b.dataset.save,pin});await refreshAdmin();i.value='';updateRow(row,userByKey(b.dataset.save));msg.className='ein-pin-error ein-pin-success';msg.textContent=pin===DEFAULT_PIN?'Saglabāts noklusējuma PIN 0000.':'Saglabāts pielāgots 4 ciparu PIN.'}catch(e){msg.className='ein-pin-error';msg.textContent=err(e)}}));
  o.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',async()=>{if(b.disabled)return;try{await api('removePin',{targetExternalKey:b.dataset.remove});await refreshAdmin();updateRow(b.closest('[data-row]'),userByKey(b.dataset.remove));msg.className='ein-pin-error ein-pin-success';msg.textContent='PIN noņemts.'}catch(e){msg.className='ein-pin-error';msg.textContent=err(e)}}));
}

function syncAdmin(){const app=document.querySelector('.app'),old=document.getElementById(ADMIN);if(!app?.classList.contains('manager-mode')){old?.remove();return}if(old)return;const side=document.querySelector('.sidebar');if(!side)return;const b=document.createElement('button');b.id=ADMIN;b.type='button';b.textContent='🔐 PIN kodi';b.addEventListener('click',()=>admin().catch(console.error));side.appendChild(b)}

document.addEventListener('click',e=>{const b=e.target.closest?.('[data-login-user], #startManager');if(!b)return;if(b.dataset.einPinVerified==='1'){delete b.dataset.einPinVerified;return}e.preventDefault();e.stopImmediatePropagation();authorize(b).catch(console.error)},true);
document.addEventListener('keydown',e=>{const o=document.getElementById(OVERLAY);if(e.key==='Escape'&&o?.dataset.dismissable==='1')close()});
new MutationObserver(()=>{syncAdmin();scheduleGate()}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
styles();syncAdmin();refresh().then(scheduleGate).catch(scheduleGate);
