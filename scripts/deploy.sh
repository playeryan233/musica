#!/usr/bin/env bash
#
# 一键部署 Musica 到远端静态服务器。
#
# 部署目标不入库：在仓库根目录创建 .deploy.env（已被 .gitignore 忽略），
# 字段参考 .deploy.env.example；也可用同名环境变量覆盖。
#
#   ./scripts/deploy.sh             本地构建 + 只推 dist（最快，默认）
#   ./scripts/deploy.sh --remote    在服务器上构建（需 DEPLOY_REMOTE_USER）
#   ./scripts/deploy.sh --dry-run   只演练 rsync，不改服务器
#
set -euo pipefail

cd "$(dirname "$0")/.."

# 本地部署配置（可选，不入库）
if [ -f .deploy.env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.deploy.env
  set +a
fi

HOST="${DEPLOY_HOST:-}"
REMOTE_DIR="${DEPLOY_DIR:-/var/www/musica}"
BASE="${DEPLOY_BASE:-/}"
SITE_URL="${DEPLOY_URL:-}"
REMOTE_USER="${DEPLOY_REMOTE_USER:-}"
REMOTE_SRC="${DEPLOY_REMOTE_SRC:-/opt/musica}"

MODE=local
DRY=()
for arg in "$@"; do
  case "$arg" in
    --remote) MODE=remote ;;
    --dry-run) DRY=(--dry-run) ;;
    -h | --help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)
      echo "未知参数: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -z "$HOST" ]; then
  cat >&2 <<'MSG'
✗ 未配置部署目标。

请在仓库根目录创建 .deploy.env（已被 .gitignore 忽略），例如：

    DEPLOY_HOST=user@your-server
    DEPLOY_DIR=/var/www/musica       # 选填，默认值
    DEPLOY_URL=https://example.com   # 选填，填了才会在发布后自检

字段说明见 .deploy.env.example，也可以临时用环境变量传入。
MSG
  exit 1
fi

if [ "$MODE" = remote ] && [ -z "$REMOTE_USER" ]; then
  echo "✗ --remote 模式需要 DEPLOY_REMOTE_USER（执行构建的远端用户）。" >&2
  exit 1
fi

if [ "$MODE" = local ]; then
  echo "▶ 本地构建（DEPLOY_BASE=${BASE}）"
  DEPLOY_BASE="$BASE" npm run build
else
  echo "▶ 同步源码到 $HOST:$REMOTE_SRC"
  rsync -az --delete \
    --exclude node_modules --exclude dist --exclude .shots --exclude .git \
    --exclude 'public/font' --exclude 'public/soundfont' --exclude '.DS_Store' \
    ${DRY[@]+"${DRY[@]}"} ./ "$HOST:$REMOTE_SRC/"
  if [ ${#DRY[@]} -eq 0 ]; then
    echo "▶ 在服务器上以 $REMOTE_USER 构建"
    ssh "$HOST" "set -e
      chown -R '$REMOTE_USER':'$REMOTE_USER' '$REMOTE_SRC'
      su - '$REMOTE_USER' -c 'cd \"$REMOTE_SRC\" && npm ci --no-audit --no-fund && npm run build'"
  fi
fi

echo "▶ 发布 dist → $HOST:$REMOTE_DIR"
rsync -az --delete ${DRY[@]+"${DRY[@]}"} dist/ "$HOST:$REMOTE_DIR/"

if [ ${#DRY[@]} -eq 0 ] && [ -n "$SITE_URL" ]; then
  echo "▶ 校验 $SITE_URL"
  curl -fsS -m 10 -o /dev/null -w "  首页   %{http_code}\n" "${SITE_URL%/}/"
  curl -fsS -m 10 -o /dev/null -w "  深链   %{http_code}\n" "${SITE_URL%/}/songs/practice-001"
  curl -fsS -m 10 -o /dev/null -w "  节拍器 %{http_code}\n" "${SITE_URL%/}/metronome"
fi

if [ ${#DRY[@]} -eq 0 ]; then
  echo "✔ 部署完成"
else
  echo "（演练模式，未改动服务器）"
fi
