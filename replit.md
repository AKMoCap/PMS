# Motus Portfolio

## Overview
Crypto hedge fund portfolio management system with React frontend and Express backend.

## Project Structure
- `/client` - React frontend (Create React App) running on port 5000
- `/server` - Express backend API running on port 3001
- `/data` - SQLite database storage

## Tech Stack
- **Frontend**: React 18, Axios
- **Backend**: Node.js, Express
- **Database**: SQLite (better-sqlite3)
- **External APIs**: CoinMarketCap API for price data

## Configuration
The application requires a CoinMarketCap API key for price data:
- Set `COINMARKETCAP_API_KEY` environment variable

## Running the Application
- `npm run dev` - Run both frontend and backend concurrently
- Frontend proxies API calls to backend at localhost:3001

## API Endpoints
- `/api/prices` - Get cryptocurrency prices
- `/api/trades` - CRUD for trades
- `/api/portfolio` - Portfolio holdings
- `/api/investors` - Investor management
- `/api/perf-tracker` - Performance tracking
- `/api/exits` - Exit tracking
- `/api/sector-watch` - Sector monitoring
- `/api/summary` - Summary data
- `/api/upload/*` - Excel file uploads
