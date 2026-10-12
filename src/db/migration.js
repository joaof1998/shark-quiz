const fs = require('fs');
const path = require('path');
const db = require('./index');
const bcrypt = require('bcryptjs');
const config = require('../config');

const migrationSql = `
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('fácil', 'média', 'difícil')),
  explanation TEXT,
  language TEXT NOT NULL DEFAULT 'pt-PT',
  active INTEGER NOT NULL DEFAULT 1,
  source TEXT,
  license TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS question_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL,
  option_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  ordering INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'LOBBY',
  current_question_index INTEGER NOT NULL DEFAULT 0,
  question_time_ms INTEGER NOT NULL DEFAULT 20000,
  question_count INTEGER NOT NULL DEFAULT 1,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  options_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS game_teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  team_name TEXT NOT NULL,
  connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  score INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT,
  UNIQUE(game_id, team_name),
  FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  order_index INTEGER NOT NULL,
  revealed INTEGER NOT NULL DEFAULT 0,
  question_end_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(game_id, order_index),
  FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY(question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  option_id INTEGER NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  is_duplicate INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY(team_id) REFERENCES game_teams(id) ON DELETE CASCADE,
  FOREIGN KEY(question_id) REFERENCES questions(id),
  FOREIGN KEY(option_id) REFERENCES question_options(id)
);

CREATE TABLE IF NOT EXISTS score_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  delta INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY(team_id) REFERENCES game_teams(id) ON DELETE CASCADE,
  FOREIGN KEY(question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  format TEXT NOT NULL,
  imported_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  total_rows INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  summary_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT,
  entity_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category_id);
CREATE INDEX IF NOT EXISTS idx_questions_active ON questions(active);
CREATE INDEX IF NOT EXISTS idx_question_options_question ON question_options(question_id);
CREATE INDEX IF NOT EXISTS idx_games_code ON games(code);
CREATE INDEX IF NOT EXISTS idx_game_teams_game ON game_teams(game_id);
CREATE INDEX IF NOT EXISTS idx_answers_game_question ON answers(game_id, question_id);
CREATE INDEX IF NOT EXISTS idx_score_events_game ON score_events(game_id);
`;

function ensureAdminUser() {
  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(config.adminUsername);
  if (!existing) {
    const hash = bcrypt.hashSync(config.adminPassword, 10);
    db.prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)').run(
      config.adminUsername,
      hash,
      'admin'
    );
  }
}

function ensureDemoQuestions() {
  const categoryCount = db.prepare('SELECT COUNT(*) AS total FROM categories').get().total;
  if (categoryCount > 0) {
    return;
  }

  const cat1 = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)').run(
    'Geografia',
    'Perguntas sobre territórios, capitais e curiosidades geográficas.'
  );

  const cat2 = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)').run(
    'Ciência',
    'Perguntas sobre tecnologia, natureza e curiosidades científicas.'
  );

  const q1 = db.prepare(`
    INSERT INTO questions (category_id, text, difficulty, explanation, language, active, source, license)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cat1.lastInsertRowid,
    'Qual é a capital de Portugal?',
    'fácil',
    'Lisboa é a capital e maior cidade de Portugal, situada na costa atlântica.',
    'pt-PT',
    1,
    'Coleção de demonstração SHARK QUIZ',
    'MIT / conteúdo demonstrativo'
  );
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q1.lastInsertRowid, 'Lisboa', 1, 1);
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q1.lastInsertRowid, 'Porto', 0, 2);
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q1.lastInsertRowid, 'Coimbra', 0, 3);
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q1.lastInsertRowid, 'Braga', 0, 4);

  const q2 = db.prepare(`
    INSERT INTO questions (category_id, text, difficulty, explanation, language, active, source, license)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cat2.lastInsertRowid,
    'Qual é o planeta mais quente do Sistema Solar?',
    'média',
    'Vénus é o planeta mais quente por causa do efeito de estufa extremo na sua atmosfera.',
    'pt-PT',
    1,
    'Coleção de demonstração SHARK QUIZ',
    'MIT / conteúdo demonstrativo'
  );
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q2.lastInsertRowid, 'Mercúrio', 0, 1);
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q2.lastInsertRowid, 'Vénus', 1, 2);
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q2.lastInsertRowid, 'Marte', 0, 3);
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q2.lastInsertRowid, 'Júpiter', 0, 4);

  const q3 = db.prepare(`
    INSERT INTO questions (category_id, text, difficulty, explanation, language, active, source, license)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cat1.lastInsertRowid,
    'Qual destes países faz fronteira com Portugal?',
    'fácil',
    'Espanha faz fronteira terrestre com Portugal e é o principal país vizinho.',
    'pt-PT',
    1,
    'Coleção de demonstração SHARK QUIZ',
    'MIT / conteúdo demonstrativo'
  );
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q3.lastInsertRowid, 'Itália', 0, 1);
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q3.lastInsertRowid, 'Espanha', 1, 2);
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q3.lastInsertRowid, 'França', 0, 3);
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q3.lastInsertRowid, 'Alemanha', 0, 4);

  const q4 = db.prepare(`
    INSERT INTO questions (category_id, text, difficulty, explanation, language, active, source, license)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cat2.lastInsertRowid,
    'Qual destas substâncias é um gás nobre?',
    'média',
    'O hélio é um gás nobre: é muito estável e não reage facilmente com outras substâncias.',
    'pt-PT',
    1,
    'Coleção de demonstração SHARK QUIZ',
    'MIT / conteúdo demonstrativo'
  );
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q4.lastInsertRowid, 'Oxigénio', 0, 1);
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q4.lastInsertRowid, 'Hélio', 1, 2);
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q4.lastInsertRowid, 'Nitrato', 0, 3);
  db.prepare('INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, ?)').run(q4.lastInsertRowid, 'Dióxido de carbono', 0, 4);
}

function initializeDatabase() {
  db.exec(migrationSql);
  ensureAdminUser();
  ensureDemoQuestions();
}

module.exports = { migrationSql, initializeDatabase };
