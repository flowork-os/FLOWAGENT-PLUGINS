/**
 * ♟️ SOVEREIGN CHESS ARENA — DUAL-ACTOR CLIENT APP
 * ==================================================
 * Instant Client-Side Legal Move Engine + Zero-Latency Board Animation
 * Synchronized with Node.js Engine & Active Agent Chat via Prompt Dispatch.
 * Co-authored-by: Flowork OS <agent@floworkos.com>
 */

(() => {
  const urlParams = new URLSearchParams(window.location.search);
  let enginePort = urlParams.get('port') || '17820';
  const host = window.location.hostname || '127.0.0.1';

  const PIECE_SYMBOLS = {
    P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔',
    p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚'
  };

  const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // Game State
  let state = {
    fen: INITIAL_FEN,
    turn: 'w',
    moveNumber: 1,
    flipped: false,
    history: [],
    captured: { w: [], b: [] },
    isCheck: false,
    isCheckmate: false,
    evaluation: '+0.0',
    lastMove: null
  };

  let selectedSquare = null;
  let legalMoves = [];
  let sseSource = null;
  let audioCtx = null;

  // DOM Elements
  const elBoard = document.getElementById('chessboard');
  const elEngineStatus = document.getElementById('engine-status-text');
  const elStatusDot = document.querySelector('.status-dot');
  const elEvalVal = document.getElementById('eval-val');
  const elTurnIndicator = document.getElementById('turn-indicator');
  const elMoveCount = document.getElementById('move-count');
  const elGameStatus = document.getElementById('game-status');
  const elAiStatus = document.getElementById('ai-status');
  const elUserStatus = document.getElementById('user-status');
  const elUserNameDisplay = document.getElementById('user-name-display');
  const elUserAvatarDisplay = document.getElementById('user-avatar-display');
  const elCapturedWhite = document.getElementById('captured-white');
  const elCapturedBlack = document.getElementById('captured-black');
  const elHistoryTbody = document.getElementById('history-tbody');
  const elHistoryCount = document.getElementById('history-count');
  const elFenText = document.getElementById('fen-text');
  const elAlertBanner = document.getElementById('alert-banner');
  const toggleDispatch = document.getElementById('toggle-dispatch');

  let currentUsername = 'White';
  let currentUserBadge = '👤';
  let currentUserRole = 'USER';

  async function fetchRealUser() {
    try {
      // 1. Ambil dari Host Auth Status
      const hostRes = await fetch('/api/auth/status');
      if (hostRes.ok) {
        const hData = await hostRes.json();
        if (hData.user && hData.user.username) {
          applyRealUser(hData.user);
          return;
        }
      }
    } catch (_) {}

    try {
      // 2. Fallback: Ambil dari Chess Engine auth_vault reader
      const engRes = await fetch(`http://${host}:${enginePort}/api/user`);
      if (engRes.ok) {
        const uData = await engRes.json();
        if (uData.username) {
          applyRealUser(uData);
          return;
        }
      }
    } catch (_) {}
  }

  function applyRealUser(user) {
    if (!user || !user.username) return;
    currentUsername = user.username;
    currentUserBadge = (user.badge || '👑').split(' ')[0] || '👑';
    currentUserRole = user.role || 'SUPER_ADMIN';

    if (elUserNameDisplay) {
      elUserNameDisplay.textContent = `@${currentUsername} (White)`;
      elUserNameDisplay.title = `${user.badge || ''} • ${currentUserRole} (Level ${user.level || 99})`;
    }
    if (elUserAvatarDisplay) {
      elUserAvatarDisplay.textContent = currentUserBadge;
    }
  }

  const btnNewGame = document.getElementById('btn-new-game');
  const btnUndo = document.getElementById('btn-undo');
  const btnFlip = document.getElementById('btn-flip');
  const btnAskAi = document.getElementById('btn-ask-ai');
  const btnCopyFen = document.getElementById('btn-copy-fen');

  // ── 1. PROCEDURAL SOUND SYNTHESIS ──
  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, duration, type = 'sine', gainVal = 0.15) {
    try {
      initAudio();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }

  function playMoveSound() { playTone(320, 0.08, 'triangle', 0.2); }
  function playCaptureSound() { playTone(180, 0.12, 'sawtooth', 0.25); }
  function playCheckSound() {
    playTone(520, 0.1, 'sine', 0.3);
    setTimeout(() => playTone(680, 0.14, 'sine', 0.3), 80);
  }

  // ── 2. FEN PARSER & GRID HELPERS ──
  function parseFen(fen) {
    const parts = fen.split(' ');
    const rows = parts[0].split('/');
    const grid = [];
    for (let r = 0; r < 8; r++) {
      const row = [];
      for (let c = 0; c < rows[r].length; c++) {
        const ch = rows[r][c];
        if (ch >= '1' && ch <= '8') {
          const empty = parseInt(ch, 10);
          for (let e = 0; e < empty; e++) row.push(null);
        } else {
          row.push(ch);
        }
      }
      grid.push(row);
    }
    return {
      grid,
      turn: parts[1] || 'w',
      castling: parts[2] || '-',
      enPassant: parts[3] || '-',
      halfmove: parseInt(parts[4] || '0', 10),
      fullmove: parseInt(parts[5] || '1', 10)
    };
  }

  function gridToFen(grid, turn, castling, enPassant, halfmove, fullmove) {
    let rows = [];
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      let rowStr = '';
      for (let c = 0; c < 8; c++) {
        const p = grid[r][c];
        if (!p) {
          empty++;
        } else {
          if (empty > 0) { rowStr += empty; empty = 0; }
          rowStr += p;
        }
      }
      if (empty > 0) rowStr += empty;
      rows.push(rowStr);
    }
    return `${rows.join('/')} ${turn} ${castling} ${enPassant} ${halfmove} ${fullmove}`;
  }

  function coordsToSquare(r, c) {
    const file = String.fromCharCode('a'.charCodeAt(0) + c);
    const rank = 8 - r;
    return `${file}${rank}`;
  }

  function squareToCoords(sq) {
    if (!sq || sq.length < 2) return null;
    const c = sq.charCodeAt(0) - 'a'.charCodeAt(0);
    const r = 8 - parseInt(sq[1], 10);
    return [r, c];
  }

  // ── 3. CLIENT-SIDE LEGAL MOVES GENERATOR (GUARANTEES 100% PLAYABILITY) ──
  function getLegalMoves(r, c) {
    const parsed = parseFen(state.fen);
    const grid = parsed.grid;
    const piece = grid[r][c];
    if (!piece) return [];

    const isWhite = piece === piece.toUpperCase();
    if ((isWhite && state.turn !== 'w') || (!isWhite && state.turn !== 'b')) {
      return [];
    }

    const moves = [];
    const pLower = piece.toLowerCase();

    const addMove = (tr, tc) => {
      if (tr < 0 || tr > 7 || tc < 0 || tc > 7) return false;
      const dest = grid[tr][tc];
      if (!dest) {
        moves.push(coordsToSquare(tr, tc));
        return true;
      }
      const destIsWhite = dest === dest.toUpperCase();
      if (isWhite !== destIsWhite) {
        moves.push(coordsToSquare(tr, tc));
      }
      return false; // blocked
    };

    if (pLower === 'p') {
      const dir = isWhite ? -1 : 1;
      const startRank = isWhite ? 6 : 1;

      // 1 square forward
      if (r + dir >= 0 && r + dir <= 7 && !grid[r + dir][c]) {
        moves.push(coordsToSquare(r + dir, c));
        // 2 squares forward from home rank
        if (r === startRank && !grid[r + 2 * dir][c]) {
          moves.push(coordsToSquare(r + 2 * dir, c));
        }
      }

      // Diagonal captures
      for (const dc of [-1, 1]) {
        const tc = c + dc;
        const tr = r + dir;
        if (tr >= 0 && tr <= 7 && tc >= 0 && tc <= 7) {
          const target = grid[tr][tc];
          if (target && (target === target.toUpperCase()) !== isWhite) {
            moves.push(coordsToSquare(tr, tc));
          } else if (parsed.enPassant !== '-') {
            const ep = squareToCoords(parsed.enPassant);
            if (ep && ep[0] === tr && ep[1] === tc) {
              moves.push(coordsToSquare(tr, tc));
            }
          }
        }
      }
    } else if (pLower === 'n') {
      const knightOffsets = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      for (const [dr, dc] of knightOffsets) {
        addMove(r + dr, c + dc);
      }
    } else if (pLower === 'b' || pLower === 'r' || pLower === 'q') {
      const dirs = [];
      if (pLower === 'b' || pLower === 'q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
      if (pLower === 'r' || pLower === 'q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);

      for (const [dr, dc] of dirs) {
        let step = 1;
        while (true) {
          const canContinue = addMove(r + dr * step, c + dc * step);
          if (!canContinue) break;
          step++;
        }
      }
    } else if (pLower === 'k') {
      const kingDirs = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1]
      ];
      for (const [dr, dc] of kingDirs) {
        addMove(r + dr, c + dc);
      }

      // Castling
      if (isWhite && r === 7 && c === 4) {
        if (parsed.castling.includes('K') && !grid[7][5] && !grid[7][6] && grid[7][7] === 'R') {
          moves.push('g1');
        }
        if (parsed.castling.includes('Q') && !grid[7][3] && !grid[7][2] && !grid[7][1] && grid[7][0] === 'R') {
          moves.push('c1');
        }
      } else if (!isWhite && r === 0 && c === 4) {
        if (parsed.castling.includes('k') && !grid[0][5] && !grid[0][6] && grid[0][7] === 'r') {
          moves.push('g8');
        }
        if (parsed.castling.includes('q') && !grid[0][3] && !grid[0][2] && !grid[0][1] && grid[0][0] === 'r') {
          moves.push('c8');
        }
      }
    }

    return moves;
  }

  // ── 4. RENDER BOARD & INTERACTION ──
  function renderBoard() {
    if (!elBoard) return;
    elBoard.innerHTML = '';

    const parsed = parseFen(state.fen);
    const grid = parsed.grid;
    const isFlipped = state.flipped;

    const files = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const ranks = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    for (let rIdx = 0; rIdx < 8; rIdx++) {
      const r = ranks[rIdx];
      for (let cIdx = 0; cIdx < 8; cIdx++) {
        const c = files[cIdx];
        const sq = coordsToSquare(r, c);
        const piece = grid[r][c];
        const isLight = (r + c) % 2 !== 0;

        const sqEl = document.createElement('div');
        sqEl.className = `square ${isLight ? 'light' : 'dark'}`;
        sqEl.dataset.square = sq;

        if (state.lastMove && (state.lastMove.from === sq || state.lastMove.to === sq)) {
          sqEl.classList.add('last-move');
        }

        if (selectedSquare === sq) {
          sqEl.classList.add('selected');
        }

        const isLegal = legalMoves.includes(sq);
        if (isLegal) {
          if (piece) sqEl.classList.add('legal-capture');
          else sqEl.classList.add('legal-move');
        }

        // Coordinate labels
        if ((!isFlipped && c === 0) || (isFlipped && c === 7)) {
          const rankLabel = document.createElement('span');
          rankLabel.className = 'square-coord coord-rank';
          rankLabel.textContent = 8 - r;
          sqEl.appendChild(rankLabel);
        }
        if ((!isFlipped && r === 7) || (isFlipped && r === 0)) {
          const fileLabel = document.createElement('span');
          fileLabel.className = 'square-coord coord-file';
          fileLabel.textContent = String.fromCharCode('a'.charCodeAt(0) + c);
          sqEl.appendChild(fileLabel);
        }

        // Piece symbol
        if (piece) {
          const pieceEl = document.createElement('span');
          pieceEl.className = `piece ${piece === piece.toUpperCase() ? 'white-piece' : 'black-piece'}`;
          pieceEl.textContent = PIECE_SYMBOLS[piece] || piece;
          sqEl.appendChild(pieceEl);
        }

        sqEl.addEventListener('click', () => handleSquareClick(r, c, sq, piece));
        elBoard.appendChild(sqEl);
      }
    }
  }

  let isExecutingMove = false;

  function handleSquareClick(r, c, sq, piece) {
    if (isExecutingMove) return;
    initAudio();

    if (selectedSquare) {
      if (selectedSquare === sq) {
        selectedSquare = null;
        legalMoves = [];
        renderBoard();
        return;
      }

      if (legalMoves.includes(sq)) {
        isExecutingMove = true;
        const fromSq = selectedSquare;
        const toSq = sq;
        selectedSquare = null;
        legalMoves = [];
        executeMove(fromSq, toSq).finally(() => {
          setTimeout(() => { isExecutingMove = false; }, 200);
        });
        return;
      }

      // Switch selection if clicked own piece
      if (piece && isOwnPiece(piece, state.turn)) {
        selectedSquare = sq;
        legalMoves = getLegalMoves(r, c);
        renderBoard();
        return;
      }

      selectedSquare = null;
      legalMoves = [];
      renderBoard();
      return;
    }

    // Select piece
    if (piece && isOwnPiece(piece, state.turn)) {
      selectedSquare = sq;
      legalMoves = getLegalMoves(r, c);
      renderBoard();
    }
  }

  function isOwnPiece(piece, turn) {
    if (!piece) return false;
    const isW = piece === piece.toUpperCase();
    return (turn === 'w' && isW) || (turn === 'b' && !isW);
  }

  // ── 5. MOVE EXECUTION & DUAL SOVEREIGNTY DISPATCH ──

  async function executeMove(from, to) {
    const [fromR, fromC] = squareToCoords(from);
    const [toR, toC] = squareToCoords(to);

    const parsed = parseFen(state.fen);
    const grid = parsed.grid;
    const movingPiece = grid[fromR][fromC];
    const capturedPiece = grid[toR][toC];

    // Local move execution
    grid[fromR][fromC] = null;
    let finalPiece = movingPiece;
    if (movingPiece && movingPiece.toLowerCase() === 'p' && (toR === 0 || toR === 7)) {
      finalPiece = state.turn === 'w' ? 'Q' : 'q';
    }
    grid[toR][toC] = finalPiece;

    if (capturedPiece) {
      if (state.turn === 'w') state.captured.w.push(capturedPiece);
      else state.captured.b.push(capturedPiece);
      playCaptureSound();
    } else {
      playMoveSound();
    }

    const prevTurn = state.turn;
    const nextTurn = state.turn === 'w' ? 'b' : 'w';
    const nextMoveNumber = nextTurn === 'w' ? state.moveNumber + 1 : state.moveNumber;

    state.fen = gridToFen(grid, nextTurn, parsed.castling, '-', parsed.halfmove + 1, nextMoveNumber);
    state.turn = nextTurn;
    state.moveNumber = nextMoveNumber;
    state.lastMove = { from, to, san: `${from}-${to}` };
    state.history.push({ from, to, san: `${from}-${to}`, turn: prevTurn });

    updateUI();

    // 1. Sync with Node.js Engine
    try {
      fetch(`http://${host}:${enginePort}/api/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, promotion: 'q' })
      }).catch(() => {});
    } catch (_) {}

    // 2. Dispatch Prompt to Agent Chat if White moved
    if (prevTurn === 'w' && toggleDispatch && toggleDispatch.checked) {
      dispatchMoveToAgentChat(from, to);
    }
  }

  let lastDispatchedKey = '';
  let lastDispatchedTime = 0;

  function dispatchMoveToAgentChat(from, to) {
    const moveKey = `${state.moveNumber}_${from}_${to}_${state.fen}`;
    const now = Date.now();
    if (lastDispatchedKey === moveKey && (now - lastDispatchedTime) < 3000) {
      console.log('[Chess Arena] ⏳ Ignored duplicate move prompt dispatch within 3000ms');
      return;
    }
    lastDispatchedKey = moveKey;
    lastDispatchedTime = now;

    // Gaya Bahasa Warkop: Santai, kocak, khas warkop Indonesia
    const warkopBanter = [
      `☕ Santai dulu bos sambil nyruput kopi item warkop!`,
      `☕ Rokok sebat, kopi kental udah siap di meja nih bos!`,
      `☕ Tarik nafas, sruput kopi item dulu biar ga tremor tangannya!`,
      `☕ Nongkrong di warkop sambil ngasah otak, mantap betul bos!`
    ];
    const greeting = warkopBanter[Math.floor(Math.random() * warkopBanter.length)];

    const prompt = `[CHESS ARENA WARKOP] ♟️ ${greeting}\n` +
      `Gua @${currentUsername} (Putih) barusan geser bidak: ${from} -> ${to} nih!\n` +
      `Posisi Papan Terkini (FEN): "${state.fen}"\n` +
      `Langkah ke-#${state.moveNumber} | Giliran lu nih bro: Hitam / Black (Mr. Flow AI).\n\n` +
      `Ayo giliran lu bales! Baca posisi papannya, sruput kopi lu, terus bales pukulan maut lu pake curl:\n` +
      `curl -s -X POST http://127.0.0.1:${enginePort}/api/move -H "Content-Type: application/json" -d '{"from": "<FROM>", "to": "<TO>", "comment": "..."}'\n\n` +
      `Kelar eksekusi curl, bales di chat panggil gua @${currentUsername} pake gaya warkop yang asik & kocak ya bro! Gass!`;

    // Single unified dispatch to host (host broadcasts SSE to Canvas UI AND dispatches to IDE chat)
    fetch('/api/prompt-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    }).catch(() => {});

    showAlertBanner(`☕ Langkah ${from}->${to} udah dilempar ke chat warkop!`, 'dispatch');
  }

  function dispatchAskAiPrompt() {
    const prompt = `[CHESS ARENA WARKOP] ☕ Bos Mr. Flow, bantuin gua @${currentUsername} mikir dong! Gua lagi buntu nih di meja catur warkop.\n` +
      `Tolong pilihin langkah terbaik buat Hitam (Black) di posisi ini:\n` +
      `FEN: "${state.fen}"\n` +
      `Cek posisi /api/state di port :${enginePort}, tentuin langkah terbaiknya, terus eksekusi via POST http://127.0.0.1:${enginePort}/api/move sambil kasih komen ala warkop buat @${currentUsername}!`;

    fetch('/api/prompt-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    }).catch(() => {});

    showAlertBanner('☕ Minta masukan analis warkop Mr. Flow...', 'dispatch');
  }

  // ── 6. UI UPDATES & REAL-TIME SSE ──
  function updateUI() {
    const isWhite = state.turn === 'w';
    if (elTurnIndicator) {
      elTurnIndicator.textContent = isWhite ? 'WHITE TO MOVE' : 'BLACK TO MOVE';
      elTurnIndicator.style.color = isWhite ? 'var(--accent-cyan)' : 'var(--accent-purple)';
      elTurnIndicator.style.borderColor = isWhite ? 'rgba(56, 189, 248, 0.4)' : 'rgba(168, 85, 247, 0.4)';
    }

    if (elMoveCount) elMoveCount.textContent = `#${state.moveNumber}`;

    if (elAiStatus) {
      elAiStatus.textContent = !isWhite ? 'Thinking / Turn' : 'Waiting for White';
      elAiStatus.style.color = !isWhite ? 'var(--accent-purple)' : 'var(--text-muted)';
    }
    if (elUserStatus) {
      elUserStatus.textContent = isWhite ? 'Your Turn' : 'Waiting for Agent';
      elUserStatus.style.color = isWhite ? 'var(--accent-cyan)' : 'var(--text-muted)';
    }

    if (elCapturedWhite) {
      elCapturedWhite.innerHTML = state.captured.w.map(p => `<span>${PIECE_SYMBOLS[p] || p}</span>`).join('');
    }
    if (elCapturedBlack) {
      elCapturedBlack.innerHTML = state.captured.b.map(p => `<span>${PIECE_SYMBOLS[p] || p}</span>`).join('');
    }

    if (elHistoryTbody) {
      elHistoryTbody.innerHTML = '';
      if (elHistoryCount) elHistoryCount.textContent = `${state.history.length} moves`;
      for (let i = 0; i < state.history.length; i += 2) {
        const num = Math.floor(i / 2) + 1;
        const wMove = state.history[i] ? state.history[i].san : '';
        const bMove = state.history[i + 1] ? state.history[i + 1].san : '';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td style="color:var(--text-muted);">${num}.</td><td><strong>${wMove}</strong></td><td><strong>${bMove}</strong></td>`;
        elHistoryTbody.appendChild(tr);
      }
      const box = document.querySelector('.history-table-container');
      if (box) box.scrollTop = box.scrollHeight;
    }

    if (elFenText) elFenText.textContent = state.fen;

    renderBoard();
  }

  function showAlertBanner(msg, type = 'dispatch') {
    if (!elAlertBanner) return;
    elAlertBanner.textContent = msg;
    elAlertBanner.className = `alert-banner ${type}`;
    elAlertBanner.style.display = 'block';
    setTimeout(() => { if (elAlertBanner) elAlertBanner.style.display = 'none'; }, 4000);
  }

  // ── 7. ENGINE CONNECTOR & AUTO-LAUNCH ──
  async function connectEngine() {
    try {
      // 1. Query status or launch
      const statusRes = await fetch('/api/plugins/chess/status');
      if (statusRes.ok) {
        const sData = await statusRes.json();
        if (sData.port) {
          enginePort = sData.port;
        } else {
          const launchRes = await fetch('/api/plugins/chess/launch', { method: 'POST' });
          if (launchRes.ok) {
            const lData = await launchRes.json();
            if (lData.port) enginePort = lData.port;
          }
        }
      }
      await fetchRealUser();
    } catch (_) {}

    if (elEngineStatus) elEngineStatus.textContent = `Live :${enginePort}`;
    if (elStatusDot) elStatusDot.classList.add('online');

    // Subscribe to SSE for agent moves
    try {
      if (sseSource) sseSource.close();
      sseSource = new EventSource(`http://${host}:${enginePort}/api/events`);
      sseSource.addEventListener('move', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.state && data.move && data.move.turn === 'b') {
            state.fen = data.state.fen;
            state.turn = data.state.turn;
            state.moveNumber = data.state.move_number || state.moveNumber;
            state.lastMove = data.move;
            state.history = data.state.history || state.history;
            state.captured = data.state.captured || state.captured;
            updateUI();
            playMoveSound();
            showAlertBanner(`🤖 Agent played ${data.move.san}!`, 'dispatch');
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  // ── 8. EVENT LISTENERS ──
  if (btnNewGame) {
    btnNewGame.addEventListener('click', () => {
      state.fen = INITIAL_FEN;
      state.turn = 'w';
      state.moveNumber = 1;
      state.history = [];
      state.captured = { w: [], b: [] };
      state.lastMove = null;
      updateUI();
      try { fetch(`http://${host}:${enginePort}/api/new-game`, { method: 'POST' }).catch(() => {}); } catch (_) {}
      showAlertBanner('🔄 New game started!', 'dispatch');
    });
  }

  if (btnUndo) {
    btnUndo.addEventListener('click', () => {
      if (state.history.length > 0) {
        state.history.pop();
        if (state.history.length === 0) {
          state.fen = INITIAL_FEN;
          state.turn = 'w';
          state.moveNumber = 1;
          state.lastMove = null;
        } else {
          const last = state.history[state.history.length - 1];
          state.lastMove = last;
          state.turn = last.turn === 'w' ? 'b' : 'w';
        }
        updateUI();
        try { fetch(`http://${host}:${enginePort}/api/undo`, { method: 'POST' }).catch(() => {}); } catch (_) {}
        showAlertBanner('↩️ Move undone', 'dispatch');
      }
    });
  }

  if (btnFlip) {
    btnFlip.addEventListener('click', () => {
      state.flipped = !state.flipped;
      renderBoard();
    });
  }

  if (btnAskAi) {
    btnAskAi.addEventListener('click', dispatchAskAiPrompt);
  }

  if (btnCopyFen) {
    btnCopyFen.addEventListener('click', async () => {
      await navigator.clipboard.writeText(state.fen);
      btnCopyFen.textContent = 'Copied!';
      setTimeout(() => { btnCopyFen.textContent = 'Copy'; }, 1500);
    });
  }

  // ── 9. STARTUP ──
  fetchRealUser();
  updateUI();
  connectEngine();
})();
