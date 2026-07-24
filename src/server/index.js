'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const boardClient = require('../core/boardClient');
const { createStore } = require('../core/store');
const { normalizeBoardUrl, boardIdFromUrl } = require('../core/parser');

const PORT = process.env.PORT || 3210;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', '..', 'public')));

// --- ユーザーごとのストア(Discordアクティビティではユーザー識別子ごとに分離) ---
const stores = new Map();
function storeFor(uid) {
  const key = (uid || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_') || 'guest';
  if (!stores.has(key)) {
    stores.set(key, createStore(path.join(__dirname, '..', '..', 'data', key)));
  }
  return stores.get(key);
}
function uidOf(req) {
  return req.query.uid || req.body?.uid || 'guest';
}

// クライアント側にDiscordのClient IDを渡す(Embedded App SDK初期化用)
app.get('/api/config', (req, res) => {
  res.json({
    discordClientId: DISCORD_CLIENT_ID,
    discordEnabled: Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET),
  });
});

// Discord OAuth2 認可コード -> アクセストークン交換 (Embedded App SDK公式手順)
app.post('/api/discord/token', async (req, res) => {
  try {
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
      return res.status(400).json({ error: 'DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET が未設定です' });
    }
    const { code } = req.body;
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
      }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json({ access_token: data.access_token });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/state', (req, res) => {
  res.json(storeFor(uidOf(req)).get());
});

app.get('/api/bbsmenu', async (req, res) => {
  try {
    const categories = await boardClient.fetchBbsMenu(req.query.url);
    res.json({ categories });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

app.get('/api/subject', async (req, res) => {
  try {
    const boardUrl = req.query.boardUrl;
    const threads = await boardClient.fetchSubject(boardUrl);
    res.json({ boardId: boardIdFromUrl(boardUrl), threads });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

app.get('/api/dat', async (req, res) => {
  try {
    const { boardUrl, threadId } = req.query;
    const knownBytes = req.query.knownBytes ? parseInt(req.query.knownBytes, 10) : 0;
    const result = await boardClient.fetchDat(boardUrl, threadId, { knownBytes });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

app.post('/api/boards', (req, res) => {
  const { name, url } = req.body;
  res.json(storeFor(uidOf(req)).addBoard(name, normalizeBoardUrl(url)));
});
app.delete('/api/boards', (req, res) => {
  res.json(storeFor(uidOf(req)).removeBoard(req.body.url));
});
app.post('/api/bbsmenus', (req, res) => {
  const { name, url } = req.body;
  res.json(storeFor(uidOf(req)).addBbsmenu(name, url));
});
app.delete('/api/bbsmenus', (req, res) => {
  res.json(storeFor(uidOf(req)).removeBbsmenu(req.body.url));
});

app.post('/api/favorites', (req, res) => {
  res.json(storeFor(uidOf(req)).addFavorite(req.body));
});
app.delete('/api/favorites', (req, res) => {
  const { boardUrl, threadId } = req.body;
  res.json(storeFor(uidOf(req)).removeFavorite(boardUrl, threadId));
});

app.post('/api/history', (req, res) => {
  res.json(storeFor(uidOf(req)).pushHistory(req.body));
});
app.delete('/api/history', (req, res) => {
  res.json(storeFor(uidOf(req)).clearHistory());
});

app.post('/api/ng', (req, res) => {
  res.json(storeFor(uidOf(req)).setNg(req.body));
});
app.post('/api/settings', (req, res) => {
  res.json(storeFor(uidOf(req)).setSettings(req.body));
});

app.listen(PORT, () => {
  console.log(`Sen2ch server listening on http://localhost:${PORT}`);
  console.log('Discordアクティビティとして使う場合は、DeveloperポータルのURL MappingsでこのURLをルート("/")に割り当ててください。');
});
