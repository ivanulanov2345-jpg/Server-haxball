#!/usr/bin/env node
'use strict';

const FS_AVAILABLE = typeof require === 'function';
const fs = FS_AVAILABLE ? require('fs') : null;
const path = FS_AVAILABLE ? require('path') : null;

/*
  BOT HAXBALL TODO-EN-UNO (PRO)
  - 1v1/2v2/3v3 automático.
  - ELO competitivo solo en 3v3 completo.
  - Persistencia local (ELO, monedas, stats, inventario).
  - Votekick gratis (sin monedas).
  - AFK/BACK, autobalance estable, pausa por reemplazo, tienda, misiones.
*/

const ROOM_CONFIG = {
  roomName: '3v3 COMPETITIVO',
  maxPlayers: 16,
  public: true,
  noPlayer: true,
  geo: { code: 'AR', lat: -34.61, lon: -58.38 },
};

const STADIUMS = {
  default: 'Big',
  bazinga3v3: '',
};

const DATA_FILE = FS_AVAILABLE ? path.join(__dirname, 'haxball-player-data.json') : 'haxball-player-data.localStorage';
const LS_KEY = 'haxball-player-data';

const SERVER_CONFIG = {
  adminPassword: 'eo123',
  teamSizeMax: 3,
  scoreLimit: 3,
  timeLimit: 5,
  restartDelayMs: 5000,
  checkLoopMs: 1200,
  idleCheckMs: 2000,
  avatarCleanupMs: 700,
  tipsEveryMs: 180000,
  topDefault: 5,
  votekickDurationMs: 30000,
  votekickCooldownMs: 120000,
  warnAutoMuteCount: 3,
  mvpCoinReward: 25,
  matchCoinReward: 8,
  winCoinReward: 15,
  quitPenaltyElo: -35,
  quitPenaltyCompetitiveOnly: true,
  idleKickSeconds: 10,
  idleWarnSeconds: 5,
  replacementJoinWindowMs: 5000,
  saveEveryMs: 45000,
  announceKickEffects: false,
};

const ELO_CONFIG = {
  initial: 1000,
  win: 25,
  loss: -15,
  mvpBonus: 12,
};

const RANKS = [
  { name: 'Bronce', minElo: 0, color: 0xcd7f32, dot: '🟤' },
  { name: 'Plata', minElo: 1000, color: 0xc0c0c0, dot: '⚪' },
  { name: 'Oro', minElo: 1200, color: 0xffd700, dot: '🟡' },
  { name: 'Platino', minElo: 1450, color: 0x00ced1, dot: '🔵' },
  { name: 'Diamante', minElo: 1700, color: 0x7df9ff, dot: '💠' },
  { name: 'Maestro', minElo: 2000, color: 0xba55d3, dot: '🟣' },
];

const MISSIONS = [
  { id: 'm_goals_20', name: 'Artillero', stat: 'goals', target: 20, rewardCoins: 120 },
  { id: 'm_wins_15', name: 'Competidor', stat: 'wins', target: 15, rewardCoins: 140 },
  { id: 'm_mvp_5', name: 'Figura', stat: 'mvps', target: 5, rewardCoins: 160 },
];

const SHOP_ITEMS = [
  { id: 'chat_verde', type: 'chatColor', value: 0x90ee90, name: 'Chat Verde', price: 80 },
  { id: 'chat_rosa', type: 'chatColor', value: 0xff69b4, name: 'Chat Rosa', price: 80 },
  { id: 'emblema_estrella', type: 'emblem', value: '⭐', name: 'Emblema Estrella', price: 120 },
  { id: 'emblema_fuego', type: 'emblem', value: '🔥', name: 'Emblema Fuego', price: 120 },
  { id: 'tiro_rayo', type: 'kickEffect', value: '⚡', name: 'Efecto Tiro Rayo', price: 150 },
  { id: 'tiro_fuego', type: 'kickEffect', value: '🔥', name: 'Efecto Tiro Fuego', price: 150 },
];

const TIPS = [
  '💡 Mantén la forma: en 3v3 no persigan todos la pelota.',
  '💡 Si vas último, prioriza contener antes de barrerte.',
  '💡 Después de pasar, desmárcate para abrir línea.',
  '💡 En salida, evita rifarla al medio cuando estás presionado.',
  '💡 Hablar y rotar marcas gana más que jugar solo.',
];

const GOAL_CELEBRATIONS = ['⚽ GOLAZO', '🔥 TREMENDO GOL', '🎯 DEFINICIÓN PERFECTA', '🚀 MISIL AL ARCO', '💥 GOL Y A COBRAR'];
const SAVE_COMPLIMENTS = ['🧤 ATAJADÓN brutal del arquero', '🧤 MURALLA total, qué reflejos', '🧤 Esa mano salvó el partido', '🧤 Portero modo DIOS'];

const HELP = {
  general: ['📚 !help <seccion> | !menu | !reco', 'Secciones: general, jugador, competitivo, admin, tienda, comunidad, votekick'],
  jugador: ['👤 !id !stats [id] !rank !top [n] !mode !players !afk !back !coins !misiones !shop !buy <item> !equip <item> !inventory !postular !queue !reglas !mapa !pickteam <red|blue|auto>'],
  competitivo: ['🏆 ELO solo en 3v3 completo.', '1v1/2v2 son casuales (sin riesgo ELO).', 'Penaliza abandono en competitivo.'],
  admin: ['🛡️ !admin <clave> !rr !pausebot !resumebot !setscore <n> !settime <n> !move <id> <red|blue|spec> !red <id> !blue <id> !spec <id> !setteams a,b,c:x,y,z !forcereplace'],
  tienda: ['🛒 !shop !buy <item> !equip <item> !inventory'],
  comunidad: ['🌎 !queue !online !reglas !mapa !next !capitanes'],
  votekick: ['⚖️ !votekick <id> <motivo> | !yes | !no', 'No cuesta monedas, con cooldown personal.'],
};

const state = {
  players: new Map(),
  afk: new Set(),
  mutedIds: new Set(),
  warnings: new Map(),
  forcedTeams: null,
  winnerTeam: null,
  winnerIds: new Set(),
  streakHolderIds: new Set(),
  streakCount: 0,
  vote: null,
  botEnabled: true,
  flowState: 'idle',
  restartBlockedUntil: 0,
  lastTouch: null,
  secondLastTouch: null,
  tipIndex: 0,
  pendingShot: null,
  tempAvatarUntil: new Map(),
  crownedWinners: new Set(),
  frozenLineup: null,
  replacementNeeded: null,
  replacementGraceUntil: 0,
  manualTeams: false,
  teamPreferences: new Map(),
  matchEnding: false,
  persistenceDirty: false,
};

function ann(room, msg, target = null, color = 0x9ec6ff, style = 'normal', sound = 0) {
  room.sendAnnouncement(msg, target, color, style, sound);
}

function keyOf(player) {
  return player.auth ? `auth:${player.auth}` : player.conn ? `conn:${player.conn}` : `name:${String(player.name || '').toLowerCase()}`;
}

function ensureWarnings(key) {
  if (!state.warnings.has(key)) state.warnings.set(key, []);
  return state.warnings.get(key);
}

function getRankByElo(elo) {
  let rank = RANKS[0];
  for (const r of RANKS) if (elo >= r.minElo) rank = r;
  return rank;
}

function getStreakBreakBonusPct(streakCount) {
  if (streakCount >= 6) return 0.35;
  if (streakCount >= 4) return 0.2;
  if (streakCount >= 2) return 0.1;
  return 0;
}

function toSerializableProfile(p) {
  return {
    ...p,
    missionDone: Array.from(p.missionDone || []),
    inventory: Array.from(p.inventory || []),
  };
}

function fromSerializableProfile(raw = {}) {
  return {
    key: raw.key || '',
    name: raw.name || 'Jugador',
    elo: Number.isFinite(raw.elo) ? raw.elo : ELO_CONFIG.initial,
    joins: Number(raw.joins || 0),
    matches: Number(raw.matches || 0),
    wins: Number(raw.wins || 0),
    losses: Number(raw.losses || 0),
    goals: Number(raw.goals || 0),
    assists: Number(raw.assists || 0),
    ownGoals: Number(raw.ownGoals || 0),
    mvps: Number(raw.mvps || 0),
    saves: Number(raw.saves || 0),
    coins: Number(raw.coins || 0),
    missionDone: new Set(Array.isArray(raw.missionDone) ? raw.missionDone : []),
    inventory: new Set(Array.isArray(raw.inventory) ? raw.inventory : []),
    equipped: {
      chatColor: raw.equipped && Number.isFinite(raw.equipped.chatColor) ? raw.equipped.chatColor : null,
      emblem: raw.equipped && raw.equipped.emblem ? String(raw.equipped.emblem) : null,
      kickEffect: raw.equipped && raw.equipped.kickEffect ? String(raw.equipped.kickEffect) : null,
    },
    votekickCooldownUntil: Number(raw.votekickCooldownUntil || 0),
    match: { goals: 0, assists: 0, ownGoals: 0, saves: 0 },
    isInMatch: false,
    lastMoveAt: Date.now(),
    idleWarned: false,
    idleSafeUntil: 0,
  };
}

function loadData() {
  try {
    let raw = null;

    if (FS_AVAILABLE) {
      if (!fs.existsSync(DATA_FILE)) return;
      raw = fs.readFileSync(DATA_FILE, 'utf8');
    } else if (typeof localStorage !== 'undefined') {
      raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
    } else {
      return;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.players) return;
    Object.entries(parsed.players).forEach(([k, v]) => {
      state.players.set(k, fromSerializableProfile({ ...v, key: k }));
    });
  } catch (e) {
    console.error('No se pudo cargar persistencia:', e.message);
  }
}

function saveData(force = false) {
  if (!force && !state.persistenceDirty) return;
  try {
    const payload = { players: {} };
    state.players.forEach((v, k) => {
      payload.players[k] = toSerializableProfile(v);
    });
    const json = JSON.stringify(payload, null, 2);

    if (FS_AVAILABLE) {
      fs.writeFileSync(DATA_FILE, json);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_KEY, json);
    } else {
      return;
    }

    state.persistenceDirty = false;
  } catch (e) {
    console.error('No se pudo guardar persistencia:', e.message);
  }
}

function markDirty() {
  state.persistenceDirty = true;
}

function ensureProfile(player) {
  const key = keyOf(player);
  if (!state.players.has(key)) {
    state.players.set(key, fromSerializableProfile({ key, name: player.name }));
    markDirty();
  }
  const p = state.players.get(key);
  p.key = key;
  p.name = player.name;
  if (!p.match) p.match = { goals: 0, assists: 0, ownGoals: 0, saves: 0 };
  if (!Number.isFinite(p.lastMoveAt)) p.lastMoveAt = Date.now();
  if (typeof p.idleWarned !== 'boolean') p.idleWarned = false;
  if (!Number.isFinite(p.idleSafeUntil)) p.idleSafeUntil = 0;
  return p;
}

function isAdmin(player) {
  return !!(player && player.admin);
}

function isAfk(player) {
  return state.afk.has(keyOf(player));
}

function getPlayers(room) {
  return room.getPlayerList().filter((x) => x.id !== 0);
}

function teams(room) {
  const all = getPlayers(room);
  return {
    red: all.filter((p) => p.team === 1),
    blue: all.filter((p) => p.team === 2),
    spec: all.filter((p) => p.team === 0),
  };
}

function activePlayers(room) {
  return getPlayers(room).filter((p) => !isAfk(p));
}

function mode(room) {
  const t = teams(room);
  return t.red.length === 3 && t.blue.length === 3 ? 'competitivo' : 'casual';
}

function targetSize(room) {
  const c = activePlayers(room).length;
  if (c < 2) return 0;
  return Math.min(SERVER_CONFIG.teamSizeMax, Math.max(1, Math.floor(c / 2)));
}

function currentMatchTarget(room) {
  const scores = room.getScores();
  if (scores !== null && state.frozenLineup) {
    const redSize = Array.isArray(state.frozenLineup.red) ? state.frozenLineup.red.length : 0;
    const blueSize = Array.isArray(state.frozenLineup.blue) ? state.frozenLineup.blue.length : 0;
    const frozen = Math.max(redSize, blueSize);
    if (frozen > 0) return frozen;
  }
  return targetSize(room);
}

function setTeam(room, playerId, teamId) {
  const p = room.getPlayer(playerId);
  if (!p) return;
  if (p.team !== teamId) room.setPlayerTeam(playerId, teamId);
}

function queueSorted(spec) {
  return [...spec].sort((a, b) => a.id - b.id);
}

function getPlayerById(room, id) {
  return getPlayers(room).find((p) => p.id === id) || null;
}

function randomPick(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function preferredCandidates(room, players, teamId) {
  return players.sort((a, b) => {
    const pa = state.teamPreferences.get(a.id) || null;
    const pb = state.teamPreferences.get(b.id) || null;
    const sa = pa === teamId ? 0 : pa ? 1 : 2;
    const sb = pb === teamId ? 0 : pb ? 1 : 2;
    if (sa !== sb) return sa - sb;
    return a.id - b.id;
  });
}

function isMatchCloseToFinish(room) {
  const scores = room.getScores();
  if (!scores) return false;

  const scoreLimit = Number(scores.scoreLimit || 0);
  if (scoreLimit > 0) {
    const maxGoals = Math.max(scores.red || 0, scores.blue || 0);
    if (maxGoals >= Math.max(0, scoreLimit - 1)) return true;
  }

  const timeLimit = Number(scores.timeLimit || 0);
  if (timeLimit > 0) {
    const remaining = timeLimit * 60 - Number(scores.time || 0);
    if (remaining <= 20) return true;
  }

  return false;
}

function addCoins(player, amount, reason, room) {
  const p = ensureProfile(player);
  p.coins = Math.max(0, p.coins + amount);
  markDirty();
  ann(room, `🪙 ${player.name}: ${amount >= 0 ? '+' : ''}${amount} monedas (${reason})`, player.id, amount >= 0 ? 0xffd700 : 0xff9f9f);
}

function addElo(player, amount, reason, room) {
  const p = ensureProfile(player);
  const before = getRankByElo(p.elo);
  p.elo = Math.max(0, p.elo + amount);
  const after = getRankByElo(p.elo);
  markDirty();
  ann(room, `${amount >= 0 ? '➕' : '➖'} ${player.name}: ${amount} ELO (${reason})`, player.id, amount >= 0 ? 0x90ee90 : 0xff7f7f);
  if (before.name !== after.name) ann(room, `🏅 ${player.name}: ${before.name} ➜ ${after.name}`, null, after.color, 'bold', 1);
}

function evaluateMissions(player, room) {
  const p = ensureProfile(player);
  for (const m of MISSIONS) {
    if (p.missionDone.has(m.id)) continue;
    const v = p[m.stat] || 0;
    if (v >= m.target) {
      p.missionDone.add(m.id);
      markDirty();
      addCoins(player, m.rewardCoins, `Misión ${m.name}`, room);
      ann(room, `🎯 ${player.name} completó misión ${m.name}.`, null, 0x87cefa, 'bold');
    }
  }
}

function fillVacancies(room) {
  const t = teams(room);
  const tgt = currentMatchTarget(room);
  let q = queueSorted(t.spec.filter((p) => !isAfk(p)));

  while (t.red.length < tgt && q.length > 0) {
    q = preferredCandidates(room, q, 1);
    const next = q.shift();
    setTeam(room, next.id, 1);
    t.red.push(next);
  }
  while (t.blue.length < tgt && q.length > 0) {
    q = preferredCandidates(room, q, 2);
    const next = q.shift();
    setTeam(room, next.id, 2);
    t.blue.push(next);
  }
}

function freezeCurrentLineup(room) {
  const t = teams(room);
  state.frozenLineup = {
    red: t.red.map((p) => p.id),
    blue: t.blue.map((p) => p.id),
  };
}

function clearRoundVisuals(room) {
  state.crownedWinners.clear();
  getPlayers(room).forEach((pl) => room.setPlayerAvatar(pl.id, null));
}

function applyWinnerStays(room, tgt) {
  if (state.winnerTeam !== 1 && state.winnerTeam !== 2) return;
  const t = teams(room);
  const loserTeam = state.winnerTeam === 1 ? 2 : 1;
  const waiting = t.spec.filter((p) => !isAfk(p));

  const onlyTwoTeams = activePlayers(room).length <= tgt * 2 && waiting.length === 0;
  if (onlyTwoTeams) return;

  const all = getPlayers(room);
  const winners = all
    .filter((p) => state.winnerIds.has(p.id) && !isAfk(p))
    .sort((a, b) => a.id - b.id)
    .slice(0, tgt);
  const winnerIdSet = new Set(winners.map((p) => p.id));

  winners.forEach((p) => setTeam(room, p.id, state.winnerTeam));

  // Limpia cancha dejando solo ganadores reales del último partido.
  teams(room).red.forEach((p) => {
    if (!winnerIdSet.has(p.id)) setTeam(room, p.id, 0);
  });
  teams(room).blue.forEach((p) => {
    if (!winnerIdSet.has(p.id)) setTeam(room, p.id, 0);
  });

  const refresh = teams(room);
  const q = queueSorted(refresh.spec.filter((p) => !isAfk(p) && !winnerIdSet.has(p.id)));
  const challengers = q.slice(0, tgt);
  challengers.forEach((p) => setTeam(room, p.id, loserTeam));
}

function autobalance(room) {
  if (!state.botEnabled) return;
  if (state.replacementNeeded) return;

  const scores = room.getScores();
  const tgt = currentMatchTarget(room);
  if (tgt === 0) {
    getPlayers(room).forEach((p) => setTeam(room, p.id, 0));
    return;
  }

  if (state.forcedTeams && scores === null) {
    const redIds = state.forcedTeams.red.slice(0, tgt);
    const blueIds = state.forcedTeams.blue.slice(0, tgt);
    getPlayers(room).forEach((p) => {
      if (redIds.includes(p.id)) setTeam(room, p.id, 1);
      else if (blueIds.includes(p.id)) setTeam(room, p.id, 2);
      else setTeam(room, p.id, 0);
    });
  }

  if (scores !== null) {
    const t = teams(room);
    if (t.red.length > tgt) t.red.slice(tgt).forEach((p) => setTeam(room, p.id, 0));
    if (t.blue.length > tgt) t.blue.slice(tgt).forEach((p) => setTeam(room, p.id, 0));
    return;
  }

  if (state.winnerTeam !== null) {
    const aliveWinners = getPlayers(room).filter((p) => state.winnerIds.has(p.id)).length;
    if (aliveWinners === 0) {
      state.winnerTeam = null;
      state.winnerIds = new Set();
    } else {
      applyWinnerStays(room, tgt);
    }
  }

  if (state.winnerTeam === null && !state.manualTeams) {
    const t = teams(room);
    const onField = [...t.red, ...t.blue].filter((p) => !isAfk(p));
    const need = Math.max(0, tgt * 2 - onField.length);
    if (need > 0) {
      const q = queueSorted(t.spec.filter((p) => !isAfk(p))).slice(0, need);
      q.forEach((p) => {
        const now = teams(room);
        if (now.red.length < tgt) setTeam(room, p.id, 1);
        else if (now.blue.length < tgt) setTeam(room, p.id, 2);
      });
    }
    const fresh = teams(room);
    if (fresh.red.length > tgt) fresh.red.slice(tgt).forEach((p) => setTeam(room, p.id, 0));
    if (fresh.blue.length > tgt) fresh.blue.slice(tgt).forEach((p) => setTeam(room, p.id, 0));
  }

  fillVacancies(room);
}

function startReplacementDraft(room, teamToFill) {
  state.replacementGraceUntil = Date.now() + SERVER_CONFIG.replacementJoinWindowMs + 5000;
  state.replacementNeeded = {
    teamId: teamToFill,
    candidates: new Set(),
    startedAt: Date.now(),
  };
  room.pauseGame(true);
  ann(room, `⏸️ Falta jugador en ${teamToFill === 1 ? 'ROJO' : 'AZUL'}. Tienes 5s para escribir !postular.`, null, 0xffb347, 'bold', 1);
}

function resolveReplacementDraft(room, forced = false) {
  if (!state.replacementNeeded) return;
  const draft = state.replacementNeeded;
  const t = teams(room);
  const specs = t.spec.filter((p) => !isAfk(p));
  if (specs.length === 0 && !forced) return;

  const pool = specs.filter((p) => draft.candidates.has(p.id));
  const pick = randomPick(pool.length ? pool : specs);
  if (pick) {
    setTeam(room, pick.id, draft.teamId);
    const pp = ensureProfile(pick);
    pp.lastMoveAt = Date.now();
    pp.idleWarned = false;
    pp.idleSafeUntil = Date.now() + 8000;
    ann(room, `🎲 ${pick.name} entra como reemplazo.`, null, 0x90ee90, 'bold', 1);
  } else {
    ann(room, 'No hay candidatos para reemplazo todavía.', null, 0xffb347);
    return;
  }
  state.replacementNeeded = null;
  state.replacementGraceUntil = Date.now() + 5000;
  room.pauseGame(false);
}


function ensureFlow(room) {
  const scores = room.getScores();
  const t = teams(room);
  const tgt = currentMatchTarget(room);

  if (!state.botEnabled) {
    state.flowState = 'paused';
    return;
  }

  if (state.replacementNeeded) {
    if (scores !== null) room.pauseGame(true);
    if (Date.now() - state.replacementNeeded.startedAt > SERVER_CONFIG.replacementJoinWindowMs) resolveReplacementDraft(room, true);
    state.flowState = 'replacement';
    return;
  }

  if (Date.now() < state.restartBlockedUntil) {
    if (scores !== null) return;
    state.flowState = 'cooldown';
    return;
  }

  if (activePlayers(room).length === 0) {
    if (scores !== null) room.stopGame();
    state.flowState = 'empty';
    return;
  }

  const canPlay = tgt >= 1 && t.red.length >= tgt && t.blue.length >= tgt;

  if (canPlay && scores === null) {
    clearRoundVisuals(room);
    room.startGame();
    ann(room, `🤖 Inicia ${tgt}v${tgt} (${mode(room).toUpperCase()}).`, null, 0x90ee90, 'bold', 1);
    state.flowState = 'running';
    return;
  }

  if (!canPlay && scores !== null) {
    if (Date.now() < state.replacementGraceUntil) {
      state.flowState = 'replacement';
      return;
    }
    room.stopGame();
    if (state.flowState !== 'waiting') ann(room, '⏸️ Esperando jugadores para formar equipos.', null, 0xffd580, 'bold');
    state.flowState = 'waiting';
    return;
  }

  if (!canPlay) state.flowState = 'waiting';
}

function resetMatchStats(room) {
  state.lastTouch = null;
  state.secondLastTouch = null;
  state.pendingShot = null;
  freezeCurrentLineup(room);
  getPlayers(room).forEach((pl) => {
    const p = ensureProfile(pl);
    p.match = { goals: 0, assists: 0, ownGoals: 0, saves: 0 };
    p.isInMatch = pl.team !== 0;
    p.lastMoveAt = Date.now();
    p.idleWarned = false;
    p.idleSafeUntil = Date.now() + 8000;
  });
}

function setTouch(player) {
  if (state.lastTouch && state.lastTouch.playerId !== player.id) state.secondLastTouch = state.lastTouch;
  state.lastTouch = { playerId: player.id, team: player.team, at: Date.now() };
}

function getMvp(room) {
  let best = null;
  getPlayers(room).forEach((pl) => {
    if (pl.team === 0) return;
    const p = ensureProfile(pl);
    const score = p.match.goals * 3 + p.match.assists * 2 + p.match.saves * 2 - p.match.ownGoals * 2;
    if (!best || score > best.score) best = { player: pl, score };
  });
  return best && best.score > 0 ? best.player : null;
}

function formatTag(player) {
  const p = ensureProfile(player);
  const rank = getRankByElo(p.elo);
  const emblem = p.equipped.emblem ? `${p.equipped.emblem} ` : '';
  const adminPrefix = isAdmin(player) ? '👑 ' : '';
  return `${adminPrefix}[${rank.dot}] ${emblem}[${p.elo}] ${player.name}`;
}

function chatColorFor(player) {
  const p = ensureProfile(player);
  if (isAdmin(player)) return 0xff66cc;
  return p.equipped.chatColor || getRankByElo(p.elo).color;
}

function listTop(n) {
  return Array.from(state.players.values()).sort((a, b) => b.elo - a.elo).slice(0, n);
}

function shopItem(id) {
  return SHOP_ITEMS.find((x) => x.id === id) || null;
}

function sendHelp(room, player, section) {
  const key = String(section || 'general').toLowerCase();
  const lines = HELP[key];
  if (!lines) {
    ann(room, `Sección inválida. Opciones: ${Object.keys(HELP).join(', ')}`, player.id, 0xffb347);
    return;
  }
  lines.forEach((l) => ann(room, l, player.id, 0x87ceeb));
}

function beginVotekick(room, starter, target, reason) {
  const s = ensureProfile(starter);
  if (Date.now() < s.votekickCooldownUntil) {
    const sec = Math.ceil((s.votekickCooldownUntil - Date.now()) / 1000);
    ann(room, `Debes esperar ${sec}s para otro votekick.`, starter.id, 0xffb347);
    return;
  }

  state.vote = {
    targetId: target.id,
    targetName: target.name,
    starterId: starter.id,
    reason,
    yes: new Set([starter.id]),
    no: new Set(),
    expiresAt: Date.now() + SERVER_CONFIG.votekickDurationMs,
  };

  s.votekickCooldownUntil = Date.now() + SERVER_CONFIG.votekickCooldownMs;
  markDirty();

  ann(room, `⚖️ Votekick contra ${target.name}: ${reason}`, null, 0xffc107, 'bold', 1);
  ann(room, 'Escribe !yes o !no (30s).', null, 0xffc107);
}

function finalizeVote(room) {
  if (!state.vote) return;
  const v = state.vote;
  const online = getPlayers(room).filter((p) => p.id !== v.targetId);
  const needed = Math.max(2, Math.ceil(online.length * 0.5));

  if (v.yes.size >= needed) {
    room.kickPlayer(v.targetId, `Votekick aprobado: ${v.reason}`, false);
    ann(room, `✅ Votekick aprobado (${v.yes.size}/${needed}).`, null, 0x90ee90, 'bold');
  } else {
    ann(room, `❌ Votekick rechazado (${v.yes.size}/${needed}).`, null, 0xff7f7f, 'bold');
  }
  state.vote = null;
}

function normalizeTeamArg(arg) {
  const x = String(arg || '').toLowerCase();
  if (x === 'red' || x === 'r' || x === '1') return 1;
  if (x === 'blue' || x === 'b' || x === '2') return 2;
  if (x === 'spec' || x === 's' || x === '0') return 0;
  return null;
}

function startTips(room) {
  setInterval(() => {
    const txt = TIPS[state.tipIndex % TIPS.length];
    state.tipIndex += 1;
    ann(room, txt, null, 0x87cefa);
  }, SERVER_CONFIG.tipsEveryMs);
}

function applyQuitPenalty(room, player) {
  const p = ensureProfile(player);
  if (!p.isInMatch) return;
  if (SERVER_CONFIG.quitPenaltyCompetitiveOnly && mode(room) !== 'competitivo') return;
  addElo(player, SERVER_CONFIG.quitPenaltyElo, 'Abandono de partida', room);
  p.isInMatch = false;
}

function setTemporaryAvatar(room, playerId, icon, ms) {
  const p = room.getPlayer(playerId);
  if (!p) return;
  room.setPlayerAvatar(playerId, icon);
  state.tempAvatarUntil.set(playerId, Date.now() + ms);
}

function cleanupTemporaryAvatars(room) {
  const now = Date.now();
  for (const [id, until] of state.tempAvatarUntil.entries()) {
    if (now >= until) {
      const stillWinner = state.crownedWinners.has(id);
      room.setPlayerAvatar(id, stillWinner ? '👑' : null);
      state.tempAvatarUntil.delete(id);
    }
  }
}

function trackIdlePlayers(room) {
  if (!state.botEnabled) return;
  if (state.replacementNeeded) return;
  const scores = room.getScores();
  if (!scores) return;

  const now = Date.now();
  getPlayers(room).forEach((pl) => {
    if (pl.team === 0) return;
    const pp = ensureProfile(pl);
    let moved = false;
    try {
      const d = room.getPlayerDiscProperties(pl.id);
      if (d && (Math.abs(d.xspeed || 0) > 0.01 || Math.abs(d.yspeed || 0) > 0.01)) moved = true;
    } catch (_) {
      return;
    }

    if (moved) {
      pp.lastMoveAt = now;
      pp.idleWarned = false;
      return;
    }

    if (now < pp.idleSafeUntil) return;
    const idleMs = now - pp.lastMoveAt;
    if (!pp.idleWarned && idleMs >= SERVER_CONFIG.idleWarnSeconds * 1000) {
      pp.idleWarned = true;
      ann(room, `⚠️ ${pl.name}, muévete o pasarás a spec por AFK.`, pl.id, 0xffb347, 'bold', 1);
    }
    if (idleMs >= SERVER_CONFIG.idleKickSeconds * 1000) {
      setTeam(room, pl.id, 0);
      pp.isInMatch = false;
      pp.idleWarned = false;
      ann(room, `🛌 ${pl.name} fue enviado a spec por inactividad.`, null, 0xff7f7f, 'bold', 1);
    }
  });
}

function detectSave(room, player) {
  if (!state.pendingShot) return;
  const shot = state.pendingShot;
  const now = Date.now();
  if (now - shot.at > 2500) {
    state.pendingShot = null;
    return;
  }
  if (player.team === shot.team) return;

  let nearOwnGoal = false;
  try {
    const d = room.getPlayerDiscProperties(player.id);
    if (d) nearOwnGoal = player.team === 1 ? d.x < -250 : d.x > 250;
  } catch (_) {
    nearOwnGoal = true;
  }

  if (!nearOwnGoal) return;

  const p = ensureProfile(player);
  p.saves += 1;
  p.match.saves += 1;
  markDirty();
  ann(room, `${randomPick(SAVE_COMPLIMENTS)}: ${player.name}`, null, 0x87cefa, 'bold', 1);
  setTemporaryAvatar(room, player.id, '🧤', 3000);
  state.pendingShot = null;
}

function scoreboardCommand(room, player) {
  const t = teams(room);
  ann(room, `🔴 ${t.red.map((x) => x.name).join(', ') || '—'}`, player.id, 0xff8f8f);
  ann(room, `🔵 ${t.blue.map((x) => x.name).join(', ') || '—'}`, player.id, 0x8fc7ff);
  ann(room, `👀 Spec: ${t.spec.map((x) => x.name).join(', ') || '—'}`, player.id, 0xd3d3d3);
}

function bootstrapRoom() {
  if (typeof HBInit !== 'function') throw new Error('HBInit no existe: ejecuta dentro de headless host.');

  loadData();

  const room = HBInit(ROOM_CONFIG);

  if (STADIUMS.bazinga3v3 && STADIUMS.bazinga3v3.trim()) {
    try { room.setCustomStadium(STADIUMS.bazinga3v3); } catch (_) { room.setDefaultStadium(STADIUMS.default); }
  } else {
    room.setDefaultStadium(STADIUMS.default);
  }

  room.setScoreLimit(SERVER_CONFIG.scoreLimit);
  room.setTimeLimit(SERVER_CONFIG.timeLimit);
  room.setTeamsLock(false);

  room.setTeamColors(1, 0, 0xffffff, [0x111111, 0x2a2a2a, 0x000000]);
  room.setTeamColors(2, 0, 0x000000, [0xffffff, 0xf0f0f0, 0xd9d9d9]);

  room.onGameStart = () => {
    state.matchEnding = false;
    resetMatchStats(room);
  };

  room.onPlayerJoin = (player) => {
    const p = ensureProfile(player);
    p.joins += 1;
    p.lastMoveAt = Date.now();
    p.idleWarned = false;
    p.idleSafeUntil = Date.now() + 8000;
    markDirty();

    const list = getPlayers(room);
    if (list.length === 1) {
      room.setPlayerAdmin(player.id, true);
      ann(room, '✅ Admin automático al primer jugador.', player.id, 0x00ff88, 'bold');
    }

    ann(room, `👋 ${player.name} entró (ID ${player.id}).`, null, 0x9ec6ff);
    ann(room, `🆔 Tu ID: ${player.id}. Usa !menu para guía rápida`, player.id, 0x87ceeb);
    ann(room, '💡 Recomendación: usa !afk si te ausentas y !back al volver.', player.id, 0x87cefa);

    if (state.crownedWinners.has(player.id)) room.setPlayerAvatar(player.id, '👑');
    if (state.botEnabled) {
      autobalance(room);
      ensureFlow(room);
    }
  };

  room.onPlayerLeave = (player) => {
    applyQuitPenalty(room, player);
    ann(room, `🚪 ${player.name} salió.`, null, 0x9ec6ff);

    if (state.vote && state.vote.targetId === player.id) state.vote = null;
    state.teamPreferences.delete(player.id);

    const list = getPlayers(room);
    if (list.length > 0 && !list.some((p) => p.admin)) room.setPlayerAdmin(list[0].id, true);

    const scores = room.getScores();
    if (scores !== null && !state.replacementNeeded && !state.matchEnding && !isMatchCloseToFinish(room)) {
      const t = teams(room);
      const tgt = currentMatchTarget(room);
      const hasSpec = teams(room).spec.some((x) => !isAfk(x));
      if (hasSpec) {
        if (t.red.length < tgt) startReplacementDraft(room, 1);
        else if (t.blue.length < tgt) startReplacementDraft(room, 2);
      }
    }

    markDirty();    if (state.botEnabled) {
      autobalance(room);
      ensureFlow(room);
    }
  };

  room.onPlayerTeamChange = (changed, byPlayer) => {
    const tgt = currentMatchTarget(room);
    const t = teams(room);

    if (changed && changed.team === 1 && t.red.length > tgt && tgt > 0) {
      setTeam(room, changed.id, 0);
      ann(room, 'Equipo rojo completo.', changed.id, 0xffb347);
    }
    if (changed && changed.team === 2 && t.blue.length > tgt && tgt > 0) {
      setTeam(room, changed.id, 0);
      ann(room, 'Equipo azul completo.', changed.id, 0xffb347);
    }

    if (changed && changed.team !== 0) {
      const cp = ensureProfile(changed);
      cp.lastMoveAt = Date.now();
      cp.idleWarned = false;
      cp.idleSafeUntil = Date.now() + 7000;
    }

    if (state.botEnabled) {
      if (byPlayer && !isAdmin(byPlayer)) {
        fillVacancies(room);
      }
      ensureFlow(room);
    }
  };

  room.onPlayerBallKick = (player) => {
    setTouch(player);
    const p = ensureProfile(player);
    p.lastMoveAt = Date.now();
    p.idleWarned = false;
    p.idleSafeUntil = Date.now() + 8000;

    detectSave(room, player);

    if (SERVER_CONFIG.announceKickEffects && p.equipped.kickEffect) ann(room, `${p.equipped.kickEffect} ${player.name} pateó`, null, 0xffe4b5);

    if (player.team !== 0) {
      state.pendingShot = { team: player.team, playerId: player.id, at: Date.now() };
    }
  };

  room.onTeamGoal = (team) => {
    const now = Date.now();
    let scorer = null;
    let assist = null;

    if (state.lastTouch && state.lastTouch.team === team && now - state.lastTouch.at < 10000) scorer = getPlayerById(room, state.lastTouch.playerId);
    if (scorer && state.secondLastTouch && state.secondLastTouch.playerId !== scorer.id && state.secondLastTouch.team === team && now - state.secondLastTouch.at < 15000) {
      assist = getPlayerById(room, state.secondLastTouch.playerId);
    }

    if (scorer) {
      const p = ensureProfile(scorer);
      p.goals += 1;
      p.match.goals += 1;
      p.lastMoveAt = Date.now();
      markDirty();
      evaluateMissions(scorer, room);
      ann(room, `${randomPick(GOAL_CELEBRATIONS)} de ${scorer.name}`, null, 0xffcc66, 'bold', 1);
      setTemporaryAvatar(room, scorer.id, '⚽', 3000);
    }

    if (assist) {
      const p = ensureProfile(assist);
      p.assists += 1;
      p.match.assists += 1;
      p.lastMoveAt = Date.now();
      markDirty();
      evaluateMissions(assist, room);
      ann(room, `🅰️ Asistencia de ${assist.name}`, null, 0x98fb98);
      setTemporaryAvatar(room, assist.id, '👟', 3000);
    }

    state.pendingShot = null;

    if (isMatchCloseToFinish(room)) {
      state.matchEnding = true;
    }
  };

  room.onPlayerOwnGoal = (player) => {
    const p = ensureProfile(player);
    p.ownGoals += 1;
    p.match.ownGoals += 1;
    markDirty();
    ann(room, `😬 Autogol de ${player.name}`, null, 0xff7f7f);
  };

  room.onTeamVictory = (score) => {
    state.matchEnding = true;
    const currentMode = mode(room);
    const winner = score.red > score.blue ? 1 : 2;

    const prevStreakIds = new Set(state.streakHolderIds);
    const prevStreakCount = state.streakCount;
    const winnerPlayers = getPlayers(room).filter((pl) => pl.team === winner);
    const winnerIdSet = new Set(winnerPlayers.map((pl) => pl.id));

    const sameStreakTeam = prevStreakIds.size > 0 && winnerPlayers.some((pl) => prevStreakIds.has(pl.id));
    const brokeStreak = prevStreakCount >= 2 && !sameStreakTeam;
    const streakBonusPct = getStreakBreakBonusPct(prevStreakCount);
    const streakBonusElo = Math.round(ELO_CONFIG.win * streakBonusPct);

    state.winnerTeam = winner;
    state.winnerIds = winnerIdSet;

    if (sameStreakTeam) {
      state.streakCount += 1;
      state.streakHolderIds = winnerIdSet;
    } else {
      state.streakCount = 1;
      state.streakHolderIds = winnerIdSet;
    }

    getPlayers(room).forEach((pl) => {
      if (pl.team === 0) return;
      const p = ensureProfile(pl);
      p.matches += 1;
      p.isInMatch = false;

      addCoins(pl, SERVER_CONFIG.matchCoinReward, 'Participación', room);

      if (pl.team === winner) {
        p.wins += 1;
        addCoins(pl, SERVER_CONFIG.winCoinReward, 'Victoria', room);
        state.crownedWinners.add(pl.id);
        room.setPlayerAvatar(pl.id, '👑');
        if (currentMode === 'competitivo') {
          addElo(pl, ELO_CONFIG.win, 'Victoria competitiva', room);
          if (brokeStreak && streakBonusElo > 0) {
            addElo(pl, streakBonusElo, `Bajar racha x${prevStreakCount} (+${Math.round(streakBonusPct * 100)}%)`, room);
          }
        }
      } else {
        p.losses += 1;
        if (currentMode === 'competitivo') addElo(pl, ELO_CONFIG.loss, 'Derrota competitiva', room);
      }

      markDirty();
      evaluateMissions(pl, room);
    });

    const mvp = getMvp(room);
    if (mvp) {
      const p = ensureProfile(mvp);
      p.mvps += 1;
      markDirty();
      addCoins(mvp, SERVER_CONFIG.mvpCoinReward, 'MVP', room);
      if (currentMode === 'competitivo') addElo(mvp, ELO_CONFIG.mvpBonus, 'MVP competitivo', room);
      ann(room, `⭐ MVP: ${mvp.name}`, null, 0xffd700, 'bold', 2);
    }

    if (state.streakCount >= 2) {
      ann(room, `🔥 Racha activa: x${state.streakCount}`, null, 0xffa500, 'bold');
    }
    if (brokeStreak && streakBonusElo > 0) {
      ann(room, `💣 Racha rota (x${prevStreakCount}). Ganadores recibieron +${streakBonusElo} ELO extra.`, null, 0x90ee90, 'bold', 1);
    }

    ann(room, `🏁 Final ${score.red}-${score.blue} | ${currentMode.toUpperCase()} | Gana sigue`, null, 0xffffff, 'bold', 1);

    state.restartBlockedUntil = Date.now() + SERVER_CONFIG.restartDelayMs;
    state.manualTeams = false;

    saveData(true);
    autobalance(room);
    ensureFlow(room);
  };

  room.onPlayerChat = (player, message) => {
    if (state.mutedIds.has(player.id)) {
      ann(room, '🔇 Estás muteado.', player.id, 0xff4d4d, 'bold', 2);
      return false;
    }

    const p = ensureProfile(player);

    if (!message.startsWith('!')) {
      ann(room, `${formatTag(player)}: ${message}`, null, chatColorFor(player));
      return false;
    }

    const [cmd, ...args] = message.trim().split(/\s+/);

    switch (cmd.toLowerCase()) {
      case '!help':
      case '!comandos':
        sendHelp(room, player, args[0] || 'general');
        break;

      case '!id':
        ann(room, `🆔 Tu ID es ${player.id}`, player.id, 0x87ceeb, 'bold');
        break;
      case '!menu':
        [
          '📌 Guía rápida del server:',
          '1) !pickteam <red|blue|auto> para preferencia de equipo.',
          '2) !afk / !back para disponibilidad.',
          '3) !stats / !rank / !top para progreso.',
          '4) !postular cuando haya reemplazo (5s).',
          '5) !help admin para comandos de moderación.'
        ].forEach((line) => ann(room, line, player.id, 0x87ceeb));
        break;

      case '!reco':
        ann(room, randomPick(TIPS), player.id, 0x87cefa);
        break;


      case '!mode':
        ann(room, `🎮 Modo: ${mode(room).toUpperCase()} | Bot: ${state.botEnabled ? 'ON' : 'OFF'}`, player.id, 0x87ceeb, 'bold');
        break;

      case '!players': {
        const txt = getPlayers(room).map((pl) => `${pl.id}:${pl.name}${isAfk(pl) ? '(AFK)' : ''}`).join(' | ') || 'Sin jugadores';
        ann(room, txt, player.id, 0x87ceeb);
        break;
      }

      case '!online':
        ann(room, `👥 Online: ${getPlayers(room).length}/${ROOM_CONFIG.maxPlayers}`, player.id, 0x87ceeb);
        break;

      case '!queue': {
        const t = teams(room);
        ann(room, `⌛ Cola: ${t.spec.filter((x) => !isAfk(x)).map((x) => `${x.id}:${x.name}`).join(' | ') || 'vacía'}`, player.id, 0x87ceeb);
        break;
      }

      case '!next':
        ann(room, `⏭️ Próxima partida en ${Math.max(0, Math.ceil((state.restartBlockedUntil - Date.now()) / 1000))}s aprox.`, player.id, 0x87ceeb);
        break;

      case '!capitanes': {
        const top = listTop(2);
        ann(room, `🎖️ Capitanes sugeridos: ${top.map((x) => `${x.name}(${x.elo})`).join(' y ') || 'N/A'}`, player.id, 0xffd700);
        break;
      }

      case '!reglas':
        ann(room, '📜 Reglas: respeto, no toxicidad, no abandonar en competitivo.', player.id, 0xdddddd);
        break;

      case '!mapa':
        ann(room, `🗺️ Mapa activo: ${STADIUMS.bazinga3v3 ? 'Custom (Bazinga/Personalizado)' : STADIUMS.default}`, player.id, 0xdddddd);
        break;

      case '!stats': {
        const target = args[0] ? getPlayerById(room, Number(args[0])) : player;
        if (!target) { ann(room, 'Uso: !stats [id]', player.id, 0xffb347); break; }
        const tp = ensureProfile(target);
        const tr = getRankByElo(tp.elo);
        [
          `📊 ${target.name} (ID ${target.id})`,
          `• ELO: ${tp.elo} (${tr.name})`,
          `• W/L: ${tp.wins}/${tp.losses}`,
          `• Goles: ${tp.goals}`,
          `• Asistencias: ${tp.assists}`,
          `• Autogoles: ${tp.ownGoals}`,
          `• Atajadas: ${tp.saves}`,
          `• MVPs: ${tp.mvps}`,
          `• Monedas: ${tp.coins}`,
        ].forEach((line) => ann(room, line, player.id, 0x98fb98));
        break;
      }

      case '!rank': {
        const r = getRankByElo(p.elo);
        ann(room, `🏅 ${r.name} | ELO ${p.elo}`, player.id, r.color, 'bold');
        break;
      }

      case '!top': {
        const n = Number(args[0] || SERVER_CONFIG.topDefault);
        const limit = Number.isInteger(n) && n > 0 ? Math.min(10, n) : SERVER_CONFIG.topDefault;
        ann(room, `🏆 Top ${limit}`, player.id, 0xffd700, 'bold');
        listTop(limit).forEach((u, i) => ann(room, `${i + 1}. ${u.name} | ELO ${u.elo} | W/L ${u.wins}/${u.losses}`, player.id, 0xeee8aa));
        break;
      }

      case '!coins':
        ann(room, `🪙 Tienes ${p.coins} monedas.`, player.id, 0xffd700, 'bold');
        break;

      case '!shop':
        ann(room, '🛒 Tienda:', player.id, 0xffd700, 'bold');
        SHOP_ITEMS.forEach((it) => ann(room, `- ${it.id}: ${it.name} (${it.price})`, player.id, 0xeee8aa));
        break;

      case '!inventory': {
        const items = Array.from(p.inventory);
        ann(room, `🎒 Inventario: ${items.length ? items.join(', ') : 'vacío'}`, player.id, 0x87ceeb);
        break;
      }

      case '!buy': {
        const it = shopItem(args[0]);
        if (!it) { ann(room, 'Item no existe. Usa !shop', player.id, 0xffb347); break; }
        if (p.inventory.has(it.id)) { ann(room, 'Ya tienes ese item.', player.id, 0xffb347); break; }
        if (p.coins < it.price) { ann(room, 'No tienes monedas suficientes.', player.id, 0xff4d4d); break; }
        p.coins -= it.price;
        p.inventory.add(it.id);
        markDirty();
        ann(room, `✅ Compraste ${it.name}.`, player.id, 0x90ee90);
        break;
      }

      case '!equip': {
        const it = shopItem(args[0]);
        if (!it || !p.inventory.has(it.id)) { ann(room, 'No tienes ese item.', player.id, 0xffb347); break; }
        p.equipped[it.type] = it.value;
        markDirty();
        ann(room, `🎨 Equipado: ${it.name}`, player.id, 0x90ee90);
        break;
      }

      case '!misiones':
        ann(room, '🎯 Misiones:', player.id, 0x87cefa, 'bold');
        MISSIONS.forEach((m) => {
          const done = p.missionDone.has(m.id);
          ann(room, `${done ? '✅' : '⬜'} ${m.name}: ${(p[m.stat] || 0)}/${m.target} (+${m.rewardCoins})`, player.id, done ? 0x90ee90 : 0xdddddd);
        });
        break;

      case '!pickteam': {
        const arg = String(args[0] || '').toLowerCase();
        if (!arg || !['red', 'blue', 'auto'].includes(arg)) {
          ann(room, 'Uso: !pickteam <red|blue|auto>', player.id, 0xffb347);
          break;
        }
        if (arg === 'auto') {
          state.teamPreferences.delete(player.id);
          ann(room, '✅ Preferencia de equipo removida (AUTO).', player.id, 0x90ee90);
        } else {
          state.teamPreferences.set(player.id, arg === 'red' ? 1 : 2);
          ann(room, `✅ Preferencia guardada: ${arg.toUpperCase()}.`, player.id, 0x90ee90);
        }
        break;
      }

      case '!afk':
        state.afk.add(keyOf(player));
        setTeam(room, player.id, 0);
        ann(room, `🛌 ${player.name} quedó AFK.`, null, 0xb0c4de);
        autobalance(room);
        ensureFlow(room);
        break;

      case '!back':
        state.afk.delete(keyOf(player));
        ensureProfile(player).lastMoveAt = Date.now();
        ann(room, `✅ ${player.name} volvió (BACK).`, null, 0x90ee90);
        autobalance(room);
        ensureFlow(room);
        break;

      case '!postular': {
        if (!state.replacementNeeded) { ann(room, 'No hay reemplazo abierto.', player.id, 0xffb347); break; }
        if (player.team !== 0) { ann(room, 'Debes estar en spec para postular.', player.id, 0xffb347); break; }
        state.replacementNeeded.candidates.add(player.id);
        ann(room, `✅ ${player.name} se postuló al reemplazo.`, null, 0x90ee90);
        break;
      }

      case '!forcereplace':
        if (!isAdmin(player)) { ann(room, 'Solo admins.', player.id, 0xff4d4d); break; }
        resolveReplacementDraft(room, true);
        break;

      case '!scoreboard':
        scoreboardCommand(room, player);
        break;

      case '!votekick': {
        const target = getPlayerById(room, Number(args[0]));
        const reason = args.slice(1).join(' ') || 'Sin motivo';
        if (!target || target.id === player.id) { ann(room, 'Uso: !votekick <id> <motivo>', player.id, 0xffb347); break; }
        if (state.vote) { ann(room, 'Ya hay un votekick activo.', player.id, 0xffb347); break; }
        beginVotekick(room, player, target, reason);
        break;
      }

      case '!yes':
      case '!no': {
        if (!state.vote) { ann(room, 'No hay votekick activo.', player.id, 0xffb347); break; }
        state.vote.yes.delete(player.id);
        state.vote.no.delete(player.id);
        if (cmd.toLowerCase() === '!yes') state.vote.yes.add(player.id);
        else state.vote.no.add(player.id);
        ann(room, `🗳️ ${player.name} votó ${cmd.toLowerCase() === '!yes' ? 'SÍ' : 'NO'}.`, null, 0xffc107);
        break;
      }

      case '!pausebot':
      case '!botoff':
        if (!isAdmin(player)) { ann(room, 'Solo admins.', player.id, 0xff4d4d); break; }
        state.botEnabled = false;
        state.manualTeams = false;
        room.stopGame();
        ann(room, '🛑 Bot pausado. No iniciará partidos.', null, 0xff7f7f, 'bold');
        break;

      case '!resumebot':
      case '!boton':
        if (!isAdmin(player)) { ann(room, 'Solo admins.', player.id, 0xff4d4d); break; }
        state.botEnabled = true;
        state.manualTeams = false;
        ann(room, '✅ Bot reanudado.', null, 0x90ee90, 'bold');
        autobalance(room);
        ensureFlow(room);
        break;

      case '!admin':
        if ((args[0] || '') === SERVER_CONFIG.adminPassword) {
          room.setPlayerAdmin(player.id, true);
          ann(room, '🛡️ Admin concedido.', player.id, 0x00ff88, 'bold');
        } else {
          ann(room, '❌ Clave incorrecta.', player.id, 0xff4d4d, 'bold');
        }
        break;

      case '!move': {
        if (!isAdmin(player)) { ann(room, 'Solo admins.', player.id, 0xff4d4d); break; }
        const target = getPlayerById(room, Number(args[0]));
        const team = normalizeTeamArg(args[1]);
        if (!target || team === null) { ann(room, 'Uso: !move <id> <red|blue|spec>', player.id, 0xffb347); break; }
        state.manualTeams = true;
        setTeam(room, target.id, team);
        ensureFlow(room);
        ann(room, `↔️ ${target.name} movido por admin.`, null, 0x90ee90);
        break;
      }

      case '!red':
      case '!blue':
      case '!spec': {
        if (!isAdmin(player)) { ann(room, 'Solo admins.', player.id, 0xff4d4d); break; }
        const target = getPlayerById(room, Number(args[0]));
        if (!target) { ann(room, `Uso: ${cmd} <id>`, player.id, 0xffb347); break; }
        const team = cmd === '!red' ? 1 : cmd === '!blue' ? 2 : 0;
        state.manualTeams = true;
        setTeam(room, target.id, team);
        ensureFlow(room);
        break;
      }

      case '!setteams': {
        if (!isAdmin(player)) { ann(room, 'Solo admins.', player.id, 0xff4d4d); break; }
        const raw = args.join(' ');
        const parts = raw.split(':');
        if (parts.length !== 2) { ann(room, 'Uso: !setteams id,id,id:id,id,id', player.id, 0xffb347); break; }
        const red = parts[0].split(',').map((x) => Number(x.trim())).filter(Number.isInteger);
        const blue = parts[1].split(',').map((x) => Number(x.trim())).filter(Number.isInteger);
        state.forcedTeams = { red, blue };
        state.winnerTeam = null;
        state.winnerIds = new Set();
        state.manualTeams = true;
        ann(room, '🧩 Teams forzados guardados.', null, 0x90ee90);
        autobalance(room);
        ensureFlow(room);
        break;
      }

      case '!setscore':
        if (!isAdmin(player)) { ann(room, 'Solo admins.', player.id, 0xff4d4d); break; }
        room.setScoreLimit(Math.max(0, Math.min(99, Number(args[0]) || SERVER_CONFIG.scoreLimit)));
        ann(room, '🎯 Score actualizado.', null, 0x90ee90);
        break;

      case '!settime':
        if (!isAdmin(player)) { ann(room, 'Solo admins.', player.id, 0xff4d4d); break; }
        room.setTimeLimit(Math.max(0, Math.min(99, Number(args[0]) || SERVER_CONFIG.timeLimit)));
        ann(room, '⏱️ Tiempo actualizado.', null, 0x90ee90);
        break;

      case '!rr':
        if (!isAdmin(player)) { ann(room, 'Solo admins.', player.id, 0xff4d4d); break; }
        room.stopGame();
        state.restartBlockedUntil = 0;
        state.replacementNeeded = null;
        state.winnerTeam = null;
        state.winnerIds = new Set();
        state.matchEnding = false;
        state.manualTeams = false;
        autobalance(room);
        ensureFlow(room);
        ann(room, `♻️ Reinicio por ${player.name}`, null, 0xffe4b5);
        break;

      case '!warn': {
        if (!isAdmin(player)) { ann(room, 'Solo admins.', player.id, 0xff4d4d); break; }
        const target = getPlayerById(room, Number(args[0]));
        if (!target) { ann(room, 'Uso: !warn <id> <motivo>', player.id, 0xffb347); break; }
        const reason = args.slice(1).join(' ') || 'Sin motivo';
        const arr = ensureWarnings(keyOf(target));
        arr.push({ reason, by: player.name, at: Date.now() });
        ann(room, `⚠️ ${target.name} advertido: ${reason}`, null, 0xffc107, 'bold');
        if (arr.length >= SERVER_CONFIG.warnAutoMuteCount) {
          state.mutedIds.add(target.id);
          ann(room, `🔇 ${target.name} fue muteado por exceso de advertencias.`, null, 0xff7f7f, 'bold');
        }
        break;
      }

      case '!unmute': {
        if (!isAdmin(player)) { ann(room, 'Solo admins.', player.id, 0xff4d4d); break; }
        const target = getPlayerById(room, Number(args[0]));
        if (!target) { ann(room, 'Uso: !unmute <id>', player.id, 0xffb347); break; }
        state.mutedIds.delete(target.id);
        ann(room, `🔊 ${target.name} desmuteado.`, null, 0x90ee90);
        break;
      }

      default:
        ann(room, 'Comando no reconocido. Usa !help', player.id, 0xffb347);
    }

    return false;
  };

  setInterval(() => {
    if (!state.botEnabled) return;
    if (state.vote && Date.now() >= state.vote.expiresAt) finalizeVote(room);
    if (room.getScores() === null && Date.now() > state.replacementGraceUntil) state.replacementGraceUntil = 0;
    autobalance(room);
    ensureFlow(room);
    saveData(false);
  }, SERVER_CONFIG.checkLoopMs);

  setInterval(() => {
    if (!state.botEnabled) return;
    trackIdlePlayers(room);
  }, SERVER_CONFIG.idleCheckMs);

  setInterval(() => {
    cleanupTemporaryAvatars(room);
  }, SERVER_CONFIG.avatarCleanupMs);

  setInterval(() => saveData(true), SERVER_CONFIG.saveEveryMs);

  startTips(room);
  console.log('✅ BOT Haxball PRO cargado. Persistencia activa en', FS_AVAILABLE ? DATA_FILE : 'localStorage');
  return room;
}

bootstrapRoom();
