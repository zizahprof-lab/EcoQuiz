'use strict';
/* Notifications de participation ÉcoQuiz.
 * Surveille les tentatives terminées toutes les 10 secondes, UNIQUEMENT
 * lorsque l'enseignant a ouvert sa session. Les données passent par les
 * politiques Supabase RLS (aucun accès public aux notes).
 */
(()=>{
 const by=id=>document.getElementById(id);
 const area=by('teacherNotifArea'),bell=by('teacherNotifBell'),panel=by('teacherNotifPanel');
 const list=by('teacherNotifList'),badge=by('teacherNotifBadge'),toasts=by('teacherNotifToasts');
 if(!area||!bell||!panel||!list||!badge||!toasts)return;
 const PATH='ecoquiz_attempts?select=id,learner_id,quiz_id,score,max_score,completed_at,ecoquiz_learners(display_name),ecoquiz_quizzes(id,title,class_id,ecoquiz_classes(name))&order=completed_at.desc&limit=100';
 const PERIOD=10000;
 let active=false,initialized=false,loading=false,history=[],unread=new Set(),known=new Set(),interval=null,generation=0;
 const asText=v=>String(v??'');
 function display(item){
  const quiz=item.ecoquiz_quizzes||{};
  const learner=item.ecoquiz_learners||{};
  const school=quiz.ecoquiz_classes||{};
  return {
   id:item.id,
   name:asText(learner.display_name||'Élève'),
   className:asText(school.name||'Classe'),
   quizTitle:asText(quiz.title||'Quiz'),
   grade:Number.isFinite(Number(item.score))&&Number.isFinite(Number(item.max_score))?item.score+' / '+item.max_score:'—',
   time:item.completed_at?new Date(item.completed_at).toLocaleString('fr-FR'):'Date indisponible',
   classId:quiz.class_id,
   quizId:item.quiz_id
  };
 }
 function setBadge(){
  badge.textContent=unread.size>99?'99+':String(unread.size);
  badge.classList.toggle('hide',unread.size===0);
  bell.setAttribute('aria-label',unread.size?unread.size+' notifications de quiz non lues':'Afficher les quiz terminés');
 }
 function element(tag,className,textValue){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(textValue!==undefined)node.textContent=textValue;
  return node;
 }
 async function navigate(item){
  close();
  try{
   if(!item.classId||!item.quizId)throw Error('Ce quiz n’est plus disponible.');
   if(!classes.some(c=>c.id===item.classId))await loadClasses();
   await openClass(item.classId);
   await openQuiz(item.quizId);
  }catch(e){alert('Impossible d’ouvrir ce résultat : '+(e?.message||e))}
 }
 function renderList(){
  list.replaceChildren();
  if(!history.length){
   list.append(element('p','teacherNotifEmpty','Aucun quiz terminé pour le moment.'));
   return;
  }
  history.forEach(raw=>{
   const item=display(raw);
   const button=element('button','teacherNotifRow'+(unread.has(item.id)?' unread':''));
   button.type='button';
   button.title='Voir les résultats de ce quiz';
   button.setAttribute('aria-label','Voir les résultats de '+item.name+', '+item.quizTitle);
   button.append(element('strong','',item.name+' a terminé son quiz'));
   button.append(element('small','',item.className+' · '+item.quizTitle));
   const foot=element('div','teacherNotifMeta');
   foot.append(element('span','',item.time),element('b','',item.grade));
   button.append(foot);
   button.addEventListener('click',()=>navigate(item));
   list.append(button);
  });
 }
 function clearUnread(){unread.clear();setBadge();renderList()}
 function close(){
  panel.classList.add('hide');
  bell.setAttribute('aria-expanded','false');
 }
 function open(){
  clearUnread();
  panel.classList.remove('hide');
  bell.setAttribute('aria-expanded','true');
 }
 function dismissToast(node){node.remove()}
 function toast(raw){
  const item=display(raw);
  const wrapper=element('div','teacherNotifToast');
  const icon=element('span','teacherNotifToastIcon','✓');
  icon.setAttribute('aria-hidden','true');
  const body=element('div','teacherNotifToastBody');
  body.append(element('strong','','Quiz terminé !'));
  body.append(element('p','',item.name+' · '+item.className+' · '+item.quizTitle+' · '+item.grade));
  const see=element('button','teacherNotifToastOpen','Voir les résultats');
  see.type='button';
  see.addEventListener('click',()=>{dismissToast(wrapper);navigate(item)});
  body.append(see);
  const dismiss=element('button','teacherNotifToastDismiss','×');
  dismiss.type='button';
  dismiss.setAttribute('aria-label','Fermer cette notification');
  dismiss.addEventListener('click',()=>dismissToast(wrapper));
  wrapper.append(icon,body,dismiss);
  toasts.prepend(wrapper);
  setTimeout(()=>dismissToast(wrapper),11000);
 }
 async function poll(){
  if(!active||loading||!token)return;
  loading=true;
  const current=generation;
  try{
   const rows=await req(PATH);
   if(!active||current!==generation)return;
   if(!Array.isArray(rows))throw Error('Format des notifications incorrect');
   history=rows;
   if(!initialized){
    known=new Set(rows.map(r=>r.id));
    initialized=true;
   }else{
    const fresh=rows.filter(r=>!known.has(r.id)).reverse();
    rows.forEach(r=>known.add(r.id));
    if(fresh.length){
     fresh.forEach(r=>unread.add(r.id));
     if(fresh.length<=4)fresh.forEach(toast);
     else{
      fresh.slice(-3).forEach(toast);
      const notice=element('div','teacherNotifToast');
      notice.append(element('span','teacherNotifToastIcon','🔔'),
       element('div','teacherNotifToastBody',fresh.length+' nouveaux quiz terminés. Ouvre la cloche pour tous les consulter.'));
      toasts.prepend(notice);
      setTimeout(()=>notice.remove(),11000);
     }
     if(!panel.classList.contains('hide'))unread.clear();
    }
   }
   setBadge();
   renderList();
   by('teacherNotifStatus').textContent='Vérification automatique toutes les 10 s';
  }catch(error){
   if(active&&current===generation){
    by('teacherNotifStatus').textContent='Connexion momentanément indisponible · nouvel essai automatique';
   }
  }finally{
   loading=false;
  }
 }
 function stop(){
  active=false;initialized=false;generation++;loading=false;
  known.clear();unread.clear();history=[];
  if(interval!==null){clearInterval(interval);interval=null}
  area.classList.add('hide');close();setBadge();
  list.replaceChildren();
  toasts.replaceChildren();
 }
 function start(){
  if(active)return;
  active=true;initialized=false;generation++;
  known.clear();unread.clear();history=[];
  area.classList.remove('hide');setBadge();renderList();
  poll();
  interval=setInterval(poll,PERIOD);
 }
 bell.addEventListener('click',()=>{
  if(panel.classList.contains('hide'))open();else close();
 });
 by('teacherNotifClose').addEventListener('click',close);
 by('teacherNotifRefresh').addEventListener('click',poll);
 document.addEventListener('click',ev=>{
  if(active&&!area.contains(ev.target)&&!panel.classList.contains('hide'))close();
 });
 document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!panel.classList.contains('hide'))close()});
 document.addEventListener('visibilitychange',()=>{if(active&&!document.hidden)poll()});
 window.addEventListener('focus',()=>{if(active)poll()});
 window.EcoQuizTeacherNotifications=Object.freeze({start,stop,refresh:poll});
})();