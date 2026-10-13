'use strict';
/* Import Pronote et cartes A4 : tout le CSV est traité localement,
   seules les identités retenues sont envoyées au projet Supabase ÉcoQuiz. */
(()=>{
 const csv=window.EcoQuizCSV;
 const by=id=>document.getElementById(id);
 if(!csv||!by('openCsvImport'))return;

 let documentCSV=null;
 let previewCandidates=[];
 let importing=false;
 const status=(message,kind='')=>{
  const element=by('csvImportMessage');
  element.textContent=message;
  element.className='muted '+kind;
 };
 const option=(value,label)=>{
  const element=document.createElement('option');
  element.value=String(value);
  element.textContent=String(label);
  return element;
 };
 function closeImport(){
  if(importing)return;
  by('csvImportPanel').classList.add('hide');
  status('');
 }
 by('closeCsvImport').addEventListener('click',closeImport);
 by('cancelCsvImport').addEventListener('click',closeImport);
 by('back').addEventListener('click',closeImport);
 by('classList').addEventListener('click',event=>{
  if(event.target.closest('.openClass'))closeImport();
 });
 by('openCsvImport').addEventListener('click',()=>{
  by('csvImportPanel').classList.remove('hide');
  by('csvImportPanel').scrollIntoView({behavior:'smooth',block:'start'});
  status('Sélectionne un export CSV Pronote. Aucun fichier brut ne sera envoyé sur Internet.');
 });

 function fillColumnSelect(id,initial){
  const select=by(id);
  select.replaceChildren();
  select.append(option('-1','— Aucune colonne —'));
  documentCSV.headers.forEach((text,index)=>{
   select.append(option(index,text+' (colonne '+(index+1)+')'));
  });
  select.value=String(initial>=0?initial:-1);
 }
 function formatClassFilter(){
  const index=documentCSV.defaults.class;
  const box=by('csvClassFilterArea');
  if(index<0){box.classList.add('hide');return}
  const values=[...new Set(documentCSV.rows.slice(documentCSV.startRow)
   .map(row=>csv.tidy(row[index])).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  if(!values.length||(values.length===1&&csv.fold(values[0])===csv.fold(selected?.name||''))){
   box.classList.add('hide');
   return;
  }
  box.classList.remove('hide');
  const select=by('csvClassFilter');
  select.replaceChildren();
  select.append(option('','— Choisir une classe du fichier —'));
  for(const name of values)select.append(option(name,name));
  select.append(option('*','Toutes les classes du CSV (à utiliser avec prudence)'));
  const wanted=csv.fold(selected?.name||'');
  const matched=values.find(value=>csv.fold(value)===wanted);
  select.value=matched||'';
 }
 function configureMapping(){
  const defaults=documentCSV.defaults;
  by('csvNameMode').value=defaults.mode;
  fillColumnSelect('csvLastCol',defaults.last>=0?defaults.last:0);
  fillColumnSelect('csvFirstCol',defaults.first>=0?defaults.first:Math.min(1,documentCSV.headers.length-1));
  fillColumnSelect('csvFullCol',defaults.full>=0?defaults.full:0);
  const select=by('csvSkipRows');
  select.replaceChildren();
  for(let i=0;i<Math.min(documentCSV.rows.length,21);i++){
   const row=documentCSV.rows[i]||[];
   const snippet=row.filter(Boolean).slice(0,2).map(x=>csv.tidy(x)).join(' | ').slice(0,65);
   select.append(option(i,'Ligne '+(i+1)+' : '+snippet));
  }
  select.value=String(documentCSV.startRow);
  formatClassFilter();
  by('csvMapping').classList.remove('hide');
  updatePreview();
 }
 function currentMapping(){
  const mode=by('csvNameMode').value;
  const last=Number(by('csvLastCol').value);
  const first=Number(by('csvFirstCol').value);
  const full=Number(by('csvFullCol').value);
  const classColumn=documentCSV.defaults.class;
  const classValue=by('csvClassFilterArea').classList.contains('hide')
   ?'*':by('csvClassFilter').value;
  return {mode,last,first,full,classColumn,classValue};
 }
 function toggleMapping(){
  by('csvSeparateColumns').classList.toggle('hide',by('csvNameMode').value!=='separate');
  by('csvCombinedColumn').classList.toggle('hide',by('csvNameMode').value!=='combined');
 }
 function updatePreview(){
  if(!documentCSV)return;
  toggleMapping();
  const config=currentMapping();
  let reason='';
  if(config.mode==='separate'&&(config.last<0||config.first<0||config.last===config.first)){
   reason='Sélectionne deux colonnes différentes : Nom et Prénom.';
  }
  if(config.mode==='combined'&&config.full<0)reason='Sélectionne la colonne Nom et Prénom.';
  if(config.classColumn>=0&&!by('csvClassFilterArea').classList.contains('hide')&&!config.classValue){
   reason='Ce CSV contient plusieurs classes : sélectionne la bonne classe avant l’import.';
  }
  const summary=by('csvSummary'), table=by('csvPreview'), confirm=by('confirmCsvImport');
  if(reason){
   previewCandidates=[];summary.textContent=reason;summary.className='csv-summary csv-warning';
   table.replaceChildren();confirm.disabled=true;return;
  }
  const doc={...documentCSV,startRow:Number(by('csvSkipRows').value)};
  const report=csv.selectStudents(doc,config,students.map(x=>x.display_name));
  previewCandidates=report.candidates;
  confirm.disabled=!previewCandidates.length||importing;
  const details=[
   previewCandidates.length+' élève(s) à ajouter',
   report.duplicates+' doublon(s) ignoré(s)',
   report.invalid+' ligne(s) incomplète(s)',
   report.filtered+' ligne(s) hors de la classe sélectionnée'
  ];
  summary.textContent=details.join(' · ');
  summary.className='csv-summary'+(report.invalid||report.duplicates?' csv-warning':'');
  table.replaceChildren();
  if(!previewCandidates.length){
   const empty=document.createElement('p');
   empty.className='muted';
   empty.textContent='Aucun nouvel élève à importer avec ces paramètres.';
   table.append(empty);
   return;
  }
  const caption=document.createElement('p');caption.className='muted';
  caption.textContent='Aperçu des '+Math.min(8,previewCandidates.length)+' premières identités (sur '+previewCandidates.length+'). Les codes personnels seront créés seulement après validation.';
  table.append(caption);
  const tab=document.createElement('table');
  const header=document.createElement('thead'),headrow=document.createElement('tr');
  for(const title of ['N°','Prénom et nom','État']){
   const th=document.createElement('th');th.textContent=title;headrow.append(th);
  }
  header.append(headrow);tab.append(header);
  const body=document.createElement('tbody');
  previewCandidates.slice(0,8).forEach((record,index)=>{
   const row=document.createElement('tr');
   for(const text of [String(index+1),record.display_name,'Nouveau code généré']){
    const td=document.createElement('td');td.textContent=text;row.append(td);
   }
   body.append(row);
  });
  tab.append(body);table.append(tab);
 }
 by('csvInput').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  by('csvMapping').classList.add('hide');
  documentCSV=null;
  previewCandidates=[];
  status('Analyse du CSV « '+file.name+' »…');
  try{
   const text=await csv.readFile(file);
   documentCSV=csv.parseDocument(text);
   if(documentCSV.rows.length>3000)throw Error('CSV très volumineux : plus de 3 000 lignes.');
   configureMapping();
   const hint='Fichier lu : '+file.name+' · '+documentCSV.rows.length+' lignes · '+documentCSV.headers.length+' colonnes. Vérifie l’aperçu, puis valide.';
   status(hint);
  }catch(error){
   status('Import impossible : '+error.message,'failure');
  }
 });
 for(const id of ['csvNameMode','csvLastCol','csvFirstCol','csvFullCol','csvClassFilter','csvSkipRows']){
  by(id).addEventListener('change',updatePreview);
 }
 by('confirmCsvImport').addEventListener('click',async()=>{
  if(importing||!selected||!documentCSV)return;
  updatePreview();
  const target=selected;
  if(!previewCandidates.length)return;
  let added=0,skipped=0;
  const failures=[];
  importing=true;
  const button=by('confirmCsvImport');
  button.disabled=true;button.textContent='Import en cours…';
  status('Ajout des élèves dans « '+target.name+' »…');
  try{
   // Recharge la liste avant l'import afin de préserver tous les codes existants.
   await refreshSelected();
   const report=csv.selectStudents(
    {...documentCSV,startRow:Number(by('csvSkipRows').value)},
    currentMapping(),
    students.map(x=>x.display_name)
   );
   const candidates=report.candidates;
   skipped=previewCandidates.length-candidates.length;
   for(let start=0;start<candidates.length;start+=25){
    if(selected?.id!==target.id)throw Error('La classe a changé pendant l’import.');
    const batch=candidates.slice(start,start+25);
    const records=batch.map(p=>({
     display_name:p.display_name,
     learner_code:randomCode(),
     class_code:target.name,
     class_id:target.id
    }));
    try{
     const saved=await req('ecoquiz_learners','POST',records);
     added+=saved.length;
    }catch(batchError){
     // Un doublon ou une collision de code ne doit pas perdre tout le reste.
     for(const record of records){
      let ok=false;
      for(let attempt=0;attempt<3;attempt++){
       try{
        record.learner_code=randomCode();
        await req('ecoquiz_learners','POST',record);
        added++;ok=true;break;
       }catch(error){
        const message=String(error.message||'');
        if(/duplicate key|already exists|unique constraint/i.test(message)){
         if(/display_name|class_name/i.test(message)){skipped++;ok=true;break}
         continue;
        }
        failures.push(record.display_name+' : '+message);ok=true;break;
       }
      }
      if(!ok)failures.push(record.display_name+' : code unique non généré après plusieurs essais');
     }
    }
    status(added+' élève(s) ajoutés sur '+candidates.length+'…');
   }
   await refreshSelected();
   const final=added+' élève(s) importé(s). '+(report.duplicates+skipped)+' déjà présents / doublons ignorés.';
   status(final+(failures.length?' '+failures.length+' erreur(s) à vérifier.':''),failures.length?'failure':'success');
   updatePreview();
   if(added){
    const confirmation=document.createElement('p');
    confirmation.className='notice';
    confirmation.textContent='Les codes personnels sont prêts. Clique sur « Imprimer les codes A4 » dans la liste des élèves pour les distribuer.';
    by('csvImportMessage').after(confirmation);
    setTimeout(()=>confirmation.remove(),18000);
   }
   if(failures.length)console.warn('EcoQuiz CSV import : '+failures.length+' enregistrement(s) non importé(s)');
  }catch(error){
   status('Import interrompu : '+error.message+'. Les '+added+' élèves déjà ajoutés sont conservés.','failure');
  }finally{
   importing=false;
   button.disabled=!previewCandidates.length;
   button.textContent='✓ Importer les élèves affichés';
  }
 });

 /* Planche imprimable de 8 cartes au format A4, génération locale. */
 const append=(parent,tag,className,text)=>{
  const node=document.createElement(tag);
  node.className=className;
  node.textContent=text;
  parent.append(node);
  return node;
 };
 function printCards(roster){
  if(!selected){alert('Sélectionne une classe.');return}
  if(!roster.length){alert('La classe ne contient encore aucun élève.');return}
  document.getElementById('ecoPrintSheet')?.remove();
  const area=document.createElement('section');
  area.id='ecoPrintSheet';
  area.setAttribute('aria-hidden','true');
  const order=[...roster].sort((a,b)=>a.display_name.localeCompare(b.display_name,'fr',{sensitivity:'base'}));
  for(let start=0;start<order.length;start+=8){
   const page=document.createElement('div');
   page.className='printPage';
   for(const student of order.slice(start,start+8)){
    const card=document.createElement('article');
    card.className='printCard';
    const brand=document.createElement('div');
    brand.className='printBrand';
    const eco=append(brand,'span','eco','Éco');
    const quiz=append(brand,'span','quiz','Quiz');
    card.append(brand);
    append(card,'div','printClass','Classe '+selected.name);
    append(card,'div','printName',student.display_name);
    append(card,'div','printCode',student.learner_code);
    append(card,'div','printHelp','Mon code personnel · À conserver pour tous mes quiz');
    page.append(card);
   }
   area.append(page);
  }
  document.body.append(area);
  const cleanup=()=>{area.remove();window.removeEventListener('afterprint',cleanup)};
  window.addEventListener('afterprint',cleanup,{once:true});
  window.print();
 }
 by('printAllCodes').addEventListener('click',()=>printCards(students));
 by('students').addEventListener('click',event=>{
  const button=event.target.closest('[data-student-id].printSingleCode');
  if(!button)return;
  const learner=students.find(s=>s.id===button.dataset.studentId);
  if(learner)printCards([learner]);
 });
})();
