#!/bin/bash
# eod-report.sh — End-of-day metrics aggregation
# Usage: ./eod-report.sh
# Or via cron/heartbeat: node report-wrapper.js --period eod

set -e

ROOT="${NXTLVL_ROOT:-$(pwd)}"
REPORT_DIR="${ROOT}/horizon/tools/report"
METRICS_FILE="${ROOT}/horizon/runtime/metrics"
DATASET_DIR="${ROOT}/horizon/runtime/datasets/llm-interactions"

# Ensure dataset dir exists
mkdir -p "$DATASET_DIR"

# Run attribution report for last 1 day
echo "[EOD] Running LLM attribution report..."
node "$REPORT_DIR/llm-attribution.js" --days 1 > /tmp/eod-report.txt 2>&1

# Store report
TIMESTAMP=$(date +%Y-%m-%d)
REPORT_PATH="${DATASET_DIR}/eod-${TIMESTAMP}.json"

# Extract key metrics and store as JSON
cat > "$REPORT_PATH" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "period": "eod",
  "window": "${TIMESTAMP}",
  "report": "$(cat /tmp/eod-report.txt | jq -Rs .)"
}
EOF

echo "[EOD] Report saved: $REPORT_PATH"
cat /tmp/eod-report.txt

exit 0
