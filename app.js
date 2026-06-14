// Computer Engineering Exam Simulator — KNPC
'use strict';

// ── Constants ─────────────────────────────────────────────
const QUESTION_FILES = [
  'questions-dl.json','questions-cn.json','questions-ds.json',
  'questions-db.json','questions-se.json','questions-os.json'
];


const POINTS_PER_QUESTION = 2;

const SUBJECTS = {
  'Digital Logic Design': { weight: 22, color: '#6366f1', short: 'DLD', icon: '⚡' },
  'Computer Networks':    { weight: 20, color: '#0891b2', short: 'NET', icon: '🌐' },
  'Data Structures':      { weight: 18, color: '#059669', short: 'DSA', icon: '🌲' },
  'Database Systems':     { weight: 15, color: '#d97706', short: 'DB',  icon: '🗄️' },
  'Operating Systems':    { weight: 15, color: '#dc2626', short: 'OS',  icon: '💻' },
  'Software Engineering': { weight: 10, color: '#7c3aed', short: 'SE',  icon: '🔧' }
};

const SUBJECT_NAMES = Object.keys(SUBJECTS);

const DEFAULT_CONFIG = {
  subjects: [...SUBJECT_NAMES],
  topics: [],          // [] = all topics; non-empty = filter to these
  difficulty: 'mixed',
  questionCount: 50,
  duration: 60
};

// ── State ─────────────────────────────────────────────────
let state = {
  view: 'loading',
  theme: 'dark',
  allQuestions: [],
  examConfig: { ...DEFAULT_CONFIG },
  examQuestions: [],
  userAnswers: {},
  currentIndex: 0,
  timeLeft: 0,
  timer: null,
  flagged: new Set(),
  currentExamRecord: null,
  practiceFilter: null,
  practiceQuestions: [],
  practiceAnswers: {},
  practiceIndex: 0,
  history: []
};

try { state.history = JSON.parse(localStorage.getItem('ceExamHistory') || '[]'); } catch(_) { state.history = []; }
try { state.theme = localStorage.getItem('ceTheme') || 'dark'; } catch(_) {}
applyTheme(state.theme);

// ── Boot ──────────────────────────────────────────────────
async function init() {
  document.getElementById('app').innerHTML = renderLoading();
  try {
    await loadQuestions();
    state.view = 'home';
    render();
  } catch(e) {
    document.getElementById('app').innerHTML = `
      <div class="loading-screen">
        <div style="font-size:48px">⚠️</div>
        <h2>Could not load questions</h2>
        <p style="color:var(--text2);max-width:320px;text-align:center">${e.message}</p>
        <button class="btn btn-primary" onclick="init()" style="margin-top:16px">Retry</button>
      </div>`;
  }
}

async function loadQuestions() {
  if (window.QUESTIONS_DATA && Array.isArray(window.QUESTIONS_DATA) && window.QUESTIONS_DATA.length > 0) {
    state.allQuestions = window.QUESTIONS_DATA.map(normalizeQ);
    return;
  }
  const results = await Promise.allSettled(
    QUESTION_FILES.map(f => fetch(f).then(r => { if (!r.ok) throw new Error(`${f} not found`); return r.json(); }))
  );
  const loaded = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) loaded.push(...r.value.map(normalizeQ));
    else if (r.status === 'rejected') console.warn(QUESTION_FILES[i], 'failed');
  });
  if (loaded.length === 0) throw new Error('No question files available. Make sure question JSON files are in the same folder.');
  state.allQuestions = loaded;
}

function normalizeQ(q) {
  const out = { ...q };
  if (!Array.isArray(out.choices)) {
    const obj = out.choices || {};
    out.choices = ['A','B','C','D'].filter(k => obj[k] != null).map(k => `${k}. ${obj[k]}`);
  } else {
    out.choices = out.choices.map((c, i) => {
      const L = 'ABCD'[i];
      if (typeof c !== 'string') return `${L}. ${c}`;
      if (!c.match(/^[A-D]\s*\.\s*/)) return `${L}. ${c}`;
      return c;
    });
  }
  const subjectMap = {
    'Data Structures and Algorithms': 'Data Structures',
    'DSA': 'Data Structures', 'CS Networks': 'Computer Networks',
    'DB': 'Database Systems', 'OS': 'Operating Systems',
    'SE': 'Software Engineering', 'Digital Logic': 'Digital Logic Design'
  };
  if (subjectMap[out.subject]) out.subject = subjectMap[out.subject];
  return out;
}

// ── Theme ─────────────────────────────────────────────────
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(state.theme);
  try { localStorage.setItem('ceTheme', state.theme); } catch(_) {}
  const app = document.getElementById('app');
  if (state.view !== 'exam') render();
}

// ── Render ────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  if (state.view !== 'exam') app.classList.remove('exam-active');
  const views = {
    loading: renderLoading, home: renderHome,
    'exam-config': renderExamConfig,
    exam: renderExam, results: renderResults, review: renderReview,
    practice: renderPractice,
    'subject-select': renderSubjectSelect,
    'topic-select': renderTopicSelect,
    'difficulty-select-screen': renderDifficultySelect,
    history: renderHistory
  };
  app.innerHTML = (views[state.view] || renderHome)();
  if (state.view === 'exam') updateTimerDisplay();
}

function nav(view) { state.view = view; render(); }

// ── Loading ───────────────────────────────────────────────
function renderLoading() {
  return `<div class="loading-screen">
    <div class="spinner"></div>
    <h2>Loading Question Bank</h2>
    <p style="color:var(--text2)">Preparing your exam simulator…</p>
  </div>`;
}

// ── Home ──────────────────────────────────────────────────
function renderHome() {
  const total = state.allQuestions.length;
  const subjectCounts = {};
  state.allQuestions.forEach(q => { subjectCounts[q.subject] = (subjectCounts[q.subject]||0)+1; });
  const last = state.history[0];
  const wrongCount = getWrongIds().size;
  const avgScore = state.history.length
    ? Math.round(state.history.reduce((s,e) => s + e.percentage, 0) / state.history.length)
    : null;

  return `<div class="home-screen">
    <header class="app-header">
      <div class="header-top">
        <div class="logo-area">
          <div class="logo-icon">⚡</div>
          <div>
            <h1>CE Exam Simulator</h1>
            <p class="subtitle">KNPC Preparation Platform</p>
          </div>
        </div>
        <button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">
          ${state.theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </header>

    <div class="stats-bar">
      <div class="stat"><span class="stat-value">${total.toLocaleString()}</span><span class="stat-label">Questions</span></div>
      <div class="stat"><span class="stat-value">6</span><span class="stat-label">Subjects</span></div>
      <div class="stat"><span class="stat-value">${state.history.length}</span><span class="stat-label">Exams Taken</span></div>
      <div class="stat"><span class="stat-value">${avgScore !== null ? avgScore+'%' : '—'}</span><span class="stat-label">Avg Score</span></div>
    </div>

    ${last ? `<div class="last-exam-card">
      <div>
        <div class="card-label">Last Exam</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">${new Date(last.date).toLocaleDateString()}</div>
      </div>
      <span class="score-badge ${last.percentage >= 50 ? 'pass' : 'fail'}">${last.percentage}%</span>
      <div style="text-align:right">
        <div style="font-weight:700;font-size:18px">${last.score}<span style="font-size:13px;color:var(--text3)"> pts</span></div>
        <div style="font-size:12px;color:var(--text3)">${last.correct} correct</div>
      </div>
    </div>` : ''}

    <div class="action-buttons">
      <button class="btn btn-primary btn-large" onclick="nav('exam-config')">
        <span class="btn-icon">📝</span>
        <span>Start New Exam</span>
        <span class="btn-sub">Custom configuration →</span>
      </button>

      <div class="btn-row">
        <button class="btn btn-secondary btn-half" onclick="nav('subject-select')">
          <span>📚</span> By Subject
        </button>
        <button class="btn btn-secondary btn-half" onclick="nav('topic-select')">
          <span>🏷️</span> By Topic
        </button>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary btn-half" onclick="startPractice(null)">
          <span>🎯</span> Random
        </button>
        <button class="btn btn-secondary btn-half" onclick="nav('difficulty-select-screen')">
          <span>📊</span> By Difficulty
        </button>
      </div>

      ${wrongCount > 0 ? `<button class="btn btn-danger-soft" onclick="startPractice({type:'wrong'})">
        <span>❌</span> Practice Wrong Answers
        <span class="badge-count">${wrongCount}</span>
      </button>` : ''}

      ${state.history.length > 0 ? `<button class="btn btn-ghost" onclick="nav('history')">
        <span>📊</span> Exam History
      </button>` : ''}
    </div>

    <div class="subject-grid">
      <h3>Question Bank</h3>
      <div class="subjects">
        ${Object.entries(SUBJECTS).map(([name, info]) =>
          `<div class="subject-chip" style="--color:${info.color}" onclick="startPractice({type:'subject',value:'${name}'})">
            <span class="chip-icon">${info.icon}</span>
            <span class="chip-label">${info.short}</span>
            <span class="chip-count">${subjectCounts[name]||0}</span>
          </div>`
        ).join('')}
      </div>
    </div>
  </div>`;
}

// ── Exam Config ───────────────────────────────────────────
function renderExamConfig() {
  const cfg = state.examConfig;

  // Build topic list from selected subjects + difficulty (before topic filter)
  const preTopicPool = buildPool(cfg.subjects, cfg.difficulty, []);
  const topicsBySubject = {};
  preTopicPool.forEach(q => {
    const sub = q.subject;
    const top = q.topic || 'General';
    if (!topicsBySubject[sub]) topicsBySubject[sub] = {};
    topicsBySubject[sub][top] = (topicsBySubject[sub][top] || 0) + 1;
  });

  // Final pool after topic filter
  const pool = buildPool(cfg.subjects, cfg.difficulty, cfg.topics);
  const totalScore = cfg.questionCount * POINTS_PER_QUESTION;
  const noSubject = cfg.subjects.length === 0;
  const canStart = !noSubject && pool.length >= cfg.questionCount;
  const subCounts = subjectCounts();

  // Subject cards
  const subjectCards = Object.entries(SUBJECTS).map(([name, info]) => {
    const checked = cfg.subjects.includes(name);
    return `<div class="config-subject-card ${checked?'checked':''}" style="--scolor:${info.color}" onclick="toggleSubject('${name}')">
      <div class="csc-check">${checked ? '✓' : ''}</div>
      <div class="csc-icon">${info.icon}</div>
      <div class="csc-info">
        <div class="csc-name">${name}</div>
        <div class="csc-count">${subCounts[name]||0} questions</div>
      </div>
    </div>`;
  }).join('');

  // Topic section — only shown when ≥1 subject selected
  let topicSection = '';
  if (cfg.subjects.length > 0 && Object.keys(topicsBySubject).length > 0) {
    const topicGroups = cfg.subjects
      .filter(s => topicsBySubject[s])
      .map(sub => {
        const info = SUBJECTS[sub];
        const topicItems = Object.entries(topicsBySubject[sub])
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([topic, cnt]) => {
            const topicKey = sub + '::' + topic;
            const checked = cfg.topics.includes(topicKey);
            return `<div class="config-topic-chip ${checked?'checked':''}" style="--tcolor:${info.color}" onclick="toggleTopic('${topicKey.replace(/'/g,"\\'")}')">
              ${checked ? '<span class="topic-check">✓</span>' : ''}
              <span class="topic-chip-name">${topic}</span>
              <span class="topic-chip-count">${cnt}</span>
            </div>`;
          }).join('');
        return `<div class="topic-group-config">
          <div class="topic-group-label" style="color:${info.color}">${info.icon} ${sub}</div>
          <div class="topic-chips-wrap">${topicItems}</div>
        </div>`;
      }).join('');

    topicSection = `<div class="config-section">
      <div class="config-section-title">
        <span>🏷️ Topics <span style="font-weight:400;color:var(--text3);font-size:12px">(optional — leave empty for all)</span></span>
        <div class="config-section-actions">
          ${cfg.topics.length > 0 ? `<button class="link-btn" onclick="clearTopics()">Clear all</button>` : ''}
        </div>
      </div>
      ${topicGroups}
      ${cfg.topics.length > 0 ? `<div class="topics-selected-summary">
        ${cfg.topics.length} topic${cfg.topics.length>1?'s':''} selected · ${pool.length} questions available
      </div>` : ''}
    </div>`;
  }

  return `<div class="config-screen">
    <div class="config-header">
      <button class="btn btn-ghost btn-sm" onclick="nav('home')">← Back</button>
      <h2>Create Your Exam</h2>
      <button class="theme-toggle" onclick="toggleTheme()">${state.theme==='dark'?'☀️':'🌙'}</button>
    </div>

    <!-- 1. Subjects -->
    <div class="config-section">
      <div class="config-section-title">
        <span>📚 Subjects</span>
        <div class="config-section-actions">
          <button class="link-btn" onclick="configSelectAll()">All</button>
          <button class="link-btn" onclick="configClearAll()">None</button>
        </div>
      </div>
      ${noSubject ? '<div class="config-warn" style="margin-bottom:10px">⚠️ Please select at least one subject.</div>' : ''}
      <div class="config-subjects">${subjectCards}</div>
    </div>

    <!-- 2. Topics (dynamic, based on selected subjects) -->
    ${topicSection}

    <!-- 3. Difficulty -->
    <div class="config-section">
      <div class="config-section-title"><span>🎯 Difficulty</span></div>
      <div class="config-options-row">
        ${['mixed','easy','medium','hard'].map(d =>
          `<div class="config-option ${cfg.difficulty===d?'selected':''}" onclick="setConfig('difficulty','${d}')">
            <span class="option-label">${d==='mixed'?'Mixed ⭐':d.charAt(0).toUpperCase()+d.slice(1)}</span>
          </div>`
        ).join('')}
      </div>
    </div>

    <!-- 4. Question Count -->
    <div class="config-section">
      <div class="config-section-title"><span>🔢 Questions</span></div>
      <div class="config-options-row">
        ${[25,50,75,100].map(n =>
          `<div class="config-option ${cfg.questionCount===n?'selected':''}" onclick="setConfig('questionCount',${n})">
            <span class="option-label">${n}</span>
          </div>`
        ).join('')}
      </div>
    </div>

    <!-- 5. Duration -->
    <div class="config-section">
      <div class="config-section-title"><span>⏱️ Duration</span></div>
      <div class="config-options-row">
        ${[30,60,90,120].map(m =>
          `<div class="config-option ${cfg.duration===m?'selected':''}" onclick="setConfig('duration',${m})">
            <span class="option-label">${m} min</span>
          </div>`
        ).join('')}
      </div>
    </div>

    <!-- Summary -->
    <div class="config-summary">
      <h3>Exam Summary</h3>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="sum-label">Subjects</span>
          <span class="sum-value">${cfg.subjects.length===SUBJECT_NAMES.length?'All 6':cfg.subjects.length+' selected'}</span>
        </div>
        <div class="summary-item">
          <span class="sum-label">Topics</span>
          <span class="sum-value">${cfg.topics.length===0?'All':cfg.topics.length+' selected'}</span>
        </div>
        <div class="summary-item">
          <span class="sum-label">Difficulty</span>
          <span class="sum-value" style="text-transform:capitalize">${cfg.difficulty}</span>
        </div>
        <div class="summary-item">
          <span class="sum-label">Questions</span>
          <span class="sum-value">${cfg.questionCount}</span>
        </div>
        <div class="summary-item">
          <span class="sum-label">Duration</span>
          <span class="sum-value">${cfg.duration} min</span>
        </div>
        <div class="summary-item">
          <span class="sum-label">Max Score</span>
          <span class="sum-value" style="color:var(--primary);font-weight:700">${totalScore} pts</span>
        </div>
        <div class="summary-item">
          <span class="sum-label">Pool Size</span>
          <span class="sum-value ${pool.length < cfg.questionCount?'warn':''}">${pool.length} available</span>
        </div>
      </div>
      ${!canStart && !noSubject ? `<div class="config-warn">⚠️ Not enough questions (${pool.length}) for ${cfg.questionCount} requested. Select more subjects/topics or reduce count.</div>` : ''}
      <button class="btn btn-primary" style="width:100%;margin-top:16px;font-size:17px;padding:16px" onclick="startExam()" ${!canStart?'disabled':''}>
        🚀 Start Exam
      </button>
    </div>
  </div>`;
}

function subjectCounts() {
  const c = {};
  state.allQuestions.forEach(q => { c[q.subject] = (c[q.subject]||0)+1; });
  return c;
}

function setConfig(key, val) {
  state.examConfig[key] = val;
  // When subjects change, drop topic selections that no longer belong
  if (key === 'subjects') {
    state.examConfig.topics = state.examConfig.topics.filter(tk => {
      const sub = tk.split('::')[0];
      return state.examConfig.subjects.includes(sub);
    });
  }
  render();
}

function toggleSubject(name) {
  const s = state.examConfig.subjects;
  const i = s.indexOf(name);
  if (i >= 0) {
    s.splice(i, 1);
    // Drop topics belonging to this subject
    state.examConfig.topics = state.examConfig.topics.filter(tk => tk.split('::')[0] !== name);
  } else {
    s.push(name);
  }
  render();
}

function toggleTopic(topicKey) {
  const t = state.examConfig.topics;
  const i = t.indexOf(topicKey);
  if (i >= 0) t.splice(i, 1);
  else t.push(topicKey);
  render();
}

function configSelectAll() { state.examConfig.subjects = [...SUBJECT_NAMES]; render(); }
function configClearAll()  { state.examConfig.subjects = []; state.examConfig.topics = []; render(); }
function clearTopics()     { state.examConfig.topics = []; render(); }

// topicKeys: array of "SubjectName::TopicName" strings; [] means all topics
function buildPool(subjects, difficulty, topicKeys) {
  let pool = state.allQuestions;
  if (subjects && subjects.length > 0) pool = pool.filter(q => subjects.includes(q.subject));
  if (difficulty && difficulty !== 'mixed') pool = pool.filter(q => q.difficulty === difficulty);
  if (topicKeys && topicKeys.length > 0) {
    pool = pool.filter(q => {
      const key = q.subject + '::' + (q.topic || 'General');
      return topicKeys.includes(key);
    });
  }
  return pool;
}

// ── Exam Start ────────────────────────────────────────────
function startExam() {
  const cfg = state.examConfig;
  const pool = buildPool(cfg.subjects, cfg.difficulty, cfg.topics);
  if (pool.length === 0) { alert('No questions match your selection. Please adjust the filters.'); return; }
  state.examQuestions = balancedSelect(pool, cfg.subjects, cfg.questionCount);
  state.userAnswers = {};
  state.currentIndex = 0;
  state.timeLeft = cfg.duration * 60;
  state.flagged = new Set();
  state.view = 'exam';
  render();
  startTimer();
}

function balancedSelect(pool, subjects, n) {
  if (!subjects || subjects.length === 0) return shuffle([...pool]).slice(0, n);

  const bySubject = {};
  pool.forEach(q => { if (!bySubject[q.subject]) bySubject[q.subject] = []; bySubject[q.subject].push(q); });
  const available = subjects.filter(s => bySubject[s]?.length > 0);
  if (available.length === 0) return shuffle([...pool]).slice(0, n);

  const base = Math.floor(n / available.length);
  const extra = n % available.length;
  const result = [];

  available.forEach((s, i) => {
    const arr = shuffle([...(bySubject[s] || [])]);
    result.push(...arr.slice(0, base + (i < extra ? 1 : 0)));
  });

  // Fill gaps if any subject had fewer questions than quota
  if (result.length < n) {
    const taken = new Set(result.map(q => q.id));
    const rest = shuffle(pool.filter(q => !taken.has(q.id)));
    result.push(...rest.slice(0, n - result.length));
  }

  return shuffle(result).slice(0, n);
}

function shuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// ── Timer ─────────────────────────────────────────────────
function startTimer() {
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    state.timeLeft--;
    updateTimerDisplay();
    if (state.timeLeft <= 0) { clearInterval(state.timer); submitExam(true); }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById('timer');
  if (!el) return;
  el.textContent = fmtTime(state.timeLeft);
  el.className = 'moodle-timer-box' + (state.timeLeft < 300 ? ' urgent' : state.timeLeft < 900 ? ' warning' : '');
}

function fmtTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// ── Exam Screen (Moodle Style) ────────────────────────────
function renderExam() {
  const q = state.examQuestions[state.currentIndex];
  const answered = Object.keys(state.userAnswers).length;
  const ua = state.userAnswers[state.currentIndex];
  const flagged = state.flagged.has(state.currentIndex);
  const subColor = SUBJECTS[q.subject]?.color || '#0f6cbf';
  const n = state.examQuestions.length;
  const idx = state.currentIndex;
  const totalScore = n * POINTS_PER_QUESTION;

  document.getElementById('app').classList.add('exam-active');

  const navGrid = state.examQuestions.map((_, i) => {
    let cls = '';
    if (i === idx) cls = state.userAnswers[i] ? 'answered current' : 'current';
    else if (state.userAnswers[i]) cls = 'answered';
    else if (state.flagged.has(i)) cls = 'flagged';
    return `<button class="mnav-btn ${cls}" onclick="goTo(${i})" title="Q${i+1}: ${state.userAnswers[i]?'Answered':state.flagged.has(i)?'Flagged':'Not answered'}">${i+1}</button>`;
  }).join('');

  const choices = q.choices.map((c, i) => {
    const L = 'ABCD'[i];
    const text = c.replace(/^[A-D]\s*\.\s*/, '');
    const sel = ua === L ? 'selected' : '';
    return `<label class="moodle-choice-row ${sel}" onclick="answer('${L}')">
      <span class="moodle-choice-letter-col">${L}.</span>
      <span class="moodle-choice-radio-col">
        <input type="radio" name="mq${idx}" value="${L}" ${ua===L?'checked':''} onclick="answer('${L}')">
      </span>
      <span class="moodle-choice-text-col">${text}</span>
    </label>`;
  }).join('');

  const answeredStatus = ua
    ? `<span style="color:#5cb85c;font-weight:600">&#10003; Answered</span>`
    : `<span style="color:#aaa">Not yet answered</span>`;

  return `<div class="moodle-exam">
    <nav class="moodle-navbar">
      <div class="moodle-navbar-inner">
        <span class="moodle-quiz-title">&#127979; Computer Engineering Exam — KNPC</span>
        <div class="moodle-navbar-right">
          <div class="moodle-timer-box" id="timer">${fmtTime(state.timeLeft)}</div>
          <button class="moodle-finish-top" onclick="confirmSubmit()">Finish attempt &rsaquo;</button>
        </div>
      </div>
    </nav>

    <div class="moodle-body">
      <aside class="moodle-sidebar">
        <div class="moodle-nav-block">
          <div class="moodle-nav-block-title">Quiz navigation</div>
          <div class="moodle-nav-grid">${navGrid}</div>
          <div class="moodle-nav-legend">
            <div class="mnav-legend-item"><div class="mnav-legend-dot answered"></div>Answered</div>
            <div class="mnav-legend-item"><div class="mnav-legend-dot flagged"></div>Flagged</div>
            <div class="mnav-legend-item"><div class="mnav-legend-dot current"></div>Current</div>
            <div class="mnav-legend-item"><div class="mnav-legend-dot"></div>Not answered</div>
          </div>
          <div class="sidebar-score-preview">
            <div>${answered}/${n} answered</div>
            <div style="color:#5cb85c;font-weight:600">${answered * POINTS_PER_QUESTION} / ${totalScore} pts</div>
          </div>
          <button class="moodle-finish-sidebar" onclick="confirmSubmit()">Finish attempt...</button>
        </div>
      </aside>

      <main class="moodle-main">
        <div class="moodle-qblock">
          <div class="moodle-qblock-header">
            <div>
              <div class="moodle-qnum-label">Question ${idx + 1} of ${n}</div>
              <div class="moodle-marks-label">${answeredStatus} &nbsp;|&nbsp; Marks: ${POINTS_PER_QUESTION}.00</div>
            </div>
            <button class="moodle-flag-btn ${flagged?'is-flagged':''}" onclick="toggleFlag()">
              ${flagged ? '&#9873; Remove flag' : '&#9872; Flag question'}
            </button>
          </div>
          <div class="moodle-qblock-body">
            <span class="moodle-subject-tag" style="background:${subColor}">
              ${SUBJECTS[q.subject]?.icon||''} ${q.subject} &bull; ${q.topic||'General'}
            </span>
            <div class="moodle-question-text">${q.question}</div>
            <div class="moodle-choices">${choices}</div>
          </div>
        </div>

        <div class="moodle-nav-buttons">
          <button class="moodle-nav-btn" onclick="prevQ()" ${idx===0?'disabled':''}>&#9668; Previous</button>
          <div class="moodle-answered-info">${answered} of ${n} answered</div>
          ${idx === n - 1
            ? `<button class="moodle-nav-btn primary" onclick="confirmSubmit()">Finish &#9658;</button>`
            : `<button class="moodle-nav-btn primary" onclick="nextQ()">Next &#9658;</button>`}
        </div>
      </main>
    </div>
  </div>`;
}

function confirmSubmit() {
  const answered = Object.keys(state.userAnswers).length;
  const total = state.examQuestions.length;
  const unanswered = total - answered;
  const msg = unanswered > 0
    ? `You have ${unanswered} unanswered question${unanswered>1?'s':''}.\n\nUnanswered questions will be marked as incorrect.\n\nSubmit anyway?`
    : 'Submit your exam now?';
  if (confirm(msg)) submitExam();
}

function answer(L) { state.userAnswers[state.currentIndex] = L; render(); }
function goTo(i) { state.currentIndex = i; render(); }
function nextQ() { if (state.currentIndex < state.examQuestions.length - 1) { state.currentIndex++; render(); } }
function prevQ() { if (state.currentIndex > 0) { state.currentIndex--; render(); } }
function toggleFlag() {
  const i = state.currentIndex;
  state.flagged.has(i) ? state.flagged.delete(i) : state.flagged.add(i);
  render();
}

// ── Submit ────────────────────────────────────────────────
function submitExam(auto = false) {
  clearInterval(state.timer);

  const results = state.examQuestions.map((q, i) => ({
    question: q,
    userAnswer: state.userAnswers[i] || null,
    correct: state.userAnswers[i] === q.correctAnswer
  }));

  const correct   = results.filter(r => r.correct).length;
  const incorrect = results.filter(r => r.userAnswer && !r.correct).length;
  const unanswered = results.filter(r => !r.userAnswer).length;
  const total = results.length;
  const score = correct * POINTS_PER_QUESTION;
  const maxScore = total * POINTS_PER_QUESTION;
  const percentage = Math.round((correct / total) * 100);

  const subjectStats = {};
  const diffStats = { easy: {c:0,t:0}, medium: {c:0,t:0}, hard: {c:0,t:0} };

  results.forEach(r => {
    const s = r.question.subject;
    if (!subjectStats[s]) subjectStats[s] = { correct:0, total:0, topics:{} };
    subjectStats[s].total++;
    if (r.correct) subjectStats[s].correct++;
    const t = r.question.topic || 'General';
    if (!subjectStats[s].topics[t]) subjectStats[s].topics[t] = { correct:0, total:0 };
    subjectStats[s].topics[t].total++;
    if (r.correct) subjectStats[s].topics[t].correct++;

    const d = r.question.difficulty || 'medium';
    if (diffStats[d]) { diffStats[d].t++; if (r.correct) diffStats[d].c++; }
  });

  const record = {
    date: new Date().toISOString(), score, maxScore, percentage,
    correct, incorrect, unanswered, total,
    config: { ...state.examConfig },
    subjectStats, diffStats, results, auto
  };

  state.history.unshift(record);
  if (state.history.length > 20) state.history.length = 20;
  try { localStorage.setItem('ceExamHistory', JSON.stringify(state.history)); } catch(_) {}

  state.currentExamRecord = record;
  state.view = 'results';
  render();
}

// ── Results ───────────────────────────────────────────────
function renderResults() {
  const r = state.currentExamRecord;
  const pass = r.percentage >= 50;

  // Subject breakdown
  const subjSorted = Object.entries(r.subjectStats)
    .sort((a, b) => (b[1].correct/b[1].total) - (a[1].correct/a[1].total));

  const subRows = subjSorted.map(([s, st]) => {
    const pct = Math.round((st.correct / st.total) * 100);
    const col = SUBJECTS[s]?.color || '#6366f1';
    return `<div class="subject-row">
      <span class="subject-name">${SUBJECTS[s]?.icon||''} ${s}</span>
      <div class="subject-bar-wrap"><div class="subject-bar" style="width:${pct}%;background:${col}"></div></div>
      <span class="subject-pct">${st.correct}/${st.total} (${pct}%)</span>
    </div>`;
  }).join('');

  // Topic breakdown (all topics across all subjects)
  const allTopics = [];
  Object.entries(r.subjectStats).forEach(([sub, st]) => {
    Object.entries(st.topics).forEach(([topic, ts]) => {
      allTopics.push({ subject: sub, topic, correct: ts.correct, total: ts.total, pct: Math.round((ts.correct/ts.total)*100) });
    });
  });
  allTopics.sort((a, b) => b.pct - a.pct);
  const strongest = allTopics.filter(t => t.total >= 2).slice(0, 4);
  const weakest = [...allTopics].filter(t => t.total >= 2).sort((a, b) => a.pct - b.pct).slice(0, 4);

  // Difficulty breakdown
  const diffRows = Object.entries(r.diffStats)
    .filter(([,d]) => d.t > 0)
    .map(([diff, d]) => {
      const pct = Math.round((d.c/d.t)*100);
      const col = diff==='easy'?'#10b981':diff==='medium'?'#6366f1':'#ef4444';
      return `<div class="subject-row">
        <span class="subject-name" style="text-transform:capitalize">${diff}</span>
        <div class="subject-bar-wrap"><div class="subject-bar" style="width:${pct}%;background:${col}"></div></div>
        <span class="subject-pct">${d.c}/${d.t} (${pct}%)</span>
      </div>`;
    }).join('');

  return `<div class="results-screen">
    <div class="result-hero ${pass?'pass':'fail'}">
      <div class="result-icon">${pass?'🏆':'📖'}</div>
      <div class="result-score">${r.score}</div>
      <div class="result-label">out of ${r.maxScore} points</div>
      <div class="result-pct">${r.percentage}%</div>
      <div class="result-status">${pass?'✓ PASSED':'KEEP STUDYING'}</div>
      ${r.auto ? '<div style="font-size:12px;margin-top:8px;opacity:0.7">Auto-submitted (time ran out)</div>' : ''}
    </div>

    <div class="result-stats">
      <div class="result-stat correct"><span class="rs-value">${r.correct}</span><span class="rs-label">Correct</span></div>
      <div class="result-stat incorrect"><span class="rs-value">${r.incorrect}</span><span class="rs-label">Incorrect</span></div>
      <div class="result-stat"><span class="rs-value">${r.unanswered}</span><span class="rs-label">Skipped</span></div>
    </div>

    <div class="subject-breakdown">
      <h3>📚 Performance by Subject</h3>
      ${subRows}
    </div>

    ${diffRows ? `<div class="subject-breakdown">
      <h3>🎯 Performance by Difficulty</h3>
      ${diffRows}
    </div>` : ''}

    <div class="analytics-cards">
      <div class="analytics-card green">
        <h4>💪 Strongest Topics</h4>
        ${strongest.length ? strongest.map(t => `<div class="topic-tag">
          <span>${t.topic}</span>
          <span style="color:var(--success);margin-left:auto">${t.pct}%</span>
        </div>`).join('') : '<div class="topic-tag" style="color:var(--text3)">Not enough data</div>'}
      </div>
      <div class="analytics-card red">
        <h4>📚 Review These Topics</h4>
        ${weakest.length ? weakest.map(t => `<div class="topic-tag">
          <span>${t.topic}</span>
          <span style="color:var(--danger);margin-left:auto">${t.pct}%</span>
        </div>`).join('') : '<div class="topic-tag" style="color:var(--text3)">Not enough data</div>'}
      </div>
    </div>

    <div class="analytics-cards" style="margin-top:0">
      <div class="analytics-card" style="border-color:rgba(99,102,241,0.3)">
        <h4>🏅 Best Subject</h4>
        <div style="font-size:18px;font-weight:700;margin-top:8px">${subjSorted[0]?.[0]||'—'}</div>
        <div style="font-size:13px;color:var(--text3);margin-top:4px">${subjSorted[0]?Math.round((subjSorted[0][1].correct/subjSorted[0][1].total)*100)+'%':''}</div>
      </div>
      <div class="analytics-card" style="border-color:rgba(239,68,68,0.3)">
        <h4>⚠️ Weakest Subject</h4>
        <div style="font-size:18px;font-weight:700;margin-top:8px">${subjSorted[subjSorted.length-1]?.[0]||'—'}</div>
        <div style="font-size:13px;color:var(--text3);margin-top:4px">${subjSorted[subjSorted.length-1]?Math.round((subjSorted[subjSorted.length-1][1].correct/subjSorted[subjSorted.length-1][1].total)*100)+'%':''}</div>
      </div>
    </div>

    <div class="result-actions">
      <button class="btn btn-primary" onclick="state.view='review';render()">📋 Review All Answers</button>
      ${r.incorrect > 0 || r.unanswered > 0 ? `<button class="btn btn-secondary" onclick="startPractice({type:'wrong'})">❌ Practice Wrong Answers</button>` : ''}
      <button class="btn btn-secondary" onclick="nav('exam-config')">🔄 New Exam</button>
      <button class="btn btn-ghost" onclick="nav('home')">🏠 Home</button>
    </div>
  </div>`;
}

// ── Review ────────────────────────────────────────────────
function renderReview() {
  const r = state.currentExamRecord;
  const items = r.results.map((res, i) => {
    const q = res.question;
    const ua = res.userAnswer;
    const cls = !ua ? 'unanswered' : res.correct ? 'correct' : 'incorrect';
    const icon = !ua ? '⬜' : res.correct ? '✅' : '❌';
    const col = SUBJECTS[q.subject]?.color || '#6366f1';
    return `<div class="review-item ${cls}">
      <div class="review-header">
        <span class="review-num">${icon} Q${i+1}</span>
        <span class="review-subject" style="color:${col}">${q.subject}</span>
        <span class="review-topic">${q.topic||''}</span>
        <span class="q-diff diff-${q.difficulty}" style="margin-left:auto">${q.difficulty}</span>
      </div>
      <div class="review-question">${q.question}</div>
      <div class="review-choices">
        ${q.choices.map((c, ci) => {
          const L = 'ABCD'[ci];
          const isCorrect = q.correctAnswer === L;
          const isWrong = ua === L && !isCorrect;
          return `<div class="review-choice ${isCorrect?'is-correct':''} ${isWrong?'is-wrong':''}">
            <span class="rc-letter">${L}</span>
            <span>${c.replace(/^[A-D]\s*\.\s*/,'')}</span>
            ${isCorrect ? '<span class="rc-badge correct-badge">✓ Correct</span>' : ''}
            ${isWrong ? '<span class="rc-badge wrong-badge">✗ Your answer</span>' : ''}
            ${!ua && isCorrect ? '<span class="rc-badge correct-badge">Answer</span>' : ''}
          </div>`;
        }).join('')}
      </div>
      <div class="review-explanation"><span class="exp-label">Explanation: </span>${q.explanation||'—'}</div>
    </div>`;
  }).join('');

  return `<div class="review-screen">
    <div class="review-header-bar">
      <button class="btn btn-ghost btn-sm" onclick="state.view='results';render()">← Results</button>
      <h2>Answer Review</h2>
      <button class="btn btn-ghost btn-sm" onclick="nav('home')">Home</button>
    </div>
    <div class="review-legend">
      <span class="legend-item">✅ Correct</span>
      <span class="legend-item">❌ Incorrect</span>
      <span class="legend-item">⬜ Skipped</span>
    </div>
    <div class="review-questions">${items}</div>
  </div>`;
}

// ── Practice ──────────────────────────────────────────────
function startPractice(filter) {
  let pool = [...state.allQuestions];
  if (filter?.type === 'subject') pool = pool.filter(q => q.subject === filter.value);
  else if (filter?.type === 'topic') pool = pool.filter(q => q.topic === filter.value && (!filter.subject || q.subject === filter.subject));
  else if (filter?.type === 'difficulty') pool = pool.filter(q => q.difficulty === filter.value);
  else if (filter?.type === 'wrong') { const ids = getWrongIds(); pool = pool.filter(q => ids.has(q.id)); }

  state.practiceFilter = filter;
  state.practiceQuestions = shuffle(pool);
  state.practiceAnswers = {};
  state.practiceIndex = 0;
  state.view = 'practice';
  render();
}

function getWrongIds() {
  const ids = new Set();
  state.history.forEach(exam => {
    (exam.results||[]).forEach(r => { if (!r.correct && r.userAnswer) ids.add(r.question.id); });
  });
  return ids;
}

function renderPractice() {
  const qs = state.practiceQuestions;
  const filterLabel =
    state.practiceFilter?.type === 'subject' ? `📚 ${state.practiceFilter.value}` :
    state.practiceFilter?.type === 'topic' ? `🏷️ ${state.practiceFilter.value}` :
    state.practiceFilter?.type === 'difficulty' ? `🎯 ${state.practiceFilter.value} difficulty` :
    state.practiceFilter?.type === 'wrong' ? '❌ Wrong Answers' : '🎯 Random Practice';

  if (!qs.length) return `<div class="practice-screen">
    <div class="empty-state">
      <div style="font-size:48px;margin-bottom:16px">${state.practiceFilter?.type==='wrong'?'🎉':'🔍'}</div>
      <h2>${state.practiceFilter?.type==='wrong' ? 'No wrong answers yet!' : 'No questions found'}</h2>
      <p>${state.practiceFilter?.type==='wrong' ? 'Take an exam first to track your mistakes.' : 'Try a different filter.'}</p>
      <button class="btn btn-primary" onclick="nav('home')" style="margin-top:24px">Go Home</button>
    </div></div>`;

  const q = qs[state.practiceIndex];
  const ua = state.practiceAnswers[state.practiceIndex];
  const answered = ua !== undefined;
  const col = SUBJECTS[q.subject]?.color || '#6366f1';

  // Count session stats
  const sessionAnswered = Object.keys(state.practiceAnswers).length;
  const sessionCorrect = Object.values(state.practiceAnswers).filter((a, i) => a === qs[i]?.correctAnswer).length;

  return `<div class="practice-screen">
    <div class="practice-header">
      <button class="btn btn-ghost btn-sm" onclick="nav('home')">← Home</button>
      <div class="practice-progress">
        <div class="practice-filter-label">${filterLabel}</div>
        <div class="practice-count">${state.practiceIndex + 1} / ${qs.length}</div>
        <div class="mini-progress"><div class="mini-fill" style="width:${((state.practiceIndex+1)/qs.length)*100}%"></div></div>
      </div>
      <div class="practice-session-stats">
        <span style="color:var(--success)">✓ ${sessionCorrect}</span>
        <span style="color:var(--danger)">✗ ${sessionAnswered-sessionCorrect}</span>
      </div>
    </div>

    <div class="question-body">
      <div class="question-meta">
        <span class="q-subject" style="color:${col}">${q.subject}</span>
        <span class="q-topic">${q.topic||''}</span>
        <span class="q-diff diff-${q.difficulty}">${q.difficulty}</span>
      </div>
      <div class="question-text">${q.question}</div>
      <div class="choices">
        ${q.choices.map((c, ci) => {
          const L = 'ABCD'[ci];
          const isCorrect = q.correctAnswer === L;
          const isWrong = ua === L && !isCorrect;
          let cls = 'choice';
          if (answered) {
            if (isCorrect) cls += ' correct-answer';
            else if (isWrong) cls += ' wrong-answer';
            else cls += ' dimmed';
          }
          return `<button class="${cls}" onclick="practiceAnswer('${L}')" ${answered?'disabled':''}>
            <span class="choice-letter">${L}</span>
            <span class="choice-text">${c.replace(/^[A-D]\s*\.\s*/,'')}</span>
            ${answered && isCorrect ? '<span class="choice-badge">✓</span>' : ''}
            ${answered && isWrong ? '<span class="choice-badge wrong">✗</span>' : ''}
          </button>`;
        }).join('')}
      </div>

      ${answered ? `<div class="explanation-box ${ua===q.correctAnswer?'correct':'incorrect'}">
        <div class="exp-result">${ua===q.correctAnswer ? '✅ Correct!' : `❌ Incorrect — Correct answer: ${q.correctAnswer}`}</div>
        <div class="exp-text">${q.explanation||'—'}</div>
      </div>` : ''}
    </div>

    <div class="practice-footer">
      <button class="btn btn-ghost btn-sm" onclick="practiceNav(-1)" ${state.practiceIndex===0?'disabled':''}>← Prev</button>
      <button class="btn btn-primary btn-sm" onclick="practiceNav(1)" ${state.practiceIndex===qs.length-1&&!answered?'disabled':''}>
        ${state.practiceIndex===qs.length-1 ? 'Done ✓' : 'Next →'}
      </button>
    </div>
  </div>`;
}

function practiceAnswer(L) {
  if (state.practiceAnswers[state.practiceIndex] !== undefined) return;
  state.practiceAnswers[state.practiceIndex] = L;
  render();
}

function practiceNav(dir) {
  const newIdx = state.practiceIndex + dir;
  if (newIdx >= 0 && newIdx < state.practiceQuestions.length) {
    state.practiceIndex = newIdx;
    render();
  } else if (newIdx >= state.practiceQuestions.length) {
    nav('home');
  }
}

// ── Subject Select ────────────────────────────────────────
function renderSubjectSelect() {
  const counts = {};
  state.allQuestions.forEach(q => { counts[q.subject] = (counts[q.subject]||0)+1; });

  return `<div class="subject-select-screen">
    <div class="screen-header">
      <button class="btn btn-ghost btn-sm" onclick="nav('home')">← Back</button>
      <h2>Practice by Subject</h2>
      <button class="theme-toggle sm" onclick="toggleTheme()">${state.theme==='dark'?'☀️':'🌙'}</button>
    </div>
    <div class="subject-list">
      ${Object.entries(SUBJECTS).map(([name, info]) => `
        <button class="subject-card" style="--color:${info.color}" onclick="startPractice({type:'subject',value:'${name}'})">
          <div class="sc-header">
            <span style="font-size:24px">${info.icon}</span>
            <span class="sc-short">${info.short}</span>
          </div>
          <div class="sc-name">${name}</div>
          <div class="sc-count">${counts[name]||0} questions available</div>
          <div class="sc-bar"><div class="sc-fill" style="width:${info.weight}%"></div></div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">${info.weight}% of exam weight</div>
        </button>
      `).join('')}
    </div>
  </div>`;
}

// ── Topic Select ──────────────────────────────────────────
function renderTopicSelect(filterSubject) {
  const topics = {};
  state.allQuestions.forEach(q => {
    if (filterSubject && q.subject !== filterSubject) return;
    const key = q.subject + '||' + (q.topic || 'General');
    if (!topics[key]) topics[key] = { subject: q.subject, topic: q.topic||'General', count: 0, color: SUBJECTS[q.subject]?.color||'#6366f1' };
    topics[key].count++;
  });

  const grouped = {};
  Object.values(topics).forEach(t => {
    if (!grouped[t.subject]) grouped[t.subject] = [];
    grouped[t.subject].push(t);
  });

  return `<div class="subject-select-screen">
    <div class="screen-header">
      <button class="btn btn-ghost btn-sm" onclick="nav('home')">← Back</button>
      <h2>Practice by Topic</h2>
      <button class="theme-toggle sm" onclick="toggleTheme()">${state.theme==='dark'?'☀️':'🌙'}</button>
    </div>
    ${Object.entries(grouped).map(([sub, ts]) => `
      <div class="topic-group">
        <div class="topic-group-header" style="color:${SUBJECTS[sub]?.color||'#6366f1'}">
          ${SUBJECTS[sub]?.icon||''} ${sub}
        </div>
        <div class="topic-list">
          ${ts.sort((a,b) => a.topic.localeCompare(b.topic)).map(t => `
            <button class="topic-chip" onclick="startPractice({type:'topic',value:'${t.topic.replace(/'/g,"\\'")}',subject:'${sub}'})" style="--tcolor:${t.color}">
              <span class="topic-chip-name">${t.topic}</span>
              <span class="topic-chip-count">${t.count}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `).join('')}
  </div>`;
}

function nav(view) {
  // Reset topic selections when entering config fresh from home
  if (view === 'exam-config' && state.view === 'home') {
    state.examConfig.topics = [];
  }
  state.view = view;
  render();
}

// ── Difficulty Select (Practice) ──────────────────────────
function renderDifficultySelect() {
  const counts = {};
  state.allQuestions.forEach(q => {
    const d = q.difficulty || 'medium';
    counts[d] = (counts[d]||0) + 1;
  });
  const diffs = [
    { key: 'easy',   label: 'Easy',   color: '#10b981', icon: '🟢' },
    { key: 'medium', label: 'Medium', color: '#6366f1', icon: '🔵' },
    { key: 'hard',   label: 'Hard',   color: '#ef4444', icon: '🔴' }
  ];
  return `<div class="subject-select-screen">
    <div class="screen-header">
      <button class="btn btn-ghost btn-sm" onclick="nav('home')">← Back</button>
      <h2>Practice by Difficulty</h2>
      <button class="theme-toggle sm" onclick="toggleTheme()">${state.theme==='dark'?'☀️':'🌙'}</button>
    </div>
    <div class="subject-list">
      ${diffs.map(d => `
        <button class="subject-card" style="--color:${d.color}" onclick="startPractice({type:'difficulty',value:'${d.key}'})">
          <div class="sc-header">
            <span style="font-size:28px">${d.icon}</span>
            <span class="sc-short" style="color:${d.color}">${d.label}</span>
          </div>
          <div class="sc-name">${d.label} Questions</div>
          <div class="sc-count">${counts[d.key]||0} questions available</div>
          <div class="sc-bar" style="margin-top:10px">
            <div class="sc-fill" style="width:${Math.round(((counts[d.key]||0)/state.allQuestions.length)*100)}%;background:${d.color}"></div>
          </div>
        </button>
      `).join('')}
    </div>
  </div>`;
}

// ── History ───────────────────────────────────────────────
function renderHistory() {
  const formatSubjects = (cfg) => {
    if (!cfg?.subjects) return '—';
    if (cfg.subjects.length === 6) return 'All Subjects';
    return cfg.subjects.map(s => SUBJECTS[s]?.short||s).join(', ');
  };

  return `<div class="history-screen">
    <div class="screen-header">
      <button class="btn btn-ghost btn-sm" onclick="nav('home')">← Back</button>
      <h2>Exam History</h2>
    </div>
    ${state.history.length === 0 ? '<p style="color:var(--text2);text-align:center;padding:40px">No exams taken yet.</p>' : ''}
    <div class="history-list">
      ${state.history.map((e) => `
        <div class="history-card" onclick="viewHistoryExam(${state.history.indexOf(e)})">
          <div class="hc-date">${new Date(e.date).toLocaleString()} ${e.auto?'<span style="color:var(--warning);font-size:11px">⏱ Time up</span>':''}</div>
          <div class="hc-score-row">
            <span class="hc-score ${e.percentage>=50?'pass':'fail'}">${e.score}/${e.maxScore||100}</span>
            <span class="hc-pct">${e.percentage}%</span>
            <span class="hc-status ${e.percentage>=50?'pass':'fail'}">${e.percentage>=50?'PASS':'FAIL'}</span>
          </div>
          <div class="hc-detail">${e.correct} correct · ${e.incorrect} wrong · ${e.unanswered} skipped</div>
          ${e.config ? `<div class="hc-config">${formatSubjects(e.config)} · ${e.config.difficulty} · ${e.total||50}Q · ${e.config.duration}min</div>` : ''}
        </div>
      `).join('')}
    </div>
    ${state.history.length > 0 ? `<button class="btn btn-ghost" style="width:100%;margin-top:16px" onclick="if(confirm('Clear all history?')){state.history=[];localStorage.removeItem('ceExamHistory');nav('home')}">🗑️ Clear History</button>` : ''}
  </div>`;
}

function viewHistoryExam(idx) {
  state.currentExamRecord = state.history[idx];
  state.view = 'results';
  render();
}

// ── Boot ──────────────────────────────────────────────────
init();
