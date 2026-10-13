'use strict';
(()=> {
const by=id=>document.getElementById(id);
const say=msg=>by('aiMessage').textContent=msg;
const selectOptionCount=(card,count,values)=>{
 const container=card.querySelector('.questions-options'),correct=card.querySelector('.correct'),old=[...container.querySelectorAll('input.option')].map(i=>i.value);
 const existing=values||old;container.innerHTML='';
 const truth=count===2;
 for(let i=0;i<count;i++){
  const holder=document.createElement('div'),label=document.createElement('label'),input=document.createElement('input');
  label.textContent='Réponse '+(i+1);input.className='option';input.maxLength=300;input.value=truth?(i===0?'Vrai':'Faux'):(existing[i]||'');
  holder.append(label,input);container.append(holder);
 }
 const prev=Number(correct.value)||0;correct.innerHTML='';
 for(let i=0;i<count;i++){const opt=document.createElement('option');opt.value=String(i);opt.textContent=truth?(['Vrai','Faux'][i]):'Réponse '+(i+1);correct.append(opt)}
 correct.value=String(prev<count?prev:0);
};
function prepareCard(card){
 if(card.querySelector('.aiCardType'))return;
 const typeLabel=document.createElement('label');typeLabel.textContent='Format de la question';
 const select=document.createElement('select');select.className='aiCardType';
 for(const [val,label] of [['4','QCM — 4 propositions'],['3','QCM — 3 propositions'],['2','Vrai / Faux']]){const o=document.createElement('option');o.value=val;o.textContent=label;select.append(o)}
 const holder=document.createElement('p');holder.append(typeLabel,select);
 card.querySelector('.questions-options').before(holder);
 select.onchange=()=>selectOptionCount(card,Number(select.value));
}
const observer=new MutationObserver(()=>document.querySelectorAll('#questionEditor .quizQ').forEach(prepareCard));
observer.observe(by('questionEditor'),{childList:true,subtree:true});
document.querySelectorAll('#questionEditor .quizQ').forEach(prepareCard);
async function getText(file){
 if(file.size>12*1024*1024)throw Error('Fichier trop volumineux : maximum 12 Mo.');
 const ext=(file.name.split('.').pop()||'').toLowerCase();
 if(['txt','md'].includes(ext))return await file.text();
 if(ext==='docx'){
  if(!window.mammoth)throw Error('Lecture Word indisponible. Copie le texte directement.');
  const data=await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});return data.value;
 }
 if(ext==='pdf'){
  if(!window.pdfjsLib)throw Error('Lecture PDF indisponible. Copie le texte directement.');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  const pages=[];
  for(let i=1;i<=Math.min(pdf.numPages,40);i++){const page=await pdf.getPage(i),data=await page.getTextContent();pages.push(data.items.map(x=>x.str||'').join(' '))}
  const text=pages.join('\n');
  if(text.trim().length<120)throw Error('Ce PDF semble être un scan sans texte. Copie le texte du cours pour continuer.');
  return text;
 }
 throw Error('Format non pris en charge. Formats acceptés : PDF, DOCX, TXT, MD.');
}
by('aiFile').addEventListener('change',async()=>{
 const file=by('aiFile').files[0];if(!file)return;
 by('aiFileInfo').textContent='Lecture du document…';
 try{const text=await getText(file);by('aiSource').value=text.slice(0,50000);by('aiFileInfo').textContent=file.name+' · '+text.length+' caractères extraits'+(text.length>50000?' (texte limité à 50 000 caractères)':'');}
 catch(e){by('aiFileInfo').textContent=e.message;}
});
async function checkGeminiStatus(){
 say('Vérification de la connexion Gemini…');
 try{
  await auth();
  const res=await fetch(BASE+'/functions/v1/ecoquiz-generate',{
   method:'POST',
   headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({action:'status'})
  });
  const result=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(result.error||'Vérification indisponible.');
  say(result.configured
   ? '✓ Gemini est configuré sur Supabase. Importe un cours et clique sur « Générer une première version » pour tester la génération.'
   : '⚠ Aucune clé Gemini trouvée dans Supabase : enregistre le secret GEMINI_API_KEY puis rouvre cet éditeur.');
 }catch(e){
  say('Vérification impossible : '+e.message);
 }
}
by('newQuiz').addEventListener('click',()=>{
 by('aiMessage').textContent='';by('aiSource').value='';by('aiExtra').value='';by('aiFile').value='';by('aiFileInfo').textContent='Texte extrait localement.';
 checkGeminiStatus();
});
async function generate(more){
 const source=by('aiSource').value.trim(),count=more?3:Number(by('aiCount').value);
 if(source.length<120){say('Importe un cours ou colle au moins 120 caractères.');return}
 if(!Number.isInteger(count)||count<1||count>30){say('Choisis de 1 à 30 questions.');return}
 const existing=[...document.querySelectorAll('#questionEditor .prompt')].map(x=>x.value.trim()).filter(Boolean);
 by('aiGenerate').disabled=by('aiMore').disabled=true;say('L’IA prépare des propositions à relire…');
 try{
  await auth();
  const res=await fetch(BASE+'/functions/v1/ecoquiz-generate',{
   method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({source:source.slice(0,45000),title:by('quizTitle').value.trim(),count,option_count:Number(by('aiOptions').value),true_false:by('aiTF').checked,instructions:by('aiExtra').value,existing})
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error||data.message||'Le service IA est temporairement indisponible.');
  const items=data.questions;
  if(!Array.isArray(items)||!items.length)throw Error('Aucune question générée.');
  const cards=[...document.querySelectorAll('#questionEditor .quizQ')];
  if(cards.length===1&&!cards[0].querySelector('.prompt').value.trim())cards[0].remove();
  for(const q of items){
   addQuestion();
   const card=[...document.querySelectorAll('#questionEditor .quizQ')].at(-1);
   prepareCard(card);
   const size=q.options.length;
   card.querySelector('.aiCardType').value=String(size);
   selectOptionCount(card,size,q.options);
   card.querySelector('.prompt').value=q.prompt;
   card.querySelector('.correct').value=String(q.correct_index);
   card.querySelector('.explanation').value=q.explanation||'';
   const match=concepts.find(x=>x.title.toLowerCase()===String(q.concept_title||'').toLowerCase());
   if(match)card.querySelector('.concept').value=match.id;
  }
  say(items.length+' question(s) ajoutée(s). Vérifie les réponses, modifie-les si besoin, puis valide le brouillon.');
  by('questionEditor').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){say('Génération non effectuée : '+e.message)}
 finally{by('aiGenerate').disabled=by('aiMore').disabled=false}
}
by('aiGenerate').onclick=()=>generate(false);
by('aiMore').onclick=()=>generate(true);
})();