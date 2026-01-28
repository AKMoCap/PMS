const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/portfolio.db');
let db;

function getDb() {
  if (!db) {
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
      ending_value REAL DEFAULT 0,
      fund_expenses REAL DEFAULT 0,
      mgmt_fees REAL DEFAULT 0,
      setup_costs REAL DEFAULT 0,
      btc_start REAL DEFAULT 0,
      eth_start REAL DEFAULT 0,
      spx_start REAL DEFAULT 0,
      qqq_start REAL DEFAULT 0,
      cci30_start REAL DEFAULT 0,
      sp_ex_mega_start REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
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

  console.log('Database initialized successfully');
}

module.exports = {
  getDb,
  initialize
};
