CREATE TABLE IF NOT EXISTS auto_import_flights (
  uid TEXT NOT NULL,
  flight_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (uid, flight_key)
);

CREATE INDEX IF NOT EXISTS idx_auto_import_flights_uid
  ON auto_import_flights(uid);

CREATE TABLE IF NOT EXISTS subscription_entitlements (
  uid TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL,
  original_transaction_id TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  environment TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscription_entitlements_expiry
  ON subscription_entitlements(expires_at);
