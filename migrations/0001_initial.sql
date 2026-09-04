CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL CHECK(json_valid(data)),
  revision INTEGER NOT NULL DEFAULT 0,
  last_op TEXT
);
CREATE TABLE IF NOT EXISTS operations (
  player_id TEXT NOT NULL REFERENCES players(id),
  op_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  result TEXT NOT NULL CHECK(json_valid(result)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(player_id,op_key)
);
