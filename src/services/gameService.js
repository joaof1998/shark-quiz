const bcrypt = require('bcryptjs');
const db = require('./db/index');
const config = require('../config');

function initAdminUser() {
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

function seedDemoData() {
  const categoryCount = db.prepare('SELECT COUNT(*) AS total FROM categories').get().total;
  if (categoryCount > 0) return;

  const cat1 = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)').run(
    'Geografia',
    'Perguntas sobre territórios, capitais e lugares.'
  );
  const cat2 = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)').run(
    'Ciência',
    'Perguntas sobre tecnologia, natureza e curiosidades.'
  );

  const q1 = db.prepare(`
    INSERT INTO questions (category_id, text, difficulty, explanation, language, active, source, license)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cat1.lastInsertRowid,
    'Qual é a capital de Portugal?',
    'fácil',
    'Lisboa é a capital e maior cidade de Portugal, localizada na costa atlântica.',
    'pt-PT',
    1,
    'Coleção de demonstração SHARK QUIZ',
    'MIT / conteúdo demonstrativo'
  );

  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 1)`).run(q1.lastInsertRowid, 'Lisboa', 1);
  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 2)`).run(q1.lastInsertRowid, 'Porto', 0);
  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 3)`).run(q1.lastInsertRowid, 'Coimbra', 0);
  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 4)`).run(q1.lastInsertRowid, 'Braga', 0);

  const q2 = db.prepare(`
    INSERT INTO questions (category_id, text, difficulty, explanation, language, active, source, license)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cat2.lastInsertRowid,
    'Qual é o planeta mais quente do Sistema Solar?',
    'média',
    'Vénus é o planeta mais quente porque a sua atmosfera densa retém calor e cria um efeito de estufa extremo.',
    'pt-PT',
    1,
    'Coleção de demonstração SHARK QUIZ',
    'MIT / conteúdo demonstrativo'
  );

  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 1)`).run(q2.lastInsertRowid, 'Mercúrio', 0);
  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 2)`).run(q2.lastInsertRowid, 'Vénus', 1);
  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 3)`).run(q2.lastInsertRowid, 'Marte', 0);
  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 4)`).run(q2.lastInsertRowid, 'Júpiter', 0);

  const q3 = db.prepare(`
    INSERT INTO questions (category_id, text, difficulty, explanation, language, active, source, license)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cat1.lastInsertRowid,
    'Qual destes países faz fronteira com Portugal?',
    'fácil',
    'Espanha é o país vizinho com fronteira terrestre com Portugal.',
    'pt-PT',
    1,
    'Coleção de demonstração SHARK QUIZ',
    'MIT / conteúdo demonstrativo'
  );

  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 1)`).run(q3.lastInsertRowid, 'Itália', 0);
  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 2)`).run(q3.lastInsertRowid, 'Espanha', 1);
  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 3)`).run(q3.lastInsertRowid, 'França', 0);
  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 4)`).run(q3.lastInsertRowid, 'Alemanha', 0);

  const q4 = db.prepare(`
    INSERT INTO questions (category_id, text, difficulty, explanation, language, active, source, license)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cat2.lastInsertRowid,
    'Qual destas substâncias é um gás nobre?',
    'média',
    'O hélio é um gás nobre, muito estável e usado em balões e instrumentos médicos.',
    'pt-PT',
    1,
    'Coleção de demonstração SHARK QUIZ',
    'MIT / conteúdo demonstrativo'
  );

  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 1)`).run(q4.lastInsertRowid, 'Oxigénio', 0);
  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 2)`).run(q4.lastInsertRowid, 'Hélio', 1);
  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 3)`).run(q4.lastInsertRowid, 'Nitrato', 0);
  db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, ordering) VALUES (?, ?, ?, 4)`).run(q4.lastInsertRowid, 'Dióxido de carbono', 0);
}

function initDatabase() {
  require('./index');
  const fs = require('fs');
  const migrationsDir = require('path').join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) fs.mkdirSync(migrationsDir, { recursive: true });
  require('./migration');
  initAdminUser();
  seedDemoData();
}

module.exports = { initDatabase };
