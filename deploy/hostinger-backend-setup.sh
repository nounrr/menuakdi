#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-/var/www/menu-paradise-api}"
API_PUBLIC_URL="${2:-http://148.230.125.221}"
FRONT_ORIGIN="${3:-https://www.example.com}"
APP_PORT="${4:-3304}"
API_SERVER_NAME="${API_PUBLIC_URL#http://}"
API_SERVER_NAME="${API_SERVER_NAME#https://}"
API_SERVER_NAME="${API_SERVER_NAME%%/*}"

if [ "$EUID" -ne 0 ]; then
  echo "Run with sudo: sudo bash deploy/hostinger-backend-setup.sh"
  exit 1
fi

echo "App dir: $APP_DIR"
echo "API public URL: $API_PUBLIC_URL"
echo "Nginx server name: $API_SERVER_NAME"
echo "Front origin: $FRONT_ORIGIN"
echo "Backend port: $APP_PORT"

apt update
apt install -y nginx curl build-essential

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

cd "$APP_DIR"
npm ci

if [ ! -f .env ]; then
  cp deploy/backend.env.example .env
  sed -i "s|PORT=3304|PORT=$APP_PORT|" .env
  sed -i "s|API_BASE_URL=https://api.example.com|API_BASE_URL=$API_PUBLIC_URL|" .env
  sed -i "s|CLIENT_ORIGIN=https://www.example.com|CLIENT_ORIGIN=$FRONT_ORIGIN|" .env
  echo "Created $APP_DIR/.env. Edit DB_PASSWORD, JWT_SECRET, ADMIN_PASSWORD, and domain values before production use."
fi

npm run db:migrate
npm run db:seed-admin

pm2 delete menu-paradise-api >/dev/null 2>&1 || true
pm2 start index.js --name menu-paradise-api --update-env
pm2 save
pm2 startup systemd -u root --hp /root >/tmp/menu-paradise-pm2-startup.txt

cat > "/etc/nginx/sites-available/menu-paradise-api" <<NGINX
server {
    listen 80;
    server_name $API_SERVER_NAME;

    client_max_body_size 20M;

    location /api/ {
        proxy_pass http://127.0.0.1:$APP_PORT/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:$APP_PORT/uploads/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/menu-paradise-api /etc/nginx/sites-enabled/menu-paradise-api
nginx -t
systemctl reload nginx

echo "Backend launched with PM2 on port $APP_PORT."
echo "API test: curl http://127.0.0.1:$APP_PORT/api/health"
echo "Public API: $API_PUBLIC_URL/api/health"
