import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import call from './routes/call.js';
const app = express();
const PORT = process.env.PORT || 5000;
app.set('trust proxy', true); // IP واقعی کلاینت از X-Forwarded-For (پراکسی vite)

// DB pool
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

// جدول قفل داخلی‌ها: هر داخلی فقط توسط یک رایانه قابل ثبت است
pool.query(`CREATE TABLE IF NOT EXISTS extension_claims (
  extension VARCHAR(20) PRIMARY KEY,
  computer_ip VARCHAR(64) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(e => console.error('claims table init:', e.message));

// Middlewares
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// جلوگیری از کش شدن پاسخ‌های API (وضعیت قفل‌ها باید همیشه تازه باشد) — قبل از همه روت‌ها
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Auth helpers
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// Routes
app.get('/', (req, res) => res.json({ status: 'ok' }));

// Login (uses plaintext passwords from existing `users` table for compatibility)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'نام کاربری و رمز عبور لازم است' });
  const [rows] = await pool.query('SELECT username, password, name FROM users WHERE username = ?', [username]);
  if (!rows.length || rows[0].password !== password) {
    return res.status(401).json({ message: 'نام کاربری یا رمز عبور نادرست است' });
  }
  const user = { username: rows[0].username, name: rows[0].name };
  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user });
});

// Numbers listing with full-text-ish search + pagination + optional unit filter

// تبدیل ارقام فارسی/عربی به انگلیسی و حذف جداکننده‌های رایج در تایپ شماره
function normalizeQuery(s) {
  return String(s)
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\s\-()+.]/g, '');
}

app.get('/api/numbers', async (req, res) => {
  const q = normalizeQuery((req.query.q || '').trim());
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const offset = (page - 1) * limit;
  const vahed = (req.query.vahed || '').trim();

  const whereParts = [];
  const params = [];

  if (q) {
    const like = `%${q}%`;
    // برای جستجوی عددی، حالت بدون صفر ابتدایی را هم امتحان کن (موبایل: 0913... == 9133...)
    const variants = new Set([q]);
    if (/^\d+$/.test(q)) {
      variants.add(q.replace(/^0+/, '') || '0');
    }
    const numConds = [...variants]
      .map(() => '(intel LIKE ? OR outtel LIKE ? OR mobile LIKE ?)')
      .join(' OR ');
    whereParts.push(`(name LIKE ? OR lastname LIKE ? OR samat LIKE ? OR vahed LIKE ? OR ${numConds})`);
    params.push(like, like, like, like);
    for (const v of variants) {
      params.push(`%${v}%`, `%${v}%`, `%${v}%`);
    }
  }
  if (vahed) {
    whereParts.push('vahed LIKE ?');
    params.push(`%${vahed}%`);
  }
  const where = whereParts.length ? ('WHERE ' + whereParts.join(' AND ')) : '';

  const [countRows] = await pool.query(`SELECT COUNT(*) as cnt FROM numbers ${where}`, params);
  const total = countRows[0].cnt;

  const [items] = await pool.query(`
    SELECT id, name, lastname, samat, intel, outtel, mobile, vahed
    FROM numbers
    ${where}
    ORDER BY lastname ASC, name ASC
    LIMIT ? OFFSET ?
  `, params.concat([limit, offset]));

  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

// (Optional) get distinct units for filter dropdown
app.get('/api/units', async (req, res) => {
  const [rows] = await pool.query("SELECT DISTINCT TRIM(vahed) as vahed FROM numbers WHERE TRIM(vahed) <> '' ORDER BY vahed ASC");
  res.json(rows.map(r => r.vahed));
});

app.use('/api/call', call(pool));

// --- مدیریت قفل داخلی‌ها (فقط مدیر لاگین‌شده) ---
app.get('/api/claims', auth, async (req, res) => {
  const [rows] = await pool.query('SELECT extension, computer_ip, created_at, updated_at FROM extension_claims ORDER BY extension ASC');
  res.json(rows);
});
app.delete('/api/claims/:ext', auth, async (req, res) => {
  const ext = String(req.params.ext || '').replace(/\D/g, '');
  if (!ext) return res.status(400).json({ message: 'داخلی نامعتبر است' });
  await pool.query('DELETE FROM extension_claims WHERE extension = ?', [ext]);
  res.json({ released: true });
});

// لاگ خطاها/رویدادهای سمت مرورگر برای عیب‌یابی
app.post('/api/client-log', (req, res) => {
  try { console.log('[CLIENT]', JSON.stringify(req.body || {}).slice(0, 600)); } catch {}
  res.json({ ok: true });
});
// Admin-like mutations (optional; enable when you have roles)
// For now, keep accessible to any authenticated user if you uncomment.
// app.post('/api/numbers', auth, async (req, res) => {
//   const { name, lastname, samat, intel, outtel, mobile, vahed } = req.body || {};
//   const [result] = await pool.query(
//     'INSERT INTO numbers (name, lastname, samat, intel, outtel, mobile, vahed) VALUES (?, ?, ?, ?, ?, ?, ?)',
//     [name, lastname, samat, intel, outtel, mobile, vahed]
//   );
//   res.status(201).json({ id: result.insertId });
// });

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

app.listen(PORT, () => console.log(`API listening on :${PORT}`));
