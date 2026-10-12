const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const gameService = require('../services/gameService');

const router = express.Router();

function ensureAdmin(req, res, next) {
  if (!req.session || !req.session.adminLoggedIn) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  next();
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Credenciais inválidas.' });

  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas.' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciais inválidas.' });

  req.session.adminLoggedIn = true;
  req.session.user = { username: user.username, role: user.role };
  return res.json({ ok: true, username: user.username });
});

router.post('/logout', ensureAdmin, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', ensureAdmin, (req, res) => {
  res.json({ ok: true, user: req.session.user });
});

router.get('/stats', ensureAdmin, (req, res) => {
  const totals = {
    categories: db.prepare('SELECT COUNT(*) AS total FROM categories').get().total,
    questions: db.prepare('SELECT COUNT(*) AS total FROM questions').get().total,
    teams: db.prepare('SELECT COUNT(*) AS total FROM game_teams').get().total,
    games: db.prepare('SELECT COUNT(*) AS total FROM games').get().total
  };
  res.json(totals);
});

router.get('/questions', ensureAdmin, (req, res) => {
  const { categoryId, difficulty, page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  const where = [];
  const params = [];
  if (categoryId) { where.push('q.category_id = ?'); params.push(categoryId); }
  if (difficulty) { where.push('q.difficulty = ?'); params.push(difficulty); }
  const sql = `
    SELECT q.id, q.text, q.difficulty, q.active, q.explanation, q.language, c.name AS category_name
    FROM questions q
    LEFT JOIN categories c ON c.id = q.category_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY q.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(sql).all(...params, Number(limit), offset);
  res.json(rows);
});

router.get('/categories', ensureAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
  res.json(rows);
});

router.post('/categories', ensureAdmin, (req, res) => {
  const { name, description } = req.body || {};
  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'Nome da categoria inválido.' });
  }
  const result = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)').run(String(name).trim(), description || '');
  res.status(201).json({ id: result.lastInsertRowid, name: String(name).trim() });
});

router.post('/games', ensureAdmin, (req, res) => {
  const { name, questionTimeMs = 20000, questionCount = 3 } = req.body || {};
  const game = gameService.createGame({ name, questionTimeMs, questionCount });
  const pool = gameService.fetchQuestionPool({ limit: Number(questionCount) * 4 || 12 });
  const selected = pool.slice(0, Number(questionCount) || 3).map(item => item.id);
  gameService.assignQuestionSet(game.id, selected);
  res.status(201).json(game);
});

router.post('/games/:id/start', ensureAdmin, (req, res) => {
  const game = gameService.getGame(Number(req.params.id));
  if (!game) return res.status(404).json({ error: 'Partida não encontrada.' });
  const started = gameService.startGameByCode(game.code);
  res.json(started);
});

router.post('/games/:id/advance', ensureAdmin, (req, res) => {
  const result = gameService.advanceGame(Number(req.params.id));
  res.json(result);
});

router.post('/games/:id/reveal', ensureAdmin, (req, res) => {
  const result = gameService.revealQuestion(Number(req.params.id));
  res.json(result);
});

router.post('/games/:id/pause', ensureAdmin, (req, res) => {
  const result = gameService.pauseGame(Number(req.params.id));
  res.json(result);
});

router.post('/games/:id/resume', ensureAdmin, (req, res) => {
  const result = gameService.resumeGame(Number(req.params.id));
  res.json(result);
});

router.get('/games', ensureAdmin, (req, res) => {
  const games = db.prepare('SELECT * FROM games ORDER BY created_at DESC LIMIT 20').all();
  res.json(games);
});

router.get('/games/:id/state', ensureAdmin, (req, res) => {
  const game = gameService.getGame(Number(req.params.id));
  if (!game) return res.status(404).json({ error: 'Partida não encontrada.' });
  res.json(gameService.getGameView(game.code));
});

router.post('/questions', ensureAdmin, (req, res) => {
  const { categoryId, text, difficulty, explanation, options } = req.body || {};
  if (!categoryId || !text || !difficulty || !Array.isArray(options) || options.length !== 4) {
    return res.status(400).json({ error: 'Pergunta incompleta. O payload deve incluir 4 opções.' });
  }

  const q = db.prepare(`INSERT INTO questions (category_id, text, difficulty, explanation, language, source, license)
    VALUES (?, ?, ?, ?, 'pt-PT', 'manual', 'manual')`).run(categoryId, String(text).trim(), String(difficulty), String(explanation || ''));

  options.forEach((option, index) => {
    db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)')
      .run(q.lastInsertRowid, String(option.text).trim(), option.isCorrect ? 1 : 0, index + 1);
  });

  res.status(201).json({ id: q.lastInsertRowid, ok: true });
});

module.exports = router;
