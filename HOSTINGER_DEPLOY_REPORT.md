# Rapport de deploiement Hostinger Ubuntu

## Objectif

- Backend Express/MySQL sur VPS Ubuntu avec port interne `3304`.
- Nginx expose l'API publique avec `/api` et `/uploads`.
- Front React compile dans `dist`, puis heberge separement dans un autre hebergement Hostinger.

## Fichiers ajoutes

- `deploy/backend.env.example`: exemple `.env` backend production.
- `deploy/frontend.env.example`: exemple `.env` front production.
- `deploy/nginx-api.conf`: exemple Nginx API.
- `deploy/nginx-front-static.conf`: exemple Nginx si le front est aussi servi par un Nginx.
- `deploy/hostinger-backend-setup.sh`: script Ubuntu pour installer et lancer le backend avec PM2.
- `deploy/build-front-dist.bat`: script Windows pour generer le dossier front `deploy/front-dist`.
- `deploy/start-local-5174.bat`: script Windows pour lancer localement front `5174` + backend.
- `deploy/setup-db-and-start-local.bat`: script Windows complet pour installer, creer/migrer la base, importer Excel, assigner images, creer admin, build, puis lancer.
- `deploy/deploy-to-vps-148.230.125.221.bat`: script Windows pour envoyer le projet au VPS `root@148.230.125.221` et lancer le backend.
- `deploy/backend.env.vps-148.230.125.221.example`: exemple `.env` deja adapte a l'IP du VPS.
- `deploy/nginx-api-148.230.125.221.conf`: config Nginx adaptee a l'IP du VPS.
- `deploy/build-front-dist-vps-ip.bat`: build front avec API `http://148.230.125.221/api`.

## VPS cible

```bash
ssh root@148.230.125.221
```

API publique temporaire sans domaine:

```text
http://148.230.125.221/api
```

Health check:

```text
http://148.230.125.221/api/health
```

## 1. Cloner le projet sur le VPS

```bash
sudo mkdir -p /var/www/menu-paradise-api
sudo chown -R $USER:$USER /var/www/menu-paradise-api
cd /var/www
git clone YOUR_GIT_REPO_URL menu-paradise-api
cd /var/www/menu-paradise-api
```

Si le projet est envoye en ZIP, decompresser dans `/var/www/menu-paradise-api`.

## 2. Configurer le backend

Copier l'exemple:

```bash
cp deploy/backend.env.example .env
nano .env
```

Valeurs importantes:

```env
PORT=3304
API_BASE_URL=https://api.votre-domaine.com
CLIENT_ORIGIN=https://www.votre-front.com
DB_PORT=3306
DB_USER=menu_user
DB_PASSWORD=mot_de_passe_mysql
DB_NAME=menu_akdi
JWT_SECRET=long_secret_random
```

## 3. Lancer backend + Nginx automatiquement

Depuis le VPS:

```bash
sudo bash deploy/hostinger-backend-setup.sh /var/www/menu-paradise-api https://api.votre-domaine.com https://www.votre-front.com 3304
```

Verification:

```bash
pm2 status
curl http://127.0.0.1:3304/api/health
curl http://api.votre-domaine.com/api/health
```

Pour le VPS actuel avec IP seulement:

```bash
sudo bash deploy/hostinger-backend-setup.sh /var/www/menu-paradise-api http://148.230.125.221 https://www.votre-front.com 3304
```

Si le front n'a pas encore de domaine et sert seulement pour test, remplacer `https://www.votre-front.com` par l'URL exacte du front quand elle existe.

Pour HTTPS:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.votre-domaine.com
```

## 4. Construire le front separe

Sur Windows, dans le dossier du projet:

```bat
deploy\build-front-dist.bat https://api.votre-domaine.com/api
```

Pour construire le front avec l'IP du VPS:

```bat
deploy\build-front-dist-vps-ip.bat
```

Le dossier a uploader est:

```text
deploy\front-dist
```

Uploader le contenu de `deploy\front-dist` dans le nouvel hebergement Hostinger du front.

## 5. Points a verifier

- Le domaine front doit etre identique a `CLIENT_ORIGIN`.
- `VITE_API_BASE_URL` doit pointer vers `https://api.votre-domaine.com/api`.
- Les images upload sont servies par `https://api.votre-domaine.com/uploads/...`.
- MySQL sur Hostinger VPS utilise souvent `DB_PORT=3306`, pas `3307`.
- Le port `3304` est seulement interne backend; Nginx expose en public sur `80/443`.

## 6. Setup local complet avec base de donnees

Sur Windows:

```bat
deploy\setup-db-and-start-local.bat
```

Ce script fait:

- `npm install`
- `npm run db:migrate` pour creer la base et les tables
- `npm run db:import` pour importer `menu_with_images_1.xlsx`
- `npm run db:assign-images` pour copier/assigner les images
- `npm run db:seed-admin` pour creer l'admin
- `npm run build`
- `npm run dev`

Si le script echoue, verifier dans `.env`:

```env
DB_HOST=localhost
DB_PORT=3307
DB_USER=root
DB_PASSWORD=rootroot@
DB_NAME=menu_akdi
```

## 7. Deploiement direct depuis Windows vers le VPS

Prerequis Windows:

- OpenSSH Client installe (`ssh` et `scp` disponibles dans CMD).
- Acces SSH valide a `root@148.230.125.221`.
- MySQL pret sur le VPS, ou credentials MySQL a renseigner dans `.env` apres premier upload.

Commande:

```bat
deploy\deploy-to-vps-148.230.125.221.bat https://www.votre-front.com
```

Le script:

- cree une archive du projet sans `node_modules`, `.git`, ni `dist`
- upload vers `root@148.230.125.221:/tmp/menu-paradise-api.tar.gz`
- extrait dans `/var/www/menu-paradise-api`
- lance `deploy/hostinger-backend-setup.sh`
- configure Nginx avec `server_name 148.230.125.221`
- lance backend avec PM2 sur port interne `3304`

Important: au premier lancement, le script cree `.env` sur le VPS depuis `deploy/backend.env.example`. Il faut ensuite verifier/modifier:

```bash
ssh root@148.230.125.221
nano /var/www/menu-paradise-api/.env
pm2 restart menu-paradise-api --update-env
```
