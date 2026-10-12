const db = require('../db');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const VALID_STATES = ['LOBBY', 'QUESTION', 'REVEAL', 'PAUSED', 'FINISHED'];

function generateGameCode() {
  return crypto.randomInt(100000, 999999).toString();
}

function getQuestionById(questionId) {
  return db.prepare(`
    SELECT q.id, q.text, q.difficulty, q.explanation, q.category_id, c.name AS category_name,
           q.active, q.language, q.source, q.license
    FROM questions q
    LEFT JOIN categories c ON c.id = q.category_id
    WHERE q.id = ?
  `).get(questionId);
}

function getQuestionWithOptions(questionId) {
  const question = getQuestionById(questionId);
  if (!question) return null;
  const options = db.prepare(`
    SELECT id, option_text, is_correct, ordering
    FROM question_options
    WHERE question_id = ?
    ORDER BY ordering ASC
  `).all(questionId);
  return { ...question, options };
}

function createGame({ name = 'Nova partida', questionTimeMs = 20000, questionCount = 3 }) {
  let code = generateGameCode();
  while (db.prepare('SELECT 1 FROM games WHERE code = ?').get(code)) {
    code = generateGameCode();
  }

  const result = db.prepare(`
    INSERT INTO games (name, code, state, question_time_ms, question_count, options_json)
    VALUES (?, ?, 'LOBBY', ?, ?, ?)
  `).run(name, code, questionTimeMs, questionCount, JSON.stringify({ questionTimeMs, questionCount }));

  return { id: result.lastInsertRowid, code, name, state: 'LOBBY', questionTimeMs, questionCount };
}

function getGame(gameId) {
  return db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
}

function getGameByCode(code) {
  return db.prepare('SELECT * FROM games WHERE code = ?').get(code);
}

function listQuestionsForGame(gameId, { categoryId = null, difficulty = null, limit = 20 } = {}) {
  const where = [];
  const params = [];
  if (categoryId) { where.push('q.category_id = ?'); params.push(categoryId); }
  if (difficulty) { where.push('q.difficulty = ?'); params.push(difficulty); }
  where.push('q.active = 1');

  return db.prepare(`
    SELECT q.id, q.text, q.difficulty, c.name AS category_name, q.explanation
    FROM questions q
    LEFT JOIN categories c ON c.id = q.category_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY q.created_at DESC
    LIMIT ?
  `).all(...params, limit);
}

function fetchQuestionPool({ categoryId = null, difficulty = null, limit = 30 }) {
  const where = [];
  const params = [];
  if (categoryId) { where.push('q.category_id = ?'); params.push(categoryId); }
  if (difficulty) { where.push('q.difficulty = ?'); params.push(difficulty); }
  where.push('q.active = 1');

  const rows = db.prepare(`
    SELECT q.id, q.text, q.difficulty, c.name AS category_name, q.explanation
    FROM questions q
    LEFT JOIN categories c ON c.id = q.category_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY RANDOM()
    LIMIT ?
  `).all(...params, limit);

  return rows;
}

function assignQuestionSet(gameId, questionIds) {
  const existing = db.prepare('SELECT COUNT(*) AS total FROM game_questions WHERE game_id = ?').get(gameId).total;
  if (existing > 0) return;

  for (let i = 0; i < questionIds.length; i++) {
    db.prepare(`
      INSERT INTO game_questions (game_id, question_id, order_index, revealed, question_end_at)
      VALUES (?, ?, ?, 0, NULL)
    `).run(gameId, questionIds[i], i + 1);
  }
}

function startGameByCode(code) {
  const game = getGameByCode(code);
  if (!game) throw new Error('Código de jogo inválido.');
  const selected = db.prepare('SELECT question_id FROM game_questions WHERE game_id = ? ORDER BY order_index ASC LIMIT 1').all(game.id);
  if (!selected.length) throw new Error('A partida não tem perguntas disponíveis.');
  db.prepare('UPDATE games SET state = ?, started_at = ?, updated_at = ? WHERE id = ?').run('QUESTION', new Date().toISOString(), new Date().toISOString(), game.id);
  const questionId = selected[0].question_id;
  const now = Date.now();
  const endAt = new Date(now + game.question_time_ms).toISOString();
  db.prepare('UPDATE game_questions SET question_end_at = ? WHERE game_id = ? AND question_id = ?').run(endAt, game.id, questionId);
  return { ...game, state: 'QUESTION', current_question_index: 0, questionId };
}

function getCurrentQuestion(gameId) {
  const game = getGame(gameId);
  const currentIndex = Number(game.current_question_index || 0);
  const record = db.prepare(`
    SELECT gq.*, q.text, q.explanation, c.name AS category_name, q.difficulty
    FROM game_questions gq
    INNER JOIN questions q ON q.id = gq.question_id
    LEFT JOIN categories c ON c.id = q.category_id
    WHERE gq.game_id = ? AND gq.order_index = ?
  `).get(gameId, currentIndex + 1);
  if (!record) return null;
  return { ...record, options: db.prepare(`SELECT * FROM question_options WHERE question_id = ? ORDER BY ordering ASC`).all(record.question_id) };
}

function joinGame(code, teamName) {
  const game = getGameByCode(code);
  if (!game) throw new Error('Código de jogo inválido.');
  if (!teamName || teamName.trim().length < 2 || teamName.trim().length > 30) {
    throw new Error('O nome da equipa deve ter entre 2 e 30 caracteres.');
  }

  const team = db.prepare('SELECT * FROM game_teams WHERE game_id = ? AND team_name = ?').get(game.id, teamName.trim());
  if (team) return { ...team, gameCode: code, alreadyExists: true };

  const result = db.prepare('INSERT INTO game_teams (game_id, team_name, connected_at, last_seen_at, score) VALUES (?, ?, ?, ?, 0)').run(
    game.id,
    teamName.trim(),
    new Date().toISOString(),
    new Date().toISOString()
  );

  return { id: result.lastInsertRowid, game_id: game.id, team_name: teamName.trim(), score: 0, gameCode: code };
}

function listTeams(gameId) {
  return db.prepare(`
    SELECT gt.id, gt.team_name, gt.score, gt.connected_at
    FROM game_teams gt
    WHERE game_id = ?
    ORDER BY gt.score DESC, gt.team_name ASC
  `).all(gameId);
}

function submitAnswer({ gameId, teamId, questionId, optionId }) {
  const game = getGame(gameId);
  if (!game) throw new Error('Partida inexistente.');
  if (game.state !== 'QUESTION') throw new Error('As respostas não estão abertas neste momento.');

  const team = db.prepare('SELECT * FROM game_teams WHERE id = ? AND game_id = ?').get(teamId, gameId);
  if (!team) throw new Error('Equipa não encontrada.');

  const option = db.prepare('SELECT * FROM question_options WHERE id = ? AND question_id = ?').get(optionId, questionId);
  if (!option) throw new Error('Opção inválida.');

  const duplicate = db.prepare('SELECT * FROM answers WHERE game_id = ? AND team_id = ? AND question_id = ?').get(gameId, teamId, questionId);
  if (duplicate) {
    throw new Error('Já respondeu a esta pergunta.');
  }

  const currentQuestion = db.prepare('SELECT * FROM game_questions WHERE game_id = ? AND question_id = ?').get(gameId, questionId);
  if (!currentQuestion) throw new Error('Pergunta não disponível na partida.');

  const now = Date.now();
  const endAt = currentQuestion.question_end_at ? new Date(currentQuestion.question_end_at).getTime() : now;
  if (now > endAt) {
    throw new Error('O tempo para responder terminou.');
  }

  const correct = option.is_correct === 1 ? 1 : 0;
  const basePoints = 500;
  const remaining = Math.max(0, endAt - now);
  const speedBonus = Math.round((remaining / Math.max(1, game.question_time_ms)) * 500);
  const total = correct ? basePoints + speedBonus : 0;

  db.prepare(`
    INSERT INTO answers (game_id, team_id, question_id, option_id, submitted_at, points_awarded, correct)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(gameId, teamId, questionId, optionId, new Date().toISOString(), total, correct);

  if (correct) {
    db.prepare('UPDATE game_teams SET score = score + ? WHERE id = ?').run(total, teamId);
    db.prepare('INSERT INTO score_events (game_id, team_id, question_id, delta, reason) VALUES (?, ?, ?, ?, ?)')
      .run(gameId, teamId, questionId, total, 'Resposta correta + bónus de rapidez');
  } else {
    db.prepare('INSERT INTO score_events (game_id, team_id, question_id, delta, reason) VALUES (?, ?, ?, ?, ?)')
      .run(gameId, teamId, questionId, 0, 'Resposta incorreta');
  }

  const updatedTeam = db.prepare('SELECT * FROM game_teams WHERE id = ?').get(teamId);
  return { accepted: true, correct, pointsAwarded: total, team: updatedTeam };
}

function revealQuestion(gameId) {
  const game = getGame(gameId);
  if (!game) throw new Error('Partida inexistente.');
  const currentIndex = Number(game.current_question_index || 0);
  const record = db.prepare('SELECT * FROM game_questions WHERE game_id = ? AND order_index = ?').get(gameId, currentIndex + 1);
  if (!record) throw new Error('Pergunta atual inexistente.');
  db.prepare('UPDATE games SET state = ?, updated_at = ? WHERE id = ?').run('REVEAL', new Date().toISOString(), gameId);
  db.prepare('UPDATE game_questions SET revealed = 1 WHERE id = ?').run(record.id);
  return { success: true };
}

function advanceGame(gameId) {
  const game = getGame(gameId);
  if (!game) throw new Error('Partida inexistente.');

  const nextIndex = Number(game.current_question_index) + 1;
  const totalQuestions = db.prepare('SELECT COUNT(*) AS total FROM game_questions WHERE game_id = ?').get(gameId).total;
  if (nextIndex >= totalQuestions) {
    db.prepare('UPDATE games SET state = ?, ended_at = ?, updated_at = ? WHERE id = ?').run('FINISHED', new Date().toISOString(), new Date().toISOString(), gameId);
    return { state: 'FINISHED' };
  }

  db.prepare('UPDATE games SET current_question_index = ?, state = ?, updated_at = ? WHERE id = ?').run(nextIndex, 'QUESTION', new Date().toISOString(), gameId);
  const nextQuestion = db.prepare('SELECT question_id FROM game_questions WHERE game_id = ? AND order_index = ?').get(gameId, nextIndex + 1);
  const endAt = new Date(Date.now() + game.question_time_ms).toISOString();
  db.prepare('UPDATE game_questions SET question_end_at = ?, revealed = 0 WHERE game_id = ? AND question_id = ?').run(endAt, gameId, nextQuestion.question_id);
  return { state: 'QUESTION', nextQuestionId: nextQuestion.question_id };
}

function pauseGame(gameId) {
  const game = getGame(gameId);
  if (!game) throw new Error('Partida inexistente.');
  db.prepare('UPDATE games SET state = ?, updated_at = ? WHERE id = ?').run('PAUSED', new Date().toISOString(), gameId);
  return { success: true };
}

function resumeGame(gameId) {
  const game = getGame(gameId);
  if (!game) throw new Error('Partida inexistente.');
  db.prepare('UPDATE games SET state = ?, updated_at = ? WHERE id = ?').run('QUESTION', new Date().toISOString(), gameId);
  const currentIndex = Number(game.current_question_index || 0);
  const record = db.prepare('SELECT * FROM game_questions WHERE game_id = ? AND order_index = ?').get(gameId, currentIndex + 1);
  if (record && !record.question_end_at) {
    const endAt = new Date(Date.now() + game.question_time_ms).toISOString();
    db.prepare('UPDATE game_questions SET question_end_at = ? WHERE id = ?').run(endAt, record.id);
  }
  return { success: true };
}

function getGameView(gameCode) {
  const game = getGameByCode(gameCode);
  if (!game) return null;
  const teams = listTeams(game.id);
  const currentIndex = Number(game.current_question_index || 0);
  const currentQuestionRec = db.prepare(`
    SELECT gq.id, gq.question_id, gq.order_index, gq.revealed, gq.question_end_at, q.text, q.explanation, q.difficulty, c.name AS category_name
    FROM game_questions gq
    INNER JOIN questions q ON q.id = gq.question_id
    LEFT JOIN categories c ON c.id = q.category_id
    WHERE gq.game_id = ? AND gq.order_index = ?
  `).get(game.id, currentIndex + 1);

  const currentQuestion = currentQuestionRec ? { ...currentQuestionRec, options: db.prepare('SELECT * FROM question_options WHERE question_id = ? ORDER BY ordering ASC').all(currentQuestionRec.question_id) } : null;
  const leaderboard = [...teams].sort((a, b) => b.score - a.score);
  return {
    id: game.id,
    code: game.code,
    name: game.name,
    state: game.state,
    current_question_index: currentIndex,
    question_count: game.question_count,
    question_time_ms: game.question_time_ms,
    teams,
    leaderboard,
    currentQuestion,
    started_at: game.started_at
  };
}

function fetchQuestionsForImport() {
  return db.prepare('SELECT * FROM questions ORDER BY created_at DESC LIMIT 50').all();
}

module.exports = {
  createGame,
  getGame,
  getGameByCode,
  joinGame,
  listTeams,
  listQuestionsForGame,
  fetchQuestionPool,
  assignQuestionSet,
  startGameByCode,
  submitAnswer,
  revealQuestion,
  advanceGame,
  pauseGame,
  resumeGame,
  getGameView,
  getCurrentQuestion,
  getQuestionWithOptions,
  fetchQuestionsForImport,
  VALID_STATES,
  generateGameCode
};
