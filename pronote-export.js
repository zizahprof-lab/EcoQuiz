'use strict';
/* Export PRONOTE pour chaque quiz de classe — notes ramenées sur 20.
 * Aucun accès direct à PRONOTE : export Excel, puis collage dans un devoir PRONOTE.
 * Important : les élèves sans participation occupent une ligne vide.
 */
(()=>{
 const by=id=>document.getElementById(id);
 const excel=by('exportQuizExcel'),csv=by('exportQuizCsv'),copy=by('copyQuizNotes'),status=by('pronoteExportStatus');
 if(!excel||!csv||!copy||!status)return;
 let snapshot=null;
 const collator=new Intl.Collator('fr-FR',{sensitivity:'base',numeric:true});
 const upperWord=part=>{
  const letters=String(part).replace(/[^A-Za-zÀ-ÿ]/g,'');
  return letters.length>0&&letters===letters.toLocaleUpperCase('fr-FR');
 };
 function nameParts(value){
  const tokens=String(value??'').trim().split(/\s+/).filter(Boolean);
  if(!tokens.length)return {family:'',given:'',original:''};
  let family='',given='';
  const firstNotUpper=tokens.findIndex(t=>!upperWord(t));
  if(upperWord(tokens[0])&&firstNotUpper>0){
   // Export PRONOTE : « ACHOUR BELMAMOUN Aya ».
   family=tokens.slice(0,firstNotUpper).join(' ');
   given=tokens.slice(firstNotUpper).join(' ');
  }else if(!upperWord(tokens[0])){
   const familyAt=tokens.findIndex((t,i)=>i>0&&upperWord(t));
   if(familyAt>0){
    // Format ÉcoQuiz : « Aya ACHOUR BELMAMOUN ».
    family=tokens.slice(familyAt).join(' ');
    given=tokens.slice(0,familyAt).join(' ');
   }else if(tokens.length>1){
    family=tokens[tokens.length-1];
    given=tokens.slice(0,-1).join(' ');
   }else family=tokens[0];
  }else{
   family=tokens.join(' ');
  }
  return {family,given,original:tokens.join(' ')};
 }
 function gradeFromAttempt(attempt){
  const score=Number(attempt?.score),max=Number(attempt?.max_score);
  if(!Number.isFinite(score)||!Number.isFinite(max)||max<=0||score<0||score>max)return null;
  return Math.round((score/max)*20*100)/100;
 }
 function asDate(dateValue){
  if(!dateValue)return null;
  const date=new Date(dateValue);
  return Number.isNaN(date.getTime())?null:date;
 }
 function rowsFrom({students,attempts}){
  const latest=new Map(),times=new Map(),counts=new Map();
  for(const attempt of attempts){
   if(!attempt.learner_id)continue;
   const id=attempt.learner_id;
   counts.set(id,(counts.get(id)||0)+1);
   const when=asDate(attempt.completed_at)?.getTime()??0;
   if(!latest.has(id)||when>times.get(id)){
    latest.set(id,attempt);times.set(id,when);
   }
  }
  return students.map(student=>{
   const id=student.id;
   const parsed=nameParts(student.display_name);
   const attempt=latest.get(id);
   const grade=attempt?gradeFromAttempt(attempt):null;
   return {
    id,
    family:parsed.family,
    given:parsed.given,
    original:parsed.original,
    note:grade,
    count:counts.get(id)||0,
    date:attempt?(asDate(attempt.completed_at)?.toLocaleString('fr-FR')||''):'',
    originalScore:attempt?String(attempt.score)+'/'+String(attempt.max_score):''
   };
  }).sort((a,b)=>collator.compare(a.family,b.family)||collator.compare(a.given,b.given)||collator.compare(a.original,b.original));
 }
 function notesForPronote(rows){
  // Une ligne par élève. Une case vide reste vide ; jamais de zéro automatique.
  return rows.map(row=>row.note===null?'':row.note.toLocaleString('fr-FR',{maximumFractionDigits:2,useGrouping:false})).join('\n');
 }
 function fileName(name){
  return String(name??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,54)||'Quiz';
 }
 function current(){
  if(!snapshot)throw Error('Ouvre les résultats d’un quiz pour exporter les notes.');
  return {...snapshot,rows:rowsFrom(snapshot)};
 }
 function statusMessage(message,problem=false){
  status.textContent=message;
  status.classList.toggle('error',problem);
 }
 function clear(){
  snapshot=null;
  excel.disabled=true;csv.disabled=true;copy.disabled=true;
  statusMessage('Ouvre les résultats d’un quiz pour préparer les notes.');
 }
 function setData({quiz,className,students,attempts}){
  snapshot={
   title:String(quiz?.title||'Quiz'),
   className:String(className||'Classe'),
   students:Array.isArray(students)?students.map(s=>({...s})):[],
   attempts:Array.isArray(attempts)?attempts.map(a=>({...a})):[]
  };
  excel.disabled=false;csv.disabled=false;copy.disabled=false;
  const rows=rowsFrom(snapshot);
  const graded=rows.filter(r=>r.note!==null).length;
  statusMessage(graded+' élève'+(graded>1?'s':'')+' noté'+(graded>1?'s':'')+' sur '+rows.length+
   ' · ordre alphabétique par NOM · dernière tentative retenue · cases vides pour les élèves sans note.');
 }
 /* CSV PRONOTE : une colonne « Nom et prénom » + une colonne « Note /20 ».
  * Point-virgule, virgule décimale et BOM UTF-8 pour les accents.
  * La liste garantit qu'une ligne reste présente pour chaque élève,
  * même si sa note est vide. */
 function csvCell(value){
  const raw=String(value??'');
  const safe=/^[\s]*[=+@-]/.test(raw)?"'"+raw:raw;
  return /[;"\r\n]/.test(safe)?'"'+safe.replace(/"/g,'""')+'"':safe;
 }
 function csvGrade(value){
  if(value===null)return '';
  return Number(value).toLocaleString('fr-FR',{maximumFractionDigits:2,useGrouping:false});
 }
 function buildCsvRows(rows){
  return [
   ['Nom et prénom','Note /20'].join(';'),
   ...rows.map(row=>[csvCell([row.family,row.given].filter(Boolean).join(' ')),csvGrade(row.note)].join(';'))
  ].join('\r\n')+'\r\n';
 }
 function exportCsv(){
  try{
   const {rows,title,className}=current();
   if(!rows.length)throw Error('Cette classe ne contient pas encore d’élèves.');
   const contents='\uFEFF'+buildCsvRows(rows);
   const blob=new Blob([contents],{type:'text/csv;charset=utf-8'});
   const fileUrl=URL.createObjectURL(blob);
   const link=document.createElement('a');
   link.href=fileUrl;
   link.download='EcoQuiz_'+fileName(className)+'_'+fileName(title)+'_PRONOTE_2_colonnes_notes_sur_20.csv';
   link.hidden=true;
   document.body.append(link);
   link.click();
   link.remove();
   setTimeout(()=>URL.revokeObjectURL(fileUrl),5000);
   statusMessage('CSV PRONOTE créé : Nom et prénom ; Note /20. Dans PRONOTE, choisis « Autre » comme séparateur et saisis ; puis associe les deux colonnes (ignore la première ligne).');
  }catch(e){statusMessage(e.message||'Échec de l’export CSV.',true)}
 }
 function exportExcel(){
  try{
   const workbookLib=window.XLSX;
   if(!workbookLib?.utils||typeof workbookLib.writeFile!=='function')
    throw Error('Le module Excel ne s’est pas chargé. Vérifie ta connexion puis recharge la page.');
   const {rows,title,className}=current();
   if(!rows.length)throw Error('Cette classe ne contient pas encore d’élèves.');
   const wb=workbookLib.utils.book_new();
   // Feuille 1 : cellules à copier directement, sans ligne d’en-tête.
   const notesSheet=workbookLib.utils.aoa_to_sheet(rows.map(row=>[row.note===null?null:row.note]));
   notesSheet['!cols']=[{wch:17}];
   notesSheet['!ref']='A1:A'+rows.length;
   for(let i=1;i<=rows.length;i++){
    const cell=notesSheet['A'+i];
    if(cell&&cell.t==='n')cell.z='0.##';
   }
   workbookLib.utils.book_append_sheet(wb,notesSheet,'Notes PRONOTE');
   // Feuille 2 : contrôle des noms et notes, avant collage dans PRONOTE.
   const detail=[
    ['Classe',className],
    ['Évaluation',title],
    ['Barème',20],
    ['Note retenue','Dernière participation de chaque élève'],
    [],
    ['NOM','Prénom','Élève ÉcoQuiz','Note /20','Note initiale','Participations','Dernière réponse']
   ];
   for(const row of rows){
    detail.push([row.family,row.given,row.original,row.note,row.originalScore,row.count,row.date]);
   }
   const control=workbookLib.utils.aoa_to_sheet(detail);
   control['!cols']=[{wch:24},{wch:19},{wch:35},{wch:15},{wch:15},{wch:16},{wch:23}];
   control['!freeze']={ySplit:6};
   control['!autofilter']={ref:'A6:G'+(rows.length+6)};
   for(let i=7;i<=rows.length+6;i++){
    const cell=control['D'+i];
    if(cell&&cell.t==='n')cell.z='0.##';
   }
   workbookLib.utils.book_append_sheet(wb,control,'Vérification');
   workbookLib.writeFile(wb,'EcoQuiz_'+fileName(className)+'_'+fileName(title)+'_notes_sur_20.xlsx',{compression:true});
   statusMessage('Fichier Excel créé. Vérifie les noms dans « Vérification », puis copie uniquement « Notes PRONOTE ».');
  }catch(e){statusMessage(e.message||'Échec de l’export Excel.',true)}
 }
 async function copyGrades(){
  try{
   const {rows}=current();
   if(!rows.length)throw Error('Cette classe ne contient pas encore d’élèves.');
   const text=notesForPronote(rows);
   if(!navigator.clipboard?.writeText)throw Error('Copie automatique indisponible : utilise l’onglet « Notes PRONOTE » du fichier Excel.');
   await navigator.clipboard.writeText(text);
   statusMessage(rows.length+' lignes de notes copiées, sans noms ni titre. Dans PRONOTE, colle-les dans le devoir après avoir vérifié l’ordre des élèves.');
  }catch(e){statusMessage(e.message||'Impossible de copier les notes.',true)}
 }
 excel.addEventListener('click',exportExcel);
 csv.addEventListener('click',exportCsv);
 copy.addEventListener('click',copyGrades);
 clear();
 window.EcoQuizPronoteExport=Object.freeze({setData,clear,rowsFrom,notesForPronote,buildCsvRows,nameParts,gradeFromAttempt});
})();