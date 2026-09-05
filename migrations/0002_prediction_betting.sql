CREATE TABLE IF NOT EXISTS prediction_bets (
  prediction_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL CHECK(option_id IN ('A','B','C','D')),
  stake_rc INTEGER NOT NULL CHECK(stake_rc BETWEEN 10 AND 1000 AND stake_rc % 10 = 0),
  free_stake_rc INTEGER NOT NULL DEFAULT 10 CHECK(free_stake_rc = 10),
  paid_stake_rc INTEGER NOT NULL CHECK(paid_stake_rc = stake_rc - free_stake_rc AND paid_stake_rc >= 0),
  placed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  settled_at TEXT,
  payout_rc INTEGER CHECK(payout_rc IS NULL OR payout_rc >= 0),
  prediction_xp INTEGER CHECK(prediction_xp IS NULL OR prediction_xp >= 0),
  final_odds REAL CHECK(final_odds IS NULL OR final_odds >= 1),
  correct INTEGER CHECK(correct IS NULL OR correct IN (0,1)),
  PRIMARY KEY(prediction_id, version, player_id)
);

CREATE INDEX IF NOT EXISTS idx_prediction_bets_player
  ON prediction_bets(player_id, settled_at);
CREATE INDEX IF NOT EXISTS idx_prediction_bets_market
  ON prediction_bets(prediction_id, version, option_id);

CREATE TABLE IF NOT EXISTS prediction_option_pools (
  prediction_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  option_id TEXT NOT NULL CHECK(option_id IN ('A','B','C','D')),
  stake_rc INTEGER NOT NULL CHECK(stake_rc >= 0),
  bettor_count INTEGER NOT NULL CHECK(bettor_count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(prediction_id, version, option_id)
);

CREATE TABLE IF NOT EXISTS prediction_market_snapshots (
  prediction_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  total_pool_rc INTEGER NOT NULL CHECK(total_pool_rc >= 0),
  bettor_count INTEGER NOT NULL CHECK(bettor_count >= 0),
  option_pools_json TEXT NOT NULL CHECK(json_valid(option_pools_json)),
  closed_at TEXT NOT NULL,
  snapshot_at TEXT NOT NULL,
  result_option_id TEXT CHECK(result_option_id IS NULL OR result_option_id IN ('A','B','C','D')),
  result_recorded_at TEXT,
  PRIMARY KEY(prediction_id, version)
);

CREATE TABLE IF NOT EXISTS prediction_rc_ledger (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  op_key TEXT NOT NULL,
  prediction_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  operation TEXT NOT NULL CHECK(operation IN ('BET_ADJUST','PAYOUT')),
  delta_rc INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
  stake_rc INTEGER,
  created_at TEXT NOT NULL,
  PRIMARY KEY(player_id, op_key)
);

CREATE INDEX IF NOT EXISTS idx_prediction_rc_ledger_market
  ON prediction_rc_ledger(prediction_id, version, created_at);

CREATE TABLE IF NOT EXISTS prediction_xp_ledger (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  op_key TEXT NOT NULL,
  prediction_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  sense_key TEXT NOT NULL CHECK(sense_key = 'foresight'),
  result TEXT NOT NULL CHECK(result IN ('HIT','MISS')),
  final_odds REAL CHECK(final_odds IS NULL OR final_odds >= 1),
  xp_odds REAL NOT NULL CHECK(xp_odds >= 1),
  base_xp INTEGER NOT NULL CHECK(base_xp >= 0),
  odds_bonus_xp INTEGER NOT NULL CHECK(odds_bonus_xp >= 0),
  awarded_xp INTEGER NOT NULL CHECK(awarded_xp >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY(player_id, op_key)
);

CREATE INDEX IF NOT EXISTS idx_prediction_xp_ledger_market
  ON prediction_xp_ledger(prediction_id, version, created_at);
