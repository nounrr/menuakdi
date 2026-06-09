import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { pool } from '../src/db.js';

dotenv.config();

const IMAGE_EXTENSIONS = ['.webp', '.jpg', '.jpeg', '.png', '.avif'];
const FORMAT_EXTENSIONS = {
  jpeg: '.jpg',
  jpg: '.jpg',
  png: '.png',
  webp: '.webp',
  avif: '.avif'
};

const options = parseArgs(process.argv.slice(2));
const imageDir = path.resolve(options.folder);
const uploadDir = path.resolve(options.uploads);

try {
  await assertDirectory(imageDir);
  await fs.mkdir(uploadDir, { recursive: true });

  const [dishes] = await pool.query(
    `SELECT d.id, d.name_fr, d.sort_order,
            c.sort_order AS category_sort_order,
            s.sort_order AS subcategory_sort_order
       FROM dishes d
       LEFT JOIN categories c ON c.id = d.category_id
       LEFT JOIN subcategories s ON s.id = d.subcategory_id
      ORDER BY c.sort_order, s.sort_order, d.sort_order, d.id`
  );

  if (dishes.length === 0) {
    console.log('Aucun produit trouve dans la table dishes.');
    process.exit(0);
  }

  let assigned = 0;
  let missing = 0;

  for (const [index, dish] of dishes.entries()) {
    const imageNumber = options.start + index;
    const imageFile = await findImage(imageDir, imageNumber);

    if (!imageFile) {
      missing += 1;
      console.warn(`Image manquante pour #${index + 1} "${dish.name_fr}": ${imageNumber}`);
      continue;
    }

    const uploadName = await outputImageName(imageFile);
    const destination = path.join(uploadDir, uploadName);

    if (options.dryRun) {
      console.log(`[dry-run] ${dish.id} "${dish.name_fr}" -> ${uploadName}`);
      assigned += 1;
      continue;
    }

    await fs.copyFile(imageFile, destination);
    await pool.query('UPDATE dishes SET image_url = ? WHERE id = ?', [uploadName, dish.id]);
    assigned += 1;
    console.log(`${dish.id} "${dish.name_fr}" -> ${uploadName}`);
  }

  console.log('');
  console.log(`Produits trouves: ${dishes.length}`);
  console.log(`Images assignees: ${assigned}`);
  console.log(`Images manquantes: ${missing}`);
  console.log(`Premiere image utilisee: ${options.start}`);
} finally {
  await pool.end();
}

async function findImage(dir, imageNumber) {
  const baseName = String(imageNumber);
  const fileWithoutExtension = path.join(dir, baseName);

  if (await fileExists(fileWithoutExtension)) {
    return fileWithoutExtension;
  }

  for (const extension of IMAGE_EXTENSIONS) {
    const file = path.join(dir, `${baseName}${extension}`);
    if (await fileExists(file)) {
      return file;
    }
  }

  return null;
}

async function outputImageName(file) {
  const ext = path.extname(file).toLowerCase();
  if (IMAGE_EXTENSIONS.includes(ext)) return path.basename(file);

  const metadata = await sharp(file).metadata();
  const detectedExt = FORMAT_EXTENSIONS[metadata.format] || '.jpg';
  return `${path.basename(file)}${detectedExt}`;
}

async function assertDirectory(dir) {
  const stats = await fs.stat(dir).catch(() => null);

  if (!stats?.isDirectory()) {
    throw new Error(`Dossier introuvable: ${dir}`);
  }
}

async function fileExists(file) {
  return fs
    .access(file)
    .then(() => true)
    .catch(() => false);
}

function parseArgs(args) {
  const parsed = {
    folder: 'img',
    uploads: 'server/uploads',
    start: 2,
    dryRun: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--folder') {
      parsed.folder = readValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--uploads') {
      parsed.uploads = readValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--start') {
      parsed.start = readNumber(args, index, arg, 0, 100000);
      index += 1;
      continue;
    }

    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg.startsWith('-')) {
      throw new Error(`Option inconnue: ${arg}`);
    }

    parsed.folder = arg;
  }

  return parsed;
}

function readValue(args, index, name) {
  const value = args[index + 1];

  if (!value) {
    throw new Error(`${name} demande une valeur`);
  }

  return value;
}

function readNumber(args, index, name, min, max) {
  const value = Number(args[index + 1]);

  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} doit etre un nombre entier entre ${min} et ${max}`);
  }

  return value;
}

function printHelp() {
  console.log(`
Usage:
  npm run db:assign-images
  npm run db:assign-images -- --dry-run
  npm run db:assign-images -- --folder img --start 2

Options:
  --folder   Dossier source des images. Par defaut: img
  --uploads  Dossier copie pour l'API. Par defaut: server/uploads
  --start    Numero de la premiere image. Par defaut: 2
  --dry-run  Affiche les associations sans modifier la base
`);
}
