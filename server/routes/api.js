const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const XLSX = require('xlsx');
const { getDb } = require('../database');

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'text/csv'
    ];
    if (allowedTypes.includes(file.mimetype) ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls') ||
        file.originalname.endsWith('.xlsm') ||
        file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel and CSV files are allowed'));
    }
  }
});

// CoinMarketCap API configuration
const CMC_API_KEY = process.env.COINMARKETCAP_API_KEY;
const CMC_BASE_URL = 'https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest';

// List of tokens to track
const TRACKED_SYMBOLS = 'BTC,ETH,GMX,ALT,FET,LIT,SHADOW,KNTQ,BUDDY,VDO,XPL,XMR,S,HYPE,LOOP,PUMP,HFUN,PIP,LEO,PURR,CETUS,ONDO,POPCAT,ENS,BEAM,ENA,RAY,EIGEN,HIGHER,KMNO,JLP,MOG,W,ZYN,AERO,STX,XRP,VIRTUAL,CRO,TON,ICP,LTC,BNKR,FIL,HBAR,OKB,INJ,TIA,SUI,SEI,WHALES,CANTO,MPLX,ACX,XAI,PRIME,JUP,MNDE,AGIX,WIF,BANANA,APT,RAM,HNT,ORCA,TAO,JTO,AR,AKT,AGRS,PTF,PYTH,DYDX,BONK,DMT,XLM,TRX,BCH,ETC,MNT,DOGE,PEPE,FARTCOIN,SPX,SHIB,ASX,RENDER,BNB,AAVE,COMP,SAND,AXS,MAGIC,PYR,GRAIL,NEAR,GNS,ARB,WOO,UNI,SUSHI,RPL,CRV,FRAX,LINK,OP,ALGB,CVX,JOE,LDO,ATOM,ALGO,ADA,AVAX,SOL,RAIL,MATIC,DOT,PENDLE,SNX,ORANJE,NEST,SWAP,USDC,veKITTEN';

// Cache for price data
let priceCache = {
  data: null,
  timestamp: 0
};
const CACHE_DURATION = 60000; // 1 minute cache

// =====================
// PRICE DATA ENDPOINTS
// =====================

router.get('/prices', async (req, res) => {
  try {
    const now = Date.now();

    // Return cached data if still valid
    if (priceCache.data && (now - priceCache.timestamp) < CACHE_DURATION) {
      return res.json(priceCache.data);
    }

    // Fetch fresh data from CoinMarketCap
    const response = await axios.get(CMC_BASE_URL, {
      headers: {
        'X-CMC_PRO_API_KEY': CMC_API_KEY
      },
      params: {
        symbol: TRACKED_SYMBOLS
      }
    });

    // Process the response
    const priceData = {};
    const data = response.data.data;

    for (const symbol in data) {
      const tokenArray = data[symbol];
      if (Array.isArray(tokenArray) && tokenArray.length > 0) {
        const token = tokenArray[0];
        const quote = token.quote?.USD || {};
        priceData[symbol] = {
          price: quote.price || 0,
          percent_change_24h: quote.percent_change_24h || 0,
          percent_change_7d: quote.percent_change_7d || 0,
          percent_change_30d: quote.percent_change_30d || 0,
          percent_change_60d: quote.percent_change_60d || 0,
          market_cap: quote.market_cap || 0,
          volume_24h: quote.volume_24h || 0,
          name: token.name
        };
      }
    }

    // Update cache
    priceCache = {
      data: priceData,
      timestamp: now
    };

    res.json(priceData);
  } catch (error) {
    console.error('Error fetching prices:', error.message);
    // Return cached data if available, even if expired
    if (priceCache.data) {
      return res.json(priceCache.data);
    }
    res.status(500).json({ error: 'Failed to fetch price data' });
  }
});

// =====================
// TRADES ENDPOINTS
// =====================

router.get('/trades', (req, res) => {
  try {
    const db = getDb();
    const trades = db.prepare('SELECT * FROM trades ORDER BY date DESC, id DESC').all();
    res.json(trades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/trades', (req, res) => {
  try {
    const db = getDb();
    const { date, token, units, avg_price, total, type, notes } = req.body;

    // Calculate missing field
    let finalAvgPrice = avg_price;
    let finalTotal = total;

    if (!avg_price && total && units) {
      finalAvgPrice = total / units;
    } else if (!total && avg_price && units) {
      finalTotal = avg_price * units;
    }

    const stmt = db.prepare(`
      INSERT INTO trades (date, token, units, avg_price, total, type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(date, token.toUpperCase(), units, finalAvgPrice, finalTotal, type, notes || null);

    const newTrade = db.prepare('SELECT * FROM trades WHERE id = ?').get(result.lastInsertRowid);
    res.json(newTrade);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/trades/:id', (req, res) => {
  try {
    const db = getDb();
    const { date, token, units, avg_price, total, type, notes } = req.body;

    let finalAvgPrice = avg_price;
    let finalTotal = total;

    if (!avg_price && total && units) {
      finalAvgPrice = total / units;
    } else if (!total && avg_price && units) {
      finalTotal = avg_price * units;
    }

    const stmt = db.prepare(`
      UPDATE trades
      SET date = ?, token = ?, units = ?, avg_price = ?, total = ?, type = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(date, token.toUpperCase(), units, finalAvgPrice, finalTotal, type, notes || null, req.params.id);

    const updatedTrade = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
    res.json(updatedTrade);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/trades/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export trades as CSV
router.get('/trades/export/csv', (req, res) => {
  try {
    const db = getDb();
    const trades = db.prepare('SELECT * FROM trades ORDER BY date DESC, id DESC').all();

    const headers = 'Date,Token,Units,Avg Price,Total,Type,Notes';
    const rows = trades.map(t => {
      const notes = t.notes ? `"${t.notes.replace(/"/g, '""')}"` : '';
      return `${t.date},${t.token},${t.units},${t.avg_price || ''},${t.total || ''},${t.type},${notes}`;
    });

    const csv = [headers, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=trades.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================
// PORTFOLIO ENDPOINTS
// =====================

router.get('/portfolio', (req, res) => {
  try {
    const db = getDb();

    // Get aggregated holdings from trades
    const holdings = db.prepare(`
      SELECT
        token,
        SUM(CASE WHEN type = 'Buy' THEN units WHEN type = 'Sell' THEN -units WHEN type = 'Income' THEN units ELSE 0 END) as total_units,
        SUM(CASE WHEN type = 'Buy' THEN total WHEN type = 'Sell' THEN -total ELSE 0 END) as cost_basis
      FROM trades
      GROUP BY token
      HAVING total_units > 0.0001 OR total_units < -0.0001
      ORDER BY cost_basis DESC
    `).all();

    res.json(holdings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get USDC balance calculation
router.get('/portfolio/usdc', (req, res) => {
  try {
    const db = getDb();

    // Get total subscriptions (GP + LP)
    const subscriptions = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM investors
    `).get();

    // Get total cost basis of current holdings (excluding USDC)
    const costBasis = db.prepare(`
      SELECT COALESCE(SUM(
        CASE WHEN type = 'Buy' THEN total
             WHEN type = 'Sell' THEN -total
             ELSE 0 END
      ), 0) as total
      FROM trades
      WHERE UPPER(token) != 'USDC'
    `).get();

    // Get total expenses from perf_tracker
    const expenses = db.prepare(`
      SELECT
        COALESCE(SUM(fund_expenses), 0) as fund_expenses,
        COALESCE(SUM(mgmt_fees), 0) as mgmt_fees,
        COALESCE(SUM(setup_costs), 0) as setup_costs
      FROM perf_tracker
    `).get();

    const totalExpenses = (expenses.fund_expenses || 0) + (expenses.mgmt_fees || 0) + (expenses.setup_costs || 0);

    // Get exits cost basis
    const exitsCostBasis = db.prepare(`
      SELECT COALESCE(SUM(cost_basis), 0) as total FROM exits
    `).get();

    // USDC = Total Subscriptions - Cost Basis of Holdings - Total Expenses - Exits Cost Basis
    const usdcBalance = (subscriptions.total || 0) - (costBasis.total || 0) - totalExpenses - (exitsCostBasis.total || 0);

    res.json({
      total_subscriptions: subscriptions.total || 0,
      cost_basis: costBasis.total || 0,
      total_expenses: totalExpenses,
      exits_cost_basis: exitsCostBasis.total || 0,
      usdc_balance: usdcBalance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================
// INVESTORS ENDPOINTS
// =====================

router.get('/investors', (req, res) => {
  try {
    const db = getDb();
    const investors = db.prepare('SELECT * FROM investors ORDER BY month DESC, id DESC').all();
    res.json(investors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/investors', (req, res) => {
  try {
    const db = getDb();
    const { month, client, type, amount } = req.body;

    const stmt = db.prepare(`
      INSERT INTO investors (month, client, type, amount)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(month, client, type, amount);

    const newInvestor = db.prepare('SELECT * FROM investors WHERE id = ?').get(result.lastInsertRowid);
    res.json(newInvestor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/investors/:id', (req, res) => {
  try {
    const db = getDb();
    const { month, client, type, amount } = req.body;

    const stmt = db.prepare(`
      UPDATE investors
      SET month = ?, client = ?, type = ?, amount = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(month, client, type, amount, req.params.id);

    const updated = db.prepare('SELECT * FROM investors WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/investors/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM investors WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================
// PERF TRACKER ENDPOINTS
// =====================

router.get('/perf-tracker', (req, res) => {
  try {
    const db = getDb();
    const records = db.prepare('SELECT * FROM perf_tracker ORDER BY month ASC').all();
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/perf-tracker', (req, res) => {
  try {
    const db = getDb();
    const { month, gp_subs, lp_subs, initial_value, ending_value, motus_return,
            btc_return, eth_return, cci30_return, sp_ex_mega_return, spx_return, qqq_return,
            fund_expenses, mgmt_fees, setup_costs } = req.body;

    const stmt = db.prepare(`
      INSERT INTO perf_tracker (month, gp_subs, lp_subs, initial_value, ending_value, motus_return,
                                btc_return, eth_return, cci30_return, sp_ex_mega_return, spx_return, qqq_return,
                                fund_expenses, mgmt_fees, setup_costs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(month) DO UPDATE SET
        gp_subs = excluded.gp_subs,
        lp_subs = excluded.lp_subs,
        initial_value = excluded.initial_value,
        ending_value = excluded.ending_value,
        motus_return = excluded.motus_return,
        btc_return = excluded.btc_return,
        eth_return = excluded.eth_return,
        cci30_return = excluded.cci30_return,
        sp_ex_mega_return = excluded.sp_ex_mega_return,
        spx_return = excluded.spx_return,
        qqq_return = excluded.qqq_return,
        fund_expenses = excluded.fund_expenses,
        mgmt_fees = excluded.mgmt_fees,
        setup_costs = excluded.setup_costs,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(month, gp_subs || 0, lp_subs || 0, initial_value || 0, ending_value || 0, motus_return || 0,
             btc_return || 0, eth_return || 0, cci30_return || 0, sp_ex_mega_return || 0, spx_return || 0, qqq_return || 0,
             fund_expenses || 0, mgmt_fees || 0, setup_costs || 0);

    const record = db.prepare('SELECT * FROM perf_tracker WHERE month = ?').get(month);
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/perf-tracker/:id', (req, res) => {
  try {
    const db = getDb();
    const { month, gp_subs, lp_subs, initial_value, ending_value, motus_return,
            btc_return, eth_return, cci30_return, sp_ex_mega_return, spx_return, qqq_return,
            fund_expenses, mgmt_fees, setup_costs } = req.body;

    const stmt = db.prepare(`
      UPDATE perf_tracker
      SET month = ?, gp_subs = ?, lp_subs = ?, initial_value = ?, ending_value = ?, motus_return = ?,
          btc_return = ?, eth_return = ?, cci30_return = ?, sp_ex_mega_return = ?, spx_return = ?, qqq_return = ?,
          fund_expenses = ?, mgmt_fees = ?, setup_costs = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(month, gp_subs || 0, lp_subs || 0, initial_value || 0, ending_value || 0, motus_return || 0,
             btc_return || 0, eth_return || 0, cci30_return || 0, sp_ex_mega_return || 0, spx_return || 0, qqq_return || 0,
             fund_expenses || 0, mgmt_fees || 0, setup_costs || 0, req.params.id);

    const updated = db.prepare('SELECT * FROM perf_tracker WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/perf-tracker/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM perf_tracker WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all perf tracker data (for re-importing)
router.delete('/perf-tracker/all', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM perf_tracker').run();
    res.json({ success: true, deleted: result.changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================
// EXITS ENDPOINTS
// =====================

router.get('/exits', (req, res) => {
  try {
    const db = getDb();
    const exits = db.prepare('SELECT * FROM exits ORDER BY exit_date DESC, id DESC').all();
    res.json(exits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/exits', (req, res) => {
  try {
    const db = getDb();
    const { token, cost_basis, exit_date } = req.body;

    const stmt = db.prepare(`
      INSERT INTO exits (token, cost_basis, exit_date)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(token.toUpperCase(), cost_basis, exit_date);

    const newExit = db.prepare('SELECT * FROM exits WHERE id = ?').get(result.lastInsertRowid);
    res.json(newExit);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/exits/:id', (req, res) => {
  try {
    const db = getDb();
    const { token, cost_basis, exit_date } = req.body;

    const stmt = db.prepare(`
      UPDATE exits
      SET token = ?, cost_basis = ?, exit_date = ?
      WHERE id = ?
    `);

    stmt.run(token.toUpperCase(), cost_basis, exit_date, req.params.id);

    const updated = db.prepare('SELECT * FROM exits WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/exits/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM exits WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all exits (for re-importing)
router.delete('/exits/all', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM exits').run();
    res.json({ success: true, deleted: result.changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================
// MANUAL PRICES ENDPOINTS
// =====================

router.get('/manual-prices', (req, res) => {
  try {
    const db = getDb();
    const prices = db.prepare('SELECT * FROM manual_prices ORDER BY token').all();
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/manual-prices', (req, res) => {
  try {
    const db = getDb();
    const { token, price } = req.body;

    const stmt = db.prepare(`
      INSERT INTO manual_prices (token, price, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(token) DO UPDATE SET
        price = excluded.price,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(token.toUpperCase(), price);

    const record = db.prepare('SELECT * FROM manual_prices WHERE token = ?').get(token.toUpperCase());
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/manual-prices/:token', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM manual_prices WHERE token = ?').run(req.params.token.toUpperCase());
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================
// SECTOR WATCH ENDPOINTS
// =====================

router.get('/sector-watch', (req, res) => {
  try {
    const db = getDb();
    const tokens = db.prepare('SELECT * FROM sector_watch ORDER BY sector, symbol').all();
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sector-watch/initialize', (req, res) => {
  try {
    const db = getDb();
    const symbols = TRACKED_SYMBOLS.split(',');

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO sector_watch (symbol)
      VALUES (?)
    `);

    const insertMany = db.transaction((syms) => {
      for (const sym of syms) {
        stmt.run(sym.trim());
      }
    });

    insertMany(symbols);

    const tokens = db.prepare('SELECT * FROM sector_watch ORDER BY sector, symbol').all();
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================
// SUMMARY ENDPOINTS
// =====================

router.get('/summary', (req, res) => {
  try {
    const db = getDb();

    // Get total subscriptions
    const subscriptions = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'GP' THEN amount ELSE 0 END), 0) as gp_total,
        COALESCE(SUM(CASE WHEN type = 'LP' THEN amount ELSE 0 END), 0) as lp_total,
        COALESCE(SUM(amount), 0) as total
      FROM investors
    `).get();

    // Get total expenses
    const expenses = db.prepare(`
      SELECT
        COALESCE(SUM(fund_expenses), 0) as fund_expenses,
        COALESCE(SUM(mgmt_fees), 0) as mgmt_fees,
        COALESCE(SUM(setup_costs), 0) as setup_costs
      FROM perf_tracker
    `).get();

    // Get latest performance record
    const latestPerf = db.prepare(`
      SELECT * FROM perf_tracker ORDER BY month DESC LIMIT 1
    `).get();

    res.json({
      subscriptions,
      expenses,
      latestPerf
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================
// UPLOAD ENDPOINTS
// =====================

// Helper function to parse Excel date
function parseExcelDate(value) {
  if (!value) return null;

  // Handle JavaScript Date objects (from xlsx with cellDates: true)
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // If it's already a string date
  if (typeof value === 'string') {
    // Try parsing common date formats
    const dateStr = value.trim();

    // Handle MM/DD/YYYY or M/D/YYYY format
    const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const [, month, day, year] = slashMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // Handle YYYY-MM-DD format
    const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return dateStr;
  }

  // If it's an Excel serial date number
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const jsDate = new Date(excelEpoch.getTime() + value * 86400000);
    const year = jsDate.getFullYear();
    const month = String(jsDate.getMonth() + 1).padStart(2, '0');
    const day = String(jsDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return null;
}

// Helper function to normalize trade type
function normalizeTradeType(type) {
  if (!type) return 'Buy';
  const normalized = String(type).trim().toLowerCase();
  if (normalized === 'sell') return 'Sell';
  if (normalized === 'income') return 'Income';
  return 'Buy';
}

// Helper function to find column value with flexible matching
function getColumnValue(row, ...possibleNames) {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null) {
      return row[name];
    }
  }
  // Try case-insensitive search through all keys
  const rowKeys = Object.keys(row);
  for (const name of possibleNames) {
    const lowerName = name.toLowerCase().trim();
    for (const key of rowKeys) {
      if (key.toLowerCase().trim() === lowerName) {
        return row[key];
      }
    }
  }
  return null;
}

// Helper function to parse month format like "June-22" to "2022-06"
function parseMonthValue(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const monthStr = value.trim();
    const monthMatch = monthStr.match(/^([A-Za-z]+)-(\d{2})$/);
    if (monthMatch) {
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const monthIndex = monthNames.findIndex(m => monthMatch[1].toLowerCase().startsWith(m));
      if (monthIndex !== -1) {
        const year = parseInt(monthMatch[2]) + 2000;
        return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
      }
    }
    if (monthStr.match(/^\d{4}-\d{2}$/)) {
      return monthStr;
    }
  }
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  }
  return null;
}

// Upload trades from Excel
router.post('/upload/trades', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Processing file:', req.file.originalname, 'Size:', req.file.size);

    // Parse the Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to JSON with header mapping
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: null });

    console.log('Parsed rows:', rawData.length);
    if (rawData.length > 0) {
      console.log('First row keys:', Object.keys(rawData[0]));
      console.log('First row data:', JSON.stringify(rawData[0]));
    }

    if (rawData.length === 0) {
      return res.status(400).json({ error: 'No data found in the file' });
    }

    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO trades (date, token, units, avg_price, total, type)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let imported = 0;
    let skipped = 0;
    const errors = [];
    const skippedReasons = {
      noToken: 0,
      zeroUnits: 0,
      invalidUnits: 0,
      other: 0
    };
    const skippedRows = []; // Track first few skipped rows for debugging

    // Process each row
    const insertMany = db.transaction((rows) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          // Map Excel columns to our fields using flexible matching
          const token = getColumnValue(row, 'Token', 'token', 'TOKEN', 'SYMBOL', 'Symbol');
          const dateValue = getColumnValue(row, 'Date', 'date', 'DATE');
          const units = getColumnValue(row, 'Units', 'units', 'UNITS', 'Quantity', 'quantity', 'QTY', 'Qty');
          const avgPrice = getColumnValue(row, 'Avg Price', 'Avg. Price', 'avg_price', 'AVG PRICE', 'Price', 'price', 'PRICE', 'AvgPrice');
          const total = getColumnValue(row, 'Total Bot', 'Total', 'total', 'TOTAL BOT', 'TOTAL', 'Amount', 'amount', 'TotalBot');
          const type = getColumnValue(row, 'Buy/Sell/Income', 'Type', 'type', 'TYPE', 'Side', 'side', 'Action', 'action');

          // Skip if no token (likely empty row)
          if (!token || String(token).trim() === '') {
            skipped++;
            skippedReasons.noToken++;
            if (skippedRows.length < 20) {
              skippedRows.push({ row: i + 2, reason: 'No token', data: JSON.stringify(row).substring(0, 100) });
            }
            continue;
          }

          // Parse and validate data
          const parsedDate = parseExcelDate(dateValue);
          const parsedUnits = parseFloat(units);
          let parsedAvgPrice = avgPrice ? parseFloat(String(avgPrice).replace(/[$,]/g, '')) : null;
          let parsedTotal = total ? parseFloat(String(total).replace(/[$,]/g, '')) : null;

          // Skip if units is invalid (NaN) - but allow zero if it might be a valid entry
          if (isNaN(parsedUnits)) {
            skipped++;
            skippedReasons.invalidUnits++;
            if (skippedRows.length < 20) {
              skippedRows.push({ row: i + 2, reason: 'Invalid units: ' + units, token: token });
            }
            continue;
          }

          // Skip if units is exactly zero AND no total value
          if (parsedUnits === 0 && (!parsedTotal || parsedTotal === 0)) {
            skipped++;
            skippedReasons.zeroUnits++;
            if (skippedRows.length < 20) {
              skippedRows.push({ row: i + 2, reason: 'Zero units with no total', token: token });
            }
            continue;
          }

          // Calculate missing field
          if (!parsedAvgPrice && parsedTotal && parsedUnits) {
            parsedAvgPrice = Math.abs(parsedTotal / parsedUnits);
          } else if (!parsedTotal && parsedAvgPrice && parsedUnits) {
            parsedTotal = parsedAvgPrice * parsedUnits;
          }

          // Normalize trade type
          const normalizedType = normalizeTradeType(type);

          // Insert the trade
          stmt.run(
            parsedDate || new Date().toISOString().split('T')[0],
            String(token).toUpperCase().trim(),
            Math.abs(parsedUnits),
            parsedAvgPrice,
            parsedTotal ? Math.abs(parsedTotal) : null,
            normalizedType
          );
          imported++;
        } catch (rowError) {
          console.error(`Row ${i + 2} error:`, rowError.message);
          errors.push(`Row ${i + 2}: ${rowError.message}`);
          skipped++;
        }
      }
    });

    insertMany(rawData);

    console.log('Import complete - Imported:', imported, 'Skipped:', skipped);
    console.log('Skip reasons:', skippedReasons);
    if (skippedRows.length > 0) {
      console.log('Sample skipped rows:', skippedRows);
    }

    res.json({
      success: true,
      imported,
      skipped,
      total: rawData.length,
      skippedReasons,
      skippedRows: skippedRows.slice(0, 20),
      errors: errors.slice(0, 10) // Return first 10 errors only
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to process file' });
  }
});

// Upload investors from Excel
router.post('/upload/investors', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: null });

    if (rawData.length === 0) {
      return res.status(400).json({ error: 'No data found in the file' });
    }

    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO investors (month, client, type, amount)
      VALUES (?, ?, ?, ?)
    `);

    let imported = 0;
    let skipped = 0;
    const errors = [];

    const insertMany = db.transaction((rows) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          // Map Excel columns: Month, Client, GP / LP, Amount
          const monthValue = row['Month'] || row['month'] || row['MONTH'];
          const client = row['Client'] || row['client'] || row['CLIENT'];
          const gpLp = row['GP / LP'] || row['GP/LP'] || row['Type'] || row['type'];
          const amount = row['Amount'] || row['amount'] || row['AMOUNT'];

          if (!client || !amount) {
            skipped++;
            continue;
          }

          // Parse month - convert to YYYY-MM format
          let parsedMonth = '';
          if (typeof monthValue === 'string') {
            // Handle formats like "June-22", "Jun-22", "2022-06"
            const monthStr = monthValue.trim();
            const monthMatch = monthStr.match(/^([A-Za-z]+)-(\d{2})$/);
            if (monthMatch) {
              const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
              const monthIndex = monthNames.findIndex(m => monthMatch[1].toLowerCase().startsWith(m));
              if (monthIndex !== -1) {
                const year = parseInt(monthMatch[2]) + 2000;
                parsedMonth = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
              }
            } else if (monthStr.match(/^\d{4}-\d{2}$/)) {
              parsedMonth = monthStr;
            }
          } else if (monthValue instanceof Date) {
            parsedMonth = `${monthValue.getFullYear()}-${String(monthValue.getMonth() + 1).padStart(2, '0')}`;
          }

          // Determine GP or LP
          const investorType = String(gpLp || '').toUpperCase().includes('GP') ? 'GP' : 'LP';

          // Parse amount
          const parsedAmount = parseFloat(String(amount).replace(/[$,()]/g, '').trim());
          const finalAmount = String(amount).includes('(') || String(amount).includes('-') ? -Math.abs(parsedAmount) : parsedAmount;

          if (isNaN(finalAmount)) {
            skipped++;
            continue;
          }

          stmt.run(parsedMonth, String(client).trim(), investorType, finalAmount);
          imported++;
        } catch (rowError) {
          errors.push(`Row ${i + 2}: ${rowError.message}`);
          skipped++;
        }
      }
    });

    insertMany(rawData);

    res.json({
      success: true,
      imported,
      skipped,
      total: rawData.length,
      errors: errors.slice(0, 10)
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload perf tracker data from Excel
router.post('/upload/perf-tracker', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: null });

    if (rawData.length === 0) {
      return res.status(400).json({ error: 'No data found in the file' });
    }

    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO perf_tracker (month, gp_subs, lp_subs, initial_value, ending_value,
                                motus_return, btc_return, eth_return, cci30_return,
                                sp_ex_mega_return, spx_return, qqq_return)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(month) DO UPDATE SET
        gp_subs = excluded.gp_subs,
        lp_subs = excluded.lp_subs,
        initial_value = excluded.initial_value,
        ending_value = excluded.ending_value,
        motus_return = excluded.motus_return,
        btc_return = excluded.btc_return,
        eth_return = excluded.eth_return,
        cci30_return = excluded.cci30_return,
        sp_ex_mega_return = excluded.sp_ex_mega_return,
        spx_return = excluded.spx_return,
        qqq_return = excluded.qqq_return,
        updated_at = CURRENT_TIMESTAMP
    `);

    let imported = 0;
    let skipped = 0;
    const errors = [];

    const insertMany = db.transaction((rows) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const monthValue = getColumnValue(row, 'MONTH', 'Month', 'month');
          const parsedMonth = parseMonthValue(monthValue);

          if (!parsedMonth) {
            skipped++;
            continue;
          }

          const gpSubs = parseFloat(getColumnValue(row, 'GP SUBS', 'GP Subs', 'gp_subs') || 0);
          const lpSubs = parseFloat(getColumnValue(row, 'LP SUBS', 'LP Subs', 'lp_subs') || 0);
          const initialValue = parseFloat(getColumnValue(row, 'INITIAL VALUE', 'Initial Value', 'initial_value') || 0);
          const endingValue = parseFloat(getColumnValue(row, 'END/LIVE VALUE', 'END VALUE', 'ENDING VALUE', 'Ending Value', 'ending_value', 'End/Live Value') || 0);
          const motusReturn = parseFloat(getColumnValue(row, 'MOTUS', 'Motus', 'motus_return', 'Motus Return') || 0);
          const btcReturn = parseFloat(getColumnValue(row, 'BTC', 'Btc', 'btc_return', 'BTC Return') || 0);
          const ethReturn = parseFloat(getColumnValue(row, 'ETH', 'Eth', 'eth_return', 'ETH Return') || 0);
          const cci30Return = parseFloat(getColumnValue(row, 'CCI30', 'Cci30', 'cci30_return', 'CCI30 Return') || 0);
          const spExMegaReturn = parseFloat(getColumnValue(row, 'S&PexMEGA', 'S&P ex MEGA', 'sp_ex_mega_return', 'S&PexMega', 'SPexMEGA') || 0);
          const spxReturn = parseFloat(getColumnValue(row, 'SPX', 'Spx', 'spx_return', 'SPX Return') || 0);
          const qqqReturn = parseFloat(getColumnValue(row, 'QQQ', 'Qqq', 'qqq_return', 'QQQ Return') || 0);

          stmt.run(parsedMonth,
            isNaN(gpSubs) ? 0 : gpSubs,
            isNaN(lpSubs) ? 0 : lpSubs,
            isNaN(initialValue) ? 0 : initialValue,
            isNaN(endingValue) ? 0 : endingValue,
            isNaN(motusReturn) ? 0 : motusReturn,
            isNaN(btcReturn) ? 0 : btcReturn,
            isNaN(ethReturn) ? 0 : ethReturn,
            isNaN(cci30Return) ? 0 : cci30Return,
            isNaN(spExMegaReturn) ? 0 : spExMegaReturn,
            isNaN(spxReturn) ? 0 : spxReturn,
            isNaN(qqqReturn) ? 0 : qqqReturn
          );
          imported++;
        } catch (rowError) {
          errors.push(`Row ${i + 2}: ${rowError.message}`);
          skipped++;
        }
      }
    });

    insertMany(rawData);

    res.json({
      success: true,
      imported,
      skipped,
      total: rawData.length,
      errors: errors.slice(0, 10)
    });
  } catch (error) {
    console.error('Perf tracker upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload exits from Excel
router.post('/upload/exits', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: null });

    if (rawData.length === 0) {
      return res.status(400).json({ error: 'No data found in the file' });
    }

    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO exits (token, cost_basis)
      VALUES (?, ?)
    `);

    let imported = 0;
    let skipped = 0;
    const errors = [];

    const insertMany = db.transaction((rows) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const token = getColumnValue(row, 'TOKEN', 'Token', 'token', 'SYMBOL', 'Symbol');
          const costBasis = getColumnValue(row, 'COST', 'Cost', 'cost', 'COST BASIS', 'Cost Basis', 'cost_basis');

          if (!token || String(token).trim() === '') {
            skipped++;
            continue;
          }

          const parsedCost = parseFloat(String(costBasis || 0).replace(/[$,]/g, ''));
          if (isNaN(parsedCost)) {
            skipped++;
            continue;
          }

          stmt.run(String(token).toUpperCase().trim(), parsedCost);
          imported++;
        } catch (rowError) {
          errors.push(`Row ${i + 2}: ${rowError.message}`);
          skipped++;
        }
      }
    });

    insertMany(rawData);

    res.json({
      success: true,
      imported,
      skipped,
      total: rawData.length,
      errors: errors.slice(0, 10)
    });
  } catch (error) {
    console.error('Exits upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear all trades (for re-importing)
router.delete('/trades/all', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM trades').run();
    res.json({ success: true, deleted: result.changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all investors (for re-importing)
router.delete('/investors/all', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM investors').run();
    res.json({ success: true, deleted: result.changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get upload statistics
router.get('/upload/stats', (req, res) => {
  try {
    const db = getDb();
    const tradesCount = db.prepare('SELECT COUNT(*) as count FROM trades').get();
    const investorsCount = db.prepare('SELECT COUNT(*) as count FROM investors').get();
    const oldestTrade = db.prepare('SELECT MIN(date) as date FROM trades').get();
    const newestTrade = db.prepare('SELECT MAX(date) as date FROM trades').get();

    res.json({
      trades: tradesCount.count,
      investors: investorsCount.count,
      oldestTrade: oldestTrade.date,
      newestTrade: newestTrade.date
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================
// CHECKER/DEBUG ENDPOINTS
// =====================

// Get detailed breakdown of portfolio calculations
router.get('/checker/portfolio', (req, res) => {
  try {
    const db = getDb();

    // Get detailed holdings with buy/sell/income breakdown
    const holdings = db.prepare(`
      SELECT
        token,
        SUM(CASE WHEN type = 'Buy' THEN units ELSE 0 END) as buy_units,
        SUM(CASE WHEN type = 'Sell' THEN units ELSE 0 END) as sell_units,
        SUM(CASE WHEN type = 'Income' THEN units ELSE 0 END) as income_units,
        SUM(CASE WHEN type = 'Buy' THEN units WHEN type = 'Sell' THEN -units WHEN type = 'Income' THEN units ELSE 0 END) as net_units,
        SUM(CASE WHEN type = 'Buy' THEN total ELSE 0 END) as buy_total,
        SUM(CASE WHEN type = 'Sell' THEN total ELSE 0 END) as sell_total,
        SUM(CASE WHEN type = 'Buy' THEN total WHEN type = 'Sell' THEN -total ELSE 0 END) as cost_basis,
        COUNT(*) as trade_count
      FROM trades
      GROUP BY token
      ORDER BY token
    `).all();

    // Get investor totals
    const investors = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'GP' THEN amount ELSE 0 END), 0) as gp_total,
        COALESCE(SUM(CASE WHEN type = 'LP' THEN amount ELSE 0 END), 0) as lp_total,
        COALESCE(SUM(amount), 0) as total_subscriptions
      FROM investors
    `).get();

    // Get expenses
    const expenses = db.prepare(`
      SELECT
        COALESCE(SUM(fund_expenses), 0) as fund_expenses,
        COALESCE(SUM(mgmt_fees), 0) as mgmt_fees,
        COALESCE(SUM(setup_costs), 0) as setup_costs
      FROM perf_tracker
    `).get();

    const totalExpenses = (expenses.fund_expenses || 0) + (expenses.mgmt_fees || 0) + (expenses.setup_costs || 0);

    // Calculate total cost basis (excluding USDC)
    const totalCostBasis = holdings
      .filter(h => h.token.toUpperCase() !== 'USDC')
      .reduce((sum, h) => sum + (h.cost_basis || 0), 0);

    // Get exits cost basis
    const exitsCostBasis = db.prepare(`
      SELECT COALESCE(SUM(cost_basis), 0) as total FROM exits
    `).get();

    // USDC calculation
    const usdcBalance = (investors.total_subscriptions || 0) - totalCostBasis - totalExpenses - (exitsCostBasis.total || 0);

    res.json({
      holdings,
      investors,
      expenses: {
        fund_expenses: expenses.fund_expenses || 0,
        mgmt_fees: expenses.mgmt_fees || 0,
        setup_costs: expenses.setup_costs || 0,
        total: totalExpenses
      },
      exits_cost_basis: exitsCostBasis.total || 0,
      calculations: {
        total_subscriptions: investors.total_subscriptions || 0,
        total_cost_basis: totalCostBasis,
        total_expenses: totalExpenses,
        exits_cost_basis: exitsCostBasis.total || 0,
        usdc_balance: usdcBalance
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get trades for a specific token
router.get('/checker/token/:token', (req, res) => {
  try {
    const db = getDb();
    const token = req.params.token.toUpperCase();

    const trades = db.prepare(`
      SELECT * FROM trades
      WHERE UPPER(token) = ?
      ORDER BY date ASC, id ASC
    `).all(token);

    const summary = db.prepare(`
      SELECT
        SUM(CASE WHEN type = 'Buy' THEN units ELSE 0 END) as buy_units,
        SUM(CASE WHEN type = 'Sell' THEN units ELSE 0 END) as sell_units,
        SUM(CASE WHEN type = 'Income' THEN units ELSE 0 END) as income_units,
        SUM(CASE WHEN type = 'Buy' THEN units WHEN type = 'Sell' THEN -units WHEN type = 'Income' THEN units ELSE 0 END) as net_units,
        SUM(CASE WHEN type = 'Buy' THEN total ELSE 0 END) as buy_total,
        SUM(CASE WHEN type = 'Sell' THEN total ELSE 0 END) as sell_total,
        SUM(CASE WHEN type = 'Buy' THEN total WHEN type = 'Sell' THEN -total ELSE 0 END) as cost_basis
      FROM trades
      WHERE UPPER(token) = ?
    `).get(token);

    res.json({
      token,
      trades,
      summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
