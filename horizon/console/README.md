# Horizon Console

Real-time monitoring dashboard for Horizon agent runs and heartbeat metrics.

## Features

- 📊 **Live Metrics** — Queue size, active runs, avg response time
- ▶️ **Runs Table** — Status, ID, timing, tokens
- 🌐 **Simple HTTP Server** — No build required, runs immediately
- 📈 **Expandable** — Easy to add more metrics and features

## Setup (On Your System - 10.0.0.27)

```powershell
# Navigate to console directory
cd C:\Users\klaws\clawd\horizon\console

# Install dependencies
npm install

# Start server
npm start
# Opens http://localhost:3000
```

## How It Works

```
Computer A (Your System - 10.0.0.27)
├── server.js (Express on port 3000)
├── public/index.html (Dashboard UI)
└── Browser: http://localhost:3000

Computer B (My System - 10.0.0.194)
├── Horizon Agent
└── Sends data to Computer A's Console
```

## Configuration

Currently uses mock data. To integrate with real Horizon Agent:

1. Update `server.js` to fetch heartbeat/runs from Computer B's API
2. Add WebSocket for live updates (future)

## File Structure

```
console/
├── server.js           # Express server
├── package.json        # Dependencies
├── public/
│   └── index.html      # Dashboard UI
└── README.md
```

## Next Steps

- [ ] Connect to real Horizon Agent API on 10.0.0.194
- [ ] Add WebSocket for live updates
- [ ] Expand metrics dashboard
- [ ] Add filtering and detailed views

---

**Built for Horizon**  
Dashboard v1.0 — 2026-02-26
