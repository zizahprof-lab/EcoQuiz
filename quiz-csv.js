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

  button.addEventListener('click', async () => {
    const file = input.files?.[0];
    if (!file) return say('Selectionne d’abord un fichier CSV de questions.', true);
    if (!/\.(csv|txt)$/i.test(file.name)) return say('Format accepte : CSV (ou TXT tabule).', true);
    if (file.size > 1024 * 1024) return say('Le CSV est trop volumineux (limite 1 Mo).', true);
    button.disabled = true;
    try {
      const data = await file.arrayBuffer();
      let content;
      try { content = new TextDecoder('utf-8', {fatal:true}).decode(data); }
      catch { content = new TextDecoder('windows-1252').decode(data); }
      const items = parseCsvQuiz(content);
      const container = document.getElementById('questionEditor');
      const current = [...container.querySelectorAll('.quizQ')];
      const placeholder = current.length === 1 && !current[0].querySelector('.prompt')?.value.trim() &&
        [...current[0].querySelectorAll('.option')].every(x => !x.value.trim());
      if (current.length - (placeholder ? 1 : 0) + items.length > 50)
        throw Error('Limite de 50 questions : enleve quelques questions avant l’import.');
      if (placeholder) current[0].remove();
      for (const question of items) {
        if (typeof addQuestion !== 'function') throw Error('Editeur indisponible : recharge la page.');
        addQuestion();
        // L'editeur transforme automatiquement la nouvelle carte (MutationObserver).
        await Promise.resolve();
        const card = [...container.querySelectorAll('.quizQ')].at(-1);
        const type = card.querySelector('.aiCardType');
        if (!type) throw Error('Impossible de preparer les questions : recharge la page.');
        type.value = String(question.options.length);
        type.dispatchEvent(new Event('change', {bubbles:true}));
        card.querySelector('.prompt').value = question.prompt;
        [...card.querySelectorAll('.option')].forEach((input, i) => { input.value = question.options[i]; });
        const correct = card.querySelector('.correct');
        correct.value = String(question.correct_index);
        correct.dispatchEvent(new Event('change', {bubbles:true}));
        card.querySelector('.explanation').value = question.explanation;
        card.dataset.conceptTitle = question.concept_title;
      }
      const title = document.getElementById('quizTitle');
      if (!title.value.trim()) {
        const base = file.name.replace(/\.(csv|txt)$/i,'').replace(/[_-]+/g,' ').trim();
        title.value = ('Quiz - ' + base).slice(0,150);
      }
      const tf = items.filter(q => q.options.length === 2).length;
      say(items.length + ' questions importees (' + (items.length - tf) + ' QCM, ' + tf + ' Vrai/Faux). Verifie le resultat puis clique sur « Valider mon quiz » pour enregistrer.');
      container.scrollIntoView({behavior:'smooth',block:'start'});
      input.value = '';
    } catch (e) {
      say('Import impossible : ' + e.message, true);
    } finally {
      button.disabled = false;
    }
  });
})();