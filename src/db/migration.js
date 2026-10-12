const fs = require('fs');
const path = require('path');
const db = require('./index');

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

const migrationPath = path.join(__dirname, 'migrations');
if (!fs.existsSync(migrationPath)) fs.mkdirSync(migrationPath, { recursive: true });

const versionFile = path.join(migrationPath, 'schema-version.json');
let version = { current: 1 };
if (fs.existsSync(versionFile)) {
  version = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
}

if (version.current < 1) {
  db.exec(migrationSql);
  version.current = 1;
  fs.writeFileSync(versionFile, JSON.stringify(version, null, 2));
} else {
  db.exec(migrationSql);
}

module.exports = { migrationSql, version };
