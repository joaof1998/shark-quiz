const API = '/api';
const socket = io();

const loginPanel = document.getElementById('loginPanel');
const hostPanel = document.getElementById('hostPanel');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');

const gameCodeEl = document.getElementById('gameCode');
const gameStateEl = document.getElementById('gameState');
const teamCountEl = document.getElementById('teamCount');
const questionNumberEl = document.getElementById('questionNumber');
const questionCardEl = document.getElementById('questionCard');
const questionTextEl = document.getElementById('questionText');
const questionCategoryEl = document.getElementById('questionCategory');
const questionDifficultyEl = document.getElementById('questionDifficulty');
const optionsListEl = document.getElementById('optionsList');
const explanationEl = document.getElementById('questionExplanation');
const leaderboardListEl = document.getElementById('leaderboardList');

let currentGame = null;
let token = null;

function setLoggedIn(logged) {
  loginPanel.classList.toggle('hidden', logged);
  hostPanel.classList.toggle('hidden', !logged);
}

async function checkAuth() {
  const res = await fetch(`${API}/admin/me`, { credentials: 'same-origin' });
  if (res.ok) {
    setLoggedIn(true);
    await createGameIfNeeded();
  } else {
    setLoggedIn(false);
  }
}

async function createGameIfNeeded() {
  const res = await fetch(`${API}/admin/games`, { credentials: 'same-origin' });
  const games = await res.json();
  if (!games.length) {
    await createGame();
  } else {
    currentGame = games[0];
    await loadState(currentGame.code);
    socket.emit('host-room', { code: currentGame.code });
  }
}

async function createGame() {
  const res = await fetch(`${API}/admin/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ name: 'Partida demo', questionTimeMs: 20000, questionCount: 3 })
  });
  const payload = await res.json();
  currentGame = payload;
  await loadState(payload.code);
  socket.emit('host-room', { code: payload.code });
}

async function loadState(code) {
  const res = await fetch(`${API}/games/${code}/state`);
  const data = await res.json();
  currentGame = data;
  renderState(data);
}

function renderState(data) {
  if (!data) return;
  gameCodeEl.textContent = data.code;
  gameStateEl.textContent = data.state || 'LOBBY';
  teamCountEl.textContent = data.teams ? data.teams.length : 0;
  questionNumberEl.textContent = `${(Number(data.current_question_index || 0) + 1)}/${data.question_count || 0}`;

  const q = data.currentQuestion;
  if (!q) {
    questionTextEl.textContent = 'Aguardando perguntas.';
    questionCategoryEl.textContent = '—';
    questionDifficultyEl.textContent = '—';
    optionsListEl.innerHTML = '';
    explanationEl.classList.add('hidden');
    return;
  }

  questionTextEl.textContent = q.text;
  questionCategoryEl.textContent = q.category_name || '—';
  questionDifficultyEl.textContent = q.difficulty || '—';
  optionsListEl.innerHTML = q.options.map((opt) => `
    <div class="option-box ${q.revealed ? (opt.is_correct ? 'correct' : '') : ''}">
      ${opt.option_text}
      ${q.revealed && opt.is_correct ? '<span class="badge-correct">Correta</span>' : ''}
    </div>
  `).join('');

  if (q.revealed && q.explanation) {
    explanationEl.textContent = q.explanation;
    explanationEl.classList.remove('hidden');
  } else {
    explanationEl.classList.add('hidden');
  }

  leaderboardListEl.innerHTML = (data.leaderboard || []).map((team, index) => `
    <li><span>#${index + 1} ${team.team_name}</span><strong>${team.score}</strong></li>
  `).join('');
}

loginForm.addEventListener('submit', async function (event) {
  event.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const res = await fetch(`${API}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Erro de autenticação.');
    return;
  }
  setLoggedIn(true);
  await createGameIfNeeded();
});

logoutBtn.addEventListener('click', async () => {
  await fetch(`${API}/admin/logout`, { method: 'POST', credentials: 'same-origin' });
  setLoggedIn(false);
});

document.getElementById('createGameBtn').addEventListener('click', async () => {
  await createGame();
});
document.getElementById('startGameBtn').addEventListener('click', async () => {
  if (!currentGame) return;
  await fetch(`${API}/admin/games/${currentGame.id}/start`, { method: 'POST', credentials: 'same-origin' });
  await loadState(currentGame.code);
  socket.emit('request-state', { code: currentGame.code });
});
document.getElementById('pauseGameBtn').addEventListener('click', async () => {
  if (!currentGame) return;
  await fetch(`${API}/admin/games/${currentGame.id}/pause`, { method: 'POST', credentials: 'same-origin' });
  await loadState(currentGame.code);
  socket.emit('request-state', { code: currentGame.code });
});
document.getElementById('resumeGameBtn').addEventListener('click', async () => {
  if (!currentGame) return;
  await fetch(`${API}/admin/games/${currentGame.id}/resume`, { method: 'POST', credentials: 'same-origin' });
  await loadState(currentGame.code);
  socket.emit('request-state', { code: currentGame.code });
});
document.getElementById('revealGameBtn').addEventListener('click', async () => {
  if (!currentGame) return;
  await fetch(`${API}/admin/games/${currentGame.id}/reveal`, { method: 'POST', credentials: 'same-origin' });
  await loadState(currentGame.code);
  socket.emit('request-state', { code: currentGame.code });
});
document.getElementById('advanceGameBtn').addEventListener('click', async () => {
  if (!currentGame) return;
  await fetch(`${API}/admin/games/${currentGame.id}/advance`, { method: 'POST', credentials: 'same-origin' });
  await loadState(currentGame.code);
  socket.emit('request-state', { code: currentGame.code });
});

socket.on('game:update', (data) => {
  renderState(data);
});

checkAuth();
