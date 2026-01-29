const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
const dbPath = path.join(dataDir, 'portfolio.db');
let db;

function getDb() {
  if (!db) {
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('Created data directory:', dataDir);
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function initialize() {
  const database = getDb();

  // Trades table - all buy/sell/income transactions
  database.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      token TEXT NOT NULL,
      units REAL NOT NULL,
      avg_price REAL,
      total REAL,
      type TEXT NOT NULL CHECK(type IN ('Buy', 'Sell', 'Income')),
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Investors table - LP and GP subscriptions/redemptions
  database.exec(`
    CREATE TABLE IF NOT EXISTS investors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      client TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('GP', 'LP')),
      amount REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Monthly performance tracking
  database.exec(`
    CREATE TABLE IF NOT EXISTS perf_tracker (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT UNIQUE NOT NULL,
      gp_subs REAL DEFAULT 0,
      lp_subs REAL DEFAULT 0,
      initial_value REAL DEFAULT 0,
      ending_value REAL DEFAULT 0,
      motus_return REAL DEFAULT 0,
      btc_return REAL DEFAULT 0,
      eth_return REAL DEFAULT 0,
      cci30_return REAL DEFAULT 0,
      sp_ex_mega_return REAL DEFAULT 0,
      spx_return REAL DEFAULT 0,
      qqq_return REAL DEFAULT 0,
      fund_expenses REAL DEFAULT 0,
      mgmt_fees REAL DEFAULT 0,
      setup_costs REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Manual prices table
  database.exec(`
    CREATE TABLE IF NOT EXISTS manual_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      price REAL NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Exits table - fully exited positions
  database.exec(`
    CREATE TABLE IF NOT EXISTS exits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      cost_basis REAL NOT NULL,
      exit_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Settings table for fund configuration
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Sector watch tokens
  database.exec(`
    CREATE TABLE IF NOT EXISTS sector_watch (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT UNIQUE NOT NULL,
      sector TEXT DEFAULT 'Uncategorized',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add columns to existing tables (SQLite doesn't support IF NOT EXISTS for ALTER TABLE)
  const alterStatements = [
    'ALTER TABLE trades ADD COLUMN notes TEXT',
    'ALTER TABLE perf_tracker ADD COLUMN initial_value REAL DEFAULT 0',
    'ALTER TABLE perf_tracker ADD COLUMN motus_return REAL DEFAULT 0',
    'ALTER TABLE perf_tracker ADD COLUMN btc_return REAL DEFAULT 0',
    'ALTER TABLE perf_tracker ADD COLUMN eth_return REAL DEFAULT 0',
    'ALTER TABLE perf_tracker ADD COLUMN cci30_return REAL DEFAULT 0',
    'ALTER TABLE perf_tracker ADD COLUMN sp_ex_mega_return REAL DEFAULT 0',
    'ALTER TABLE perf_tracker ADD COLUMN spx_return REAL DEFAULT 0',
    'ALTER TABLE perf_tracker ADD COLUMN qqq_return REAL DEFAULT 0',
  ];

  for (const stmt of alterStatements) {
    try {
      database.exec(stmt);
    } catch (e) {
      // Column already exists - safe to ignore
    }
  }

  console.log('Database initialized successfully');
}

module.exports = {
  getDb,
  initialize
};
