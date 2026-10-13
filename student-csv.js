'use strict';
/* Parsing local d'exports CSV Pronote (aucun transfert du fichier brut). */
(function (root) {
  const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  const tidy=value=>String(value??'').replace(/[\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim();

  function parseCSV(text,separator=';'){
    if(![',',';','\t','|'].includes(separator))throw Error('Séparateur CSV invalide');
    const rows=[];let row=[],cell='',quoted=false;
    const pushCell=()=>{row.push(cell);cell=''};
    const pushRow=()=>{
      pushCell();
      if(row.some(x=>x.trim().length>0))rows.push(row);
      row=[];
    };
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(ch==='"'){
        if(quoted&&text[i+1]==='"'){cell+='"';i++}
        else quoted=!quoted;
      }else if(!quoted&&ch===separator)pushCell();
      else if(!quoted&&(ch==='\n'||ch==='\r')){
        if(ch==='\r'&&text[i+1]==='\n')i++;
        pushRow();
      }else cell+=ch;
    }
    if(quoted)throw Error('CSV mal formé : guillemets non refermés');
    if(cell!==''||row.length)pushRow();
    return rows;
  }
  function headerKind(cell){
    const h=fold(cell);
    if(!h)return '';
    if(/^(prenom|prenoms|prenom eleve|prenom de l eleve|prenom usuel|prenom s)$/.test(h))return 'first';
    if(/^(nom|nom eleve|nom de l eleve|nom de famille|nom usage|nom usuel|nom de naissance|nom patronymique)$/.test(h))return 'last';
    if(/^(nom prenom|nom et prenom|nom et prenoms|nom prenoms|eleve|eleves|liste des eleves|nom et prenom des eleves|identite|identite eleve|identite des eleves|identite de l eleve)$/.test(h))return 'full';
    if(/^(classe|division|classe division|classe de l eleve|classe des eleves|classe de rattachement|classe d origine)$/.test(h))return 'class';
    return '';
  }
  function headerGuess(rows){
    let winner={score:0,index:-1,last:-1,first:-1,full:-1,class:-1};
    for(let i=0;i<Math.min(18,rows.length);i++){
      const kinds=rows[i].map(headerKind);
      const last=kinds.indexOf('last'),first=kinds.indexOf('first'),full=kinds.indexOf('full'),cls=kinds.indexOf('class');
      const score=(last>=0?3:0)+(first>=0?3:0)+(full>=0?4:0)+(cls>=0?1:0);
      if(score>winner.score)winner={score,index:i,last,first,full,class:cls};
    }
    return winner;
  }
  function parseDocument(text){
    let sanitized=String(text||'').replace(/^\uFEFF/,'');
    const sepMatch=sanitized.match(/^sep=([;,\t|])\r?\n/i);
    if(sepMatch)sanitized=sanitized.slice(sepMatch[0].length);
    let best=null;
    const choices=sepMatch?[sepMatch[1]]:[';','\t',',','|'];
    for(const delim of choices){
      try{
        const rows=parseCSV(sanitized,delim);
        const header=headerGuess(rows);
        const width=rows.slice(0,20).filter(r=>r.length>1).length;
        const score=header.score*100+width*2+(rows[0]?.length||0)+(delim===';'?0.2:0);
        if(!best||score>best.score)best={rows,header,delimiter:delim,score};
      }catch(error){if(choices.length===1)throw error}
    }
    if(!best||!best.rows.length)throw Error('Le fichier CSV est vide ou illisible.');
    const raw=best.rows;
    const maxLen=Math.max(...raw.slice(0,30).map(r=>r.length));
    if(maxLen<1)throw Error('Aucune colonne de données détectée.');
    const detected=best.header.index>=0&&(best.header.score>=4);
    const headerIndex=detected?best.header.index:-1;
    const headerRow=detected?raw[headerIndex]:[];
    const headers=Array.from({length:maxLen},(_,i)=>tidy(headerRow[i])||'Colonne '+(i+1));
    const startRow=detected?headerIndex+1:0;
    const defaults=detected?{
      mode:(best.header.last>=0&&best.header.first>=0)?'separate':'combined',
      last:best.header.last,
      first:best.header.first,
      full:best.header.full,
      class:best.header.class
    }:{mode:'separate',last:0,first:1,full:0,class:-1};
    return {rows:raw,headers,startRow,headerIndex,defaults,delimiter:best.delimiter};
  }
  // Pronote exports its "Élèves" column as "NOM COMPOSÉ Prénom(s)".
  // Only reorder when the uppercase surname and given name are unambiguous.
  function pronoteFullName(value){
    const raw=tidy(value);
    if(!raw)return '';
    const tokens=raw.split(/\s+/);
    const hasLetter=word=>/[A-Za-zÀ-ÿ]/.test(word);
    const allCaps=word=>hasLetter(word)&&word===word.toLocaleUpperCase('fr');
    const isJoiner=word=>word==='-'||word==='–'||word==='—';
    let surnameEnd=0;
    while(surnameEnd<tokens.length&&(allCaps(tokens[surnameEnd])||(surnameEnd>0&&isJoiner(tokens[surnameEnd]))))surnameEnd++;
    if(surnameEnd>0&&surnameEnd<tokens.length&&tokens.slice(surnameEnd).every(t=>!allCaps(t))){
      const family=tokens.slice(0,surnameEnd).join(' ').replace(/\s+([-–—])\s+/g,'$1');
      const given=tokens.slice(surnameEnd).join(' ');
      return tidy(given+' '+family);
    }
    return raw;
  }
  const identityKey=value=>fold(pronoteFullName(value));
  function selectStudents(doc,{mode='separate',last=-1,first=-1,full=-1,classColumn=-1,classValue='*'}={},existingNames=[]){
    const existing=new Set(existingNames.map(identityKey));
    const seen=new Set();
    const candidates=[];let filtered=0,invalid=0,duplicates=0;
    for(let i=doc.startRow;i<doc.rows.length;i++){
      const row=doc.rows[i];
      if(classColumn>=0&&classValue!=='*'&&tidy(row[classColumn])!==classValue){filtered++;continue}
      let name='';
      if(mode==='combined')name=pronoteFullName(row[full]);
      else {
        const nom=tidy(row[last]),prenom=tidy(row[first]);
        if(nom&&prenom)name=prenom+' '+nom;
      }
      if(!name||name.length>100||name.length<3||name.split(' ').filter(Boolean).length<2||!/[a-zA-ZÀ-ÿ]/.test(name)){
        invalid++;continue;
      }
      const key=identityKey(name);
      if(existing.has(key)||seen.has(key)){duplicates++;continue}
      seen.add(key);
      candidates.push({display_name:name,rowIndex:i});
    }
    return {candidates,filtered,invalid,duplicates,sourceRows:Math.max(0,doc.rows.length-doc.startRow)};
  }
  async function readFile(file){
    if(!file)throw Error('Sélectionne un fichier CSV.');
    if(file.size>4*1024*1024)throw Error('Le fichier dépasse la limite de 4 Mo.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(!bytes.length)throw Error('Le fichier est vide.');
    if(bytes[0]===0xFF&&bytes[1]===0xFE)return new TextDecoder('utf-16le').decode(bytes);
    if(bytes[0]===0xFE&&bytes[1]===0xFF)return new TextDecoder('utf-16be').decode(bytes);
    try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
    catch{return new TextDecoder('windows-1252').decode(bytes)}
  }
  root.EcoQuizCSV=Object.freeze({fold,tidy,pronoteFullName,parseCSV,parseDocument,selectStudents,readFile});
})(typeof window!=='undefined'?window:globalThis);
