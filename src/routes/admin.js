const http = require('http');
const app = require('./app');
const config = require('./config');
const db = require('./db');
const { initDatabase } = require('./db/migration');
const socketManager = require('./sockets');

initDatabase();

const server = http.createServer(app);
socketManager.init(server);

server.listen(config.port, config.host, () => {
  console.log(`SHARK QUIZ listening on http://${config.host}:${config.port}`);
});

module.exports = { server };
