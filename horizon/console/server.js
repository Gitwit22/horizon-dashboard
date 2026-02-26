const express = require('express');
const app = express();

const PORT = 3000;

// Mock heartbeat
const heartbeat = {
  lastEvent: new Date(),
  queueSize: 3,
  activeRuns: 1,
  avgResponse: 4.3,
  runsToday: 47,
  errorRate: 0.042
};

// Mock runs
const runs = [
  { id: 'run_8f3a2b', status: 'Success', started: '08:58 AM', duration: '4.2s', agent: 'horizon-main', tokens: 2840 },
  { id: 'run_4c7d1e', status: 'Error', started: '09:02 AM', duration: '6.1s', agent: 'horizon-main', tokens: 1560 },
  { id: 'run_9e2f8a', status: 'Running', started: '09:09 AM', agent: 'horizon-research', tokens: 890 },
  { id: 'run_1b5c3d', status: 'Queued', started: '09:09 AM', agent: 'horizon-main', tokens: 0 },
  { id: 'run_6a8e4f', status: 'Success', started: '08:45 AM', duration: '3.1s', agent: 'horizon-main', tokens: 1920 },
  { id: 'run_2d7f9c', status: 'Success', started: '08:25 AM', duration: '5.8s', agent: 'horizon-research', tokens: 4200 }
];

// API routes
app.get('/api/heartbeat', (req, res) => {
  res.json(heartbeat);
});

app.get('/api/runs', (req, res) => {
  res.json({ total: runs.length, runs });
});

app.use(express.static(__dirname + '/public'));

app.listen(PORT, () => {
  console.log(`🌅 Horizon Console running on http://localhost:${PORT}`);
});
