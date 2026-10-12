const express = require('express');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
const routesAdmin = require('./routes/admin');
const routesPublic = require('./routes/public');
const config = require('./config');

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 }
}));

app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/admin', routesAdmin);
app.use('/api', routesPublic);

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/host.html')));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, '../public/host.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, '../public/play.html')));
app.get('/projector', (req, res) => res.sendFile(path.join(__dirname, '../public/projector.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

module.exports = app;
