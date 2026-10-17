/**
 * ♟️ SOVEREIGN CHESS ARENA — CORE ENGINE & REST/SSE SERVER
 * ========================================================
 * Pure Node.js Sovereign Engine (Zero External Dependencies)
 * Supports FEN, Legal Move Generation, Checkmate Validation,
 * SSE Real-time Broadcast, and Minimax Evaluation.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = parseInt(process.env.FLOWORK_APP_PORT || process.env.PORT || '17820', 10);
const HOST = '127.0.0.1';

// ── 0. SOVEREIGN REAL USER AUTH VAULT RESOLVER ──
function getRealUser() {
  const candidatePaths = [
    path.join(process.cwd(), 'portable-home', '.flowork', 'auth_vault.json'),
    path.join(process.cwd(), '..', 'portable-home', '.flowork', 'auth_vault.json'),
    path.join(process.cwd(), '..', '..', 'portable-home', '.flowork', 'auth_vault.json'),
    path.join(process.cwd(), '..', '..', '..', 'portable-home', '.flowork', 'auth_vault.json'),
    path.join(process.cwd(), '.flowork', 'auth_vault.json'),
    path.join(process.cwd(), '..', '.flowork', 'auth_vault.json'),
    path.join(process.cwd(), '..', '..', '.flowork', 'auth_vault.json'),
    path.join(process.cwd(), '..', '..', '..', '.flowork', 'auth_vault.json'),
    path.join(process.env.HOME || '', 'Music', 'flowork', 'linux', 'portable-home', '.flowork', 'auth_vault.json'),
    path.join(process.env.HOME || '', 'Music', 'flowork', '.flowork', 'auth_vault.json'),
    path.join(process.env.HOME || '', 'Music', 'flowork', 'xflow', 'portable-home', '.flowork', 'auth_vault.json'),
    path.join(process.env.HOME || '', '.flowork', 'auth_vault.json')
  ];

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (raw.flowork_user && raw.flowork_user.username) {
          return raw.flowork_user;
        }
      }
    } catch (_) {}
  }

  return { username: 'Player', badge: '👤', role: 'USER', level: 1 };
}

// ── 1. CHESS CONSTANTS & PIECE VALUES ──
const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PIECE_VALUES = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
  P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000
};

// Piece Square Tables for Positional Evaluation
const PST = {
  P: [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5,  5, 10, 25, 25, 10,  5,  5],
    [0,  0,  0, 20, 20,  0,  0,  0],
    [5, -5,-10,  0,  0,-10, -5,  5],
    [5, 10, 10,-20,-20, 10, 10,  5],
    [0,  0,  0,  0,  0,  0,  0,  0]
  ],
  N: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50]
  ],
  B: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20]
  ],
  R: [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [5, 10, 10, 10, 10, 10, 10,  5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [0,  0,  0,  5,  5,  0,  0,  0]
  ],
  Q: [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [-5,  0,  5,  5,  5,  5,  0, -5],
    [0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20]
  ],
  K: [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [20, 20,  0,  0,  0,  0, 20, 20],
    [20, 30, 10,  0,  0, 10, 30, 20]
  ]
};

// ── 2. CHESS POSITION LOGIC ──

class ChessEngine {
  constructor(fen = INITIAL_FEN) {
    this.history = [];
    this.captured = { w: [], b: [] };
    this.loadFen(fen);
  }

  loadFen(fen) {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) throw new Error('Invalid FEN format');

    this.board = Array(8).fill(null).map(() => Array(8).fill(null));
    const rows = parts[0].split('/');
    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const char of rows[r]) {
        if (char >= '1' && char <= '8') {
          c += parseInt(char, 10);
        } else {
          this.board[r][c] = char;
          c++;
        }
      }
    }

    this.turn = parts[1]; // 'w' or 'b'
    this.castling = parts[2]; // e.g. "KQkq" or "-"
    this.enPassant = parts[3]; // e.g. "e3" or "-"
    this.halfmove = parseInt(parts[4] || '0', 10);
    this.fullmove = parseInt(parts[5] || '1', 10);
  }

  getFen() {
    let fenRows = [];
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      let rowStr = '';
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (!piece) {
          empty++;
        } else {
          if (empty > 0) {
            rowStr += empty;
            empty = 0;
          }
          rowStr += piece;
        }
      }
      if (empty > 0) rowStr += empty;
      fenRows.push(rowStr);
    }
    return `${fenRows.join('/')} ${this.turn} ${this.castling} ${this.enPassant} ${this.halfmove} ${this.fullmove}`;
  }

  squareToCoords(sq) {
    if (!sq || sq.length < 2) return null;
    const col = sq.charCodeAt(0) - 97;
    const row = 8 - parseInt(sq[1], 10);
    if (row < 0 || row > 7 || col < 0 || col > 7) return null;
    return [row, col];
  }

  coordsToSquare(r, c) {
    return String.fromCharCode(97 + c) + (8 - r);
  }

  isWhite(piece) {
    return piece && piece === piece.toUpperCase();
  }

  isBlack(piece) {
    return piece && piece === piece.toLowerCase();
  }

  cloneState() {
    return {
      board: this.board.map(row => [...row]),
      turn: this.turn,
      castling: this.castling,
      enPassant: this.enPassant,
      halfmove: this.halfmove,
      fullmove: this.fullmove,
      history: [...this.history],
      captured: { w: [...this.captured.w], b: [...this.captured.b] }
    };
  }

  restoreState(s) {
    this.board = s.board.map(row => [...row]);
    this.turn = s.turn;
    this.castling = s.castling;
    this.enPassant = s.enPassant;
    this.halfmove = s.halfmove;
    this.fullmove = s.fullmove;
    this.history = [...s.history];
    this.captured = { w: [...s.captured.w], b: [...s.captured.b] };
  }

  // Generates pseudo-legal moves for a square
  getPseudoMoves(r, c) {
    const piece = this.board[r][c];
    if (!piece) return [];
    const isW = this.isWhite(piece);
    if ((isW && this.turn !== 'w') || (!isW && this.turn !== 'b')) return [];

    const moves = [];
    const pLower = piece.toLowerCase();

    // 1. Pawn
    if (pLower === 'p') {
      const dir = isW ? -1 : 1;
      const startRow = isW ? 6 : 1;

      // Push 1
      if (r + dir >= 0 && r + dir < 8 && !this.board[r + dir][c]) {
        moves.push({ from: this.coordsToSquare(r, c), to: this.coordsToSquare(r + dir, c) });
        // Push 2
        if (r === startRow && !this.board[r + 2 * dir][c]) {
          moves.push({ from: this.coordsToSquare(r, c), to: this.coordsToSquare(r + 2 * dir, c) });
        }
      }

      // Captures
      for (const dc of [-1, 1]) {
        const nr = r + dir;
        const nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const target = this.board[nr][nc];
          if (target && (isW ? this.isBlack(target) : this.isWhite(target))) {
            moves.push({ from: this.coordsToSquare(r, c), to: this.coordsToSquare(nr, nc) });
          } else if (this.enPassant !== '-') {
            const epCoords = this.squareToCoords(this.enPassant);
            if (epCoords && epCoords[0] === nr && epCoords[1] === nc) {
              moves.push({ from: this.coordsToSquare(r, c), to: this.coordsToSquare(nr, nc), isEnPassant: true });
            }
          }
        }
      }
    }

    // 2. Knight
    if (pLower === 'n') {
      const deltas = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      for (const [dr, dc] of deltas) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const target = this.board[nr][nc];
          if (!target || (isW ? this.isBlack(target) : this.isWhite(target))) {
            moves.push({ from: this.coordsToSquare(r, c), to: this.coordsToSquare(nr, nc) });
          }
        }
      }
    }

    // 3. Bishop & Rook & Queen (Raycasters)
    const rays = [];
    if (pLower === 'b' || pLower === 'q') {
      rays.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    }
    if (pLower === 'r' || pLower === 'q') {
      rays.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    }
    for (const [dr, dc] of rays) {
      let step = 1;
      while (true) {
        const nr = r + dr * step;
        const nc = c + dc * step;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
        const target = this.board[nr][nc];
        if (!target) {
          moves.push({ from: this.coordsToSquare(r, c), to: this.coordsToSquare(nr, nc) });
        } else {
          if (isW ? this.isBlack(target) : this.isWhite(target)) {
            moves.push({ from: this.coordsToSquare(r, c), to: this.coordsToSquare(nr, nc) });
          }
          break;
        }
        step++;
      }
    }

    // 4. King
    if (pLower === 'k') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const target = this.board[nr][nc];
            if (!target || (isW ? this.isBlack(target) : this.isWhite(target))) {
              moves.push({ from: this.coordsToSquare(r, c), to: this.coordsToSquare(nr, nc) });
            }
          }
        }
      }

      // Castling
      if (isW && r === 7 && c === 4) {
        if (this.castling.includes('K') && !this.board[7][5] && !this.board[7][6] && this.board[7][7] === 'R') {
          if (!this.isSquareAttacked(7, 4, 'b') && !this.isSquareAttacked(7, 5, 'b') && !this.isSquareAttacked(7, 6, 'b')) {
            moves.push({ from: 'e1', to: 'g1', isCastling: 'K' });
          }
        }
        if (this.castling.includes('Q') && !this.board[7][3] && !this.board[7][2] && !this.board[7][1] && this.board[7][0] === 'R') {
          if (!this.isSquareAttacked(7, 4, 'b') && !this.isSquareAttacked(7, 3, 'b') && !this.isSquareAttacked(7, 2, 'b')) {
            moves.push({ from: 'e1', to: 'c1', isCastling: 'Q' });
          }
        }
      } else if (!isW && r === 0 && c === 4) {
        if (this.castling.includes('k') && !this.board[0][5] && !this.board[0][6] && this.board[0][7] === 'r') {
          if (!this.isSquareAttacked(0, 4, 'w') && !this.isSquareAttacked(0, 5, 'w') && !this.isSquareAttacked(0, 6, 'w')) {
            moves.push({ from: 'e8', to: 'g8', isCastling: 'k' });
          }
        }
        if (this.castling.includes('q') && !this.board[0][3] && !this.board[0][2] && !this.board[0][1] && this.board[0][0] === 'r') {
          if (!this.isSquareAttacked(0, 4, 'w') && !this.isSquareAttacked(0, 3, 'w') && !this.isSquareAttacked(0, 2, 'w')) {
            moves.push({ from: 'e8', to: 'c8', isCastling: 'q' });
          }
        }
      }
    }

    return moves;
  }

  isSquareAttacked(r, c, attackerColor) {
    const isW = attackerColor === 'w';

    // Pawns
    const pawnDir = isW ? 1 : -1;
    for (const dc of [-1, 1]) {
      const pr = r + pawnDir;
      const pc = c + dc;
      if (pr >= 0 && pr < 8 && pc >= 0 && pc < 8) {
        const piece = this.board[pr][pc];
        if (piece === (isW ? 'P' : 'p')) return true;
      }
    }

    // Knights
    const knightDeltas = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    for (const [dr, dc] of knightDeltas) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const piece = this.board[nr][nc];
        if (piece === (isW ? 'N' : 'n')) return true;
      }
    }

    // Diagonal (B / Q)
    const diagDeltas = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of diagDeltas) {
      let step = 1;
      while (true) {
        const nr = r + dr * step;
        const nc = c + dc * step;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
        const target = this.board[nr][nc];
        if (target) {
          if (target === (isW ? 'B' : 'b') || target === (isW ? 'Q' : 'q')) return true;
          break;
        }
        step++;
      }
    }

    // Orthogonal (R / Q)
    const orthoDeltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of orthoDeltas) {
      let step = 1;
      while (true) {
        const nr = r + dr * step;
        const nc = c + dc * step;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
        const target = this.board[nr][nc];
        if (target) {
          if (target === (isW ? 'R' : 'r') || target === (isW ? 'Q' : 'q')) return true;
          break;
        }
        step++;
      }
    }

    // King
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const target = this.board[nr][nc];
          if (target === (isW ? 'K' : 'k')) return true;
        }
      }
    }

    return false;
  }

  isCheck(color = this.turn) {
    const kingPiece = color === 'w' ? 'K' : 'k';
    let kingPos = null;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.board[r][c] === kingPiece) {
          kingPos = [r, c];
          break;
        }
      }
      if (kingPos) break;
    }
    if (!kingPos) return false;
    const attacker = color === 'w' ? 'b' : 'w';
    return this.isSquareAttacked(kingPos[0], kingPos[1], attacker);
  }

  getAllLegalMoves() {
    const legalMoves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (!piece) continue;
        const isW = this.isWhite(piece);
        if ((isW && this.turn !== 'w') || (!isW && this.turn !== 'b')) continue;

        const pseudos = this.getPseudoMoves(r, c);
        for (const mv of pseudos) {
          const backup = this.cloneState();
          this.applyMoveInternal(mv);
          const inCheck = this.isCheck(backup.turn);
          this.restoreState(backup);
          if (!inCheck) {
            legalMoves.push(mv);
          }
        }
      }
    }
    return legalMoves;
  }

  applyMoveInternal(mv) {
    const [fromR, fromC] = this.squareToCoords(mv.from);
    const [toR, toC] = this.squareToCoords(mv.to);
    const piece = this.board[fromR][fromC];
    let captured = this.board[toR][toC];

    // En Passant capture
    if (mv.isEnPassant || (piece.toLowerCase() === 'p' && !captured && fromC !== toC)) {
      const epR = this.turn === 'w' ? toR + 1 : toR - 1;
      captured = this.board[epR][toC];
      this.board[epR][toC] = null;
    }

    // Castling rook move
    if (piece.toLowerCase() === 'k' && Math.abs(fromC - toC) === 2) {
      if (toC === 6) { // Kingside
        const rook = this.board[fromR][7];
        this.board[fromR][7] = null;
        this.board[fromR][5] = rook;
      } else if (toC === 2) { // Queenside
        const rook = this.board[fromR][0];
        this.board[fromR][0] = null;
        this.board[fromR][3] = rook;
      }
    }

    this.board[fromR][fromC] = null;
    let finalPiece = piece;

    // Promotion
    if (piece.toLowerCase() === 'p' && (toR === 0 || toR === 7)) {
      const promo = (mv.promotion || 'q').toLowerCase();
      finalPiece = this.turn === 'w' ? promo.toUpperCase() : promo;
    }
    this.board[toR][toC] = finalPiece;

    if (captured) {
      if (this.turn === 'w') this.captured.w.push(captured);
      else this.captured.b.push(captured);
    }

    // Update castling rights
    if (piece === 'K') this.castling = this.castling.replace(/[KQ]/g, '');
    if (piece === 'k') this.castling = this.castling.replace(/[kq]/g, '');
    if (piece === 'R' && fromR === 7 && fromC === 7) this.castling = this.castling.replace('K', '');
    if (piece === 'R' && fromR === 7 && fromC === 0) this.castling = this.castling.replace('Q', '');
    if (piece === 'r' && fromR === 0 && fromC === 7) this.castling = this.castling.replace('k', '');
    if (piece === 'r' && fromR === 0 && fromC === 0) this.castling = this.castling.replace('q', '');
    if (!this.castling) this.castling = '-';

    // Update en passant square
    if (piece.toLowerCase() === 'p' && Math.abs(fromR - toR) === 2) {
      const epR = this.turn === 'w' ? fromR - 1 : fromR + 1;
      this.enPassant = this.coordsToSquare(epR, fromC);
    } else {
      this.enPassant = '-';
    }

    // Halfmove & Fullmove
    if (piece.toLowerCase() === 'p' || captured) this.halfmove = 0;
    else this.halfmove++;
    if (this.turn === 'b') this.fullmove++;

    this.turn = this.turn === 'w' ? 'b' : 'w';
  }

  makeMove(from, to, promotion = 'q', comment = '') {
    const legalMoves = this.getAllLegalMoves();
    const match = legalMoves.find(m => m.from === from && m.to === to);
    if (!match) {
      throw new Error(`Illegal move: ${from} to ${to}`);
    }

    match.promotion = promotion;
    const prevTurn = this.turn;
    const backup = this.cloneState();

    this.applyMoveInternal(match);

    const isCheckNow = this.isCheck(this.turn);
    const nextLegals = this.getAllLegalMoves();
    const isCheckmate = isCheckNow && nextLegals.length === 0;
    const isStalemate = !isCheckNow && nextLegals.length === 0;

    const moveRecord = {
      from,
      to,
      promotion: match.promotion,
      turn: prevTurn,
      san: `${from}-${to}`,
      comment,
      fen: this.getFen(),
      is_check: isCheckNow,
      is_checkmate: isCheckmate,
      timestamp: Date.now()
    };
    this.history.push(moveRecord);

    return {
      success: true,
      move: moveRecord,
      state: this.getState()
    };
  }

  evaluate() {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (!piece) continue;
        const val = PIECE_VALUES[piece] || 0;
        const isW = this.isWhite(piece);
        const pKey = piece.toUpperCase();
        let pstVal = 0;
        if (PST[pKey]) {
          const pR = isW ? r : (7 - r);
          pstVal = PST[pKey][pR][c];
        }
        const totalPiece = val + pstVal;
        score += isW ? totalPiece : -totalPiece;
      }
    }
    return score;
  }

  findBestMove(depth = 2) {
    const legalMoves = this.getAllLegalMoves();
    if (legalMoves.length === 0) return null;

    let bestMove = legalMoves[0];
    let bestVal = this.turn === 'w' ? -Infinity : Infinity;

    for (const mv of legalMoves) {
      const backup = this.cloneState();
      this.applyMoveInternal(mv);
      const val = this.minimax(depth - 1, -Infinity, Infinity, this.turn === 'w');
      this.restoreState(backup);

      if (backup.turn === 'w') {
        if (val > bestVal) {
          bestVal = val;
          bestMove = mv;
        }
      } else {
        if (val < bestVal) {
          bestVal = val;
          bestMove = mv;
        }
      }
    }
    return { move: bestMove, score: bestVal / 100 };
  }

  minimax(depth, alpha, beta, isMaximizing) {
    if (depth === 0) return this.evaluate();

    const moves = this.getAllLegalMoves();
    if (moves.length === 0) {
      if (this.isCheck()) return isMaximizing ? -20000 : 20000;
      return 0; // Stalemate
    }

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const mv of moves) {
        const backup = this.cloneState();
        this.applyMoveInternal(mv);
        const evalVal = this.minimax(depth - 1, alpha, beta, false);
        this.restoreState(backup);
        maxEval = Math.max(maxEval, evalVal);
        alpha = Math.max(alpha, evalVal);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const mv of moves) {
        const backup = this.cloneState();
        this.applyMoveInternal(mv);
        const evalVal = this.minimax(depth - 1, alpha, beta, true);
        this.restoreState(backup);
        minEval = Math.min(minEval, evalVal);
        beta = Math.min(beta, evalVal);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  getState() {
    const legals = this.getAllLegalMoves();
    const isCheckNow = this.isCheck();
    const isCheckmate = isCheckNow && legals.length === 0;
    const isStalemate = !isCheckNow && legals.length === 0;
    const rawEval = this.evaluate() / 100;
    const evalSign = rawEval >= 0 ? `+${rawEval.toFixed(1)}` : rawEval.toFixed(1);

    return {
      fen: this.getFen(),
      turn: this.turn,
      move_number: this.fullmove,
      history: this.history,
      captured: this.captured,
      is_check: isCheckNow,
      is_checkmate: isCheckmate,
      is_stalemate: isStalemate,
      eval: evalSign,
      last_move: this.history.length > 0 ? this.history[this.history.length - 1] : null,
      legal_moves: legals.map(m => ({ from: m.from, to: m.to })),
      user: getRealUser()
    };
  }

  reset() {
    this.history = [];
    this.captured = { w: [], b: [] };
    this.loadFen(INITIAL_FEN);
    return this.getState();
  }

  undo() {
    if (this.history.length === 0) return this.getState();
    this.history.pop();
    if (this.history.length === 0) {
      return this.reset();
    }
    // Replay from beginning
    const targetHistory = [...this.history];
    this.reset();
    for (const rec of targetHistory) {
      this.makeMove(rec.from, rec.to, rec.promotion, rec.comment);
    }
    return this.getState();
  }
}

// ── 3. HTTP SERVER & SSE BROADCASTER ──

const engine = new ChessEngine();
const sseClients = new Set();

function broadcastEvent(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 64) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // SSE Stream
  if (url.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('event: connected\ndata: {"status":"connected"}\n\n');
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // Health
  if (url.pathname === '/api/health' || url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok', app: 'chess', port: PORT });
  }

  // State
  if (url.pathname === '/api/state' && req.method === 'GET') {
    return sendJson(res, 200, engine.getState());
  }

  // Real User from Auth Vault
  if ((url.pathname === '/api/user' || url.pathname === '/api/auth/user') && req.method === 'GET') {
    return sendJson(res, 200, getRealUser());
  }

  // Move
  if (url.pathname === '/api/move' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.from || !body.to) {
        return sendJson(res, 400, { error: 'Missing "from" or "to" square parameters' });
      }

      const result = engine.makeMove(body.from, body.to, body.promotion || 'q', body.comment || '');
      broadcastEvent('move', result);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // New Game
  if (url.pathname === '/api/new-game' && req.method === 'POST') {
    const state = engine.reset();
    broadcastEvent('new_game', { state });
    return sendJson(res, 200, { success: true, state });
  }

  // Undo
  if (url.pathname === '/api/undo' && req.method === 'POST') {
    const state = engine.undo();
    broadcastEvent('undo', { state });
    return sendJson(res, 200, { success: true, state });
  }

  // Best Move
  if ((url.pathname === '/api/best-move' || url.pathname === '/api/evaluate') && (req.method === 'GET' || req.method === 'POST')) {
    const best = engine.findBestMove(2);
    return sendJson(res, 200, {
      turn: engine.turn,
      best_move: best ? best.move : null,
      score: best ? best.score : 0,
      state: engine.getState()
    });
  }

  // 404
  return sendJson(res, 404, { error: 'Not Found' });
});

server.listen(PORT, HOST, () => {
  console.log(`[Chess Engine] Sovereign Chess Server listening on http://${HOST}:${PORT}`);
});
