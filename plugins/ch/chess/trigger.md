---
trigger_id: "PLUGIN-CHESS-TRIGGER"
name: "Sovereign Chess Arena Activation Trigger"
scopes:
  - "universal_all"
events:
  - "always_active"
  - "game_simulation"
categories:
  - "CAT-020"
keywords:
  - "chess"
  - "chessboard"
  - "chess_engine"
  - "stockfish"
  - "grandmaster"
  - "fen"
  - "pgn"
  - "board_game"
exclude_keywords:
  - "chinese_chess"
  - "xiangqi"
  - "checkers"
conditions:
  - key: "env.is_headless"
    op: "=="
    val: false
---

# Sovereign Chess Arena Ambient Activation Trigger
<!-- Co-authored-by: Flowork OS <agent@floworkos.com> -->

This trigger manages the ambient recommendation and automated mounting of the Sovereign Chess Arena Canvas plugin when user intent matches interactive chess simulation.
