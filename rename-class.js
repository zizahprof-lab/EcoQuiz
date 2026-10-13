'use strict';
/* ÉcoQuiz : renommage des classes depuis ⋮, sans perdre les codes ni les résultats. */
(()=>{
 const by=id=>document.getElementById(id);
 const overlay=by('renameOverlay');
 if(!overlay)return;
 const form=by('renameClassForm');
 const input=by('renameClassInput');
 const submit=by('confirmRename');
 const error=by('renameError');
 let context=null;
 let busy=false;
 let focusSource=null;

 function hideContextMenus(){
  document.querySelectorAll('.ecoMenu').forEach(menu=>{
   menu.querySelector('.ecoMenuPanel')?.classList.add('hide');
   menu.querySelector('.moreOptions')?.setAttribute('aria-expanded','false');
  });
 }
 const normalized=value=>String(value||'').trim().replace(/\s+/g,' ');
 const compare=value=>normalized(value).toLocaleLowerCase('fr');

 function validate(){
  if(!context||busy){submit.disabled=true;return false}
  const value=normalized(input.value);
  let message='';
  if(!value)message='Saisis un nom de classe.';
  else if(value.length>100)message='Maximum 100 caractères.';
  else if(value===context.originalName)message='';
  else if(classes.some(c=>c.id!==context.id&&compare(c.name)===compare(value))){
   message='Une autre classe porte déjà ce nom.';
  }
  error.textContent=message;
  const valid=Boolean(value)&&value.length<=100&&value!==context.originalName&&!message;
  submit.disabled=!valid;
  return valid;
 }
 function close(){
  if(busy)return;
  overlay.classList.add('hide');
  document.body.style.removeProperty('overflow');
  context=null;
  input.value='';
  error.textContent='';
  submit.disabled=true;
  if(focusSource?.isConnected)focusSource.focus({preventScroll:true});
  focusSource=null;
 }
 function open(classId){
  if(busy||!classId)return;
  const item=classes.find(c=>c.id===classId);
  if(!item){alert('Cette classe est introuvable. Actualise la page.');return}
  focusSource=document.activeElement;
  hideContextMenus();
  context={id:item.id,originalName:item.name};
  by('renameOldName').textContent=item.name;
  input.value=item.name;
  overlay.classList.remove('hide');
  document.body.style.overflow='hidden';
  validate();
  input.focus({preventScroll:true});
  input.select();
 }
 document.addEventListener('click',event=>{
  const action=event.target.closest('.editMenuAction');
  if(!action)return;
  event.preventDefault();
  event.stopPropagation();
  const id=action.dataset.renameId||(action.dataset.renameCurrent==='class'?selected?.id:null);
  open(id);
 });
 input.addEventListener('input',validate);
 by('cancelRename').addEventListener('click',close);
 overlay.addEventListener('click',event=>{if(event.target===overlay)close()});
 document.addEventListener('keydown',event=>{
  if(overlay.classList.contains('hide'))return;
  if(event.key==='Escape'){
   event.preventDefault();
   if(!busy)close();
   return;
  }
  if(event.key!=='Tab')return;
  const items=[...overlay.querySelectorAll('input:not(:disabled),button:not(:disabled)')];
  if(!items.length)return;
  const first=items[0],last=items[items.length-1];
  if(event.shiftKey&&document.activeElement===first){
   event.preventDefault();last.focus();
  }else if(!event.shiftKey&&document.activeElement===last){
   event.preventDefault();first.focus();
  }
 });
 by('logout').addEventListener('click',()=>{if(!busy)close()});
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!context||busy||!validate())return;
  const id=context.id,oldName=context.originalName,newName=normalized(input.value);
  busy=true;
  input.disabled=true;
  submit.disabled=true;
  by('cancelRename').disabled=true;
  submit.textContent='Enregistrement…';
  error.textContent='';
  let saved=false;
  try{
   const result=await req('rpc/ecoquiz_rename_class','POST',{
    p_class_id:id,
    p_new_name:newName
   });
   if(!result||result.success!==true||result.class_id!==id){
    throw Error('Le serveur n’a pas confirmé le changement de nom.');
   }
   saved=true;
   busy=false;
   input.disabled=false;
   by('cancelRename').disabled=false;
   submit.textContent='✓ Enregistrer le nouveau nom';
   close();

   const displayed=selected?.id===id;
   await loadClasses();
   if(displayed){
    const updated=classes.find(c=>c.id===id);
    if(updated){
     selected=updated;
     by('classTitle').textContent=updated.name;
     await refreshSelected();
    }
   }
   const notice=document.createElement('p');
   notice.className='notice';
   notice.setAttribute('role','status');
   notice.textContent='Classe renommée : « '+oldName+' » devient « '+result.new_name+' ». Les codes élèves et les résultats sont conservés.';
   const destination=displayed?by('classSummary'):by('classList');
   destination.after(notice);
   setTimeout(()=>notice.remove(),11000);
  }catch(e){
   busy=false;
   input.disabled=false;
   by('cancelRename').disabled=false;
   submit.textContent='✓ Enregistrer le nouveau nom';
   if(saved){
    close();
    alert('La classe a bien été renommée dans la base, mais la liste n’a pas pu être actualisée. Recharge la page. Détail : '+e.message);
   }else{
    error.textContent=e.message||'Impossible de renommer la classe.';
    validate();
   }
  }
 });
})();
