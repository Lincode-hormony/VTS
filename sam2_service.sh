#!/usr/bin/env bash
set -euo pipefail

SESSION="${SAM2_TMUX_SESSION:-sam2}"
APP_DIR="/root/autodl-tmp/sam2-api"
CONDA_SH="/root/autodl-tmp/miniforge3/etc/profile.d/conda.sh"
ENV_PATH="/root/autodl-tmp/conda_envs/sam2_project"
PORT="${SAM2_PORT:-6006}"

usage() {
  cat <<USAGE
Usage: bash sam2_service.sh <command>

Commands:
  start   Start SAM2 API in a tmux session
  status  Show tmux session and port status
  attach  Attach to the tmux session
  stop    Send Ctrl-C to the tmux session
  health  Request local health endpoint

This script does not install packages or modify conda configuration.
USAGE
}

require_file() {
  if [ ! -e "$1" ]; then
    echo "Missing: $1" >&2
    exit 1
  fi
}

is_port_listening() {
  curl -fsS "http://127.0.0.1:${PORT}/sam2/api/v1/health" >/dev/null 2>&1
}

start_service() {
  require_file "$CONDA_SH"
  require_file "$ENV_PATH/bin/python"
  require_file "$APP_DIR/api_server.py"

  if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "tmux session '$SESSION' already exists."
    echo "Use: tmux attach -t $SESSION"
    exit 0
  fi

  if is_port_listening; then
    echo "Port $PORT is already listening. Not starting another service." >&2
    exit 1
  fi

  tmux new-session -d -s "$SESSION" \
    "cd '$APP_DIR' && source '$CONDA_SH' && conda activate '$ENV_PATH' && unset http_proxy https_proxy all_proxy && uvicorn api_server:app --host 0.0.0.0 --port '$PORT'"

  echo "SAM2 API started in tmux session '$SESSION'."
  echo "Attach: tmux attach -t $SESSION"
  echo "Health: curl http://127.0.0.1:${PORT}/sam2/api/v1/health"
}

status_service() {
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "tmux session '$SESSION': running"
  else
    echo "tmux session '$SESSION': not found"
  fi

  if is_port_listening; then
    echo "port $PORT: responding"
  else
    echo "port $PORT: not responding"
  fi
}

attach_service() {
  tmux attach -t "$SESSION"
}

stop_service() {
  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "tmux session '$SESSION' not found."
    exit 0
  fi

  tmux send-keys -t "$SESSION" C-c
  echo "Sent Ctrl-C to tmux session '$SESSION'."
}

health_service() {
  curl -fsS "http://127.0.0.1:${PORT}/sam2/api/v1/health"
  echo
}

case "${1:-}" in
  start) start_service ;;
  status) status_service ;;
  attach) attach_service ;;
  stop) stop_service ;;
  health) health_service ;;
  -h|--help|help|"") usage ;;
  *)
    echo "Unknown command: $1" >&2
    usage
    exit 2
    ;;
esac
