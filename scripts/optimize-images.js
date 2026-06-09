import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

const options = parseArgs(process.argv.slice(2));
const rootDir = path.resolve(process.cwd(), options.folder);

let processed = 0;
let skipped = 0;
let failed = 0;
let originalTotal = 0;
let outputTotal = 0;

try {
  await assertDirectory(rootDir);
  const files = await getImageFiles(rootDir, options.recursive);

  if (files.length === 0) {
    console.log(`Aucune image trouvee dans ${rootDir}`);
    process.exit(0);
  }

  for (const file of files) {
    await optimizeImage(file);
  }

  console.log("");
  console.log(`Images traitees: ${processed}`);
  console.log(`Images ignorees: ${skipped}`);
  console.log(`Erreurs: ${failed}`);
  console.log(`Taille avant: ${formatBytes(originalTotal)}`);
  console.log(`Taille apres: ${formatBytes(outputTotal)}`);

  const saved = originalTotal - outputTotal;
  const percent = originalTotal > 0 ? (saved / originalTotal) * 100 : 0;
  console.log(`Gain estime: ${formatBytes(saved)} (${percent.toFixed(1)}%)`);

  if (failed > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

async function optimizeImage(file) {
  const ext = path.extname(file).toLowerCase();
  const output = ext === ".webp" ? file : replaceExtension(file, ".webp");
  const tempOutput = `${output}.tmp-${process.pid}.webp`;

  try {
    const inputStats = await fs.stat(file);
    const originalSize = inputStats.size;
    const outputExistsBefore = await fileExists(output);

    if (options.dryRun) {
      console.log(`[dry-run] ${path.relative(process.cwd(), file)} -> ${path.relative(process.cwd(), output)}`);
      processed += 1;
      originalTotal += originalSize;
      outputTotal += originalSize;
      return;
    }

    const transformer = sharp(file, { animated: true }).rotate();
    const metadata = await transformer.metadata();

    if (metadata.width && metadata.width > options.maxWidth) {
      transformer.resize({
        width: options.maxWidth,
        withoutEnlargement: true,
      });
    }

    await transformer
      .webp({
        quality: options.quality,
        effort: options.effort,
      })
      .toFile(tempOutput);

    const outputStats = await fs.stat(tempOutput);

    if (ext === ".webp" && outputStats.size >= originalSize) {
      await fs.rm(tempOutput, { force: true });
      skipped += 1;
      originalTotal += originalSize;
      outputTotal += originalSize;
      console.log(`= ${path.relative(process.cwd(), file)} deja optimise (${formatBytes(originalSize)})`);
      return;
    }

    await fs.rename(tempOutput, output);

    if (options.deleteOriginal && ext !== ".webp") {
      await fs.rm(file, { force: true });
    }

    processed += 1;
    originalTotal += originalSize;
    outputTotal += outputStats.size;

    const action = ext === ".webp" ? "compresse" : outputExistsBefore ? "remplace" : "converti";
    const ratio = originalSize > 0 ? (100 - (outputStats.size / originalSize) * 100).toFixed(1) : "0.0";
    console.log(
      `${action}: ${path.relative(process.cwd(), file)} -> ${path.relative(process.cwd(), output)} ` +
        `(${formatBytes(originalSize)} -> ${formatBytes(outputStats.size)}, ${ratio}%)`,
    );
  } catch (error) {
    failed += 1;
    await fs.rm(tempOutput, { force: true }).catch(() => {});
    console.error(`Erreur: ${path.relative(process.cwd(), file)}: ${error.message}`);
  }
}

async function getImageFiles(dir, recursive) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...(await getImageFiles(fullPath, recursive)));
      }
      continue;
    }

    if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
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

function replaceExtension(file, extension) {
  return path.join(path.dirname(file), `${path.basename(file, path.extname(file))}${extension}`);
}

function parseArgs(args) {
  const parsed = {
    folder: "img",
    quality: 78,
    maxWidth: 1600,
    effort: 5,
    recursive: true,
    deleteOriginal: false,
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--quality" || arg === "-q") {
      parsed.quality = readNumber(args, index, arg, 1, 100);
      index += 1;
      continue;
    }

    if (arg === "--max-width" || arg === "-w") {
      parsed.maxWidth = readNumber(args, index, arg, 1, 20000);
      index += 1;
      continue;
    }

    if (arg === "--effort") {
      parsed.effort = readNumber(args, index, arg, 0, 6);
      index += 1;
      continue;
    }

    if (arg === "--delete-original") {
      parsed.deleteOriginal = true;
      continue;
    }

    if (arg === "--no-recursive") {
      parsed.recursive = false;
      continue;
    }

    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg.startsWith("-")) {
      throw new Error(`Option inconnue: ${arg}`);
    }

    parsed.folder = arg;
  }

  return parsed;
}

function readNumber(args, index, name, min, max) {
  const value = Number(args[index + 1]);

  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} doit etre un nombre entre ${min} et ${max}`);
  }

  return value;
}

function formatBytes(bytes) {
  if (Math.abs(bytes) < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (Math.abs(value) >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function printHelp() {
  console.log(`
Usage:
  npm run images:webp
  npm run images:webp -- img --quality 75 --max-width 1400
  npm run images:webp -- img --delete-original

Options:
  folder              Dossier a traiter. Par defaut: img
  -q, --quality       Qualite WebP entre 1 et 100. Par defaut: 78
  -w, --max-width     Largeur max en pixels. Par defaut: 1600
  --effort            Compression WebP entre 0 et 6. Par defaut: 5
  --delete-original   Supprime les jpg/png/avif apres conversion
  --no-recursive      Ne traite pas les sous-dossiers
  --dry-run           Affiche ce qui serait fait sans ecrire de fichiers
`);
}
