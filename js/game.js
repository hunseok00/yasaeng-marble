// ── 주루마블 메인 게임 로직 ──────────────────────────────
import {
  PACKS, PENALTIES, CHANCE_CARDS, ALL_EVENTS, SURPRISE_EVENTS,
  CELL_TYPES, BOARD, CORNERS, PLAYER_COLORS,
  TEAM_MISSIONS, PENALTIES_TEAM,
} from './data.js';
import { audio } from './audio.js';
import { Roulette } from './roulette.js';

const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const SURPRISE_RATE = 0.05; // 서프라이즈 이벤트 발동 확률
const HOST_WEIGHT = 0.35;   // 지목 룰렛의 진행자 조각 가중치 (참가자=1 대비 → 낮은 확률)

// ── 상태 ──────────────────────────────
const state = {
  players: [],        // {name, color, pos, laps, hits, maxStreak, streak, immunity} — 팀전에서는 1항목 = 1팀
  mode: 'solo',       // 'solo' 개인전 | 'team' 팀전
  packId: 'basic',
  intensity: 2,       // 1 순한맛 / 2 보통 / 3 매운맛
  end: { type: 'laps', value: 2 },
  turn: 0,
  turnCount: 0,
  pot: 0,             // 🍶 공용 벌주잔: 채워진 횟수 (💣 칸에서 원샷)
  startTime: 0,
  log: [],
  playing: false,
  busy: false,
};

// ══════════════════════════════════════
// 1. 시작 설정 화면
// ══════════════════════════════════════
const MODES = [
  { v: 'solo', label: '🙋 개인전', desc: '각자 말을 놓고 진행' },
  { v: 'team', label: '👥 팀전', desc: '팀 단위 말·미션으로 진행' },
];

const INTENSITIES = [
  { v: 1, label: '😇 순한맛', desc: '벌주 = 한 모금 (무알콜 OK)' },
  { v: 2, label: '😀 보통', desc: '벌주 = 반 잔' },
  { v: 3, label: '🌶️ 매운맛', desc: '벌주 = 원샷' },
];
const END_OPTIONS = [
  { type: 'laps', value: 1, label: '🔁 1바퀴', desc: '가볍게 한 판' },
  { type: 'laps', value: 2, label: '🔁 2바퀴', desc: '표준 플레이' },
  { type: 'time', value: 30, label: '⏰ 30분', desc: '시간제 진행' },
  { type: 'time', value: 60, label: '⏰ 60분', desc: '길게 즐기기' },
];

function renderSetup() {
  const isTeam = state.mode === 'team';

  // 진행 방식 (개인전/팀전)
  const modeList = $('#mode-list');
  modeList.innerHTML = '';
  MODES.forEach((m) => {
    const btn = document.createElement('button');
    btn.className = 'option' + (state.mode === m.v ? ' selected' : '');
    btn.innerHTML = `${m.label}<small>${m.desc}</small>`;
    btn.onclick = () => { audio.click(); state.mode = m.v; renderSetup(); };
    modeList.appendChild(btn);
  });

  // 팀전 여부에 따라 참가자 입력 문구 전환
  $('#player-heading').firstChild.textContent = isTeam ? '2️⃣ 팀 ' : '2️⃣ 참가자 ';
  $('#player-name').placeholder = isTeam ? '팀 이름 입력 후 Enter' : '이름 입력 후 Enter';
  $('#player-hint').textContent = isTeam ? '최소 2팀 · 최대 8팀 (예: 1조, 흑마팀…)' : '최소 2명 · 최대 8명';

  // 미션팩 — 팀전은 전용 팀 미션팩 자동 적용
  const packList = $('#pack-list');
  packList.innerHTML = '';
  if (isTeam) {
    const note = document.createElement('div');
    note.className = 'option selected';
    note.innerHTML = `👥 팀 미션팩<small>팀 대결·단체 수행 미션 ${TEAM_MISSIONS.length}개가 자동 적용됩니다</small>`;
    packList.appendChild(note);
  } else {
    Object.entries(PACKS).forEach(([id, pack]) => {
      const btn = document.createElement('button');
      btn.className = 'option' + (state.packId === id ? ' selected' : '');
      btn.innerHTML = `${pack.emoji} ${pack.name}<small>${pack.desc} · 미션 ${pack.missions.length}개</small>`;
      btn.onclick = () => { audio.click(); state.packId = id; renderSetup(); };
      packList.appendChild(btn);
    });
  }

  // 강도
  const intList = $('#intensity-list');
  intList.className = 'options inline';
  intList.innerHTML = '';
  INTENSITIES.forEach((it) => {
    const btn = document.createElement('button');
    btn.className = 'option' + (state.intensity === it.v ? ' selected' : '');
    btn.innerHTML = `${it.label}<small>${it.desc}</small>`;
    btn.onclick = () => { audio.click(); state.intensity = it.v; renderSetup(); };
    intList.appendChild(btn);
  });

  // 종료 조건
  const endList = $('#end-list');
  endList.className = 'options inline';
  endList.innerHTML = '';
  END_OPTIONS.forEach((opt) => {
    const sel = state.end.type === opt.type && state.end.value === opt.value;
    const btn = document.createElement('button');
    btn.className = 'option' + (sel ? ' selected' : '');
    btn.innerHTML = `${opt.label}<small>${opt.desc}</small>`;
    btn.onclick = () => { audio.click(); state.end = { type: opt.type, value: opt.value }; renderSetup(); };
    endList.appendChild(btn);
  });

  renderChips();
}

function renderChips() {
  const chips = $('#player-chips');
  chips.innerHTML = '';
  state.players.forEach((p, i) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.style.borderColor = p.color;
    chip.style.color = p.color;
    chip.innerHTML = `${p.name} <span class="x">✕</span>`;
    chip.title = '클릭하면 제거';
    chip.onclick = () => { state.players.splice(i, 1); renderChips(); };
    chips.appendChild(chip);
  });
  const unit = state.mode === 'team' ? '팀' : '명';
  $('#player-count').textContent = `${state.players.length}${unit}`;
  const startBtn = $('#start-btn');
  startBtn.disabled = state.players.length < 2;
  startBtn.textContent = state.players.length < 2
    ? (state.mode === 'team' ? '팀을 2팀 이상 추가하세요' : '참가자를 2명 이상 추가하세요')
    : '게임 시작! 🎲';
}

function addPlayer() {
  const input = $('#player-name');
  const name = input.value.trim();
  if (!name) return;
  if (state.players.length >= 8) { showToastSetup(state.mode === 'team' ? '최대 8팀까지!' : '최대 8명까지!'); return; }
  if (state.players.some((p) => p.name === name)) { showToastSetup('같은 이름이 있어요!'); return; }
  state.players.push({
    name,
    color: PLAYER_COLORS[state.players.length % PLAYER_COLORS.length],
    pos: 0, laps: 0, hits: 0, streak: 0, maxStreak: 0, immunity: 0,
  });
  audio.click();
  input.value = '';
  input.focus();
  renderChips();
}

function showToastSetup(msg) {
  const input = $('#player-name');
  input.value = '';
  input.placeholder = msg;
  setTimeout(() => {
    input.placeholder = state.mode === 'team' ? '팀 이름 입력 후 Enter' : '이름 입력 후 Enter';
  }, 1500);
}

$('#add-player').onclick = addPlayer;
$('#player-name').addEventListener('keydown', (e) => {
  // 한글 IME 조합 중 Enter는 무시 — 조합 확정 이벤트가 중복 발화되어
  // 마지막 글자가 한 번 더 추가되는 버그 방지 (keyCode 229 = 조합 중)
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'Enter') addPlayer();
});
$('#start-btn').onclick = startGame;

// ══════════════════════════════════════
// 2. 보드 렌더링
// ══════════════════════════════════════
// 14×8 그리드 둘레를 시계방향으로 도는 40칸의 grid 좌표
function cellGridArea(i) {
  if (i <= 13) return [1, i + 1];        // 윗줄 좌→우 (0~13)
  if (i <= 19) return [i - 12, 14];      // 오른쪽 위→아래 (14~19)
  if (i <= 33) return [8, 34 - i];       // 아랫줄 우→좌 (20~33)
  return [41 - i, 1];                    // 왼쪽 아래→위 (34~39)
}

function renderBoard() {
  const board = $('#board');
  board.querySelectorAll('.cell').forEach((el) => el.remove());
  BOARD.forEach((typeId, i) => {
    const type = CELL_TYPES[typeId];
    const [r, c] = cellGridArea(i);
    const cell = document.createElement('div');
    cell.className = 'cell' + (CORNERS.includes(i) ? ' corner' : '');
    cell.dataset.idx = i;
    cell.style.gridArea = `${r} / ${c}`;
    cell.style.setProperty('--cell-color', type.color);
    cell.innerHTML = `
      <div class="cell-emoji">${type.emoji}</div>
      <div class="cell-label">${type.label}</div>
      <div class="tokens"></div>`;
    board.appendChild(cell);
  });
  renderTokens();
}

function renderTokens() {
  document.querySelectorAll('.cell .tokens').forEach((el) => { el.innerHTML = ''; });
  state.players.forEach((p) => {
    const holder = document.querySelector(`.cell[data-idx="${p.pos}"] .tokens`);
    if (!holder) return;
    const tok = document.createElement('div');
    tok.className = 'token';
    tok.style.background = p.color;
    tok.textContent = p.name[0];
    tok.title = p.name;
    holder.appendChild(tok);
  });
}

function highlightCell(idx) {
  document.querySelectorAll('.cell').forEach((el) => el.classList.remove('active-cell'));
  const cell = document.querySelector(`.cell[data-idx="${idx}"]`);
  if (cell) cell.classList.add('active-cell');
}

// ══════════════════════════════════════
// 3. HUD (턴 배너 / 리더보드 / 진행도)
// ══════════════════════════════════════
function renderHUD() {
  const p = state.players[state.turn];
  $('#turn-banner').innerHTML =
    `<span style="color:${p.color}">${p.name}</span> 차례!`;

  const lb = $('#leaderboard');
  lb.innerHTML = '';
  state.players.forEach((pl, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row' + (i === state.turn ? ' current' : '');
    row.innerHTML = `
      <div class="lb-dot" style="background:${pl.color}"></div>
      <div class="lb-name">${pl.name}${pl.immunity ? ` 🎫×${pl.immunity}` : ''}</div>
      <div class="lb-hits">🍺 ${pl.hits}</div>
      <div class="lb-lap">${pl.laps}바퀴</div>`;
    lb.appendChild(row);
  });

  // 🍶 공용 벌주잔 상태
  $('#pot').innerHTML = state.pot > 0
    ? `🍶 벌주잔 <b>${state.pot}번</b> 채워짐 — 💣 칸 밟으면 원샷!`
    : '🍶 벌주잔이 비어있어요';

  if (state.end.type === 'laps') {
    const leader = Math.max(...state.players.map((pl) => pl.laps));
    $('#progress').textContent = `🏁 ${state.end.value}바퀴 완주 시 종료 (선두 ${leader}바퀴)`;
  } else {
    const elapsed = Math.floor((Date.now() - state.startTime) / 60000);
    const left = Math.max(0, state.end.value - elapsed);
    $('#progress').textContent = `⏰ 남은 시간 약 ${left}분`;
  }
}

function toast(msg, ms = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

// ══════════════════════════════════════
// 4. 팝업 / 룰렛 오버레이
// ══════════════════════════════════════
const THEME = {
  mission: { color: '#4cc9f0', glow: 'rgba(76,201,240,.35)' },
  penalty: { color: '#f72585', glow: 'rgba(247,37,133,.35)' },
  chance:  { color: '#b5e48c', glow: 'rgba(181,228,140,.3)' },
  all:     { color: '#ff9e00', glow: 'rgba(255,158,0,.35)' },
  rest:    { color: '#adb5bd', glow: 'rgba(173,181,189,.25)' },
  surprise:{ color: '#ffd166', glow: 'rgba(255,209,102,.4)' },
  roulette:{ color: '#c77dff', glow: 'rgba(199,125,255,.35)' },
};

function setOverlayTheme(kind) {
  const t = THEME[kind] || THEME.mission;
  const card = $('#overlay-card');
  card.style.setProperty('--oc-color', t.color);
  card.style.setProperty('--oc-glow', t.glow);
}

// 팝업을 띄우고, 누른 버튼의 id를 resolve
function showPopup({ kind = 'mission', badge, title, body, sub, buttons }) {
  return new Promise((resolve) => {
    setOverlayTheme(kind);
    const card = $('#overlay-card');
    card.innerHTML = `
      ${badge ? `<div class="oc-badge">${badge}</div>` : ''}
      ${title ? `<div class="oc-title">${title}</div>` : ''}
      ${body ? `<div class="oc-body">${body}</div>` : ''}
      ${sub ? `<div class="oc-sub">${sub}</div>` : ''}
      <div class="oc-btns"></div>`;
    const btnWrap = card.querySelector('.oc-btns');
    buttons.forEach((b) => {
      const el = document.createElement('button');
      el.className = b.primary ? 'big-btn' : 'big-btn ghost';
      el.textContent = b.label;
      el.onclick = () => { audio.click(); hideOverlay(); resolve(b.id); };
      btnWrap.appendChild(el);
    });
    $('#overlay').classList.remove('hidden');
  });
}

function hideOverlay() { $('#overlay').classList.add('hidden'); }

// 룰렛 오버레이: 자동 스핀 후 선택된 항목 resolve (weights: 조각별 당첨 확률 가중치)
async function runRoulette(title, items, colors, weights) {
  setOverlayTheme('roulette');
  const card = $('#overlay-card');
  card.innerHTML = `
    <div class="oc-badge">🎰 룰렛</div>
    <div class="oc-title">${title}</div>
    <div class="roulette-wrap"><canvas id="roulette-canvas" width="440" height="440"></canvas></div>`;
  $('#overlay').classList.remove('hidden');

  const wheel = new Roulette($('#roulette-canvas'), items, colors, weights);
  await sleep(700);
  const idx = await wheel.spin();
  await sleep(600);

  // 결과 강조
  const resultEl = document.createElement('div');
  resultEl.className = 'oc-body';
  resultEl.textContent = `👉 ${items[idx]}`;
  card.appendChild(resultEl);
  await sleep(1200);
  hideOverlay();
  return idx;
}

// ══════════════════════════════════════
// 5. 미션/벌칙 선택 로직
// ══════════════════════════════════════
// 강도는 미션 수위가 아니라 "벌주의 양"을 결정한다:
//  - 순한맛=한 모금 / 보통=반 잔 / 매운맛=원샷 (PENALTIES 레벨)
//  - 미션을 성공하면 강도와 무관하게 술을 마시지 않는다 (실패 시에만 벌주)
//  - 팀전에서는 팀 전용 미션/벌주 풀 사용
function pickMission() {
  if (state.mode === 'team') return pick(TEAM_MISSIONS);
  return pick(PACKS[state.packId].missions);
}

function pickPenalty(level) {
  const lv = Math.min(3, Math.max(1, level));
  return pick(state.mode === 'team' ? PENALTIES_TEAM[lv] : PENALTIES[lv]);
}

// 벌주 양 기본 레벨 (강도 설정 그대로)
function baseLevel() { return state.intensity; }

// ══════════════════════════════════════
// 6. 턴 진행
// ══════════════════════════════════════
async function rollDice() {
  const diceEl = $('#dice');
  const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  diceEl.classList.add('rolling');
  audio.dice();
  const value = 1 + Math.floor(Math.random() * 6);
  for (let i = 0; i < 10; i++) {
    diceEl.textContent = faces[Math.floor(Math.random() * 6)];
    await sleep(70);
  }
  diceEl.classList.remove('rolling');
  diceEl.textContent = faces[value - 1];
  return value;
}

async function movePlayer(p, steps) {
  const dir = steps > 0 ? 1 : -1;
  for (let s = 0; s < Math.abs(steps); s++) {
    p.pos = (p.pos + dir + BOARD.length) % BOARD.length;
    if (dir > 0 && p.pos === 0) {
      p.laps++;
      p.immunity++;
      audio.fanfare();
      toast(`🎉 ${p.name} 한 바퀴 완주! 보너스: 벌칙 면제권 🎫`);
    }
    renderTokens();
    highlightCell(p.pos);
    audio.tick();
    await sleep(240);
  }
  renderHUD();
}

// 전체 벌주(전체 이벤트/떼벌칙)에서 면제권 보유자는 자동으로 1장 쓰고 제외된다
function immunityExemptNote() {
  const exempt = state.players.filter((pl) => pl.immunity > 0);
  return exempt.length
    ? `🎫 면제권 자동 사용으로 제외: ${exempt.map((e) => e.name).join(', ')}`
    : '';
}

function applyGroupHit() {
  state.players.forEach((pl) => {
    if (pl.immunity > 0) {
      pl.immunity--;
      state.log.push(`${state.turnCount}턴 · ${pl.name}: 면제권으로 전체 벌주 회피! 🎫`);
    } else {
      pl.hits++;
    }
  });
}

// 걸림 처리 (통계/콤보)
function registerHit(p, note) {
  p.hits++;
  p.streak++;
  p.maxStreak = Math.max(p.maxStreak, p.streak);
  state.log.push(`${state.turnCount}턴 · ${p.name}: ${note}${p.streak >= 2 ? ` 🔥콤보x${p.streak}` : ''}`);
  renderHUD();
}

// 미션/벌칙 공통 팝업 흐름: 완료 / 면제권 / 건너뛰기
async function runChallenge(p, { kind, badge, title, body, sub }) {
  const buttons = [
    { id: 'done', label: '완료 ✅', primary: true },
    { id: 'skip', label: '건너뛰기 ⏭' },
  ];
  if (p.immunity > 0 && kind === 'penalty') {
    buttons.splice(1, 0, { id: 'immunity', label: `면제권 사용 🎫 (${p.immunity}장)` });
  }
  const choice = await showPopup({ kind, badge, title, body, sub, buttons });

  if (choice === 'immunity') {
    p.immunity--;
    p.streak = 0;
    state.log.push(`${state.turnCount}턴 · ${p.name}: 면제권으로 벌칙 회피! 🎫`);
    toast(`🎫 ${p.name} 면제권 사용!`);
    renderHUD();
    return;
  }
  if (choice === 'skip') { p.streak = 0; return; }
  registerHit(p, body.replace(/<[^>]*>/g, ''));
}

// 칸 도착 이벤트 분기
async function resolveCell(p) {
  const type = BOARD[p.pos];
  audio.boom();
  await sleep(350);

  switch (type) {
    case 'start': {
      await showPopup({
        kind: 'chance', badge: '🏁 START', title: '시작점 정착!',
        body: state.mode === 'team'
          ? '원하는 팀 하나를 지목해 다같이 건배! 🥂'
          : '원하는 사람 1명을 지목해 같이 건배! 🥂',
        buttons: [{ id: 'ok', label: '확인 ✅', primary: true }],
      });
      break;
    }
    case 'mission': {
      // 미션 성공 = 통과 (강도와 무관하게 술 없음) / 실패 시에만 벌주
      const m = pickMission();
      const choice = await showPopup({
        kind: 'mission',
        badge: state.mode === 'team' ? '🎤 팀 미션' : `🎤 미션 · ${PACKS[state.packId].name}`,
        title: `${p.name}의 미션!`, body: m,
        sub: '성공하면 술 없이 통과! 실패하면 벌주 🍺',
        buttons: [
          { id: 'success', label: '성공! 🎉', primary: true },
          { id: 'fail', label: '실패… 🍺' },
          { id: 'skip', label: '건너뛰기 ⏭' },
        ],
      });

      if (choice === 'success') {
        p.streak = 0;
        state.log.push(`${state.turnCount}턴 · ${p.name}: 미션 성공 — ${m}`);
        toast(`🎉 ${p.name} 미션 성공! 술 없이 통과!`);
        audio.fanfare();
        break;
      }
      if (choice === 'skip') { p.streak = 0; break; }

      // 실패 → 강도에 맞는 벌주 (콤보 시 양 자동 UP)
      const pen = pickPenalty(baseLevel() + (p.streak >= 2 ? 1 : 0));
      await runChallenge(p, {
        kind: 'penalty', badge: '🍺 미션 실패 벌주',
        title: `${p.name}, 아쉽다!`, body: pen,
        sub: p.streak >= 2 ? `🔥 콤보 x${p.streak} — 벌주 양 자동 UP!` : '',
      });
      break;
    }
    case 'penalty': {
      const level = baseLevel() + (p.streak >= 2 ? 1 : 0); // 콤보 시 강도 자동 UP
      const pen = pickPenalty(level);
      await runChallenge(p, {
        kind: 'penalty', badge: '🍺 벌칙',
        title: `${p.name} 당첨!`, body: pen,
        sub: p.streak >= 2 ? `🔥 콤보 x${p.streak} — 벌칙 강도 자동 UP!` : '',
      });
      break;
    }
    case 'chance': {
      const card = pick(CHANCE_CARDS);
      await showPopup({
        kind: 'chance', badge: '🃏 찬스카드', title: `${p.name}의 찬스!`,
        body: state.mode === 'team' && card.tt ? card.tt : card.t,
        buttons: [{ id: 'ok', label: '확인 ✅', primary: true }],
      });
      if (card.fx.immunity) { p.immunity += card.fx.immunity; renderHUD(); }
      if (card.fx.move) await movePlayer(p, card.fx.move);
      if (card.fx.again) {
        toast(`🎲 ${p.name} 한 번 더!`);
        return { again: true };
      }
      break;
    }
    case 'rest': {
      await showPopup({
        kind: 'rest', badge: '😴 쉬어가기', title: '휴식 타임',
        body: `${p.name}, 이번 턴은 무사통과!`,
        buttons: [{ id: 'ok', label: '꿀맛 휴식 ✅', primary: true }],
      });
      p.streak = 0;
      break;
    }
    case 'all': {
      const ev = pick(ALL_EVENTS);
      await showPopup({
        kind: 'all', badge: '🍻 전체 이벤트', title: '다같이!',
        body: ev,
        sub: immunityExemptNote(),
        buttons: [{ id: 'done', label: '완료 ✅', primary: true }],
      });
      applyGroupHit();
      state.log.push(`${state.turnCount}턴 · 전체 이벤트: ${ev}`);
      renderHUD();
      break;
    }
    case 'target': {
      // 지목 룰렛: 순서 무관 랜덤 당첨 — 낮은 확률로 🎙 진행자 조각 포함!
      const names = [...state.players.map((pl) => pl.name), '🎙 진행자'];
      const colors = [...state.players.map((pl) => pl.color), '#ffffff'];
      const weights = [...state.players.map(() => 1), HOST_WEIGHT];
      const idx = await runRoulette('누가 마셔?! 🎯', names, colors, weights);

      if (idx === state.players.length) {
        // 진행자 당첨 — 게임 돌리던 사람이 마신다!
        const pen = pickPenalty(baseLevel());
        await showPopup({
          kind: 'surprise', badge: '🎙 진행자 당첨!!',
          title: '설마 했는데…', body: `게임 돌리던 진행자가 마십니다!<br>${pen}`,
          buttons: [{ id: 'ok', label: '진행자의 숙명… ✅', primary: true }],
        });
        state.log.push(`${state.turnCount}턴 · 🎙 진행자 당첨! ${pen}`);
        break;
      }

      const victim = state.players[idx];
      const pen = pickPenalty(baseLevel());
      await runChallenge(victim, {
        kind: 'penalty', badge: '🎯 지목 룰렛',
        title: `${victim.name} 당첨!`, body: pen,
      });
      break;
    }
    case 'fill': {
      // 🍶 공용 벌주잔 채우기 — 💣 칸에서 터진다
      state.pot++;
      await showPopup({
        kind: 'all', badge: '🍶 벌주 채우기',
        title: `${p.name}, 벌주잔에 술을 부으세요!`,
        body: `현재 벌주잔: <b>${state.pot}번</b> 채워짐 🍶`,
        sub: '💣 벌주 원샷 칸을 밟는 사람이 이걸 다 마십니다…',
        buttons: [{ id: 'ok', label: '부었다! ✅', primary: true }],
      });
      state.log.push(`${state.turnCount}턴 · ${p.name}: 벌주잔 채우기 (${state.pot}번째) 🍶`);
      renderHUD();
      break;
    }
    case 'bomb': {
      // 💣 모서리 칸: 지금까지 채워진 벌주를 원샷!
      if (state.pot === 0) {
        await showPopup({
          kind: 'rest', badge: '💣 벌주 원샷',
          title: '천운!', body: `벌주잔이 비어있다… ${p.name}, 살았다! 😇`,
          sub: '가볍게 건배만 하고 지나갑니다',
          buttons: [{ id: 'ok', label: '휴… ✅', primary: true }],
        });
        break;
      }
      const potSize = state.pot;
      state.pot = 0;
      renderHUD();
      await runChallenge(p, {
        kind: 'penalty', badge: '💣 벌주 원샷',
        title: `${p.name}, 터졌다!!`,
        body: `${potSize}번 채워진 벌주잔 원샷! 🍶🔥`,
        sub: '지금까지 모두가 부어온 그 잔입니다…',
      });
      break;
    }
    case 'spicy': {
      // 강도 룰렛: 마실 양을 즉석 결정
      const levels = ['😇 한 모금', '😀 반 잔', '🌶️ 원샷'];
      const idx = await runRoulette('얼마나 마실까?! 🌶️', levels, ['#b5e48c', '#4cc9f0', '#f72585']);
      const pen = pickPenalty(idx + 1);
      await runChallenge(p, {
        kind: 'penalty', badge: `🌶️ 강도 룰렛 · ${levels[idx]}`,
        title: `${p.name}의 벌칙!`, body: pen,
      });
      break;
    }
  }
  return {};
}

// 서프라이즈(확률형 히든 이벤트)
async function maybeSurprise() {
  if (Math.random() > SURPRISE_RATE) return;
  document.body.classList.add('shake');
  audio.drumroll(1.5);
  await sleep(1500);
  document.body.classList.remove('shake');

  const ev = pick(SURPRISE_EVENTS);
  audio.boom();
  await showPopup({
    kind: 'surprise', badge: '⚡ 서프라이즈', title: '히든 이벤트 발동!',
    body: ev.t,
    sub: ev.allHit ? immunityExemptNote() : '',
    buttons: [{ id: 'ok', label: '받아들인다… ✅', primary: true }],
  });
  if (ev.allHit) {
    applyGroupHit();
    renderHUD();
  }
  state.log.push(`${state.turnCount}턴 · ⚡ ${ev.t}`);
}

// 한 턴 전체 흐름
async function takeTurn() {
  if (state.busy || !state.playing) return;
  state.busy = true;
  $('#roll-btn').disabled = true;

  const p = state.players[state.turn];
  state.turnCount++;

  try {
    await maybeSurprise();
    const steps = await rollDice();
    toast(`${p.name} → ${steps}칸 전진!`);
    await sleep(400);
    await movePlayer(p, steps);
    await sleep(300);

    const result = await resolveCell(p);

    if (checkEnd()) { finishGame(); return; }

    if (!result?.again) {
      state.turn = (state.turn + 1) % state.players.length;
    }
    renderHUD();
  } finally {
    state.busy = false;
    if (state.playing) $('#roll-btn').disabled = false;
  }
}

function checkEnd() {
  if (state.end.type === 'laps') {
    return state.players.some((p) => p.laps >= state.end.value);
  }
  return (Date.now() - state.startTime) >= state.end.value * 60000;
}

// ══════════════════════════════════════
// 7. 게임 시작 / 종료 / 결과
// ══════════════════════════════════════
function switchScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
}

function startGame() {
  state.players.forEach((p) => Object.assign(p, { pos: 0, laps: 0, hits: 0, streak: 0, maxStreak: 0, immunity: 0 }));
  state.turn = 0;
  state.turnCount = 0;
  state.pot = 0;
  state.log = [];
  state.startTime = Date.now();
  state.playing = true;

  audio.fanfare();
  switchScreen('#game-screen');
  renderBoard();
  renderHUD();
  highlightCell(0);
  $('#roll-btn').disabled = false;
}

function finishGame() {
  state.playing = false;
  hideOverlay();
  audio.fanfare();

  const sorted = [...state.players].sort((a, b) => b.hits - a.hits);
  const mvp = sorted[0];
  const survivor = sorted[sorted.length - 1];
  const comboKing = [...state.players].sort((a, b) => b.maxStreak - a.maxStreak)[0];

  $('#mvp').innerHTML = `
    <div class="crown">👑</div>
    <div class="mvp-name">${mvp.name}</div>
    <div class="mvp-desc">오늘의 MVP — 총 ${mvp.hits}번 당첨! 큰 박수 부탁드립니다 👏</div>`;

  const maxHits = Math.max(1, mvp.hits);
  const stats = $('#stats');
  stats.innerHTML = '';
  sorted.forEach((p) => {
    const awards = [];
    if (p === mvp && p.hits > 0) awards.push('🍺 MVP');
    if (p === survivor) awards.push('🛡️ 생존왕');
    if (p === comboKing && p.maxStreak >= 2) awards.push(`🔥 콤보왕 x${p.maxStreak}`);
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <div class="stat-name" style="color:${p.color}">${p.name}</div>
      <div class="stat-bar-track">
        <div class="stat-bar" style="background:${p.color}; width:${(p.hits / maxHits) * 100}%">${p.hits}</div>
      </div>
      <div class="stat-award">${awards.join(' ')}</div>`;
    stats.appendChild(row);
  });

  const hl = $('#highlights');
  const recent = state.log.slice(-10).reverse();
  hl.innerHTML = recent.length
    ? recent.map((l) => `<div>${l}</div>`).join('')
    : '<div>기록된 사건이 없어요. 평화로운 밤…?</div>';

  switchScreen('#result-screen');
}

// ── 게임 화면 버튼 ──
$('#roll-btn').onclick = takeTurn;

$('#skip-turn-btn').onclick = () => {
  if (state.busy || !state.playing) return;
  audio.click();
  const p = state.players[state.turn];
  toast(`⏭ ${p.name} 턴 건너뛰기`);
  state.turn = (state.turn + 1) % state.players.length;
  renderHUD();
};

$('#end-game-btn').onclick = () => {
  if (!state.playing) return;
  if (confirm('게임을 종료하고 결과를 볼까요?')) finishGame();
};

$('#sound-btn').onclick = () => {
  audio.enabled = !audio.enabled;
  $('#sound-btn').textContent = audio.enabled ? '🔊 사운드 ON' : '🔇 사운드 OFF';
  if (audio.enabled) audio.click();
};

// ── 결과 화면 버튼 ──
$('#replay-btn').onclick = () => { audio.click(); startGame(); };
$('#new-btn').onclick = () => {
  audio.click();
  switchScreen('#setup-screen');
  renderSetup();
};

// ── 초기화 ──
renderSetup();
