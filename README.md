# SHARK QUIZ

Aplicação web profissional de quiz multiplayer para eventos.

## Requisitos

- Node.js 18+
- npm

## Instalação

```bash
npm install
cp .env.example .env
npm start
```

## Acesso

- Portal administrativo: http://localhost:3000/admin
- Painel do apresentador: http://localhost:3000/host
- Página de participantes: http://localhost:3000/play
- Página de projeção: http://localhost:3000/projector

Credenciais padrão:
- Utilizador: admin
- Palavra-passe: admin123

## Testes

```bash
npm test
```

## Estrutura principal

- `src/server.js` - entrada da aplicação
- `src/app.js` - configuração do Express
- `src/db/index.js` - base de dados SQLite
- `src/services/gameService.js` - lógica de jogo e pontuação
- `src/sockets/index.js` - comunicação em tempo real
- `public/` - páginas web e assets
