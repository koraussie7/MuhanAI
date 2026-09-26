#!/bin/bash
set -euo pipefail

# ============================================================
# Move Docker's data root from /var/lib/docker (root disk, 84% full)
# to the 1TB data disk /mnt/data/docker (798G free).
#
# Run on the origin host:  ssh 110 'cd /tmp && sudo bash move-docker-data-root.sh'
#
# Why: /var/lib/docker was 26G on a ~134G root filesystem. The Kamra PMS
# stack (3.36G image + MariaDB growth) needs headroom. /mnt/data is /dev/vdb
# ext4, 1007G total / 798G free.
#
# Docker daemon.json keeps log-driver options AND gains data-root.
# A copy (not a move) is used, then the old tree is archived to /root so the
# change can be undone until the new root is proven healthy.
# ============================================================

DAEMON_JSON="/etc/docker/daemon.json"
NEW_ROOT="/mnt/data/docker"
OLD_ROOT="/var/lib/docker"
BACKUP_DIR="/root/docker-data-root-backup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=== Docker data-root migration: ${OLD_ROOT} -> ${NEW_ROOT} ==="
echo ""

if [ "$(findmnt -no TARGET /mnt/data 2>/dev/null)" != "/mnt/data" ]; then
	echo "error: /mnt/data is not mounted — aborting"
	exit 1
fi

avail_gb=$(df -BG --output=avail /mnt/data | tail -1 | tr -dc '0-9')
if [ "$avail_gb" -lt 60 ]; then
	echo "error: need >= 60G free on /mnt/data, have ${avail_gb}G"
	exit 1
fi

# 1. Stop Docker so nothing writes to the old root mid-copy.
echo "[1/6] Stopping Docker..."
systemctl stop docker docker.socket containerd 2>/dev/null || true

# 2. Copy the existing data (container state, volumes, overlay layers).
echo "[2/6] Copying ${OLD_ROOT} -> ${NEW_ROOT} (this takes a few minutes)..."
mkdir -p "$NEW_ROOT"
if command -v rsync >/dev/null 2>&1; then
	rsync -aHAX --info=stats2 "${OLD_ROOT}/" "${NEW_ROOT}/"
else
	cp -a "${OLD_ROOT}/." "${NEW_ROOT}/"
fi

# 3. Point the daemon at the new root, keeping existing log options.
echo "[3/6] Writing ${DAEMON_JSON}..."
cp "$DAEMON_JSON" "${DAEMON_JSON}.bak.${TIMESTAMP}" 2>/dev/null || echo '{}' > "$DAEMON_JSON"
python3 - "$DAEMON_JSON" "$NEW_ROOT" <<'PY'
import json, sys
path, new_root = sys.argv[1], sys.argv[2]
try:
    with open(path) as fh:
        cfg = json.load(fh)
except Exception:
    cfg = {}
cfg["data-root"] = new_root
with open(path, "w") as fh:
    json.dump(cfg, fh, indent=2)
    fh.write("\n")
PY
cat "$DAEMON_JSON"

# 4. Start Docker and confirm it reports the new root.
echo "[4/6] Starting Docker..."
systemctl start containerd docker
active_root=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo "")
echo "       docker data-root = ${active_root}"
if [ "$active_root" != "$NEW_ROOT" ]; then
	echo "error: Docker still reports '${active_root}' — rolling back"
	mv "$DAEMON_JSON.bak.${TIMESTAMP}" "$DAEMON_JSON"
	systemctl restart docker
	exit 1
fi

# 5. Verify the previous containers and images came across.
echo "[5/6] Verifying images and containers..."
echo "       images:     $(docker images -q | wc -l)"
echo "       running:    $(docker ps -q | wc -l)"
echo "       all:        $(docker ps -aq | wc -l)"

# 6. Archive the old tree instead of deleting it, so the migration is reversible.
echo "[6/6] Archiving ${OLD_ROOT} -> ${BACKUP_DIR}..."
mkdir -p "$BACKUP_DIR"
mv "$OLD_ROOT" "${BACKUP_DIR}/docker.${TIMESTAMP}"
echo "       Old data-root parked at ${BACKUP_DIR}/docker.${TIMESTAMP}"
echo "       Reclaim it with: sudo rm -rf ${BACKUP_DIR}/docker.${TIMESTAMP}"

echo ""
echo "=== Done. Disk now: ==="
df -h / /mnt/data | sed 's/^/  /'
echo ""
echo "Undo (if needed):"
echo "  1) sudo systemctl stop docker"
echo "  2) backup ${DAEMON_JSON}, remove the data-root key"
echo "  3) sudo mv ${BACKUP_DIR}/docker.${TIMESTAMP} ${OLD_ROOT}"
echo "  4) sudo systemctl start docker"