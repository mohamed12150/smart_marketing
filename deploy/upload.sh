#!/usr/bin/env bash
# يرفع الكود من هذا الجهاز إلى السيرفر (يُشغَّل محليًا من Git Bash):
#   bash deploy/upload.sh                                   # الوجهة من deploy/target.local.conf
#   bash deploy/upload.sh root@1.2.3.4 /path/to/app         # وجهة مخصصة
# عنوان السيرفر ومساره لا يُكتبان هنا (الملف يُرفع على git) بل في deploy/target.local.conf
# — ملف محلي غير مُتتبع بهذا الشكل:
#   TARGET=root@SERVER_IP
#   APP=/path/to/app/on/server
#   KEY=$HOME/.ssh/deploy_key        # اختياري
# الرفع الأول ينشئ مجلد التطبيق؛ التحديثات تستبدل الكود وتعيد تشغيل الخدمة دون لمس qsm-data إطلاقًا.
set -euo pipefail

CONF="$(dirname "$0")/target.local.conf"
[ -f "$CONF" ] && . "$CONF"
TARGET="${1:-${TARGET:?لا وجهة — أنشئ deploy/target.local.conf أو مرر user@host كمعامل أول}}"
APP="${2:-${APP:?لا مسار — أضف APP في deploy/target.local.conf أو مرره كمعامل ثانٍ}}"
KEY="${KEY:-$HOME/.ssh/qhub_deploy}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$(mktemp -d)/qsm-app.tar.gz"

tar -C "$HERE" -czf "$PKG" \
  --exclude='.git' --exclude='.venv' --exclude='data' --exclude='__pycache__' \
  --exclude='*.local.txt' --exclude='.env' \
  qsm web docs tests deploy run.py requirements.txt requirements-dev.txt pytest.ini ruff.toml README.md .env.example

scp -q -i "$KEY" "$PKG" "$TARGET:/tmp/qsm-app.tar.gz"
ssh -i "$KEY" "$TARGET" "APP='$APP' bash -s" <<'REMOTE'
set -euo pipefail
mkdir -p "$APP"
tar -xzf /tmp/qsm-app.tar.gz -C "$APP"
rm -f /tmp/qsm-app.tar.gz
id -u qsm >/dev/null 2>&1 && chown -R qsm:qsm "$APP" || true
if systemctl is-enabled qhub-smart-marketing >/dev/null 2>&1; then
  systemctl restart qhub-smart-marketing
  sleep 2
  systemctl is-active qhub-smart-marketing
fi
echo "الكود الآن في $APP"
REMOTE
