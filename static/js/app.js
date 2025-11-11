// frontend logic: fetch questions, render, save choices to localStorage keyed by session
let SESSION = null;
let QUESTIONS = [];

function el(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) Object.keys(attrs).forEach(k => e.setAttribute(k, attrs[k]));
  return e;
}

async function fetchQuestions() {
  const res = await fetch('/api/questions');
  const data = await res.json();
  SESSION = data.session;
  QUESTIONS = data.questions || [];
  document.getElementById('status').textContent = `已加载 ${QUESTIONS.length} 道题（session: ${SESSION}）`;
  renderQuestions();
}

function storageKey() { return `answers_${SESSION}`; }

function loadAnswers() {
  try { return JSON.parse(localStorage.getItem(storageKey()) || '{}'); } catch(e){ return {}; }
}

function saveAnswers(obj) { localStorage.setItem(storageKey(), JSON.stringify(obj)); }

function renderQuestions() {
  const container = document.getElementById('quiz');
  container.innerHTML = '';
  const saved = loadAnswers();
  QUESTIONS.forEach((q, idx) => {
    const card = el('div', 'card');
    const title = el('h3', 'q-title');
    title.textContent = `${idx+1}. ${q.question}`;
    card.appendChild(title);
    const opts = el('div', 'options');
    q.options.forEach((opt, oi) => {
      const o = el('div', 'option');
      o.textContent = opt;
      o.dataset.qid = q.id;
      o.dataset.choice = oi;
      if (saved[q.id] !== undefined && String(saved[q.id]) === String(oi)) {
        o.classList.add('selected');
      }
      o.addEventListener('click', (e) => {
        // mark selected
        const parent = e.currentTarget.parentNode;
        [...parent.children].forEach(ch => ch.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        const as = loadAnswers();
        as[q.id] = Number(e.currentTarget.dataset.choice);
        saveAnswers(as);
        updateProgress();
      });
      opts.appendChild(o);
    });
    card.appendChild(opts);
    container.appendChild(card);
  });
  updateProgress();
}

function updateProgress(){
  const saved = loadAnswers();
  const answered = Object.keys(saved).length;
  const total = QUESTIONS.length;
  const status = document.getElementById('status');
  status.textContent = `已答 ${answered}/${total}`;
}

async function submit() {
  const saved = loadAnswers();
  const answers = QUESTIONS.map(q => ({id: q.id, choice: saved[q.id] !== undefined ? saved[q.id] : null}));
  const payload = {session: SESSION, answers};
  const res = await fetch('/api/submit', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data = await res.json();
  const result = document.getElementById('result');
  result.style.display = 'block';
  result.innerHTML = `<h3>得分: ${data.score}%</h3>`;
  if (data.flag) {
    const f = el('pre'); f.textContent = data.flag; f.style.background='#111'; f.style.color='#fff'; f.style.padding='8px'; f.style.borderRadius='8px';
    result.appendChild(f);
  } else {
    const hint = el('p'); hint.textContent = '未达到 90% ，无法获得 Flag。请重答或复习题目。'; result.appendChild(hint);
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('reloadQuestions').addEventListener('click', ()=>{
    // clear cookie by reloading from server: force new by removing local session cookie via requesting /api/questions after clearing localStorage for this session
    // clear local storage for current session (if any)
    if (SESSION) localStorage.removeItem(storageKey());
    fetchQuestions();
  });
  document.getElementById('submitBtn').addEventListener('click', ()=>{
    submit();
  });
  fetchQuestions();
});
