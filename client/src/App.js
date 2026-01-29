import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

// API base URL
const API_BASE = '/api';

// Utility functions
const formatCurrency = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '$0.00';
  const num = parseFloat(value);
  if (Math.abs(num) >= 1e9) {
    return '$' + (num / 1e9).toFixed(2) + 'B';
  }
  if (Math.abs(num) >= 1e6) {
    return '$' + (num / 1e6).toFixed(2) + 'M';
  }
  if (Math.abs(num) >= 1000) {
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return '$' + num.toFixed(decimals);
};

const formatPercent = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '0.00%';
  return parseFloat(value).toFixed(2) + '%';
};

const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '0';
  return parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const formatPrice = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '$0.00';
  const num = parseFloat(value);
  if (num < 0.01) return '$' + num.toFixed(6);
  if (num < 1) return '$' + num.toFixed(4);
  if (num < 100) return '$' + num.toFixed(2);
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getPerformanceClass = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '';
  const num = parseFloat(value);
  if (num >= 10) return 'perf-strong-positive';
  if (num > 0) return 'perf-positive';
  if (num === 0) return 'perf-neutral';
  if (num > -10) return 'perf-negative';
  return 'perf-strong-negative';
};

// Format date from YYYY-MM-DD to DD/MM/YY
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y.slice(-2)}`;
  }
  return dateStr;
};

function App() {
  const [activeTab, setActiveTab] = useState('portfolio');
  const [prices, setPrices] = useState({});
  const [trades, setTrades] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [investors, setInvestors] = useState([]);
  const [perfTracker, setPerfTracker] = useState([]);
  const [exits, setExits] = useState([]);
  const [usdcData, setUsdcData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [manualPrices, setManualPrices] = useState([]);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      const [pricesRes, tradesRes, holdingsRes, investorsRes, perfRes, exitsRes, usdcRes, manualRes] = await Promise.all([
        axios.get(`${API_BASE}/prices`).catch(() => ({ data: {} })),
        axios.get(`${API_BASE}/trades`),
        axios.get(`${API_BASE}/portfolio`),
        axios.get(`${API_BASE}/investors`),
        axios.get(`${API_BASE}/perf-tracker`),
        axios.get(`${API_BASE}/exits`),
        axios.get(`${API_BASE}/portfolio/usdc`),
        axios.get(`${API_BASE}/manual-prices`).catch(() => ({ data: [] }))
      ]);

      setPrices(pricesRes.data || {});
      setTrades(tradesRes.data || []);
      setHoldings(holdingsRes.data || []);
      setInvestors(investorsRes.data || []);
      setPerfTracker(perfRes.data || []);
      setExits(exitsRes.data || []);
      setUsdcData(usdcRes.data || null);
      setManualPrices(manualRes.data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Refresh prices every minute
    const interval = setInterval(() => {
      axios.get(`${API_BASE}/prices`)
        .then(res => setPrices(res.data || {}))
        .catch(console.error);
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchData]);

  // Build merged prices (CMC + manual)
  const mergedPrices = useMemo(() => {
    const merged = { ...prices };
    (manualPrices || []).forEach(mp => {
      if (!merged[mp.token] || !merged[mp.token].price) {
        merged[mp.token] = {
          price: mp.price,
          isManual: true,
          percent_change_24h: null,
          percent_change_7d: null,
          percent_change_30d: null,
          percent_change_60d: null
        };
      }
    });
    return merged;
  }, [prices, manualPrices]);

  // Calculate portfolio value
  const calculatePortfolioValue = () => {
    let totalValue = 0;
    holdings.forEach(holding => {
      const token = holding.token.toUpperCase();
      const price = mergedPrices[token]?.price || 0;
      totalValue += holding.total_units * price;
    });
    // Add USDC balance
    if (usdcData) {
      totalValue += usdcData.usdc_balance;
    }
    return totalValue;
  };

  // Calculate MTD and YTD returns
  const calculateReturns = () => {
    const totalValue = calculatePortfolioValue();
    const sortedPerf = [...perfTracker].sort((a, b) => a.month.localeCompare(b.month));

    // Get beginning of month value
    const currentMonth = new Date().toISOString().slice(0, 7);
    const lastMonthRecord = sortedPerf.filter(p => p.month < currentMonth).pop();
    const beginningValue = lastMonthRecord?.ending_value || (usdcData?.total_subscriptions || 0);

    // Get beginning of year value
    const currentYear = new Date().getFullYear();
    const lastYearEnd = sortedPerf.filter(p => p.month.startsWith(String(currentYear - 1))).pop();
    const yearStartValue = lastYearEnd?.ending_value || beginningValue;

    const mtd = beginningValue > 0 ? ((totalValue / beginningValue) - 1) * 100 : 0;
    const ytd = yearStartValue > 0 ? ((totalValue / yearStartValue) - 1) * 100 : 0;

    // Calculate since inception
    const firstRecord = sortedPerf[0];
    const initialValue = firstRecord ? (firstRecord.gp_subs + firstRecord.lp_subs) : (usdcData?.total_subscriptions || 0);
    const sinceInception = initialValue > 0 ? ((totalValue / initialValue) - 1) * 100 : 0;

    return { mtd, ytd, sinceInception };
  };

  const portfolioValue = calculatePortfolioValue();
  const returns = calculateReturns();

  const tabs = [
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'trades', label: 'Trades' },
    { id: 'perf-tracker', label: 'Perf Tracker' },
    { id: 'investors', label: 'Investors' },
    { id: 'exits', label: 'Exits' },
    { id: 'sector-watch', label: 'SectorWatch' },
    { id: 'upload', label: 'Upload' },
    { id: 'checker', label: 'Checker' }
  ];

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-logo">
          <h1>MOTUS</h1>
        </div>
        <div className="header-stats">
          <div className="header-stat">
            <div className="header-stat-value">{formatCurrency(portfolioValue, 0)}</div>
            <div className="header-stat-label">Portfolio Value</div>
          </div>
          <div className="header-stat">
            <div className={`header-stat-value ${returns.mtd >= 0 ? 'positive' : 'negative'}`}>
              {formatPercent(returns.mtd)}
            </div>
            <div className="header-stat-label">MTD</div>
          </div>
          <div className="header-stat">
            <div className={`header-stat-value ${returns.ytd >= 0 ? 'positive' : 'negative'}`}>
              {formatPercent(returns.ytd)}
            </div>
            <div className="header-stat-label">YTD</div>
          </div>
          <div className="header-stat">
            <div className={`header-stat-value ${returns.sinceInception >= 0 ? 'positive' : 'negative'}`}>
              {formatPercent(returns.sinceInception)}
            </div>
            <div className="header-stat-label">SI</div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="nav-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <>
            {activeTab === 'portfolio' && (
              <PortfolioTab
                holdings={holdings}
                prices={mergedPrices}
                cmcPrices={prices}
                usdcData={usdcData}
                portfolioValue={portfolioValue}
                onRefresh={fetchData}
              />
            )}
            {activeTab === 'trades' && (
              <TradesTab
                trades={trades}
                onRefresh={fetchData}
              />
            )}
            {activeTab === 'perf-tracker' && (
              <PerfTrackerTab
                perfTracker={perfTracker}
                investors={investors}
                onRefresh={fetchData}
              />
            )}
            {activeTab === 'investors' && (
              <InvestorsTab
                investors={investors}
                onRefresh={fetchData}
              />
            )}
            {activeTab === 'exits' && (
              <ExitsTab
                exits={exits}
                onRefresh={fetchData}
              />
            )}
            {activeTab === 'sector-watch' && (
              <SectorWatchTab
                prices={mergedPrices}
                onRefresh={fetchData}
              />
            )}
            {activeTab === 'upload' && (
              <UploadTab
                onRefresh={fetchData}
              />
            )}
            {activeTab === 'checker' && (
              <CheckerTab
                prices={mergedPrices}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ============================================================
// Portfolio Tab Component
// - Manual price entry for unpriced tokens
// - Show "-" for performance columns without CMC data
// - Small Balances toggle (hide <$1,000 by default)
// - Sortable columns
// ============================================================
function PortfolioTab({ holdings, prices, cmcPrices, usdcData, portfolioValue, onRefresh }) {
  const [showSmallBalances, setShowSmallBalances] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'weight', direction: 'desc' });
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [priceModalToken, setPriceModalToken] = useState('');
  const [priceModalValue, setPriceModalValue] = useState('');

  // Prepare holdings with current values
  const enrichedHoldings = useMemo(() => {
    const items = holdings
      .filter(h => h.token.toUpperCase() !== 'USDC')
      .map(holding => {
        const token = holding.token.toUpperCase();
        const priceData = prices[token] || {};
        const currentPrice = priceData.price || 0;
        const currentValue = holding.total_units * currentPrice;
        const pnl = currentValue - holding.cost_basis;
        const weight = portfolioValue > 0 ? (currentValue / portfolioValue) * 100 : 0;
        const hasCMCData = !!(cmcPrices[token]?.price);

        return {
          ...holding,
          currentPrice,
          currentValue,
          pnl,
          weight,
          hasCMCData,
          isManualPrice: priceData.isManual || false,
          percent_change_24h: priceData.percent_change_24h,
          percent_change_7d: priceData.percent_change_7d,
          percent_change_30d: priceData.percent_change_30d,
          percent_change_60d: priceData.percent_change_60d
        };
      });

    // Add USDC
    if (usdcData && usdcData.usdc_balance !== 0) {
      const usdcWeight = portfolioValue > 0 ? (usdcData.usdc_balance / portfolioValue) * 100 : 0;
      items.push({
        token: 'USDC',
        total_units: usdcData.usdc_balance,
        cost_basis: usdcData.usdc_balance,
        currentPrice: 1,
        currentValue: usdcData.usdc_balance,
        pnl: 0,
        weight: usdcWeight,
        hasCMCData: true,
        isManualPrice: false,
        percent_change_24h: 0,
        percent_change_7d: 0,
        percent_change_30d: 0,
        percent_change_60d: 0
      });
    }

    return items;
  }, [holdings, prices, cmcPrices, usdcData, portfolioValue]);

  // Filter small balances
  const filteredHoldings = useMemo(() => {
    if (showSmallBalances) return enrichedHoldings;
    return enrichedHoldings.filter(h => Math.abs(h.currentValue) >= 1000);
  }, [enrichedHoldings, showSmallBalances]);

  // Sort holdings
  const sortedHoldings = useMemo(() => {
    const sorted = [...filteredHoldings];
    const { key, direction } = sortConfig;
    const multiplier = direction === 'desc' ? -1 : 1;

    sorted.sort((a, b) => {
      let aVal, bVal;
      switch (key) {
        case 'token':
          return multiplier * a.token.localeCompare(b.token);
        case 'currentPrice':
          aVal = a.currentPrice || 0;
          bVal = b.currentPrice || 0;
          break;
        case 'currentValue':
          aVal = a.currentValue || 0;
          bVal = b.currentValue || 0;
          break;
        case 'weight':
          aVal = a.weight || 0;
          bVal = b.weight || 0;
          break;
        case 'percent_change_24h':
          aVal = a.percent_change_24h || 0;
          bVal = b.percent_change_24h || 0;
          break;
        case 'percent_change_7d':
          aVal = a.percent_change_7d || 0;
          bVal = b.percent_change_7d || 0;
          break;
        case 'percent_change_30d':
          aVal = a.percent_change_30d || 0;
          bVal = b.percent_change_30d || 0;
          break;
        case 'percent_change_60d':
          aVal = a.percent_change_60d || 0;
          bVal = b.percent_change_60d || 0;
          break;
        case 'pnl':
          aVal = a.pnl || 0;
          bVal = b.pnl || 0;
          break;
        case 'cost_basis':
          aVal = a.cost_basis || 0;
          bVal = b.cost_basis || 0;
          break;
        case 'total_units':
          aVal = a.total_units || 0;
          bVal = b.total_units || 0;
          break;
        default:
          aVal = a.weight || 0;
          bVal = b.weight || 0;
      }
      return multiplier * (aVal - bVal);
    });

    return sorted;
  }, [filteredHoldings, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'desc' ? 'asc' : 'desc' };
      }
      return { key, direction: 'desc' };
    });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return '';
    return sortConfig.direction === 'desc' ? ' \u25BC' : ' \u25B2';
  };

  const handleSetManualPrice = async () => {
    if (!priceModalToken || !priceModalValue) return;
    try {
      await axios.post(`${API_BASE}/manual-prices`, {
        token: priceModalToken,
        price: parseFloat(priceModalValue)
      });
      setShowPriceModal(false);
      setPriceModalToken('');
      setPriceModalValue('');
      onRefresh();
    } catch (error) {
      console.error('Error setting manual price:', error);
      alert('Error setting manual price');
    }
  };

  const openPriceModal = (token) => {
    setPriceModalToken(token);
    setPriceModalValue('');
    setShowPriceModal(true);
  };

  // Calculate totals
  const totalCostBasis = enrichedHoldings.reduce((sum, h) => sum + (h.cost_basis || 0), 0);
  const totalPnl = enrichedHoldings.reduce((sum, h) => sum + (h.pnl || 0), 0);

  const renderPerfCell = (holding, field) => {
    if (!holding.hasCMCData || holding.token === 'USDC') {
      if (holding.token === 'USDC') {
        return <span className="perf-cell">-</span>;
      }
      return <span className="perf-cell" style={{ color: 'var(--text-muted)' }}>-</span>;
    }
    const val = holding[field];
    if (val === null || val === undefined) {
      return <span className="perf-cell" style={{ color: 'var(--text-muted)' }}>-</span>;
    }
    return (
      <span className={`perf-cell ${getPerformanceClass(val)}`}>
        {formatPercent(val)}
      </span>
    );
  };

  return (
    <div>
      {/* Summary Cards */}
      <div className="portfolio-summary">
        <div className="summary-card">
          <div className="summary-card-value">{formatCurrency(portfolioValue, 0)}</div>
          <div className="summary-card-label">Total Value</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-value">{formatCurrency(totalCostBasis, 0)}</div>
          <div className="summary-card-label">Cost Basis</div>
        </div>
        <div className="summary-card">
          <div className={`summary-card-value ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(totalPnl, 0)}
          </div>
          <div className="summary-card-label">Total P&L</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-value">{enrichedHoldings.length}</div>
          <div className="summary-card-label">Holdings</div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Holdings</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showSmallBalances}
                onChange={(e) => setShowSmallBalances(e.target.checked)}
              />
              <span className="toggle-text">Small Balances</span>
            </label>
            <button className="btn btn-secondary btn-sm" onClick={onRefresh}>
              Refresh
            </button>
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th className="sortable-header" onClick={() => handleSort('token')}>
                  Token{getSortIndicator('token')}
                </th>
                <th className="right sortable-header" onClick={() => handleSort('currentPrice')}>
                  Price{getSortIndicator('currentPrice')}
                </th>
                <th className="right sortable-header" onClick={() => handleSort('currentValue')}>
                  Value{getSortIndicator('currentValue')}
                </th>
                <th className="right sortable-header" onClick={() => handleSort('weight')}>
                  Weight{getSortIndicator('weight')}
                </th>
                <th className="right sortable-header" onClick={() => handleSort('percent_change_24h')}>
                  24Hr{getSortIndicator('percent_change_24h')}
                </th>
                <th className="right">MTD</th>
                <th className="right">YTD</th>
                <th className="right sortable-header" onClick={() => handleSort('percent_change_7d')}>
                  7D%{getSortIndicator('percent_change_7d')}
                </th>
                <th className="right sortable-header" onClick={() => handleSort('percent_change_30d')}>
                  30D%{getSortIndicator('percent_change_30d')}
                </th>
                <th className="right sortable-header" onClick={() => handleSort('percent_change_60d')}>
                  60D%{getSortIndicator('percent_change_60d')}
                </th>
                <th className="right sortable-header" onClick={() => handleSort('pnl')}>
                  P&L{getSortIndicator('pnl')}
                </th>
                <th className="right sortable-header" onClick={() => handleSort('cost_basis')}>
                  Cost Basis{getSortIndicator('cost_basis')}
                </th>
                <th className="right sortable-header" onClick={() => handleSort('total_units')}>
                  Units{getSortIndicator('total_units')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map((holding, idx) => (
                <tr key={idx}>
                  <td className="token-name">
                    {holding.token}
                    {holding.currentPrice === 0 && holding.token !== 'USDC' && (
                      <button
                        className="btn-set-price"
                        onClick={() => openPriceModal(holding.token)}
                        title="Set manual price"
                      >
                        Set Price
                      </button>
                    )}
                    {holding.isManualPrice && (
                      <button
                        className="btn-set-price"
                        onClick={() => openPriceModal(holding.token)}
                        title="Update manual price"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                  <td className="right">{formatPrice(holding.currentPrice)}</td>
                  <td className="right">{formatCurrency(holding.currentValue)}</td>
                  <td className="right">
                    <div className="weight-bar-container">
                      <div className="weight-bar">
                        <div
                          className="weight-bar-fill"
                          style={{ width: `${Math.min(holding.weight, 100)}%` }}
                        />
                      </div>
                      <div className="weight-value">{formatPercent(holding.weight)}</div>
                    </div>
                  </td>
                  <td className="right">{renderPerfCell(holding, 'percent_change_24h')}</td>
                  <td className="right"><span className="perf-cell" style={{ color: 'var(--text-muted)' }}>-</span></td>
                  <td className="right"><span className="perf-cell" style={{ color: 'var(--text-muted)' }}>-</span></td>
                  <td className="right">{renderPerfCell(holding, 'percent_change_7d')}</td>
                  <td className="right">{renderPerfCell(holding, 'percent_change_30d')}</td>
                  <td className="right">{renderPerfCell(holding, 'percent_change_60d')}</td>
                  <td className={`right ${holding.pnl >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(holding.pnl)}
                  </td>
                  <td className="right">{formatCurrency(holding.cost_basis)}</td>
                  <td className="right">{formatNumber(holding.total_units, holding.total_units < 1 ? 6 : 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Price Modal */}
      {showPriceModal && (
        <div className="modal-overlay" onClick={() => setShowPriceModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Set Manual Price</span>
              <button className="modal-close" onClick={() => setShowPriceModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Token</label>
                <input
                  type="text"
                  className="form-input"
                  value={priceModalToken}
                  readOnly
                  style={{ background: 'var(--border-dark)' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Price (USD) *</label>
                <input
                  type="number"
                  step="any"
                  className="form-input"
                  value={priceModalValue}
                  onChange={(e) => setPriceModalValue(e.target.value)}
                  placeholder="Enter current price"
                  autoFocus
                />
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                This price will be used when CoinMarketCap doesn't have data for this token.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowPriceModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSetManualPrice}
                disabled={!priceModalValue}
              >
                Save Price
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Trades Tab Component
// - Notes column
// - Date/Token/Type filters
// - CSV export
// - Compact rows (20% thinner)
// ============================================================
function TradesTab({ trades, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    token: '',
    units: '',
    avg_price: '',
    total: '',
    type: 'Buy',
    notes: ''
  });
  const [dateFilter, setDateFilter] = useState('');
  const [tokenFilter, setTokenFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Filter trades
  const filteredTrades = useMemo(() => {
    return trades.filter(trade => {
      if (dateFilter) {
        const displayDate = formatDate(trade.date);
        if (!trade.date.includes(dateFilter) && !displayDate.includes(dateFilter)) return false;
      }
      if (tokenFilter && !trade.token.toLowerCase().includes(tokenFilter.toLowerCase())) return false;
      if (typeFilter && trade.type !== typeFilter) return false;
      return true;
    });
  }, [trades, dateFilter, tokenFilter, typeFilter]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        units: parseFloat(formData.units),
        avg_price: formData.avg_price ? parseFloat(formData.avg_price) : null,
        total: formData.total ? parseFloat(formData.total) : null
      };

      if (editingTrade) {
        await axios.put(`${API_BASE}/trades/${editingTrade.id}`, data);
      } else {
        await axios.post(`${API_BASE}/trades`, data);
      }

      setShowModal(false);
      setEditingTrade(null);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        token: '',
        units: '',
        avg_price: '',
        total: '',
        type: 'Buy',
        notes: ''
      });
      onRefresh();
    } catch (error) {
      console.error('Error saving trade:', error);
      alert('Error saving trade');
    }
  };

  const handleEdit = (trade) => {
    setEditingTrade(trade);
    setFormData({
      date: trade.date,
      token: trade.token,
      units: trade.units.toString(),
      avg_price: trade.avg_price?.toString() || '',
      total: trade.total?.toString() || '',
      type: trade.type,
      notes: trade.notes || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this trade?')) {
      try {
        await axios.delete(`${API_BASE}/trades/${id}`);
        onRefresh();
      } catch (error) {
        console.error('Error deleting trade:', error);
        alert('Error deleting trade');
      }
    }
  };

  const handleExportCSV = () => {
    window.location.href = `${API_BASE}/trades/export/csv`;
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Trade History ({filteredTrades.length})</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
              Export CSV
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingTrade(null);
                setFormData({
                  date: new Date().toISOString().split('T')[0],
                  token: '',
                  units: '',
                  avg_price: '',
                  total: '',
                  type: 'Buy',
                  notes: ''
                });
                setShowModal(true);
              }}
            >
              + Enter Trade
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="filter-bar">
          <div className="filter-group">
            <label className="filter-label">Date</label>
            <input
              type="text"
              className="filter-input"
              placeholder="e.g. 01/06/22"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label className="filter-label">Token</label>
            <input
              type="text"
              className="filter-input"
              placeholder="e.g. BTC"
              value={tokenFilter}
              onChange={(e) => setTokenFilter(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label className="filter-label">Type</label>
            <select
              className="filter-input"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="Buy">Buy</option>
              <option value="Sell">Sell</option>
              <option value="Income">Income</option>
            </select>
          </div>
        </div>

        <div className="table-container">
          <table className="compact-table" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '21%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Date</th>
                <th>Token</th>
                <th className="right">Units</th>
                <th className="right">Avg Price</th>
                <th className="right">Total</th>
                <th>Type</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan="8" className="empty-state">
                    <div className="empty-state-title">No trades found</div>
                    <div>{trades.length > 0 ? 'Try adjusting your filters' : 'Click "Enter Trade" to add your first trade'}</div>
                  </td>
                </tr>
              ) : (
                filteredTrades.map(trade => (
                  <tr key={trade.id}>
                    <td>{formatDate(trade.date)}</td>
                    <td className="token-name">{trade.token}</td>
                    <td className="right">{formatNumber(trade.units, 4)}</td>
                    <td className="right">{formatPrice(trade.avg_price)}</td>
                    <td className="right">{formatCurrency(trade.total)}</td>
                    <td>
                      <span className={`badge badge-${trade.type.toLowerCase()}`}>
                        {trade.type}
                      </span>
                    </td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {trade.notes || ''}
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          className="btn btn-icon btn-sm"
                          onClick={() => handleEdit(trade)}
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-icon btn-sm"
                          onClick={() => handleDelete(trade.id)}
                          title="Delete"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trade Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                {editingTrade ? 'Edit Trade' : 'Enter New Trade'}
              </span>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Date *</label>
                    <input
                      type="date"
                      className="form-input"
                      value={formData.date}
                      onChange={e => setFormData({ ...formData, date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type *</label>
                    <select
                      className="form-select"
                      value={formData.type}
                      onChange={e => setFormData({ ...formData, type: e.target.value })}
                      required
                    >
                      <option value="Buy">Buy</option>
                      <option value="Sell">Sell</option>
                      <option value="Income">Income</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Token *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.token}
                    onChange={e => setFormData({ ...formData, token: e.target.value.toUpperCase() })}
                    placeholder="e.g., BTC, ETH, SOL"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Units *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    value={formData.units}
                    onChange={e => setFormData({ ...formData, units: e.target.value })}
                    placeholder="Number of units"
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Avg Price</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      value={formData.avg_price}
                      onChange={e => setFormData({ ...formData, avg_price: e.target.value })}
                      placeholder="Price per unit"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Total</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      value={formData.total}
                      onChange={e => setFormData({ ...formData, total: e.target.value })}
                      placeholder="Total value"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Optional notes"
                  />
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Enter either Avg Price or Total - the other will be calculated automatically.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingTrade ? 'Update Trade' : 'Add Trade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Perf Tracker Tab Component
// - Display uploaded historical data with all return columns
// - Columns: MONTH, GP SUBS, LP SUBS, INITIAL VALUE, END/LIVE VALUE,
//            MOTUS, BTC, ETH, CCI30, S&PexMEGA, SPX, QQQ
// ============================================================
function PerfTrackerTab({ perfTracker, investors, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [formData, setFormData] = useState({
    month: '',
    gp_subs: '',
    lp_subs: '',
    initial_value: '',
    ending_value: '',
    motus_return: '',
    btc_return: '',
    eth_return: '',
    cci30_return: '',
    sp_ex_mega_return: '',
    spx_return: '',
    qqq_return: '',
    fund_expenses: '',
    mgmt_fees: '',
    setup_costs: ''
  });

  const sortedData = useMemo(() => {
    return [...perfTracker].sort((a, b) => b.month.localeCompare(a.month));
  }, [perfTracker]);

  // Current month placeholder
  const currentMonth = new Date().toISOString().slice(0, 7);
  const hasCurrentMonth = perfTracker.some(r => r.month === currentMonth);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        month: formData.month,
        gp_subs: parseFloat(formData.gp_subs) || 0,
        lp_subs: parseFloat(formData.lp_subs) || 0,
        initial_value: parseFloat(formData.initial_value) || 0,
        ending_value: parseFloat(formData.ending_value) || 0,
        motus_return: parseFloat(formData.motus_return) || 0,
        btc_return: parseFloat(formData.btc_return) || 0,
        eth_return: parseFloat(formData.eth_return) || 0,
        cci30_return: parseFloat(formData.cci30_return) || 0,
        sp_ex_mega_return: parseFloat(formData.sp_ex_mega_return) || 0,
        spx_return: parseFloat(formData.spx_return) || 0,
        qqq_return: parseFloat(formData.qqq_return) || 0,
        fund_expenses: parseFloat(formData.fund_expenses) || 0,
        mgmt_fees: parseFloat(formData.mgmt_fees) || 0,
        setup_costs: parseFloat(formData.setup_costs) || 0
      };

      if (editingRecord) {
        await axios.put(`${API_BASE}/perf-tracker/${editingRecord.id}`, data);
      } else {
        await axios.post(`${API_BASE}/perf-tracker`, data);
      }

      setShowModal(false);
      setEditingRecord(null);
      setFormData({
        month: '',
        gp_subs: '',
        lp_subs: '',
        initial_value: '',
        ending_value: '',
        motus_return: '',
        btc_return: '',
        eth_return: '',
        cci30_return: '',
        sp_ex_mega_return: '',
        spx_return: '',
        qqq_return: '',
        fund_expenses: '',
        mgmt_fees: '',
        setup_costs: ''
      });
      onRefresh();
    } catch (error) {
      console.error('Error saving record:', error);
      alert('Error saving record');
    }
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setFormData({
      month: record.month,
      gp_subs: record.gp_subs?.toString() || '',
      lp_subs: record.lp_subs?.toString() || '',
      initial_value: record.initial_value?.toString() || '',
      ending_value: record.ending_value?.toString() || '',
      motus_return: record.motus_return?.toString() || '',
      btc_return: record.btc_return?.toString() || '',
      eth_return: record.eth_return?.toString() || '',
      cci30_return: record.cci30_return?.toString() || '',
      sp_ex_mega_return: record.sp_ex_mega_return?.toString() || '',
      spx_return: record.spx_return?.toString() || '',
      qqq_return: record.qqq_return?.toString() || '',
      fund_expenses: record.fund_expenses?.toString() || '',
      mgmt_fees: record.mgmt_fees?.toString() || '',
      setup_costs: record.setup_costs?.toString() || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this record?')) {
      try {
        await axios.delete(`${API_BASE}/perf-tracker/${id}`);
        onRefresh();
      } catch (error) {
        console.error('Error deleting record:', error);
      }
    }
  };

  // Format month display: "2022-06" -> "Jun-22"
  const formatMonth = (monthStr) => {
    if (!monthStr) return '-';
    const parts = monthStr.split('-');
    if (parts.length === 2) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIdx = parseInt(parts[1]) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${monthNames[monthIdx]}-${parts[0].slice(-2)}`;
      }
    }
    return monthStr;
  };

  const renderReturnCell = (value) => {
    if (value === null || value === undefined || value === 0) {
      return <span className="perf-cell" style={{ color: 'var(--text-muted)' }}>-</span>;
    }
    return (
      <span className={`perf-cell ${getPerformanceClass(value)}`}>
        {formatPercent(value)}
      </span>
    );
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Monthly Performance Tracker</span>
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingRecord(null);
              setFormData({
                month: new Date().toISOString().slice(0, 7),
                gp_subs: '',
                lp_subs: '',
                initial_value: '',
                ending_value: '',
                motus_return: '',
                btc_return: '',
                eth_return: '',
                cci30_return: '',
                sp_ex_mega_return: '',
                spx_return: '',
                qqq_return: '',
                fund_expenses: '',
                mgmt_fees: '',
                setup_costs: ''
              });
              setShowModal(true);
            }}
          >
            + Add Month
          </button>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="right">GP Subs</th>
                <th className="right">LP Subs</th>
                <th className="right">Fund Exp</th>
                <th className="right">Mgmt Fees</th>
                <th className="right">Initial Value</th>
                <th className="right">End/Live Value</th>
                <th className="right">Motus</th>
                <th className="right">BTC</th>
                <th className="right">ETH</th>
                <th className="right">CCI30</th>
                <th className="right">S&PexMEGA</th>
                <th className="right">SPX</th>
                <th className="right">QQQ</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!hasCurrentMonth && (
                <tr style={{ background: 'rgba(58, 180, 239, 0.05)', borderLeft: '3px solid var(--primary-blue)' }}>
                  <td style={{ fontWeight: '600', color: 'var(--text-blue)' }}>{formatMonth(currentMonth)}</td>
                  <td className="right" style={{ color: 'var(--text-muted)' }}>-</td>
                  <td className="right" style={{ color: 'var(--text-muted)' }}>-</td>
                  <td className="right" style={{ color: 'var(--text-muted)' }}>-</td>
                  <td className="right" style={{ color: 'var(--text-muted)' }}>-</td>
                  <td className="right" style={{ color: 'var(--text-muted)' }}>-</td>
                  <td className="right" style={{ color: 'var(--text-muted)' }}>-</td>
                  <td className="right" style={{ color: 'var(--text-muted)' }}>-</td>
                  <td className="right" style={{ color: 'var(--text-muted)' }}>-</td>
                  <td className="right" style={{ color: 'var(--text-muted)' }}>-</td>
                  <td className="right" style={{ color: 'var(--text-muted)' }}>-</td>
                  <td className="right" style={{ color: 'var(--text-muted)' }}>-</td>
                  <td className="right" style={{ color: 'var(--text-muted)' }}>-</td>
                  <td className="right" style={{ color: 'var(--text-muted)' }}>-</td>
                  <td>
                    <div className="actions">
                      <button
                        className="btn btn-icon btn-sm"
                        style={{ color: 'var(--text-blue)' }}
                        onClick={() => {
                          setEditingRecord(null);
                          setFormData({
                            month: currentMonth,
                            gp_subs: '',
                            lp_subs: '',
                            initial_value: '',
                            ending_value: '',
                            motus_return: '',
                            btc_return: '',
                            eth_return: '',
                            cci30_return: '',
                            sp_ex_mega_return: '',
                            spx_return: '',
                            qqq_return: '',
                            fund_expenses: '',
                            mgmt_fees: '',
                            setup_costs: ''
                          });
                          setShowModal(true);
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {sortedData.length === 0 && hasCurrentMonth === false ? null : sortedData.length === 0 ? (
                <tr>
                  <td colSpan="15" className="empty-state">
                    <div className="empty-state-title">No performance records</div>
                    <div>Upload data via the Upload tab or click "Add Month" to start tracking</div>
                  </td>
                </tr>
              ) : (
                sortedData.map(record => (
                  <tr key={record.id}>
                    <td style={{ fontWeight: '600' }}>{formatMonth(record.month)}</td>
                    <td className="right">{record.gp_subs ? formatCurrency(record.gp_subs, 0) : '-'}</td>
                    <td className="right">{record.lp_subs ? formatCurrency(record.lp_subs, 0) : '-'}</td>
                    <td className="right">{record.fund_expenses ? formatCurrency(record.fund_expenses, 0) : '-'}</td>
                    <td className="right">{record.mgmt_fees ? formatCurrency(record.mgmt_fees, 0) : '-'}</td>
                    <td className="right">{record.initial_value ? formatCurrency(record.initial_value, 0) : '-'}</td>
                    <td className="right">{record.ending_value ? formatCurrency(record.ending_value, 0) : '-'}</td>
                    <td className="right">{renderReturnCell(record.motus_return)}</td>
                    <td className="right">{renderReturnCell(record.btc_return)}</td>
                    <td className="right">{renderReturnCell(record.eth_return)}</td>
                    <td className="right">{renderReturnCell(record.cci30_return)}</td>
                    <td className="right">{renderReturnCell(record.sp_ex_mega_return)}</td>
                    <td className="right">{renderReturnCell(record.spx_return)}</td>
                    <td className="right">{renderReturnCell(record.qqq_return)}</td>
                    <td>
                      <div className="actions">
                        <button
                          className="btn btn-icon btn-sm"
                          onClick={() => handleEdit(record)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-icon btn-sm"
                          onClick={() => handleDelete(record.id)}
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Perf Tracker Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                {editingRecord ? 'Edit Performance Record' : 'Add Performance Record'}
              </span>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Month *</label>
                  <input
                    type="month"
                    className="form-input"
                    value={formData.month}
                    onChange={e => setFormData({ ...formData, month: e.target.value })}
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">GP Subs</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      value={formData.gp_subs}
                      onChange={e => setFormData({ ...formData, gp_subs: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">LP Subs</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      value={formData.lp_subs}
                      onChange={e => setFormData({ ...formData, lp_subs: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Fund Exp</label>
                    <input type="number" step="any" className="form-input" value={formData.fund_expenses}
                      onChange={e => setFormData({ ...formData, fund_expenses: e.target.value })} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Mgmt Fees</label>
                    <input type="number" step="any" className="form-input" value={formData.mgmt_fees}
                      onChange={e => setFormData({ ...formData, mgmt_fees: e.target.value })} placeholder="0" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Initial Value</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      value={formData.initial_value}
                      onChange={e => setFormData({ ...formData, initial_value: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ending Value *</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      value={formData.ending_value}
                      onChange={e => setFormData({ ...formData, ending_value: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-blue)', marginBottom: '12px', fontWeight: '600' }}>
                  Returns (%)
                </p>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Motus</label>
                    <input type="number" step="any" className="form-input" value={formData.motus_return}
                      onChange={e => setFormData({ ...formData, motus_return: e.target.value })} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">BTC</label>
                    <input type="number" step="any" className="form-input" value={formData.btc_return}
                      onChange={e => setFormData({ ...formData, btc_return: e.target.value })} placeholder="0" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">ETH</label>
                    <input type="number" step="any" className="form-input" value={formData.eth_return}
                      onChange={e => setFormData({ ...formData, eth_return: e.target.value })} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">CCI30</label>
                    <input type="number" step="any" className="form-input" value={formData.cci30_return}
                      onChange={e => setFormData({ ...formData, cci30_return: e.target.value })} placeholder="0" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">S&PexMEGA</label>
                    <input type="number" step="any" className="form-input" value={formData.sp_ex_mega_return}
                      onChange={e => setFormData({ ...formData, sp_ex_mega_return: e.target.value })} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">SPX</label>
                    <input type="number" step="any" className="form-input" value={formData.spx_return}
                      onChange={e => setFormData({ ...formData, spx_return: e.target.value })} placeholder="0" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">QQQ</label>
                  <input type="number" step="any" className="form-input" value={formData.qqq_return}
                    onChange={e => setFormData({ ...formData, qqq_return: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingRecord ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Investors Tab Component (unchanged)
// ============================================================
function InvestorsTab({ investors, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState(null);
  const [formData, setFormData] = useState({
    month: '',
    client: '',
    type: 'LP',
    amount: ''
  });

  // Calculate totals
  const gpTotal = investors.filter(i => i.type === 'GP').reduce((sum, i) => sum + i.amount, 0);
  const lpTotal = investors.filter(i => i.type === 'LP').reduce((sum, i) => sum + i.amount, 0);
  const totalAll = gpTotal + lpTotal;

  // Subscriptions only (positive amounts)
  const gpSubscriptions = investors.filter(i => i.type === 'GP' && i.amount > 0).reduce((sum, i) => sum + i.amount, 0);
  const lpSubscriptions = investors.filter(i => i.type === 'LP' && i.amount > 0).reduce((sum, i) => sum + i.amount, 0);
  const totalSubscriptions = gpSubscriptions + lpSubscriptions;
  const gpSubsPct = totalSubscriptions > 0 ? (gpSubscriptions / totalSubscriptions * 100).toFixed(1) : '0.0';
  const lpSubsPct = totalSubscriptions > 0 ? (lpSubscriptions / totalSubscriptions * 100).toFixed(1) : '0.0';

  // Redemptions only (negative amounts)
  const gpRedemptions = investors.filter(i => i.type === 'GP' && i.amount < 0).reduce((sum, i) => sum + i.amount, 0);
  const lpRedemptions = investors.filter(i => i.type === 'LP' && i.amount < 0).reduce((sum, i) => sum + i.amount, 0);
  const totalRedemptions = gpRedemptions + lpRedemptions;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        amount: parseFloat(formData.amount)
      };

      if (editingInvestor) {
        await axios.put(`${API_BASE}/investors/${editingInvestor.id}`, data);
      } else {
        await axios.post(`${API_BASE}/investors`, data);
      }

      setShowModal(false);
      setEditingInvestor(null);
      setFormData({
        month: '',
        client: '',
        type: 'LP',
        amount: ''
      });
      onRefresh();
    } catch (error) {
      console.error('Error saving investor:', error);
      alert('Error saving investor');
    }
  };

  const handleEdit = (investor) => {
    setEditingInvestor(investor);
    setFormData({
      month: investor.month,
      client: investor.client,
      type: investor.type,
      amount: investor.amount.toString()
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this investor record?')) {
      try {
        await axios.delete(`${API_BASE}/investors/${id}`);
        onRefresh();
      } catch (error) {
        console.error('Error deleting investor:', error);
      }
    }
  };

  return (
    <div>
      {/* Summary Cards */}
      <div className="portfolio-summary">
        <div className="summary-card">
          <div className="summary-card-value">{formatCurrency(totalAll, 0)}</div>
          <div className="summary-card-label">Net Subscriptions</div>
        </div>
        <div className="summary-card">
          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
            <div>
              <div className="summary-card-value" style={{ color: 'var(--warning)', fontSize: '22px' }}>
                {formatCurrency(gpSubscriptions, 0)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                GP Subscriptions ({gpSubsPct}%)
              </div>
            </div>
            <div>
              <div className="summary-card-value" style={{ fontSize: '22px' }}>
                {formatCurrency(lpSubscriptions, 0)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                LP Subscriptions ({lpSubsPct}%)
              </div>
            </div>
          </div>
        </div>
        <div className="summary-card">
          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
            <div>
              <div className="summary-card-value" style={{ color: 'var(--negative)', fontSize: '22px' }}>
                {formatCurrency(gpRedemptions, 0)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                GP Redemptions
              </div>
            </div>
            <div>
              <div className="summary-card-value" style={{ color: 'var(--negative)', fontSize: '22px' }}>
                {formatCurrency(lpRedemptions, 0)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                LP Redemptions
              </div>
            </div>
          </div>
          {totalRedemptions !== 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px', borderTop: '1px solid var(--border-dark)', paddingTop: '6px' }}>
              Total: {formatCurrency(totalRedemptions, 0)}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Investor Subscriptions & Redemptions</span>
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingInvestor(null);
              setFormData({
                month: new Date().toISOString().slice(0, 7),
                client: '',
                type: 'LP',
                amount: ''
              });
              setShowModal(true);
            }}
          >
            + Add Subscription
          </button>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Client</th>
                <th>GP / LP</th>
                <th className="right">Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {investors.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-state">
                    <div className="empty-state-title">No investors yet</div>
                    <div>Click "Add Subscription" to add your first investor</div>
                  </td>
                </tr>
              ) : (
                investors.map(investor => (
                  <tr key={investor.id}>
                    <td>{investor.month}</td>
                    <td>{investor.client}</td>
                    <td>
                      <span className={`badge badge-${investor.type.toLowerCase()}`}>
                        {investor.type}
                      </span>
                    </td>
                    <td className={`right ${investor.amount < 0 ? 'negative' : ''}`}>
                      {formatCurrency(investor.amount, 0)}
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          className="btn btn-icon btn-sm"
                          onClick={() => handleEdit(investor)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-icon btn-sm"
                          onClick={() => handleDelete(investor.id)}
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Investor Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                {editingInvestor ? 'Edit Subscription' : 'Add Subscription'}
              </span>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Month *</label>
                    <input
                      type="month"
                      className="form-input"
                      value={formData.month}
                      onChange={e => setFormData({ ...formData, month: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type *</label>
                    <select
                      className="form-select"
                      value={formData.type}
                      onChange={e => setFormData({ ...formData, type: e.target.value })}
                      required
                    >
                      <option value="GP">GP (General Partner)</option>
                      <option value="LP">LP (Limited Partner)</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Client Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.client}
                    onChange={e => setFormData({ ...formData, client: e.target.value })}
                    placeholder="Client identifier"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Amount *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="Use negative for redemptions"
                    required
                  />
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Use negative values for redemptions
                  </p>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingInvestor ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Exits Tab Component
// - Shows TOKEN and COST columns
// ============================================================
function ExitsTab({ exits, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editingExit, setEditingExit] = useState(null);
  const [formData, setFormData] = useState({
    token: '',
    cost_basis: '',
    exit_date: ''
  });

  // Calculate totals
  const totalCostBasis = exits.reduce((sum, e) => sum + e.cost_basis, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        token: formData.token,
        cost_basis: parseFloat(formData.cost_basis),
        exit_date: formData.exit_date || null
      };

      if (editingExit) {
        await axios.put(`${API_BASE}/exits/${editingExit.id}`, data);
      } else {
        await axios.post(`${API_BASE}/exits`, data);
      }

      setShowModal(false);
      setEditingExit(null);
      setFormData({
        token: '',
        cost_basis: '',
        exit_date: ''
      });
      onRefresh();
    } catch (error) {
      console.error('Error saving exit:', error);
      alert('Error saving exit');
    }
  };

  const handleEdit = (exit) => {
    setEditingExit(exit);
    setFormData({
      token: exit.token,
      cost_basis: exit.cost_basis.toString(),
      exit_date: exit.exit_date || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this exit?')) {
      try {
        await axios.delete(`${API_BASE}/exits/${id}`);
        onRefresh();
      } catch (error) {
        console.error('Error deleting exit:', error);
      }
    }
  };

  return (
    <div>
      {/* Summary Cards */}
      <div className="portfolio-summary">
        <div className="summary-card">
          <div className={`summary-card-value ${totalCostBasis >= 0 ? 'negative' : 'positive'}`}>
            {formatCurrency(totalCostBasis, 0)}
          </div>
          <div className="summary-card-label">Total Exits Cost</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-value">{exits.length}</div>
          <div className="summary-card-label">Exited Positions</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Exited Positions</span>
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingExit(null);
              setFormData({
                token: '',
                cost_basis: '',
                exit_date: new Date().toISOString().split('T')[0]
              });
              setShowModal(true);
            }}
          >
            + Add Exit
          </button>
        </div>
        <div className="table-container">
          <table style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '140px' }} />
              <col style={{ width: '140px' }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>Token</th>
                <th className="right">Cost</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {exits.length === 0 ? (
                <tr>
                  <td colSpan="3" className="empty-state">
                    <div className="empty-state-title">No exits yet</div>
                    <div>Upload exits via the Upload tab or click "Add Exit"</div>
                  </td>
                </tr>
              ) : (
                exits.map(exit => (
                  <tr key={exit.id}>
                    <td className="token-name">{exit.token}</td>
                    <td className={`right ${exit.cost_basis < 0 ? 'positive' : exit.cost_basis > 0 ? 'negative' : ''}`}>
                      {formatCurrency(exit.cost_basis)}
                    </td>
                    <td className="right">
                      <div className="actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-icon btn-sm"
                          onClick={() => handleEdit(exit)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-icon btn-sm"
                          onClick={() => handleDelete(exit.id)}
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Exit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                {editingExit ? 'Edit Exit' : 'Add Exit'}
              </span>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Token *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.token}
                    onChange={e => setFormData({ ...formData, token: e.target.value.toUpperCase() })}
                    placeholder="e.g., AAVE, MAGIC"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Cost *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    value={formData.cost_basis}
                    onChange={e => setFormData({ ...formData, cost_basis: e.target.value })}
                    placeholder="Cost basis for the exited position"
                    required
                  />
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Positive cost = negative P&L impact on USDC balance
                  </p>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingExit ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sector Watch Tab Component (unchanged)
// ============================================================
function SectorWatchTab({ prices, onRefresh }) {
  const tokenList = Object.entries(prices).map(([symbol, data]) => ({
    symbol,
    ...data
  })).sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0));

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Sector Watch - All Tracked Tokens</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            {tokenList.length} tokens tracked
          </span>
        </div>
        <div className="table-container">
          <table className="sector-watch-table">
            <colgroup>
              <col style={{ width: '8%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '17%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Token</th>
                <th>Name</th>
                <th className="right">Price</th>
                <th className="right">24h %</th>
                <th className="right">7d %</th>
                <th className="right">30d %</th>
                <th className="right">Market Cap</th>
                <th className="right">Volume 24h</th>
              </tr>
            </thead>
            <tbody>
              {tokenList.length === 0 ? (
                <tr>
                  <td colSpan="8" className="empty-state">
                    <div className="empty-state-title">Loading token data...</div>
                    <div>Price data will appear once fetched from CoinMarketCap</div>
                  </td>
                </tr>
              ) : (
                tokenList.map(token => (
                  <tr key={token.symbol}>
                    <td className="token-name">{token.symbol}</td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{token.name || '-'}</td>
                    <td className="right">{formatPrice(token.price)}</td>
                    <td className="right">
                      <span className={`perf-cell ${getPerformanceClass(token.percent_change_24h)}`}>
                        {token.percent_change_24h != null ? formatPercent(token.percent_change_24h) : '-'}
                      </span>
                    </td>
                    <td className="right">
                      <span className={`perf-cell ${getPerformanceClass(token.percent_change_7d)}`}>
                        {token.percent_change_7d != null ? formatPercent(token.percent_change_7d) : '-'}
                      </span>
                    </td>
                    <td className="right">
                      <span className={`perf-cell ${getPerformanceClass(token.percent_change_30d)}`}>
                        {token.percent_change_30d != null ? formatPercent(token.percent_change_30d) : '-'}
                      </span>
                    </td>
                    <td className="right">{formatCurrency(token.market_cap, 0)}</td>
                    <td className="right">{formatCurrency(token.volume_24h, 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Upload Tab Component
// - Added Perf Tracker and Exits upload types
// - Clear buttons for all data types
// ============================================================
function UploadTab({ onRefresh }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [uploadType, setUploadType] = useState('trades');

  // Fetch upload stats
  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API_BASE}/upload/stats`);
      setStats(res.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const endpointMap = {
        trades: '/upload/trades',
        investors: '/upload/investors',
        'perf-tracker': '/upload/perf-tracker',
        exits: '/upload/exits'
      };
      const endpoint = endpointMap[uploadType] || '/upload/trades';
      const res = await axios.post(`${API_BASE}${endpoint}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(res.data);
      fetchStats();
      onRefresh();
    } catch (error) {
      setResult({
        success: false,
        error: error.response?.data?.error || error.message
      });
    } finally {
      setUploading(false);
      e.target.value = ''; // Reset file input
    }
  };

  const handleClearData = async (type) => {
    const labels = {
      trades: 'ALL trades',
      investors: 'ALL investor records',
      'perf-tracker': 'ALL performance tracker records',
      exits: 'ALL exit records'
    };
    const confirmMsg = `Are you sure you want to delete ${labels[type]}? This cannot be undone.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const endpointMap = {
        trades: '/trades/all',
        investors: '/investors/all',
        'perf-tracker': '/perf-tracker/all',
        exits: '/exits/all'
      };
      const endpoint = endpointMap[type];
      await axios.delete(`${API_BASE}${endpoint}`);
      setResult({ success: true, message: `All ${type} deleted successfully` });
      fetchStats();
      onRefresh();
    } catch (error) {
      setResult({
        success: false,
        error: error.response?.data?.error || error.message
      });
    }
  };

  const uploadDescriptions = {
    trades: {
      title: 'Expected Excel columns for Trades:',
      columns: 'Token, Date, Units, Avg. Price, Total Bot, Fee, App, Buy/Sell/Income',
      note: 'Note: Fee and App columns will be ignored. Either Avg. Price or Total Bot is required (the other will be calculated).'
    },
    investors: {
      title: 'Expected Excel columns for Investors:',
      columns: 'Month, Client, GP / LP, Amount',
      note: 'Note: Month format should be "June-22" or "2022-06". Use negative amounts for redemptions.'
    },
    'perf-tracker': {
      title: 'Expected Excel columns for Perf Tracker:',
      columns: 'MONTH, GP SUBS, LP SUBS, INITIAL VALUE, END/LIVE VALUE, MOTUS, GROSS RETURN (ignored), BTC, ETH, CCI30, S&PexMEGA, SPX, QQQ',
      note: 'Note: GROSS RETURN column will be ignored. Month format should be "June-22" or "2022-06". Return values should be percentages (e.g., 5.2 for 5.2%).'
    },
    exits: {
      title: 'Expected Excel columns for Exits:',
      columns: 'TOKEN, COST',
      note: 'Note: Positive cost = negative P&L impact, reducing USDC balance.'
    }
  };

  const desc = uploadDescriptions[uploadType];

  return (
    <div>
      {/* Stats Cards */}
      <div className="portfolio-summary">
        <div className="summary-card">
          <div className="summary-card-value">{stats?.trades || 0}</div>
          <div className="summary-card-label">Total Trades</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-value">{stats?.investors || 0}</div>
          <div className="summary-card-label">Investor Records</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-value" style={{ fontSize: '16px' }}>
            {stats?.oldestTrade || '-'}
          </div>
          <div className="summary-card-label">Oldest Trade</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-value" style={{ fontSize: '16px' }}>
            {stats?.newestTrade || '-'}
          </div>
          <div className="summary-card-label">Newest Trade</div>
        </div>
      </div>

      {/* Upload Section */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <span className="card-title">Upload Data</span>
        </div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Upload Type</label>
            <select
              className="form-select"
              value={uploadType}
              onChange={(e) => { setUploadType(e.target.value); setResult(null); }}
              style={{ maxWidth: '300px' }}
            >
              <option value="trades">Trades</option>
              <option value="investors">Investors</option>
              <option value="perf-tracker">Perf Tracker</option>
              <option value="exits">Exits</option>
            </select>
          </div>

          {desc && (
            <div style={{ marginBottom: '16px', padding: '16px', background: 'var(--bg-dark)', borderRadius: '8px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <strong>{desc.title}</strong>
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {desc.columns}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                {desc.note}
              </p>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Select Excel File (.xlsx, .xls, .xlsm, .csv)</label>
            <input
              type="file"
              accept=".xlsx,.xls,.xlsm,.csv"
              onChange={handleFileUpload}
              disabled={uploading}
              className="form-input"
              style={{ padding: '8px' }}
            />
          </div>

          {uploading && (
            <div style={{ padding: '16px', color: 'var(--text-blue)' }}>
              Uploading and processing file...
            </div>
          )}

          {result && (
            <div style={{
              padding: '16px',
              marginTop: '16px',
              borderRadius: '8px',
              background: result.success ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 0, 0, 0.1)',
              border: `1px solid ${result.success ? 'var(--positive)' : 'var(--negative)'}`
            }}>
              {result.success ? (
                <>
                  <p style={{ color: 'var(--positive)', fontWeight: '600', marginBottom: '8px' }}>
                    Upload Successful!
                  </p>
                  {result.imported !== undefined && (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Imported: {result.imported} | Skipped: {result.skipped} | Total rows: {result.total}
                    </p>
                  )}
                  {result.message && (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {result.message}
                    </p>
                  )}
                  {result.skippedReasons && result.skipped > 0 && (
                    <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(255, 165, 0, 0.1)', borderRadius: '4px' }}>
                      <p style={{ fontSize: '12px', color: 'var(--warning)', marginBottom: '4px' }}>Skip reasons:</p>
                      {result.skippedReasons.noToken > 0 && (
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>- Empty/no token: {result.skippedReasons.noToken} rows</p>
                      )}
                      {result.skippedReasons.zeroUnits > 0 && (
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>- Zero units: {result.skippedReasons.zeroUnits} rows</p>
                      )}
                      {result.skippedReasons.invalidUnits > 0 && (
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>- Invalid units: {result.skippedReasons.invalidUnits} rows</p>
                      )}
                      {result.skippedReasons.other > 0 && (
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>- Other: {result.skippedReasons.other} rows</p>
                      )}
                    </div>
                  )}
                  {result.skippedRows && result.skippedRows.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <p style={{ fontSize: '12px', color: 'var(--warning)' }}>Sample skipped rows:</p>
                      {result.skippedRows.slice(0, 10).map((row, i) => (
                        <p key={i} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Row {row.row}: {row.reason} {row.token ? `(Token: ${row.token})` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                  {result.errors && result.errors.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <p style={{ fontSize: '12px', color: 'var(--warning)' }}>Errors:</p>
                      {result.errors.map((err, i) => (
                        <p key={i} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{err}</p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p style={{ color: 'var(--negative)' }}>
                  Error: {result.error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ color: 'var(--negative)' }}>Danger Zone</span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Use these options to clear data before re-importing. This action cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-danger"
              onClick={() => handleClearData('trades')}
            >
              Clear All Trades
            </button>
            <button
              className="btn btn-danger"
              onClick={() => handleClearData('investors')}
            >
              Clear All Investors
            </button>
            <button
              className="btn btn-danger"
              onClick={() => handleClearData('perf-tracker')}
            >
              Clear All Perf Tracker
            </button>
            <button
              className="btn btn-danger"
              onClick={() => handleClearData('exits')}
            >
              Clear All Exits
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Checker Tab Component - Debug calculations
// - USDC = Subscriptions - Net Capital Deployed - Expenses
// ============================================================
function CheckerTab({ prices }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState(null);
  const [tokenTrades, setTokenTrades] = useState(null);

  useEffect(() => {
    fetchCheckerData();
  }, []);

  const fetchCheckerData = async () => {
    try {
      const res = await axios.get(`${API_BASE}/checker/portfolio`);
      setData(res.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching checker data:', error);
      setLoading(false);
    }
  };

  const fetchTokenTrades = async (token) => {
    try {
      const res = await axios.get(`${API_BASE}/checker/token/${token}`);
      setTokenTrades(res.data);
      setSelectedToken(token);
    } catch (error) {
      console.error('Error fetching token trades:', error);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!data) return <div>Error loading data</div>;

  // Calculate portfolio value using prices
  let totalPortfolioValue = 0;
  const holdingsWithValues = data.holdings
    .filter(h => h.token.toUpperCase() !== 'USDC')
    .map(h => {
      const token = h.token.toUpperCase();
      const price = prices[token]?.price || 0;
      const value = h.net_units * price;
      totalPortfolioValue += value;
      return {
        ...h,
        price,
        value
      };
    })
    .sort((a, b) => b.value - a.value);

  // Add USDC
  totalPortfolioValue += data.calculations.usdc_balance;

  return (
    <div>
      {/* Summary */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <span className="card-title">Portfolio Value Calculation Summary</span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px' }}>
            <div>
              <h3 style={{ color: 'var(--text-blue)', marginBottom: '12px' }}>Holdings Value</h3>
              <p style={{ fontSize: '24px', fontWeight: '700' }}>{formatCurrency(totalPortfolioValue - data.calculations.usdc_balance, 2)}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sum of (units x current price) for all tokens</p>
            </div>
            <div>
              <h3 style={{ color: 'var(--text-blue)', marginBottom: '12px' }}>USDC Balance</h3>
              <p style={{ fontSize: '24px', fontWeight: '700' }}>{formatCurrency(data.calculations.usdc_balance, 2)}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>= Subscriptions - Net Capital Deployed - Expenses</p>
            </div>
            <div>
              <h3 style={{ color: 'var(--positive)', marginBottom: '12px' }}>Total Portfolio Value</h3>
              <p style={{ fontSize: '24px', fontWeight: '700', color: 'var(--positive)' }}>{formatCurrency(totalPortfolioValue, 2)}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Holdings + USDC</p>
            </div>
          </div>
        </div>
      </div>

      {/* USDC Calculation Breakdown */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <span className="card-title">USDC Balance Calculation</span>
        </div>
        <div className="card-body">
          <table style={{ width: '100%', maxWidth: '600px' }}>
            <tbody>
              <tr>
                <td style={{ padding: '8px 0' }}>Total Subscriptions (GP + LP)</td>
                <td style={{ textAlign: 'right', fontWeight: '600' }}>{formatCurrency(data.calculations.total_subscriptions, 2)}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', paddingLeft: '20px', color: 'var(--text-muted)' }}>GP Total</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatCurrency(data.investors.gp_total, 2)}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', paddingLeft: '20px', color: 'var(--text-muted)' }}>LP Total</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatCurrency(data.investors.lp_total, 2)}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0' }}>Minus: Net Capital Deployed (Buys - Sells)</td>
                <td style={{ textAlign: 'right', fontWeight: '600', color: 'var(--negative)' }}>-{formatCurrency(data.calculations.total_cost_basis, 2)}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0' }}>Minus: Total Expenses</td>
                <td style={{ textAlign: 'right', fontWeight: '600', color: 'var(--negative)' }}>-{formatCurrency(data.calculations.total_expenses, 2)}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', paddingLeft: '20px', color: 'var(--text-muted)' }}>Fund Expenses</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatCurrency(data.expenses.fund_expenses, 2)}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', paddingLeft: '20px', color: 'var(--text-muted)' }}>Mgmt Fees</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatCurrency(data.expenses.mgmt_fees, 2)}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', paddingLeft: '20px', color: 'var(--text-muted)' }}>Setup Costs</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatCurrency(data.expenses.setup_costs, 2)}</td>
              </tr>
              <tr style={{ borderTop: '2px solid var(--border-medium)' }}>
                <td style={{ padding: '12px 0', fontWeight: '700', color: 'var(--text-blue)' }}>= USDC Balance</td>
                <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--text-blue)', fontSize: '18px' }}>{formatCurrency(data.calculations.usdc_balance, 2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Holdings Breakdown */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <span className="card-title">Holdings Breakdown ({holdingsWithValues.length} tokens)</span>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th className="right">Buy Units</th>
                <th className="right">Sell Units</th>
                <th className="right">Income Units</th>
                <th className="right">Net Units</th>
                <th className="right">Price</th>
                <th className="right">Current Value</th>
                <th className="right">Cost Basis</th>
                <th className="right">Trades</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {holdingsWithValues.map((h, idx) => (
                <tr key={idx} style={{ background: h.net_units < 0 ? 'rgba(255,0,0,0.1)' : 'transparent' }}>
                  <td className="token-name">{h.token}</td>
                  <td className="right">{formatNumber(h.buy_units, 4)}</td>
                  <td className="right" style={{ color: 'var(--negative)' }}>{formatNumber(h.sell_units, 4)}</td>
                  <td className="right" style={{ color: 'var(--text-blue)' }}>{formatNumber(h.income_units, 4)}</td>
                  <td className="right" style={{ fontWeight: '600', color: h.net_units < 0 ? 'var(--negative)' : 'inherit' }}>
                    {formatNumber(h.net_units, 4)}
                  </td>
                  <td className="right">{formatPrice(h.price)}</td>
                  <td className="right" style={{ fontWeight: '600' }}>{formatCurrency(h.value, 2)}</td>
                  <td className="right">{formatCurrency(h.cost_basis, 2)}</td>
                  <td className="right">{h.trade_count}</td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => fetchTokenTrades(h.token)}
                    >
                      View Trades
                    </button>
                  </td>
                </tr>
              ))}
              <tr style={{ background: 'var(--bg-card)', fontWeight: '700' }}>
                <td>USDC</td>
                <td className="right">-</td>
                <td className="right">-</td>
                <td className="right">-</td>
                <td className="right">{formatNumber(data.calculations.usdc_balance, 2)}</td>
                <td className="right">$1.00</td>
                <td className="right">{formatCurrency(data.calculations.usdc_balance, 2)}</td>
                <td className="right">-</td>
                <td className="right">-</td>
                <td>-</td>
              </tr>
              <tr style={{ background: 'var(--primary-blue-dim)', fontWeight: '700' }}>
                <td colSpan="6">TOTAL PORTFOLIO VALUE</td>
                <td className="right" style={{ fontSize: '16px', color: 'var(--text-blue)' }}>
                  {formatCurrency(totalPortfolioValue, 2)}
                </td>
                <td className="right">{formatCurrency(data.calculations.total_cost_basis, 2)}</td>
                <td colSpan="2"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Token Trades Modal */}
      {selectedToken && tokenTrades && (
        <div className="modal-overlay" onClick={() => setSelectedToken(null)}>
          <div className="modal" style={{ maxWidth: '900px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Trades for {selectedToken}</span>
              <button className="modal-close" onClick={() => setSelectedToken(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-dark)', borderRadius: '8px' }}>
                <p><strong>Summary:</strong></p>
                <p>Buy Units: {formatNumber(tokenTrades.summary?.buy_units || 0, 6)} |
                   Sell Units: {formatNumber(tokenTrades.summary?.sell_units || 0, 6)} |
                   Income: {formatNumber(tokenTrades.summary?.income_units || 0, 6)}</p>
                <p style={{ fontWeight: '700', color: 'var(--text-blue)' }}>
                  Net Units: {formatNumber(tokenTrades.summary?.net_units || 0, 6)}
                </p>
                <p>Cost Basis: {formatCurrency(tokenTrades.summary?.cost_basis || 0, 2)}</p>
              </div>
              <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th className="right">Units</th>
                      <th className="right">Avg Price</th>
                      <th className="right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokenTrades.trades?.map((t, idx) => (
                      <tr key={idx}>
                        <td>{formatDate(t.date)}</td>
                        <td>
                          <span className={`badge badge-${t.type.toLowerCase()}`}>{t.type}</span>
                        </td>
                        <td className="right">{formatNumber(t.units, 6)}</td>
                        <td className="right">{formatPrice(t.avg_price)}</td>
                        <td className="right">{formatCurrency(t.total, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Potential Issues */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ color: 'var(--warning)' }}>Potential Issues to Check</span>
        </div>
        <div className="card-body">
          <ul style={{ listStyle: 'disc', paddingLeft: '20px', color: 'var(--text-secondary)' }}>
            {holdingsWithValues.filter(h => h.net_units < 0).length > 0 && (
              <li style={{ marginBottom: '8px', color: 'var(--negative)' }}>
                <strong>Negative holdings detected:</strong> {holdingsWithValues.filter(h => h.net_units < 0).map(h => h.token).join(', ')}
                <br /><span style={{ fontSize: '12px' }}>This means more units were sold than bought. Check trade data.</span>
              </li>
            )}
            {holdingsWithValues.filter(h => h.price === 0 && h.net_units > 0).length > 0 && (
              <li style={{ marginBottom: '8px', color: 'var(--warning)' }}>
                <strong>Holdings with no price data:</strong> {holdingsWithValues.filter(h => h.price === 0 && h.net_units > 0).map(h => h.token).join(', ')}
                <br /><span style={{ fontSize: '12px' }}>These tokens have no price from CoinMarketCap API. Set a manual price on the Portfolio tab.</span>
              </li>
            )}
            {data.calculations.usdc_balance < 0 && (
              <li style={{ marginBottom: '8px', color: 'var(--negative)' }}>
                <strong>Negative USDC balance:</strong> {formatCurrency(data.calculations.usdc_balance, 2)}
                <br /><span style={{ fontSize: '12px' }}>Cost basis exceeds subscriptions. Check investor data or expenses.</span>
              </li>
            )}
            {data.calculations.total_subscriptions === 0 && (
              <li style={{ marginBottom: '8px', color: 'var(--warning)' }}>
                <strong>No investor subscriptions loaded.</strong>
                <br /><span style={{ fontSize: '12px' }}>Upload investor data to calculate USDC balance correctly.</span>
              </li>
            )}
          </ul>
          {holdingsWithValues.filter(h => h.net_units < 0 || (h.price === 0 && h.net_units > 0)).length === 0 &&
           data.calculations.usdc_balance >= 0 &&
           data.calculations.total_subscriptions > 0 && (
            <p style={{ color: 'var(--positive)' }}>No obvious issues detected.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
