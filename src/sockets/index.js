const express = require('express');
const router = express.Router();
const gameService = require('../services/gameService');
const db = require('../db');

router.get('/questions', (req, res) => {
  const { categoryId, difficulty, limit = 30 } = req.query;
  const items = gameService.fetchQuestionPool({ categoryId: categoryId ? Number(categoryId) : null, difficulty: difficulty || null, limit: Number(limit) });
  res.json(items);
});

router.post('/games/join', (req, res) => {
  const { code, teamName } = req.body || {};
  try {
    const team = gameService.joinGame(String(code || '').trim(), String(teamName || ''));
    res.json({ ok: true, team });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/games/:code/state', (req, res) => {
  const state = gameService.getGameView(req.params.code);
  if (!state) return res.status(404).json({ error: 'Partida não encontrada.' });
  res.json(state);
});

router.post('/games/:code/answer', (req, res) => {
  const { teamId, questionId, optionId } = req.body || {};
  const game = gameService.getGameByCode(req.params.code);
  if (!game) return res.status(404).json({ error: 'Partida não encontrada.' });
  try {
    const response = gameService.submitAnswer({ gameId: game.id, teamId: Number(teamId), questionId: Number(questionId), optionId: Number(optionId) });
    res.json({ ok: true, response });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
