'use strict';
(()=> {
const by=id=>document.getElementById(id);
const say=msg=>by('aiMessage').textContent=msg;
/* Le numéro affiché correspond toujours à l'ordre réel des cartes. */
function renumberQuestions(){
 const cards=[...document.querySelectorAll('#questionEditor .quizQ')];
 cards.forEach((card,i)=>{
  const heading=card.querySelector('.flex > b');
  if(heading && heading.textContent!=='Question '+(i+1))heading.textContent='Question '+(i+1);
  card.dataset.qid=String(i+1);
 });
 const total=by('questionTotal');
 if(total)total.textContent=cards.length+' question'+(cards.length>1?'s':'');
}
function highlightCorrect(card){
 const selected=Number(card.querySelector('.correct')?.value);
 card.querySelectorAll('.answer-option').forEach((item,i)=>{
  const ok=i===selected;
  item.classList.toggle('is-correct',ok);
  const badge=item.querySelector('.correct-badge');
  if(badge)badge.setAttribute('aria-label',ok?'Bonne réponse validée':'');
  const choose=item.querySelector('.markCorrect');
  if(choose)choose.setAttribute('aria-pressed',String(ok));
 });
}
function selectOptionCount(card,count,values){
 const container=card.querySelector('.questions-options'),correct=card.querySelector('.correct');
 if(!container||!correct)return;
 const existing=values||[...container.querySelectorAll('input.option')].map(el=>el.value);
 const previous=Number(correct.value)||0;
 container.replaceChildren();
 const truth=count===2;
 for(let i=0;i<count;i++){
  const box=document.createElement('div');box.className='answer-option';
  const label=document.createElement('label');label.textContent='Réponse '+(i+1);
  const inp=document.createElement('input');inp.className='option';inp.maxLength=300;
  inp.value=truth?(['Vrai','Faux'][i]):String(existing[i]||'');
  const badge=document.createElement('span');badge.className='correct-badge';badge.textContent='✓ Bonne réponse';
  const mark=document.createElement('button');mark.type='button';mark.className='markCorrect';mark.textContent='Valider cette réponse';
  mark.title='Marquer la réponse '+(i+1)+' comme la bonne réponse';
  mark.setAttribute('aria-label',mark.title);
  mark.addEventListener('click',()=>{
    correct.value=String(i);
    highlightCorrect(card);
  });
  box.append(label,inp,badge,mark);
  container.append(box);
 }
 correct.replaceChildren();
 for(let i=0;i<count;i++){
  const opt=document.createElement('option');opt.value=String(i);
  opt.textContent=truth?(['Vrai','Faux'][i]):'Réponse '+(i+1);
  correct.append(opt);
 }
 correct.value=String(previous<count?previous:0);
 highlightCorrect(card);
}
function prepareCard(card){
 if(card.querySelector('.aiCardType'))return;
 const typeLabel=document.createElement('label');typeLabel.textContent='Format de la question';
 const select=document.createElement('select');select.className='aiCardType';
 for(const [val,label] of [['4','QCM — 4 propositions'],['3','QCM — 3 propositions'],['2','Vrai / Faux']]){
  const opt=document.createElement('option');opt.value=val;opt.textContent=label;select.append(opt);
 }
 const holder=document.createElement('p');holder.className='question-format';holder.append(typeLabel,select);
 card.querySelector('.questions-options').before(holder);
 const count=card.querySelectorAll('.questions-options .option').length;
 select.value=String([2,3,4].includes(count)?count:4);
 select.addEventListener('change',()=>selectOptionCount(card,Number(select.value)));
 card.querySelector('.correct').addEventListener('change',()=>highlightCorrect(card));
 selectOptionCount(card,Number(select.value));
}
const observer=new MutationObserver(()=>{
 document.querySelectorAll('#questionEditor .quizQ').forEach(prepareCard);
 renumberQuestions();
});
observer.observe(by('questionEditor'),{childList:true,subtree:true});
document.querySelectorAll('#questionEditor .quizQ').forEach(prepareCard);
renumberQuestions();
/* CSV/TSV de cours : analyse locale, aucun envoi du fichier brut.
   Le texte structuré extrait est le seul contenu transmis à Gemini,
   après clic explicite sur « Générer ». */
function decodeCSVText(bytes){
 if(bytes[0]===0xFF&&bytes[1]===0xFE)return new TextDecoder('utf-16le').decode(bytes);
 if(bytes[0]===0xFE&&bytes[1]===0xFF)return new TextDecoder('utf-16be').decode(bytes);
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
 catch{return new TextDecoder('windows-1252').decode(bytes)}
}
function csvToCourse(raw,filename){
 let value=String(raw||'').replace(/^\uFEFF/,'');
 if(!value.trim())throw Error('Le fichier CSV est vide.');
 const sep=value.match(/^sep=([;,\t|])\r?\n/i);
 if(sep)value=value.slice(sep[0].length);
 const parser=window.EcoQuizCSV?.parseCSV;
 if(typeof parser!=='function')throw Error('Le lecteur CSV n’est pas encore chargé. Actualise la page et réessaie.');
 const choices=sep?[sep[1]]:[';',',','\t','|'];
 let best=null;
 for(const delimiter of choices){
  let rows;
  try{rows=parser(value,delimiter)}catch(e){continue}
  if(!rows.length)continue;
  const sample=rows.slice(0,Math.min(18,rows.length));
  const widths=sample.map(row=>row.length);
  const multi=widths.filter(w=>w>1).length;
  const median=widths.slice().sort((a,b)=>a-b)[Math.floor(widths.length/2)]||1;
  const consistent=widths.filter(w=>w===median).length;
  const score=(multi?100:0)+multi*10+consistent*3+Math.min(median,15);
  if(!best||score>best.score)best={delimiter,rows,score};
 }
 if(!best)throw Error('Ce fichier CSV ne contient aucune donnée lisible.');
 const rows=best.rows.map(row=>row.map(cell=>String(cell||'').replace(/\s+/g,' ').trim()));
 const width=Math.max(...rows.slice(0,30).map(row=>row.length));
 const header=rows[0];
 const cleanHeader=header.map((cell,i)=>cell||'Colonne '+(i+1));
 const describe=[];
 let dataRows=0;
 for(let rowIndex=1;rowIndex<rows.length;rowIndex++){
  const row=rows[rowIndex];
  if(!row.some(Boolean))continue;
  dataRows++;
  const fields=row.map((cell,col)=>cell
   ?(cleanHeader[col]||'Colonne '+(col+1))+': '+cell
   :'').filter(Boolean);
  describe.push('Ligne '+(rowIndex+1)+' — '+fields.join(' ; '));
 }
 // Pour un CSV à une ligne, transmettre les valeurs plutôt qu'une seule ligne d'en-têtes.
 const content=rows.length===1
  ?'Contenu : '+rows[0].filter(Boolean).join(' ; ')
  :describe.join('\n');
 const title='Document CSV : '+filename.replace(/\.(csv|tsv)$/i,'');
 const extracted=[title,'Colonnes : '+cleanHeader.join(' | '),'Nombre de lignes de données : '+dataRows,content].join('\n');
 if(extracted.trim().length<10)throw Error('Ce CSV ne contient pas de données exploitables.');
 return {text:extracted,rows:dataRows,columns:width};
}
async function getText(file){
 if(file.size>12*1024*1024)throw Error('Fichier trop volumineux : maximum 12 Mo.');
 const ext=(file.name.split('.').pop()||'').toLowerCase();
 if(['txt','md'].includes(ext))return await file.text();
 if(['csv','tsv'].includes(ext)){
  const bytes=new Uint8Array(await file.arrayBuffer());
  const extracted=csvToCourse(decodeCSVText(bytes),file.name);
  return extracted.text;
 }
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
 throw Error('Format non pris en charge. Formats acceptés : PDF, DOCX, CSV, TSV, TXT et MD.');
}
by('aiFile').addEventListener('change',async()=>{
 const file=by('aiFile').files[0];if(!file)return;
 const info=by('aiFileInfo');
 info.textContent='Lecture du document…';
 try{
  const text=await getText(file);
  by('aiSource').value=text.slice(0,50000);
  const type=/\.(csv|tsv)$/i.test(file.name)?'Tableau CSV chargé · ':'';
  info.textContent='✓ '+type+file.name+' · '+text.length+' caractères extraits'
   +(text.length>50000?' (contenu limité à 50 000 caractères)':'')
   +'. Le contenu est visible dans la zone « Cours ou contexte ».';
 }catch(e){
  info.textContent='Import impossible : '+e.message;
 }
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
function autoTitle(source){
 const first=source.split(/\r?\n/).map(s=>s.trim()).find(s=>s.length>=6&&s.length<=110);
 const title=(first||'Évaluation de connaissances').replace(/[.!?]+$/,'');
 return ('Quiz – '+title).slice(0,150);
}
async function generate(more){
 const source=by('aiSource').value.trim();
 const count=more?3:Number(by('aiCount').value);
 if(source.length<120){say('Importe un cours ou colle au moins 120 caractères.');return}
 if(!Number.isInteger(count)||count<1||count>30){say('Choisis de 1 à 30 questions.');return}
 const existing=[...document.querySelectorAll('#questionEditor .prompt')]
  .map(x=>x.value.trim()).filter(Boolean);
 const generateButton=by('aiGenerate'),moreButton=by('aiMore');
 generateButton.disabled=moreButton.disabled=true;
 say('L’IA compose les questions et repère les bonnes réponses…');
 try{
  await auth();
  const res=await fetch(BASE+'/functions/v1/ecoquiz-generate',{
   method:'POST',
   headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({
    source:source.slice(0,45000),
    title:by('quizTitle').value.trim(),
    count,
    option_count:Number(by('aiOptions').value),
    true_false:true,
    true_false_ratio:0.2,
    instructions:by('aiExtra').value,
    existing
   })
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error||data.message||'Le service IA est temporairement indisponible.');
  const items=data.questions;
  if(!Array.isArray(items)||items.length<1)throw Error('Aucune question générée.');
  // Préserver les questions rédigées ; supprimer uniquement la carte d'accueil vide.
  const cards=[...document.querySelectorAll('#questionEditor .quizQ')];
  if(cards.length===1&&!cards[0].querySelector('.prompt')?.value.trim())cards[0].remove();
  // Un titre automatique est proposé uniquement si le champ est encore vide.
  const titleField=by('quizTitle');
  if(!titleField.value.trim()){
   const suggested=String(data.title||'').trim();
   titleField.value=(suggested||autoTitle(source)).slice(0,150);
   titleField.dispatchEvent(new Event('input',{bubbles:true}));
  }
  for(const q of items){
   addQuestion();
   const card=[...document.querySelectorAll('#questionEditor .quizQ')].at(-1);
   prepareCard(card);
   const opts=Array.isArray(q.options)?q.options:[];
   if(![2,3,4].includes(opts.length))throw Error('Une question IA contient un nombre de choix incorrect.');
   card.querySelector('.aiCardType').value=String(opts.length);
   selectOptionCount(card,opts.length,opts);
   card.querySelector('.prompt').value=String(q.prompt||'');
   card.querySelector('.correct').value=String(q.correct_index);
   card.querySelector('.explanation').value=String(q.explanation||'');
   // Les notions restent associées aux questions pour l'ancrage, mais ne sont pas visibles.
   const match=concepts.find(x=>x.title.toLowerCase()===String(q.concept_title||'').toLowerCase());
   card.dataset.conceptTitle=String(q.concept_title||'').trim().slice(0,120);
   if(match)card.querySelector('.concept').value=match.id;
   highlightCorrect(card);
  }
  renumberQuestions();
  const tf=items.filter(q=>Array.isArray(q.options)&&q.options.length===2).length;
  say(items.length+' question(s) ajoutée(s), dont '+tf+' Vrai/Faux. Le titre est proposé et les bonnes réponses apparaissent en vert. Vérifie puis valide.');
  by('questionEditor').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){say('Génération non effectuée : '+e.message)}
 finally{generateButton.disabled=moreButton.disabled=false}
}
by('aiGenerate').onclick=()=>generate(false);
by('aiMore').onclick=()=>generate(true);
})();