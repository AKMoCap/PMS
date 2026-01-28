import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// API base URL
const API_BASE = '/api';

// Utility functions
const formatCurrency = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '$0.00';
  const num = parseFloat(value);
  if (Math.abs(num) >= 1000000) {
    return '$' + (num / 1000000).toFixed(2) + 'M';
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

function App() {
  const [activeTab, setActiveTab] = useState('portfolio');
  const [prices, setPrices] = useState({});
  const [trades, setTrades] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [investors, setInvestors] = useState([]);
  const [perfTracker, setPerfTracker] = useState([]);
  const [exits, setExits] = useState([]);
  const [sectorWatch, setSectorWatch] = useState([]);
  const [usdcData, setUsdcData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      const [pricesRes, tradesRes, holdingsRes, investorsRes, perfRes, exitsRes, usdcRes] = await Promise.all([
        axios.get(`${API_BASE}/prices`).catch(() => ({ data: {} })),
        axios.get(`${API_BASE}/trades`),
        axios.get(`${API_BASE}/portfolio`),
        axios.get(`${API_BASE}/investors`),
        axios.get(`${API_BASE}/perf-tracker`),
        axios.get(`${API_BASE}/exits`),
        axios.get(`${API_BASE}/portfolio/usdc`)
      ]);

      setPrices(pricesRes.data || {});
      setTrades(tradesRes.data || []);
      setHoldings(holdingsRes.data || []);
      setInvestors(investorsRes.data || []);
      setPerfTracker(perfRes.data || []);
      setExits(exitsRes.data || []);
      setUsdcData(usdcRes.data || null);
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

  // Calculate portfolio value
  const calculatePortfolioValue = () => {
    let totalValue = 0;
    holdings.forEach(holding => {
      const token = holding.token.toUpperCase();
      const price = prices[token]?.price || 0;
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
    { id: 'upload', label: 'Upload' }
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
                prices={prices}
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
                prices={prices}
                onRefresh={fetchData}
              />
            )}
            {activeTab === 'upload' && (
              <UploadTab
                onRefresh={fetchData}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// Portfolio Tab Component
function PortfolioTab({ holdings, prices, usdcData, portfolioValue, onRefresh }) {
  // Prepare holdings with current values
  const enrichedHoldings = holdings
    .filter(h => h.token.toUpperCase() !== 'USDC')
    .map(holding => {
      const token = holding.token.toUpperCase();
      const priceData = prices[token] || {};
      const currentPrice = priceData.price || 0;
      const currentValue = holding.total_units * currentPrice;
      const pnl = currentValue - holding.cost_basis;
      const weight = portfolioValue > 0 ? (currentValue / portfolioValue) * 100 : 0;

      return {
        ...holding,
        currentPrice,
        currentValue,
        pnl,
        weight,
        percent_change_24h: priceData.percent_change_24h || 0,
        percent_change_7d: priceData.percent_change_7d || 0,
        percent_change_30d: priceData.percent_change_30d || 0,
        percent_change_60d: priceData.percent_change_60d || 0
      };
    })
    .sort((a, b) => b.currentValue - a.currentValue);

  // Add USDC
  if (usdcData && usdcData.usdc_balance !== 0) {
    const usdcWeight = portfolioValue > 0 ? (usdcData.usdc_balance / portfolioValue) * 100 : 0;
    enrichedHoldings.push({
      token: 'USDC',
      total_units: usdcData.usdc_balance,
      cost_basis: usdcData.usdc_balance,
      currentPrice: 1,
      currentValue: usdcData.usdc_balance,
      pnl: 0,
      weight: usdcWeight,
      percent_change_24h: 0,
      percent_change_7d: 0,
      percent_change_30d: 0,
      percent_change_60d: 0
    });
  }

  // Calculate totals
  const totalCostBasis = enrichedHoldings.reduce((sum, h) => sum + (h.cost_basis || 0), 0);
  const totalPnl = enrichedHoldings.reduce((sum, h) => sum + (h.pnl || 0), 0);

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
          <button className="btn btn-secondary btn-sm" onClick={onRefresh}>
            Refresh
          </button>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th className="right">Price</th>
                <th className="right">Value</th>
                <th className="right">Weight</th>
                <th className="right">24Hr</th>
                <th className="right">MTD</th>
                <th className="right">YTD</th>
                <th className="right">7D%</th>
                <th className="right">30D%</th>
                <th className="right">60D%</th>
                <th className="right">P&L</th>
                <th className="right">Cost Basis</th>
                <th className="right">Units</th>
              </tr>
            </thead>
            <tbody>
              {enrichedHoldings.map((holding, idx) => (
                <tr key={idx}>
                  <td className="token-name">{holding.token}</td>
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
                  <td className="right">
                    <span className={`perf-cell ${getPerformanceClass(holding.percent_change_24h)}`}>
                      {formatPercent(holding.percent_change_24h)}
                    </span>
                  </td>
                  <td className="right">
                    <span className="perf-cell">-</span>
                  </td>
                  <td className="right">
                    <span className="perf-cell">-</span>
                  </td>
                  <td className="right">
                    <span className={`perf-cell ${getPerformanceClass(holding.percent_change_7d)}`}>
                      {formatPercent(holding.percent_change_7d)}
                    </span>
                  </td>
                  <td className="right">
                    <span className={`perf-cell ${getPerformanceClass(holding.percent_change_30d)}`}>
                      {formatPercent(holding.percent_change_30d)}
                    </span>
                  </td>
                  <td className="right">
                    <span className={`perf-cell ${getPerformanceClass(holding.percent_change_60d)}`}>
                      {formatPercent(holding.percent_change_60d)}
                    </span>
                  </td>
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
    </div>
  );
}

// Trades Tab Component
function TradesTab({ trades, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    token: '',
    units: '',
    avg_price: '',
    total: '',
    type: 'Buy'
  });

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
        type: 'Buy'
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
      type: trade.type
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

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Trade History</span>
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
                type: 'Buy'
              });
              setShowModal(true);
            }}
          >
            + Enter Trade
          </button>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Token</th>
                <th className="right">Units</th>
                <th className="right">Avg Price</th>
                <th className="right">Total</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-state">
                    <div className="empty-state-title">No trades yet</div>
                    <div>Click "Enter Trade" to add your first trade</div>
                  </td>
                </tr>
              ) : (
                trades.map(trade => (
                  <tr key={trade.id}>
                    <td>{trade.date}</td>
                    <td className="token-name">{trade.token}</td>
                    <td className="right">{formatNumber(trade.units, 4)}</td>
                    <td className="right">{formatPrice(trade.avg_price)}</td>
                    <td className="right">{formatCurrency(trade.total)}</td>
                    <td>
                      <span className={`badge badge-${trade.type.toLowerCase()}`}>
                        {trade.type}
                      </span>
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

// Perf Tracker Tab Component
function PerfTrackerTab({ perfTracker, investors, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [formData, setFormData] = useState({
    month: '',
    gp_subs: '',
    lp_subs: '',
    ending_value: '',
    fund_expenses: '',
    mgmt_fees: '',
    setup_costs: ''
  });

  // Calculate performance metrics for each month
  const calculatePerformance = () => {
    const sorted = [...perfTracker].sort((a, b) => a.month.localeCompare(b.month));
    let runningTotal = 0;

    return sorted.map((record, idx) => {
      // Get subscriptions for this month
      const monthSubs = investors.filter(i => {
        const invMonth = i.month;
        return invMonth === record.month;
      });

      const gpSubs = monthSubs.filter(i => i.type === 'GP').reduce((sum, i) => sum + i.amount, 0);
      const lpSubs = monthSubs.filter(i => i.type === 'LP').reduce((sum, i) => sum + i.amount, 0);

      // Calculate initial value
      const prevEnding = idx > 0 ? sorted[idx - 1].ending_value : 0;
      const expenses = (record.fund_expenses || 0) + (record.mgmt_fees || 0) + (record.setup_costs || 0);
      const initialValue = prevEnding + gpSubs + lpSubs - expenses;

      // Calculate return
      const monthReturn = initialValue > 0 ? ((record.ending_value / initialValue) - 1) * 100 : 0;

      // Update running total for cumulative return
      if (idx === 0) {
        runningTotal = gpSubs + lpSubs;
      }

      return {
        ...record,
        calculated_gp_subs: gpSubs,
        calculated_lp_subs: lpSubs,
        initial_value: initialValue,
        month_return: monthReturn,
        expenses
      };
    });
  };

  const enrichedData = calculatePerformance();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        month: formData.month,
        gp_subs: parseFloat(formData.gp_subs) || 0,
        lp_subs: parseFloat(formData.lp_subs) || 0,
        ending_value: parseFloat(formData.ending_value) || 0,
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
        ending_value: '',
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
      ending_value: record.ending_value?.toString() || '',
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
                ending_value: '',
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
                <th className="right">Initial Value</th>
                <th className="right">Ending Value</th>
                <th className="right">Return</th>
                <th className="right">Fund Exp</th>
                <th className="right">Mgmt Fees</th>
                <th className="right">Setup Costs</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {enrichedData.length === 0 ? (
                <tr>
                  <td colSpan="10" className="empty-state">
                    <div className="empty-state-title">No performance records</div>
                    <div>Click "Add Month" to start tracking</div>
                  </td>
                </tr>
              ) : (
                enrichedData.map(record => (
                  <tr key={record.id}>
                    <td>{record.month}</td>
                    <td className="right">{formatCurrency(record.calculated_gp_subs, 0)}</td>
                    <td className="right">{formatCurrency(record.calculated_lp_subs, 0)}</td>
                    <td className="right">{formatCurrency(record.initial_value, 0)}</td>
                    <td className="right">{formatCurrency(record.ending_value, 0)}</td>
                    <td className="right">
                      <span className={`perf-cell ${getPerformanceClass(record.month_return)}`}>
                        {formatPercent(record.month_return)}
                      </span>
                    </td>
                    <td className="right">{formatCurrency(record.fund_expenses, 0)}</td>
                    <td className="right">{formatCurrency(record.mgmt_fees, 0)}</td>
                    <td className="right">{formatCurrency(record.setup_costs, 0)}</td>
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
          <div className="modal" onClick={e => e.stopPropagation()}>
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
                <div className="form-group">
                  <label className="form-label">Ending Portfolio Value *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    value={formData.ending_value}
                    onChange={e => setFormData({ ...formData, ending_value: e.target.value })}
                    placeholder="Portfolio value at month end"
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Fund Expenses</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      value={formData.fund_expenses}
                      onChange={e => setFormData({ ...formData, fund_expenses: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Mgmt Fees</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      value={formData.mgmt_fees}
                      onChange={e => setFormData({ ...formData, mgmt_fees: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Setup Costs</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    value={formData.setup_costs}
                    onChange={e => setFormData({ ...formData, setup_costs: e.target.value })}
                    placeholder="0"
                  />
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

// Investors Tab Component
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
          <div className="summary-card-value">{formatCurrency(gpTotal + lpTotal, 0)}</div>
          <div className="summary-card-label">Total Subscriptions</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-value" style={{ color: 'var(--warning)' }}>
            {formatCurrency(gpTotal, 0)}
          </div>
          <div className="summary-card-label">GP Subscriptions</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-value">{formatCurrency(lpTotal, 0)}</div>
          <div className="summary-card-label">LP Subscriptions</div>
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

// Exits Tab Component
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
  const profitableExits = exits.filter(e => e.cost_basis > 0).length;
  const unprofitableExits = exits.filter(e => e.cost_basis < 0).length;

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
          <div className={`summary-card-value ${totalCostBasis >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(totalCostBasis, 0)}
          </div>
          <div className="summary-card-label">Total P&L from Exits</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-value positive">{profitableExits}</div>
          <div className="summary-card-label">Profitable Exits</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-value negative">{unprofitableExits}</div>
          <div className="summary-card-label">Unprofitable Exits</div>
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
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th className="right">Cost Basis / P&L</th>
                <th>Exit Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {exits.length === 0 ? (
                <tr>
                  <td colSpan="4" className="empty-state">
                    <div className="empty-state-title">No exits yet</div>
                    <div>Exited positions will appear here</div>
                  </td>
                </tr>
              ) : (
                exits.map(exit => (
                  <tr key={exit.id}>
                    <td className="token-name">{exit.token}</td>
                    <td className={`right ${exit.cost_basis >= 0 ? 'positive' : 'negative'}`}>
                      {formatCurrency(exit.cost_basis)}
                    </td>
                    <td>{exit.exit_date || '-'}</td>
                    <td>
                      <div className="actions">
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
                  <label className="form-label">Cost Basis / P&L *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    value={formData.cost_basis}
                    onChange={e => setFormData({ ...formData, cost_basis: e.target.value })}
                    placeholder="Positive for profit, negative for loss"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Exit Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.exit_date}
                    onChange={e => setFormData({ ...formData, exit_date: e.target.value })}
                  />
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

// Sector Watch Tab Component
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
          <table>
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
                    <td>{token.name || '-'}</td>
                    <td className="right">{formatPrice(token.price)}</td>
                    <td className="right">
                      <span className={`perf-cell ${getPerformanceClass(token.percent_change_24h)}`}>
                        {formatPercent(token.percent_change_24h)}
                      </span>
                    </td>
                    <td className="right">
                      <span className={`perf-cell ${getPerformanceClass(token.percent_change_7d)}`}>
                        {formatPercent(token.percent_change_7d)}
                      </span>
                    </td>
                    <td className="right">
                      <span className={`perf-cell ${getPerformanceClass(token.percent_change_30d)}`}>
                        {formatPercent(token.percent_change_30d)}
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

// Upload Tab Component
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
      const endpoint = uploadType === 'trades' ? '/upload/trades' : '/upload/investors';
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
    const confirmMsg = type === 'trades'
      ? 'Are you sure you want to delete ALL trades? This cannot be undone.'
      : 'Are you sure you want to delete ALL investor records? This cannot be undone.';

    if (!window.confirm(confirmMsg)) return;

    try {
      const endpoint = type === 'trades' ? '/trades/all' : '/investors/all';
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
              onChange={(e) => setUploadType(e.target.value)}
              style={{ maxWidth: '300px' }}
            >
              <option value="trades">Trades</option>
              <option value="investors">Investors</option>
            </select>
          </div>

          {uploadType === 'trades' && (
            <div style={{ marginBottom: '16px', padding: '16px', background: 'var(--bg-dark)', borderRadius: '8px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <strong>Expected Excel columns for Trades:</strong>
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Token, Date, Units, Avg. Price, Total Bot, Fee, App, Buy/Sell/Income
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                Note: Fee and App columns will be ignored. Either Avg. Price or Total Bot is required (the other will be calculated).
              </p>
            </div>
          )}

          {uploadType === 'investors' && (
            <div style={{ marginBottom: '16px', padding: '16px', background: 'var(--bg-dark)', borderRadius: '8px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <strong>Expected Excel columns for Investors:</strong>
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Month, Client, GP / LP, Amount
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                Note: Month format should be "June-22" or "2022-06". Use negative amounts for redemptions.
              </p>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Select Excel File (.xlsx, .xls, .csv)</label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
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
          <div style={{ display: 'flex', gap: '12px' }}>
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
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
