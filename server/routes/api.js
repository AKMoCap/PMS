const express = require('express');
const router = express.Router();
const axios = require('axios');
const { getDb } = require('../database');

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
    const { date, token, units, avg_price, total, type } = req.body;

    // Calculate missing field
    let finalAvgPrice = avg_price;
    let finalTotal = total;

    if (!avg_price && total && units) {
      finalAvgPrice = total / units;
    } else if (!total && avg_price && units) {
      finalTotal = avg_price * units;
    }

    const stmt = db.prepare(`
      INSERT INTO trades (date, token, units, avg_price, total, type)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(date, token.toUpperCase(), units, finalAvgPrice, finalTotal, type);

    const newTrade = db.prepare('SELECT * FROM trades WHERE id = ?').get(result.lastInsertRowid);
    res.json(newTrade);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/trades/:id', (req, res) => {
  try {
    const db = getDb();
    const { date, token, units, avg_price, total, type } = req.body;

    let finalAvgPrice = avg_price;
    let finalTotal = total;

    if (!avg_price && total && units) {
      finalAvgPrice = total / units;
    } else if (!total && avg_price && units) {
      finalTotal = avg_price * units;
    }

    const stmt = db.prepare(`
      UPDATE trades
      SET date = ?, token = ?, units = ?, avg_price = ?, total = ?, type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(date, token.toUpperCase(), units, finalAvgPrice, finalTotal, type, req.params.id);

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

    // USDC = Total Subscriptions - Cost Basis of Holdings - Total Expenses
    const usdcBalance = (subscriptions.total || 0) - (costBasis.total || 0) - totalExpenses;

    res.json({
      total_subscriptions: subscriptions.total || 0,
      cost_basis: costBasis.total || 0,
      total_expenses: totalExpenses,
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
    const { month, gp_subs, lp_subs, ending_value, fund_expenses, mgmt_fees, setup_costs,
            btc_start, eth_start, spx_start, qqq_start, cci30_start, sp_ex_mega_start } = req.body;

    const stmt = db.prepare(`
      INSERT INTO perf_tracker (month, gp_subs, lp_subs, ending_value, fund_expenses, mgmt_fees, setup_costs,
                                btc_start, eth_start, spx_start, qqq_start, cci30_start, sp_ex_mega_start)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(month) DO UPDATE SET
        gp_subs = excluded.gp_subs,
        lp_subs = excluded.lp_subs,
        ending_value = excluded.ending_value,
        fund_expenses = excluded.fund_expenses,
        mgmt_fees = excluded.mgmt_fees,
        setup_costs = excluded.setup_costs,
        btc_start = excluded.btc_start,
        eth_start = excluded.eth_start,
        spx_start = excluded.spx_start,
        qqq_start = excluded.qqq_start,
        cci30_start = excluded.cci30_start,
        sp_ex_mega_start = excluded.sp_ex_mega_start,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(month, gp_subs || 0, lp_subs || 0, ending_value || 0, fund_expenses || 0,
             mgmt_fees || 0, setup_costs || 0, btc_start || 0, eth_start || 0,
             spx_start || 0, qqq_start || 0, cci30_start || 0, sp_ex_mega_start || 0);

    const record = db.prepare('SELECT * FROM perf_tracker WHERE month = ?').get(month);
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/perf-tracker/:id', (req, res) => {
  try {
    const db = getDb();
    const { month, gp_subs, lp_subs, ending_value, fund_expenses, mgmt_fees, setup_costs,
            btc_start, eth_start, spx_start, qqq_start, cci30_start, sp_ex_mega_start } = req.body;

    const stmt = db.prepare(`
      UPDATE perf_tracker
      SET month = ?, gp_subs = ?, lp_subs = ?, ending_value = ?, fund_expenses = ?,
          mgmt_fees = ?, setup_costs = ?, btc_start = ?, eth_start = ?, spx_start = ?,
          qqq_start = ?, cci30_start = ?, sp_ex_mega_start = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(month, gp_subs || 0, lp_subs || 0, ending_value || 0, fund_expenses || 0,
             mgmt_fees || 0, setup_costs || 0, btc_start || 0, eth_start || 0,
             spx_start || 0, qqq_start || 0, cci30_start || 0, sp_ex_mega_start || 0, req.params.id);

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

module.exports = router;
