'use strict';
/* ÉcoQuiz : suppression explicite et transactionnelle depuis les menus ⋮.
 * La suppression n'est déclenchée qu'après confirmation explicite Oui/Non.
 */
(()=>{
 const by=id=>document.getElementById(id);
 const overlay=by('deleteOverlay');
 if(!overlay)return;
 const confirmButton=by('confirmDeletion');
 const errorBox=by('deleteError');
 let current=null;
 let requestNumber=0;
 let busy=false;
 let returnFocus=null;

 function closeMenus(){
  document.querySelectorAll('.ecoMenu').forEach(menu=>{
   const panel=menu.querySelector('.ecoMenuPanel');
   const trigger=menu.querySelector('.moreOptions');
   if(panel)panel.classList.add('hide');
   if(trigger)trigger.setAttribute('aria-expanded','false');
  });
 }
 function closeDialog(){
  if(busy)return;
  requestNumber++;
  current=null;
  overlay.classList.add('hide');
  document.body.style.removeProperty('overflow');
  errorBox.textContent='';
  confirmButton.disabled=true;
  if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
  returnFocus=null;
 }
 function checkConfirmation(){
  confirmButton.disabled=busy||!current?.preview;
 }
 function setError(message){
  errorBox.textContent=message;
  if(message)errorBox.scrollIntoView({block:'nearest'});
 }
 function impactText(preview){
  if(preview.type==='class'){
   return 'Seront supprimés : '+preview.students+' élève(s), '+preview.quizzes
    +' quiz/test(s) et '+preview.attempts+' résultat(s).';
  }
  return 'Seront supprimés : '+preview.questions+' question(s) et '
   +preview.attempts+' résultat(s). Les autres quiz et élèves sont conservés.';
 }
 async function openDialog(type,id){
  if(busy||!['class','quiz'].includes(type)||!id)return;
  closeMenus();
  requestNumber++;
  const serial=requestNumber;
  returnFocus=document.activeElement;
  current={type,id,preview:null};
  overlay.classList.remove('hide');
  document.body.style.overflow='hidden';
  by('deleteDialogTitle').textContent='Êtes-vous sûr ?';
  by('deleteDialogDescription').textContent='Vérification de l’élément à supprimer…';
  by('deleteImpact').textContent='Vérification du nombre d’élèves, de questions et de résultats…';
  confirmButton.disabled=true;
  setError('');
  try{
   const preview=await req('rpc/ecoquiz_deletion_preview','POST',{
    p_target_type:type,
    p_target_id:id
   });
   if(serial!==requestNumber||!current||current.id!==id)return;
   if(preview.type!==type||preview.id!==id||typeof preview.name!=='string')throw Error('Aperçu de suppression incohérent.');
   current.preview=preview;
   by('deleteImpact').textContent=impactText(preview);
   by('deleteDialogDescription').textContent=type==='class'
    ?'Voulez-vous supprimer la classe « '+preview.name+' » ?'
    :'Voulez-vous supprimer le quiz/test « '+preview.name+' » ?';
   checkConfirmation();
   by('cancelDeletion').focus({preventScroll:true});
  }catch(error){
   if(serial!==requestNumber)return;
   by('deleteImpact').textContent='Impossible de vérifier les données liées à cette suppression.';
   setError('Suppression indisponible : '+error.message);
  }
 }

 document.addEventListener('click',event=>{
  const btn=event.target.closest('.moreOptions');
  if(btn){
   event.preventDefault();
   event.stopPropagation();
   const menu=btn.closest('.ecoMenu');
   const panel=menu?.querySelector('.ecoMenuPanel');
   const wasClosed=panel?.classList.contains('hide');
   closeMenus();
   if(menu&&panel&&wasClosed){
    panel.classList.remove('hide');
    btn.setAttribute('aria-expanded','true');
   }
   return;
  }
  const action=event.target.closest('.dangerMenuAction');
  if(action){
   event.preventDefault();
   event.stopPropagation();
   let type=action.dataset.deleteType;
   let id=action.dataset.deleteId;
   if(action.dataset.deleteCurrent==='class'){type='class';id=selected?.id}
   if(action.dataset.deleteCurrent==='quiz'){type='quiz';id=quizSelected?.id}
   if(type&&id)openDialog(type,id);
   return;
  }
  if(!event.target.closest('.ecoMenu'))closeMenus();
 });
 by('cancelDeletion').addEventListener('click',closeDialog);
 overlay.addEventListener('click',event=>{
  if(event.target===overlay)closeDialog();
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
   closeMenus();
   if(!overlay.classList.contains('hide'))closeDialog();
   return;
  }
  if(event.key!=='Tab'||overlay.classList.contains('hide'))return;
  const focusable=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 });
 by('logout').addEventListener('click',()=>{if(!busy)closeDialog();closeMenus()});

 confirmButton.addEventListener('click',async()=>{
  if(busy||!current?.preview)return;
  const type=current.type,id=current.id,preview=current.preview;
  busy=true;
  confirmButton.disabled=true;
  confirmButton.textContent='Suppression en cours…';
  by('cancelDeletion').disabled=true;
  setError('');
  let serverConfirmed=false;
  try{
   const result=await req('rpc/ecoquiz_delete_item','POST',{
    p_target_type:type,
    p_target_id:id,
    p_confirmation:preview.name
   });
   if(result?.deleted!==true)throw Error('La suppression n’a pas été confirmée par le serveur.');
   serverConfirmed=true;
   busy=false;
   by('cancelDeletion').disabled=false;
   confirmButton.textContent='Oui, supprimer';
   closeDialog();

   if(type==='class'){
    if(selected?.id===id){
     selected=null;
     quizSelected=null;
     students=[];
     quizzes=[];
     for(const section of ['classDetails','quizDetail','editor','longitudinal','csvImportPanel','copyPanel']){
      const node=by(section);
      if(node)node.classList.add('hide');
     }
    }
    await loadClasses();
   }else{
    if(quizSelected?.id===id){
     quizSelected=null;
     by('quizDetail').classList.add('hide');
    }
    if(selected&&quizzes.some(q=>q.id===id)){
     await refreshSelected();
    }else{
     await loadClasses();
    }
   }
   // Information non intrusive après confirmation du serveur.
   const notice=document.createElement('p');
   notice.className='notice';
   notice.setAttribute('role','status');
   notice.textContent=(type==='class'?'Classe supprimée : ':'Quiz/test supprimé : ')
    +preview.name+'. '+(result.attempts_deleted||0)+' participation(s) associée(s) supprimée(s).';
   const target=by('classList');
   target.parentElement.append(notice);
   setTimeout(()=>notice.remove(),10000);
  }catch(error){
   if(serverConfirmed){
    busy=false;
    alert('La suppression a bien été enregistrée, mais l’actualisation de l’écran a échoué. Recharge la page pour voir la liste à jour. Détail : '+error.message);
    return;
   }
   busy=false;
   by('cancelDeletion').disabled=false;
   confirmButton.textContent='Oui, supprimer';
   checkConfirmation();
   setError('La suppression a échoué : '+error.message+'. Aucun succès n’est confirmé.');
  }
 });
})();
