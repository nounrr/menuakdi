# Menu Paradise Digital

Application React + Express + MySQL pour menu digital cafe/restaurant avec import Excel, CRUD admin, users et images des plats.

## Installation

```bash
npm install
copy .env.example .env
```

Modifier `.env` si MySQL n'utilise pas `root` sans mot de passe.

## Base de donnees

```bash
npm run db:migrate
npm run db:import
npm run db:seed-admin
```

Admin par defaut:

- Email: `admin@paradise.local`
- Password: `admin123`

## Assigner les images aux produits

Assigner `img/2.webp` au premier produit, `img/3.webp` au deuxieme, etc.:

```bash
npm run db:assign-images
```

Tester sans modifier la base:

```bash
npm run db:assign-images -- --dry-run
```

## Lancer le projet

```bash
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:5000

Les images uploadees sont stockees dans `server/uploads`.

## Optimiser les images

Convertir et compresser le dossier `img` en WebP:

```bash
npm run images:webp
```

Options utiles:

```bash
npm run images:webp -- img --quality 55 --max-width 720 --delete-original
npm run images:webp -- img --delete-original
```

Par defaut, le script garde les fichiers originaux et cree/remplace les `.webp`.
