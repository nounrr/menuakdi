import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { pool } from './db.js';
import { requireAdmin, requireAuth, signToken } from './auth.js';
import { upload } from './upload.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5000);
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.resolve('server/uploads')));
app.use(express.static(path.resolve('dist')));

function publicDish(row) {
  return {
    ...row,
    price: Number(row.price),
    image_url: row.image_url ? `${process.env.API_BASE_URL || ''}/uploads/${row.image_url}` : null
  };
}

function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE));
  return { page, limit };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
  }

  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

app.get('/api/categories', async (_req, res) => {
  const [categories] = await pool.query('SELECT * FROM categories ORDER BY sort_order, name_fr');
  const [subcategories] = await pool.query('SELECT * FROM subcategories ORDER BY sort_order, name_fr');
  res.json({ categories, subcategories });
});

app.get('/api/dishes', async (req, res) => {
  const { categoryId, subcategoryId, q } = req.query;
  const { page, limit } = parsePagination(req.query);
  const filters = ['d.is_active = 1'];
  const params = [];

  if (categoryId) {
    filters.push('d.category_id = ?');
    params.push(categoryId);
  }

  if (subcategoryId) {
    filters.push('d.subcategory_id = ?');
    params.push(subcategoryId);
  }

  if (q) {
    filters.push('(d.name_fr LIKE ? OR d.name_ar LIKE ? OR d.description_fr LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const whereClause = filters.join(' AND ');
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM dishes d WHERE ${whereClause}`, params);
  const totalItems = Number(countRows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * limit;

  const [rows] = await pool.query(
    `SELECT d.*, c.name_fr AS category_fr, c.name_ar AS category_ar,
            s.name_fr AS subcategory_fr, s.name_ar AS subcategory_ar
       FROM dishes d
       LEFT JOIN categories c ON c.id = d.category_id
       LEFT JOIN subcategories s ON s.id = d.subcategory_id
      WHERE ${whereClause}
      ORDER BY c.sort_order, s.sort_order, d.sort_order, d.name_fr
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({
    items: rows.map(publicDish),
    pagination: {
      page: currentPage,
      limit,
      totalItems,
      totalPages
    }
  });
});

app.get('/api/admin/dishes', requireAuth, requireAdmin, async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM dishes');
  const totalItems = Number(countRows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * limit;
  const [rows] = await pool.query(
    `SELECT d.*, c.name_fr AS category_fr, s.name_fr AS subcategory_fr
       FROM dishes d
       LEFT JOIN categories c ON c.id = d.category_id
       LEFT JOIN subcategories s ON s.id = d.subcategory_id
      ORDER BY d.updated_at DESC
      LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  res.json({
    items: rows.map(publicDish),
    pagination: {
      page: currentPage,
      limit,
      totalItems,
      totalPages
    }
  });
});

app.post('/api/admin/dishes', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
  const body = req.body;
  const [result] = await pool.query(
    `INSERT INTO dishes
      (category_id, subcategory_id, name_fr, name_ar, description_fr, description_ar, price, note, image_url, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      body.category_id || null,
      body.subcategory_id || null,
      body.name_fr,
      body.name_ar || null,
      body.description_fr || null,
      body.description_ar || null,
      body.price || 0,
      body.note || null,
      req.file?.filename || null,
      body.is_active === '0' ? 0 : 1,
      body.sort_order || 0
    ]
  );
  res.status(201).json({ id: result.insertId });
});

app.put('/api/admin/dishes/:id', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
  const body = req.body;
  const imageSql = req.file ? ', image_url = ?' : '';
  const params = [
    body.category_id || null,
    body.subcategory_id || null,
    body.name_fr,
    body.name_ar || null,
    body.description_fr || null,
    body.description_ar || null,
    body.price || 0,
    body.note || null,
    body.is_active === '0' ? 0 : 1,
    body.sort_order || 0
  ];
  if (req.file) params.push(req.file.filename);
  params.push(req.params.id);

  await pool.query(
    `UPDATE dishes
        SET category_id = ?, subcategory_id = ?, name_fr = ?, name_ar = ?,
            description_fr = ?, description_ar = ?, price = ?, note = ?,
            is_active = ?, sort_order = ?${imageSql}
      WHERE id = ?`,
    params
  );
  res.json({ ok: true });
});

app.delete('/api/admin/dishes/:id', requireAuth, requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM dishes WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/admin/categories', requireAuth, requireAdmin, async (req, res) => {
  const { name_fr, name_ar, sort_order = 0 } = req.body;
  const [result] = await pool.query(
    'INSERT INTO categories (name_fr, name_ar, sort_order) VALUES (?, ?, ?)',
    [name_fr, name_ar || null, sort_order]
  );
  res.status(201).json({ id: result.insertId });
});

app.put('/api/admin/categories/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name_fr, name_ar, sort_order = 0 } = req.body;
  await pool.query('UPDATE categories SET name_fr = ?, name_ar = ?, sort_order = ? WHERE id = ?', [
    name_fr,
    name_ar || null,
    sort_order,
    req.params.id
  ]);
  res.json({ ok: true });
});

app.delete('/api/admin/categories/:id', requireAuth, requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/admin/subcategories', requireAuth, requireAdmin, async (req, res) => {
  const { category_id, name_fr, name_ar, sort_order = 0 } = req.body;
  const [result] = await pool.query(
    'INSERT INTO subcategories (category_id, name_fr, name_ar, sort_order) VALUES (?, ?, ?, ?)',
    [category_id, name_fr, name_ar || null, sort_order]
  );
  res.status(201).json({ id: result.insertId });
});

app.put('/api/admin/subcategories/:id', requireAuth, requireAdmin, async (req, res) => {
  const { category_id, name_fr, name_ar, sort_order = 0 } = req.body;
  await pool.query(
    'UPDATE subcategories SET category_id = ?, name_fr = ?, name_ar = ?, sort_order = ? WHERE id = ?',
    [category_id, name_fr, name_ar || null, sort_order, req.params.id]
  );
  res.json({ ok: true });
});

app.delete('/api/admin/subcategories/:id', requireAuth, requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM subcategories WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (_req, res) => {
  const [rows] = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC');
  res.json(rows);
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const { name, email, password, role = 'admin' } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [name, email, hash, role]
  );
  res.status(201).json({ id: result.insertId });
});

app.put('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, email, password, role = 'admin' } = req.body;
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET name = ?, email = ?, password_hash = ?, role = ? WHERE id = ?', [
      name,
      email,
      hash,
      role,
      req.params.id
    ]);
  } else {
    await pool.query('UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?', [
      name,
      email,
      role,
      req.params.id
    ]);
  }
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.get('/{*path}', (_req, res) => {
  res.sendFile(path.resolve('dist', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'Image trop lourde. Taille maximale: 12 MB.' });
  }
  res.status(500).json({ message: err.message || 'Erreur serveur' });
});

app.listen(port, () => {
  console.log(`API Menu Paradise sur http://localhost:${port}`);
});
