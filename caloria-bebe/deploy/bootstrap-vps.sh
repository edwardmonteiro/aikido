#!/usr/bin/env bash
# One-time setup of a fresh Hostinger VPS (Ubuntu 22.04/24.04), run as root:
#   curl -fsSL https://raw.githubusercontent.com/edwardmonteiro/aikido/main/caloria-bebe/deploy/bootstrap-vps.sh | bash -s -- deploy
# Installs Docker, opens the firewall for SSH/HTTP/HTTPS, creates the deploy
# user and /opt/caloria-bebe with a generated .env you then edit (DOMAIN).
set -euo pipefail

DEPLOY_USER="${1:-deploy}"
APP_DIR=/opt/caloria-bebe

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
apt-get install -y rsync ufw >/dev/null

ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw --force enable

id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/backups"
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<ENV
DOMAIN=CHANGE-ME.example.com
POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
ENV
  chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
fi

# Nightly database backup at 03:15, keep 14 days.
cat > /etc/cron.d/caloria-backup <<CRON
15 3 * * * $DEPLOY_USER cd $APP_DIR && docker compose exec -T db pg_dump -U caloria caloria | gzip > backups/caloria-\$(date +\%F).sql.gz && find backups -name '*.sql.gz' -mtime +14 -delete
CRON

echo
echo "Done. Next:"
echo "  1. Add the GitHub Actions public key to /home/$DEPLOY_USER/.ssh/authorized_keys"
echo "  2. Set DOMAIN in $APP_DIR/.env"
echo "  3. Point the domain's A record at this server's IP in Hostinger hPanel → DNS"
