const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'test-shark-quiz.db');
process.env.DB_PATH = dbPath;

const config = require('../src/config');
const db = require('../src/db');
const { initializeDatabase } = require('../src/db/migration');
const gameService = require('../src/services/gameService');

test.beforeEach(() => {
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  if (fs.existsSync(path.join(process.cwd(), 'data'))) {
    // keep directory
  }
  initializeDatabase();
});

test('a base de dados é criada e o administrador é inicializado', () => {
  const admin = db.prepare('SELECT username, role FROM admin_users WHERE username = ?').get(config.adminUsername);
  assert.ok(admin);
  assert.equal(admin.role, 'admin');
  const tableCount = db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table'").get().total;
  assert.ok(tableCount >= 10);
});

test('as perguntas de demonstração estão presentes', () => {
  const count = db.prepare('SELECT COUNT(*) AS total FROM questions').get().total;
  assert.ok(count >= 4);
  const options = db.prepare('SELECT COUNT(*) AS total FROM question_options').get().total;
  assert.ok(options >= 12);
});

test('criação de partida e entrada de equipas funciona', () => {
  const game = gameService.createGame({ name: 'Partida de teste', questionTimeMs: 20000, questionCount: 3 });
  const teamA = gameService.joinGame(game.code, 'Equipa Alfa');
  const teamB = gameService.joinGame(game.code, 'Equipa Beta');

  assert.equal(teamA.team_name, 'Equipa Alfa');
  assert.equal(teamB.team_name, 'Equipa Beta');
  assert.equal(game.code.length, 6);
  assert.equal(gameService.getGameByCode(game.code).name, 'Partida de teste');
});

test('código de acesso inválido falha', () => {
  assert.throws(() => gameService.joinGame('000000', 'Equipa Teste'), /Código de jogo inválido/i);
});
