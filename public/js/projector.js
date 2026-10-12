const socket = io();
const joinScreen = document.getElementById('joinScreen');
const gameScreen = document.getElementById('gameScreen');
const joinForm = document.getElementById('joinForm');

const joinButton = joinForm.querySelector('button');
const teamBadge = document.getElementById('teamBadge');
const timeRemaining = document.getElementById('timeRemaining');
const playCategory = document.getElementById('playCategory');
const playDifficulty = document.getElementById('playDifficulty');
const playQuestionText = document.getElementById('playQuestionText');
const playOptions = document.getElementById('playOptions');
const statusMessage = document.getElementById('statusMessage');

let currentGame = null;
let currentTeam = null;
let currentQuestion = null;
let selectedOptionId = null;
let countdownTimer = null;

function showJoinScreen() {
  joinScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
}

function showGameScreen() {
  joinScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
}

function formatSeconds(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${seconds}s`;
}

function updateTimer(questionEndAt) {
  if (!questionEndAt) {
    timeRemaining.textContent = '0s';
    return;
  }
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    const diff = new Date(questionEndAt).getTime() - Date.now();
    timeRemaining.textContent = formatSeconds(diff);
    if (diff <= 0) {
      clearInterval(countdownTimer);
      timeRemaining.textContent = '0s';
    }
  }, 250);
}

function renderCurrentQuestion(question, state) {
  currentQuestion = question;
  if (!question) {
    playQuestionText.textContent = 'Aguardando o início da pergunta.';
    playCategory.textContent = '—';
    playDifficulty.textContent = '—';
    playOptions.innerHTML = '';
    statusMessage.textContent = 'Aguarda o início da ronda.';
    return;
  }

  playQuestionText.textContent = question.text;
  playCategory.textContent = question.category_name || '—';
  playDifficulty.textContent = question.difficulty || '—';
  playOptions.innerHTML = '';

  question.options.forEach((option) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'play-option';
    btn.textContent = option.option_text;
    btn.disabled = selectedOptionId !== null || state !== 'QUESTION' || question.revealed;

    btn.addEventListener('click', async () => {
      if (selectedOptionId !== null || state !== 'QUESTION') return;
      selectedOptionId = option.id;
      btn.classList.add('selected');
      statusMessage.textContent = 'Resposta enviada. Aguardar confirmação…';
      try {
        const res = await fetch(`/api/games/${currentGame.code}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId: currentTeam.id, questionId: question.question_id, optionId: option.id })
        });
        const data = await res.json();
        if (!res.ok) {
          statusMessage.textContent = data.error || 'Não foi possível registar a resposta.';
          selectedOptionId = null;
          return;
        }
        statusMessage.textContent = data.response.correct ? 'Resposta aceite. Bom trabalho!' : 'Resposta registada.';
      } catch (error) {
        statusMessage.textContent = 'Não foi possível contactar o servidor.';
      }
    });

    playOptions.appendChild(btn);
  });

  if (state === 'REVEAL' && question.revealed) {
    const correctOption = question.options.find((opt) => opt.is_correct);
    if (correctOption) {
      statusMessage.textContent = `Resposta correta: ${correctOption.option_text}`;
    }
  } else if (state === 'QUESTION' && selectedOptionId) {
    statusMessage.textContent = 'Resposta enviada. Aguardar confirmação…';
  } else {
    statusMessage.textContent = 'Aguardando início da ronda.';
  }

  if (question.question_end_at) {
    updateTimer(question.question_end_at);
  }
}

async function syncGameState() {
  if (!currentGame) return;
  try {
    const res = await fetch(`/api/games/${currentGame.code}/state`);
    const data = await res.json();
    if (!res.ok) return;
    currentGame = data;
    renderGameState(data);
  } catch (error) {
    console.error('syncGameState error', error);
  }
}

function renderGameState(data) {
  if (!data) return;
  if (!data.currentQuestion) {
    playQuestionText.textContent = 'Aguardando início do jogo.';
    playCategory.textContent = '—';
    playDifficulty.textContent = '—';
    playOptions.innerHTML = '';
    statusMessage.textContent = 'Aguardando início da partida.';
    return;
  }

  const q = data.currentQuestion;
  renderCurrentQuestion(q, data.state);
}

joinForm.addEventListener('submit', async function (event) {
  event.preventDefault();
  const code = document.getElementById('gameCodeInput').value.trim();
  const teamName = document.getElementById('teamNameInput').value.trim();
  joinButton.disabled = true;
  joinButton.textContent = 'A entrar...';

  try {
    const res = await fetch('/api/games/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, teamName })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Erro ao entrar na partida.');
      return;
    }
    currentTeam = data.team;
    currentGame = { code };
    teamBadge.textContent = currentTeam.team_name;
    showGameScreen();
    socket.emit('join-room', { code });
    await syncGameState();
  } catch (error) {
    alert('Não foi possível ligar ao servidor.');
  } finally {
    joinButton.disabled = false;
    joinButton.textContent = 'Entrar';
  }
});

socket.on('game:update', (data) => {
  if (!currentGame) return;
  if (data.code !== currentGame.code) return;
  renderGameState(data);
});

showJoinScreen();
