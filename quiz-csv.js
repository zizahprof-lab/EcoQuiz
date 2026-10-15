/* EcoQuiz - Import de QUESTIONS CSV dans l'editeur (distinct du CSV Pronote). */
'use strict';
(() => {
  const normalize = value => String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  function csvRows(source, delimiter) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (ch === '"') {
        if (quoted && source[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && ch === delimiter) {
        row.push(field); field = '';
      } else if (!quoted && (ch === '\n' || ch === '\r')) {
        if (ch === '\r' && source[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(cell => cell.trim())) rows.push(row);
        row = [];
      } else field += ch;
    }
    if (quoted) throw Error('Guillemets non refermes dans le CSV.');
    row.push(field);
    if (row.some(cell => cell.trim())) rows.push(row);
    return rows;
  }

  function delimiterOf(header) {
    let best = ';', score = -1;
    for (const d of [';', ',', '\t']) {
      let count = 0, quoted = false;
      for (let i = 0; i < header.length; i++) {
        const ch = header[i];
        if (ch === '"') {
          if (quoted && header[i + 1] === '"') i++;
          else quoted = !quoted;
        } else if (!quoted && ch === d) count++;
      }
      if (count > score) { best = d; score = count; }
    }
    return best;
  }

  function parseCsvQuiz(text) {
    let source = String(text || '').replace(/^\uFEFF/, '');
    let fixedDelimiter = null;
    const directive = source.match(/^sep=([;,\t])\r?\n/i);
    if (directive) { fixedDelimiter = directive[1]; source = source.slice(directive[0].length); }
    const delimiter = fixedDelimiter || delimiterOf(source.split(/\r?\n/, 1)[0]);
    const rows = csvRows(source, delimiter);
    if (rows.length < 2) throw Error('Le CSV doit contenir une ligne de titres et des questions.');
    const headers = rows.shift().map(normalize);
    const at = (...names) => names.map(normalize).map(name => headers.indexOf(name)).find(i => i >= 0) ?? -1;
    const columns = {
      question: at('question', 'énoncé', 'enonce', 'prompt'),
      type: at('type', 'format'),
      a: at('proposition_A', 'reponse_A', 'option_A', 'choix_A', 'réponse 1'),
      b: at('proposition_B', 'reponse_B', 'option_B', 'choix_B', 'réponse 2'),
      c: at('proposition_C', 'reponse_C', 'option_C', 'choix_C', 'réponse 3'),
      d: at('proposition_D', 'reponse_D', 'option_D', 'choix_D', 'réponse 4'),
      correct: at('bonne_réponse', 'bonne réponse', 'correct', 'correct_index', 'reponse_correcte'),
      explanation: at('explication', 'explanation', 'correction'),
      notion: at('notion', 'concept', 'concept_title')
    };
    if ([columns.question, columns.a, columns.b, columns.correct].some(i => i < 0))
      throw Error('Colonnes manquantes : question, proposition_A, proposition_B ou bonne_réponse.');
    const get = (row, column) => column < 0 ? '' : String(row[column] ?? '').trim();
    const items = rows.map((row, idx) => {
      const line = idx + 2;
      const prompt = get(row, columns.question);
      const type = normalize(get(row, columns.type));
      const rawOptions = [columns.a, columns.b, columns.c, columns.d].map(c => get(row, c));
      const truth = ['vraifaux', 'vf', 'truefalse'].includes(type) ||
        (!type && normalize(rawOptions[0]) === 'vrai' && normalize(rawOptions[1]) === 'faux' && !rawOptions[2] && !rawOptions[3]);
      if (type && !truth && !['qcm', 'choixmultiple', 'question'].includes(type))
        throw Error('Ligne ' + line + ' : type inconnu (« ' + get(row, columns.type) + ' »).');
      const options = truth ? ['Vrai', 'Faux'] : rawOptions;
      if (!prompt || prompt.length > 800) throw Error('Ligne ' + line + ' : question vide ou trop longue (800 caractères max).');
      if (!options.every(s => s && s.length <= 300))
        throw Error('Ligne ' + line + ' : ' + (truth ? 'Vrai / Faux' : 'les 4 propositions') + ' doivent etre renseignes (300 caracteres max).');
      const rawCorrect = get(row, columns.correct);
      const normalizedCorrect = normalize(rawCorrect);
      let correct;
      if (/^[a-d]$/.test(normalizedCorrect)) correct = normalizedCorrect.charCodeAt(0) - 97;
      else if (truth && ['vrai', 'true'].includes(normalizedCorrect)) correct = 0;
      else if (truth && ['faux', 'false'].includes(normalizedCorrect)) correct = 1;
      else if (/^[1-4]$/.test(rawCorrect)) correct = Number(rawCorrect) - 1;
      else if (rawCorrect === '0') correct = 0;
      else throw Error('Ligne ' + line + ' : bonne réponse invalide (A/B/C/D ou Vrai/Faux).');
      if (correct >= options.length) throw Error('Ligne ' + line + ' : bonne réponse hors des choix disponibles.');
      const explanation = get(row, columns.explanation);
      const concept = get(row, columns.notion);
      if (explanation.length > 700 || concept.length > 120)
        throw Error('Ligne ' + line + ' : explication ou notion trop longue.');
      return { prompt, options, correct_index: correct, explanation, concept_title: concept };
    });
    if (items.length > 50) throw Error('Maximum 50 questions par quiz.');
    return items;
  }

  window.EcoQuizCsvImporter = {parseCsvQuiz};

  // Interface independante : pas de modification de l'import d'eleves Pronote.
  const editor = document.getElementById('editor');
  const aiPanel = editor?.querySelector('.ai-panel');
  if (!editor || !aiPanel) return;
  const styleSheet = document.createElement('style');
  styleSheet.textContent = '.quiz-csv-import{margin:17px 0;padding:16px 18px;border:1px solid #b9d3f6;border-left:4px solid #2563eb;border-radius:10px;background:#f8fbff}.quiz-csv-import h3{color:#1d4ed8;margin:0 0 7px}.quiz-csv-import .row{gap:12px;align-items:center;flex-wrap:wrap}.quiz-csv-import input[type=file]{max-width:100%;min-width:220px;flex:1}.quiz-csv-import button{white-space:normal}.quiz-csv-import p{margin:8px 0}.quiz-csv-import-status{color:#1e40af;font-weight:600}.quiz-csv-import-status.error{color:#b91c1c}';
  document.head.appendChild(styleSheet);
  const panel = document.createElement('section');
  panel.className = 'quiz-csv-import';
  panel.setAttribute('aria-label', 'Importer les questions d’un quiz CSV');
  panel.innerHTML = '<h3>Importer des questions depuis un CSV</h3><p class="muted">Pour un quiz deja prepare : questions, QCM, Vrai/Faux, bonnes reponses, explications et notions. Different de « Importer CSV Pronote » (eleves).</p><div class="row"><input type="file" id="quizCsvInput" accept=".csv,text/csv,.txt,text/plain" aria-label="Choisir le fichier CSV des questions"><button type="button" id="quizCsvImportButton">Importer les questions</button></div><p id="quizCsvStatus" class="quiz-csv-import-status" role="status" aria-live="polite">CSV avec colonnes : question, type, proposition_A a D, bonne_reponse, explication et notion.</p>';
  aiPanel.after(panel);
  const input = document.getElementById('quizCsvInput');
  const button = document.getElementById('quizCsvImportButton');
  const status = document.getElementById('quizCsvStatus');
  const say = (message, error = false) => { status.textContent = message; status.classList.toggle('error', error); };


  // Import de questions déjà validées dans ChatGPT, sans frais de génération.
  const pastePanel=document.createElement('section');
  pastePanel.className='quiz-csv-paste';
  pastePanel.setAttribute('aria-label','Coller ma sélection de questions ChatGPT');
  pastePanel.innerHTML='<h3>Importer ma sélection depuis ChatGPT</h3>'
    +'<p class="muted">Dans ChatGPT : sélectionne « Garder » ou « Rejeter », puis clique sur « Copier pour ÉcoQuiz ». Colle la sélection ici : les réponses correctes et les explications seront préservées.</p>'
    +'<textarea id="quizCsvPaste" rows="5" spellcheck="false" placeholder="Colle ici le tableau de questions copié depuis ChatGPT (CSV, séparateur point-virgule)…"></textarea>'
    +'<div class="row"><button type="button" id="quizCsvPasteButton">✓ Ajouter les questions sélectionnées</button><span class="muted">Sans appel à Gemini et sans paiement</span></div>';
  panel.append(pastePanel);
  styleSheet.textContent += '.quiz-csv-paste{margin-top:16px;padding:17px 0 0;border-top:1px solid #c7d2fe}.quiz-csv-paste h3{color:#4f46e5;margin:0 0 7px}.quiz-csv-paste textarea{width:100%;min-height:118px;padding:12px;border:1.5px solid #a5b4fc;border-radius:8px;background:#fff;color:#27364b;font-size:12px}.quiz-csv-paste .row{margin-top:10px}.quiz-csv-paste button{background:#4f46e5;color:white;border-color:#4f46e5}.quiz-csv-paste button:hover{background:#4338ca}';

  async function insertQuizQuestions(items, suggestedTitle) {
    const container=document.getElementById('questionEditor');
    const previous=[...container.querySelectorAll('.quizQ')];
    const isPlaceholder=previous.length===1&&!previous[0].querySelector('.prompt')?.value.trim()&&
      [...previous[0].querySelectorAll('.option')].every(x=>!x.value.trim());
    const previousCount=previous.length-(isPlaceholder?1:0);
    if(previousCount+items.length>50)
      throw Error('Limite de 50 questions : retire quelques questions avant cet import.');
    if(typeof addQuestion!=='function')
      throw Error('Éditeur indisponible : recharge la page.');
    if(isPlaceholder)previous[0].remove();
    for(const question of items){
      addQuestion();
      await Promise.resolve(); // laisse l'assistant IA configurer QCM / Vrai-Faux
      const card=[...container.querySelectorAll('.quizQ')].at(-1);
      const format=card?.querySelector('.aiCardType');
      if(!format)throw Error('Impossible de préparer la question, actualise la page.');
      format.value=String(question.options.length);
      format.dispatchEvent(new Event('change',{bubbles:true}));
      card.querySelector('.prompt').value=question.prompt;
      card.querySelectorAll('.option').forEach((input,i)=>{input.value=question.options[i]||''});
      const select=card.querySelector('.correct');
      select.value=String(question.correct_index);
      select.dispatchEvent(new Event('change',{bubbles:true}));
      card.querySelector('.explanation').value=question.explanation||'';
      card.dataset.conceptTitle=question.concept_title||'';
    }
    const title=document.getElementById('quizTitle');
    if(!title.value.trim())title.value=String(suggestedTitle||'Quiz — Questions sélectionnées').slice(0,150);
    const tf=items.filter(item=>item.options.length===2).length;
    say('✓ '+items.length+' question(s) importée(s) : '+(items.length-tf)+' QCM et '+tf+' Vrai/Faux. Vérifie les bonnes réponses vertes puis enregistre le quiz.');
    container.scrollIntoView({behavior:'smooth',block:'start'});
  }

  const pasteInput=document.getElementById('quizCsvPaste');
  const pasteButton=document.getElementById('quizCsvPasteButton');
  pasteButton.addEventListener('click',async()=>{
    const text=pasteInput.value.trim();
    if(!text)return say('Colle d’abord les questions copiées depuis ChatGPT.',true);
    if(text.length>1000000)return say('Le contenu copié dépasse la limite de 1 Mo.',true);
    pasteButton.disabled=true;
    try{
      const questions=parseCsvQuiz(text);
      await insertQuizQuestions(questions,'Les agents économiques — Quiz validé');
      pasteInput.value='';
    }catch(e){
      say('Import impossible : '+e.message,true);
    }finally{pasteButton.disabled=false}
  });

  button.addEventListener('click',async()=>{
    const file=input.files?.[0];
    if(!file)return say('Sélectionne d’abord un CSV de questions.',true);
    if(!/\.(csv|txt)$/i.test(file.name))return say('Seuls les fichiers .csv et .txt sont acceptés ici.',true);
    if(file.size>1024*1024)return say('Fichier trop volumineux (maximum 1 Mo).',true);
    button.disabled=true;
    try{
      const bytes=await file.arrayBuffer();
      let source;
      try{source=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
      catch{source=new TextDecoder('windows-1252').decode(bytes)}
      const questions=parseCsvQuiz(source);
      const basename=file.name.replace(/\.(csv|txt)$/i,'').replace(/[_-]+/g,' ').trim();
      await insertQuizQuestions(questions,'Quiz — '+basename);
      input.value='';
    }catch(e){
      say('Import impossible : '+e.message,true);
    }finally{button.disabled=false}
  });
})();