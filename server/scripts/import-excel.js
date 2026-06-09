import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import sharp from 'sharp';
import xlsx from 'xlsx';
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
const excelFile = path.resolve(options.file);
const imageDir = path.resolve(options.images);
const uploadDir = path.resolve(options.uploads);

let imported = 0;
let skipped = 0;
let copiedImages = 0;
let missingImages = 0;

try {
  await assertFile(excelFile);
  await fs.mkdir(uploadDir, { recursive: true });

  const workbook = xlsx.readFile(excelFile);
  const sheetName = options.sheet || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`Feuille introuvable: ${sheetName}`);
  }

  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false });

  for (const [index, row] of rows.entries()) {
    const dish = normalizeRow(row, index);

    if (!dish.name_fr) {
      skipped += 1;
      continue;
    }

    if (options.dryRun) {
      console.log(`[dry-run] ${dish.category_fr || '-'} / ${dish.subcategory_fr || '-'} / ${dish.name_fr}`);
      imported += 1;
      continue;
    }

    const categoryId = dish.category_fr
      ? await upsertCategory(dish.category_fr, dish.category_ar, dish.categoryOrder)
      : null;
    const subcategoryId =
      categoryId && dish.subcategory_fr
        ? await upsertSubcategory(categoryId, dish.subcategory_fr, dish.subcategory_ar, dish.subcategoryOrder)
        : null;
    const imageName = await importImage(dish.imagePath);

    await pool.query(
      `INSERT INTO dishes
        (category_id, subcategory_id, name_fr, name_ar, description_fr, description_ar, price, note, image_url, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
        name_ar = VALUES(name_ar),
        description_fr = VALUES(description_fr),
        description_ar = VALUES(description_ar),
        price = VALUES(price),
        note = VALUES(note),
        image_url = COALESCE(VALUES(image_url), image_url),
        is_active = VALUES(is_active),
        sort_order = VALUES(sort_order)`,
      [
        categoryId,
        subcategoryId,
        dish.name_fr,
        dish.name_ar || null,
        dish.description_fr || null,
        dish.description_ar || null,
        dish.price,
        dish.note || null,
        imageName,
        dish.sortOrder
      ]
    );

    imported += 1;
  }

  console.log('');
  console.log(`Fichier importe: ${path.relative(process.cwd(), excelFile)}`);
  console.log(`Lignes importees: ${imported}`);
  console.log(`Lignes ignorees: ${skipped}`);
  console.log(`Images copiees: ${copiedImages}`);
  console.log(`Images introuvables: ${missingImages}`);
} finally {
  await pool.end();
}

async function upsertCategory(nameFr, nameAr, sortOrder) {
  const [result] = await pool.query(
    `INSERT INTO categories (name_fr, name_ar, sort_order)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
      id = LAST_INSERT_ID(id),
      name_ar = VALUES(name_ar),
      sort_order = LEAST(sort_order, VALUES(sort_order))`,
    [nameFr, nameAr || null, sortOrder]
  );

  return result.insertId;
}

async function upsertSubcategory(categoryId, nameFr, nameAr, sortOrder) {
  const [result] = await pool.query(
    `INSERT INTO subcategories (category_id, name_fr, name_ar, sort_order)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      id = LAST_INSERT_ID(id),
      name_ar = VALUES(name_ar),
      sort_order = LEAST(sort_order, VALUES(sort_order))`,
    [categoryId, nameFr, nameAr || null, sortOrder]
  );

  return result.insertId;
}

async function importImage(imagePath) {
  const source = await resolveImage(imagePath);

  if (!source) {
    if (imagePath) missingImages += 1;
    return null;
  }

  const destination = path.join(uploadDir, source.outputName);
  await fs.copyFile(source.file, destination);
  copiedImages += 1;
  return source.outputName;
}

async function resolveImage(value) {
  const cleaned = clean(value);
  if (!cleaned || /^https?:\/\//i.test(cleaned)) return null;

  const normalized = cleaned.replace(/\\/g, '/').replace(/^\/+/, '');
  const candidate = path.resolve(imageDir, normalized);
  const candidateInCwd = path.resolve(normalized);

  for (const file of [candidate, candidateInCwd]) {
    const resolved = await resolveImageFile(file);
    if (resolved) return resolved;
  }

  const numericName = path.basename(normalized).match(/^[a-z]+(\d+)$/i)?.[1];
  if (numericName) {
    for (const file of [path.resolve(imageDir, numericName), path.resolve(numericName)]) {
      const resolved = await resolveImageFile(file);
      if (resolved) return resolved;
    }
  }

  return null;
}

async function resolveImageFile(file) {
  if (await fileExists(file)) {
    return {
      file,
      outputName: await outputImageName(file)
    };
  }

  if (path.extname(file)) return null;

  for (const extension of IMAGE_EXTENSIONS) {
    const withExtension = `${file}${extension}`;
    if (await fileExists(withExtension)) {
      return {
        file: withExtension,
        outputName: path.basename(withExtension)
      };
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

function normalizeRow(row, index) {
  return {
    category_fr: pick(row, ['Catégorie FR', 'Categorie FR', 'category_fr', 'category']),
    category_ar: pick(row, ['الفئة AR', 'Categorie AR', 'Catégorie AR', 'category_ar']),
    subcategory_fr: pick(row, ['Sous-catégorie FR', 'Sous-categorie FR', 'subcategory_fr', 'subcategory']),
    subcategory_ar: pick(row, ['الفئة الفرعية AR', 'Sous-catégorie AR', 'Sous-categorie AR', 'subcategory_ar']),
    name_fr: pick(row, ['Nom FR', 'name_fr', 'nom', 'name']),
    name_ar: pick(row, ['الاسم AR', 'Nom AR', 'name_ar']),
    description_fr: pick(row, ['Description FR', 'description_fr', 'description']),
    description_ar: pick(row, ['الوصف AR', 'Description AR', 'description_ar']),
    price: parsePrice(pick(row, ['Prix (Dhs)', 'Prix', 'price', 'prix'])),
    note: pick(row, ['Note', 'note']),
    imagePath: pick(row, ['image_path_dishes', 'image', 'image_url', 'image_path']),
    categoryOrder: index + 1,
    subcategoryOrder: index + 1,
    sortOrder: index + 1
  };
}

function pick(row, names) {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && clean(value) !== '') return clean(value);
  }

  return '';
}

function clean(value) {
  return String(value ?? '').trim();
}

function parsePrice(value) {
  const normalized = clean(value).replace(/[^\d,.-]/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function assertFile(file) {
  const stats = await fs.stat(file).catch(() => null);
  if (!stats?.isFile()) {
    throw new Error(`Fichier Excel introuvable: ${file}`);
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
    file: 'menu_with_images_1.xlsx',
    images: 'img',
    uploads: 'server/uploads',
    sheet: '',
    dryRun: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--file') {
      parsed.file = readValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--images') {
      parsed.images = readValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--uploads') {
      parsed.uploads = readValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--sheet') {
      parsed.sheet = readValue(args, index, arg);
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

    parsed.file = arg;
  }

  return parsed;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value) throw new Error(`${name} demande une valeur`);
  return value;
}

function printHelp() {
  console.log(`
Usage:
  npm run db:import
  npm run db:import -- --file menu_with_images_1.xlsx
  npm run db:import -- --images img --uploads server/uploads
  npm run db:import -- --dry-run

Options:
  --file     Fichier Excel. Par defaut: menu_with_images_1.xlsx
  --images   Dossier source des images. Par defaut: img
  --uploads  Dossier copie pour l'API. Par defaut: server/uploads
  --sheet    Nom de la feuille Excel. Par defaut: premiere feuille
  --dry-run  Affiche les lignes sans modifier la base
`);
}
