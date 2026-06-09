import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { pool } from '../src/db.js';

dotenv.config();

const name = process.env.ADMIN_NAME || 'Admin';
const email = process.env.ADMIN_EMAIL || 'admin@paradise.local';
const password = process.env.ADMIN_PASSWORD || 'admin123';
const passwordHash = await bcrypt.hash(password, 10);

await pool.query(
  `INSERT INTO users (name, email, password_hash, role)
   VALUES (?, ?, ?, 'admin')
   ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = 'admin'`,
  [name, email, passwordHash]
);

await pool.end();
console.log(`Admin pret: ${email}`);
