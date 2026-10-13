'use strict';
/* Dupliquer un quiz dans une classe, sans copier ses résultats. */
(()=>{
 const get=id=>document.getElementById(id);
 const panel=get('copyPanel');
 if(!panel)return;
 let availableQuizzes=[];
 let lastAutomaticTitle='';
 let countRequest=0;

 const close=()=>{panel.classList.add('hide');get('copyMessage').textContent='';};
 get('cancelCopy').addEventListener('click',close);
 get('cancelCopyBottom').addEventListener('click',close);
 get('back').addEventListener('click',close);
 get('logout').addEventListener('click',close);
 get('classList').addEventListener('click',e=>{if(e.target.closest('.openClass'))close()});

 const textOption=(value,label)=>{
  const option=document.createElement('option');
  option.value=value;
  option.textContent=label;
  return option;
 };
 const findQuiz=()=>availableQuizzes.find(x=>x.id===get('copySource').value);
 const findClass=id=>classes.find(x=>x.id===id);
 const automaticTitle=()=>{
  const quiz=findQuiz();
  if(!quiz)return '';
  return quiz.title+(get('copyDestination').value===quiz.class_id?' (copie)':'');
 };
 const describe=async()=>{
  const quiz=findQuiz();
  const target=findClass(get('copyDestination').value);
  if(!quiz||!target){get('copySummary').textContent='Sélectionne un quiz et une classe.';return;}
  const source=findClass(quiz.class_id);
  const counter=++countRequest;
  get('copySummary').textContent='Préparation de la copie…';
  try{
   const list=await req('ecoquiz_quiz_questions?select=id&quiz_id=eq.'+quiz.id+'&limit=100');
   if(counter!==countRequest)return;
   get('copySummary').textContent=list.length+' question(s) · '+(source?.name||'Classe source')+' → '+target.name+'. Toutes les propositions, bonnes réponses, explications et notions seront reprises. La copie sera un brouillon indépendant, sans notes ni réponses d’élèves.';
  }catch(error){
   if(counter!==countRequest)return;
   get('copySummary').textContent='De '+(source?.name||'Classe source')+' vers '+target.name+'. Le quiz sera créé en brouillon sans copier les résultats.';
  }
 };
 const syncTitle=()=>{
  const automatic=automaticTitle();
  if(!get('copyTitle').value||get('copyTitle').value===lastAutomaticTitle)get('copyTitle').value=automatic;
  lastAutomaticTitle=automatic;
 };
 get('copySource').addEventListener('change',()=>{
  const automatic=automaticTitle();
  get('copyTitle').value=automatic;
  lastAutomaticTitle=automatic;
  describe();
 });
 get('copyDestination').addEventListener('change',()=>{syncTitle();describe()});

 async function openCopy({sourceId=null,targetId=null}={}){
  get('copyMessage').textContent='Chargement des quiz disponibles…';
  panel.classList.remove('hide');
  panel.scrollIntoView({behavior:'smooth',block:'start'});
  try{
   availableQuizzes=await req('ecoquiz_quizzes?select=id,title,class_id,published&order=created_at.desc&limit=1000');
   const sourceSelect=get('copySource');
   const targetSelect=get('copyDestination');
   sourceSelect.replaceChildren();
   targetSelect.replaceChildren();
   for(const q of availableQuizzes){
    sourceSelect.append(textOption(q.id,(findClass(q.class_id)?.name||'Classe')+' / '+q.title));
   }
   for(const c of classes){
    targetSelect.append(textOption(c.id,c.name));
   }
   if(!availableQuizzes.length||!classes.length){
    get('copyMessage').textContent='Crée d’abord un quiz et au moins une classe.';
    get('confirmCopy').disabled=true;
    return;
   }
   get('confirmCopy').disabled=false;
   const initialSource=sourceId&&availableQuizzes.find(x=>x.id===sourceId)
    ||(targetId&&availableQuizzes.find(x=>x.class_id!==targetId))
    ||availableQuizzes[0];
   sourceSelect.value=initialSource.id;
   const target=targetId&&findClass(targetId)
    ||classes.find(c=>c.id!==initialSource.class_id)
    ||findClass(initialSource.class_id)
    ||classes[0];
   targetSelect.value=target.id;
   lastAutomaticTitle='';
   get('copyTitle').value=automaticTitle();
   lastAutomaticTitle=get('copyTitle').value;
   get('copyMessage').textContent='';
   await describe();
  }catch(error){get('copyMessage').textContent='Chargement impossible : '+error.message;get('confirmCopy').disabled=true;}
 }
 get('quizList').addEventListener('click',e=>{
  const btn=e.target.closest('[data-copy-id]');
  if(btn)openCopy({sourceId:btn.dataset.copyId});
 });
 get('importQuiz').addEventListener('click',()=>openCopy({targetId:selected?.id}));

 get('copyForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const sourceId=get('copySource').value;
  const destId=get('copyDestination').value;
  const name=get('copyTitle').value.trim();
  if(!sourceId||!destId||!name){get('copyMessage').textContent='Choisis un quiz, une classe et un titre.';return;}
  const button=get('confirmCopy');
  button.disabled=true;
  button.textContent='Copie en cours…';
  get('copyMessage').textContent='Copie du quiz et des questions en cours…';
  try{
   const result=await req('rpc/ecoquiz_duplicate_quiz','POST',{
    p_source_quiz_id:sourceId,
    p_target_class_id:destId,
    p_new_title:name
   });
   if(!result?.quiz_id)throw Error('Le serveur n’a pas confirmé la création du quiz.');
   close();
   await openClass(destId);
   await openQuiz(result.quiz_id);
   const oldMessage=get('copySuccess');
   if(oldMessage)oldMessage.remove();
   const notice=document.createElement('div');
   notice.className='notice';
   notice.id='copySuccess';
   notice.setAttribute('role','status');
   notice.textContent='Quiz copié : '+result.questions+' question(s) dans '+(findClass(destId)?.name||'la classe')+'. La copie est un brouillon indépendant. Tu pourras la partager par QR code quand tu le souhaites.';
   get('classSummary').insertAdjacentElement('afterend',notice);
   notice.scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(error){
   get('copyMessage').textContent='Copie non effectuée : '+error.message;
  }finally{
   button.disabled=false;
   button.textContent='⧉ Créer la copie';
  }
 });
})();
