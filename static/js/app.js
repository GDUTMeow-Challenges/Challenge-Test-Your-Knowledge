// frontend logic: fetch questions, render, save choices to localStorage keyed by session
let SESSION = null;
let QUESTIONS = [];

function el(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) Object.keys(attrs).forEach(k => e.setAttribute(k, attrs[k]));
  return e;
}

async function fetchQuestions(forceNew=false) {
  const url = '/api/questions';
  const res = await fetch(url);
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
  // show as xx/100
  result.innerHTML = `<h3>得分: ${data.score}/100</h3>`;
  // scroll to top so header/result are visible
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0,0); }
  if (data.flag) {
    const hint = el('p'); hint.textContent = '恭喜你获得了 flag！'; 
    result.appendChild(hint);
    const f = el('pre'); 
    f.textContent = data.flag;
    result.appendChild(f);
  } else {
    const hint = el('p'); hint.textContent = '你还未达到 90 分哦，去检查一下吧！'; result.appendChild(hint);
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('reloadQuestions').addEventListener('click', ()=>{
    // show modal instructing user to destroy and relaunch container
    const modal = document.getElementById('destroyModal');
    if (modal) modal.style.display = 'flex';
  });
  document.getElementById('submitBtn').addEventListener('click', ()=>{
    submit();
  });
  // modal close handler
  const modalClose = document.getElementById('modalClose');
  if (modalClose) modalClose.addEventListener('click', ()=>{
    const modal = document.getElementById('destroyModal');
    if (modal) modal.style.display = 'none';
  });
  fetchQuestions();
});
