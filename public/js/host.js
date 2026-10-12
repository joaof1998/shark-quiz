const socket = io();

const loginPanel = document.getElementById('loginPanel');
const hostPanel = document.getElementById('hostPanel');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');

const gameCodeEl = document.getElementById('gameCode');
const gameStateEl = document.getElementById('gameState');
const teamCountEl = document.getElementById('teamCount');
const questionNumberEl = document.getElementById('questionNumber');
const questionTextEl = document.getElementById('questionText');
const questionCategoryEl = document.getElementById('questionCategory');
const questionDifficultyEl = document.getElementById('questionDifficulty');
const optionsListEl = document.getElementById('optionsList');
const explanationEl = document.getElementById('questionExplanation');
const leaderboardListEl = document.getElementById('leaderboardList');

let currentGame = null;

function setLoggedIn(logged) {
  loginPanel.classList.toggle('hidden', logged);
  hostPanel.classList.toggle('hidden', !logged);
}

async function loadState() {
  const res = await fetch('/api/admin/games', { credentials: 'same-origin' });
  if (!res.ok) return;
  const games = await res.json();
  if (!games.length) {
    currentGame = await createGame();
  } else {
    currentGame = games[0];
  }

  const stateRes = await fetch(`/api/games/${currentGame.code}/state`);
  const data = await stateRes.json();
  renderState(data);
  socket.emit('host-room', { code: currentGame.code });
}

async function createGame() {
  const res = await fetch('/api/admin/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ name: 'Partida demo', questionTimeMs: 20000, questionCount: 3 })
  });

  if (!res.ok) {
    throw new Error('Não foi possível criar a partida.');
  }

  const payload = await res.json();
  currentGame = payload;
  return payload;
}

function renderState(data) {
  if (!data) return;
  gameCodeEl.textContent = data.code || '—';
  gameStateEl.textContent = data.state || 'LOBBY';
  teamCountEl.textContent = (data.teams || []).length;
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
  optionsListEl.innerHTML = (q.options || []).map((opt) => `
    <div class="option-box ${q.revealed && opt.is_correct ? 'correct' : ''}">
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

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Credenciais inválidas.');
    return;
  }

  setLoggedIn(true);
  await loadState();
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
  setLoggedIn(false);
});

document.getElementById('createGameBtn').addEventListener('click', async () => {
  await createGame();
  if (currentGame) {
    const res = await fetch(`/api/games/${currentGame.code}/state`);
    const data = await res.json();
    renderState(data);
    socket.emit('host-room', { code: currentGame.code });
  }
});

document.getElementById('startGameBtn').addEventListener('click', async () => {
  if (!currentGame) return;
  await fetch(`/api/admin/games/${currentGame.id}/start`, { method: 'POST', credentials: 'same-origin' });
  const res = await fetch(`/api/games/${currentGame.code}/state`);
  const data = await res.json();
  renderState(data);
  socket.emit('request-state', { code: currentGame.code });
});

document.getElementById('pauseGameBtn').addEventListener('click', async () => {
  if (!currentGame) return;
  await fetch(`/api/admin/games/${currentGame.id}/pause`, { method: 'POST', credentials: 'same-origin' });
  const res = await fetch(`/api/games/${currentGame.code}/state`);
  const data = await res.json();
  renderState(data);
  socket.emit('request-state', { code: currentGame.code });
});

document.getElementById('resumeGameBtn').addEventListener('click', async () => {
  if (!currentGame) return;
  await fetch(`/api/admin/games/${currentGame.id}/resume`, { method: 'POST', credentials: 'same-origin' });
  const res = await fetch(`/api/games/${currentGame.code}/state`);
  const data = await res.json();
  renderState(data);
  socket.emit('request-state', { code: currentGame.code });
});

document.getElementById('revealGameBtn').addEventListener('click', async () => {
  if (!currentGame) return;
  await fetch(`/api/admin/games/${currentGame.id}/reveal`, { method: 'POST', credentials: 'same-origin' });
  const res = await fetch(`/api/games/${currentGame.code}/state`);
  const data = await res.json();
  renderState(data);
  socket.emit('request-state', { code: currentGame.code });
});

document.getElementById('advanceGameBtn').addEventListener('click', async () => {
  if (!currentGame) return;
  await fetch(`/api/admin/games/${currentGame.id}/advance`, { method: 'POST', credentials: 'same-origin' });
  const res = await fetch(`/api/games/${currentGame.code}/state`);
  const data = await res.json();
  renderState(data);
  socket.emit('request-state', { code: currentGame.code });
});

socket.on('game:update', (data) => {
  renderState(data);
});

(async function boot() {
  const res = await fetch('/api/admin/me', { credentials: 'same-origin' });
  if (res.ok) {
    setLoggedIn(true);
    await loadState();
  } else {
    setLoggedIn(false);
  }
})();
