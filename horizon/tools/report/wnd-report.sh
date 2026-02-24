#!/bin/bash
# wnd-report.sh — Week-end metrics aggregation
# Usage: ./wnd-report.sh
# Runs over the past 7 days

set -e

ROOT="${NXTLVL_ROOT:-$(pwd)}"
REPORT_DIR="${ROOT}/horizon/tools/report"
DATASET_DIR="${ROOT}/horizon/runtime/datasets/llm-interactions"

# Ensure dataset dir exists
mkdir -p "$DATASET_DIR"

# Run attribution report for last 7 days
echo "[WND] Running week-end LLM attribution report..."
node "$REPORT_DIR/llm-attribution.js" --days 7 > /tmp/wnd-report.txt 2>&1

# Store report
TIMESTAMP=$(date +%Y-W%V)
REPORT_PATH="${DATASET_DIR}/wnd-${TIMESTAMP}.json"

# Extract key metrics and store as JSON
cat > "$REPORT_PATH" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "period": "wnd",
  "window": "${TIMESTAMP}",
  "report": "$(cat /tmp/wnd-report.txt | jq -Rs .)"
}
EOF

echo "[WND] Report saved: $REPORT_PATH"
cat /tmp/wnd-report.txt

exit 0
