import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import AsteriskManager from 'asterisk-manager';
import call from './routes/call.js';
const app = express();
const PORT = process.env.PORT || 5000;
app.set('trust proxy', true); // IP واقعی کلاینت از X-Forwarded-For (پراکسی vite)

// تنظیمات AMI برای صفحه تنظیمات پنل مدیریت
const AMI_HOST = process.env.AMI_HOST;
const AMI_PORT = parseInt(process.env.AMI_PORT, 10) || 5038;
const AMI_USER = process.env.AMI_USER;
const AMI_PASS = process.env.AMI_PASS;
const CLICK2CALL_CONTEXT = (process.env.CLICK2CALL_CONTEXT || 'from-internal').trim();
const OUTSIDE_PREFIX = (process.env.OUTSIDE_PREFIX ?? '9').trim();

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
  model_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(e => console.error('claims table init:', e.message));

// اگر جدول extension_claims قبلاً ساخته شده ولی ستون model_id ندارد، آن را اضافه کن
pool.query(
  `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'extension_claims' AND COLUMN_NAME = 'model_id'`
).then(([r]) => {
  if (!r || !r[0] || Number(r[0].c) === 0) {
    return pool.query(`ALTER TABLE extension_claims ADD COLUMN model_id INT NULL`).catch(e => console.error('claims model_id migration:', e.message));
  }
}).catch(e => console.error('claims schema check:', e.message));

// مدل تلفن‌ها: فقط لیست برند/مدل + پروفایل auto-answer
pool.query(`CREATE TABLE IF NOT EXISTS phone_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  auto_answer_profile ENUM('both','callinfo','alertinfo','none') NOT NULL DEFAULT 'none',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_brand_model (brand, model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).then(() => {
  // دادهٔ اولیه: مدل‌های رایج بازار
  return pool.query(
    `INSERT INTO phone_models (brand, model, auto_answer_profile) VALUES
     ('Fanvil', 'X3S', 'both'), ('Fanvil', 'X3G', 'both'), ('Fanvil', 'X210', 'both'), ('Fanvil', 'X310', 'both'), ('Fanvil', 'X5S', 'both'),
     ('Yealink', 'T30P', 'callinfo'), ('Yealink', 'T31P', 'callinfo'), ('Yealink', 'T43U', 'callinfo'), ('Yealink', 'T46S', 'callinfo'),
     ('GrandStream', 'GXP2160', 'both'), ('GrandStream', 'GXP2130', 'both'), ('GrandStream', 'GXV3240', 'both'), ('GrandStream', 'GXP1620', 'both'),
     ('ZTE', 'ZXV10', 'alertinfo'),
     ('Alcatel', 'H2P', 'both'),
     ('Generic', 'سایر / ناشناخته', 'none')
     ON DUPLICATE KEY UPDATE auto_answer_profile = VALUES(auto_answer_profile)`
  );
}).catch(e => console.error('phone_models init:', e.message));

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

// --- مدیریت کاربران (فقط مدیر لاگین‌شده) ---
app.get('/api/users', auth, async (_req, res) => {
  const [rows] = await pool.query('SELECT username, name FROM users ORDER BY username ASC');
  res.json(rows);
});
app.post('/api/users', auth, async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim();
  if (!username || !password) return res.status(400).json({ message: 'نام کاربری و رمز عبور لازم است' });
  try {
    await pool.query('INSERT INTO users (username, password, name) VALUES (?, ?, ?)', [username, password, name]);
    res.status(201).json({ username });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'این نام کاربری قبلاً ثبت شده است' });
    console.error('user insert:', e.message);
    res.status(500).json({ message: 'خطای دیتابیس' });
  }
});
app.put('/api/users/:username', auth, async (req, res) => {
  const username = String(req.params.username || '').trim();
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim();
  if (!username) return res.status(400).json({ message: 'نام کاربری نامعتبر است' });
  const sets = [];
  const params = [];
  if (password) { sets.push('password = ?'); params.push(password); }
  if (name) { sets.push('name = ?'); params.push(name); }
  if (!sets.length) return res.status(400).json({ message: 'مقداری برای تغییر ندارد' });
  params.push(username);
  await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE username = ?`, params);
  res.json({ updated: true });
});
app.delete('/api/users/:username', auth, async (req, res) => {
  const username = String(req.params.username || '').trim();
  if (!username) return res.status(400).json({ message: 'نام کاربری نامعتبر است' });
  if (req.user?.username === username) {
    return res.status(400).json({ message: 'امکان حذف کاربر لاگین‌شده وجود ندارد' });
  }
  const [count] = await pool.query('SELECT COUNT(*) AS c FROM users');
  if (count[0].c <= 1) return res.status(400).json({ message: 'آخرین کاربر قابل حذف نیست' });
  await pool.query('DELETE FROM users WHERE username = ?', [username]);
  res.json({ deleted: username });
});

// --- مدیریت شماره‌ها/داخلی‌ها (فقط مدیر لاگین‌شده) ---
const NUMBER_FIELDS = ['name', 'lastname', 'samat', 'intel', 'outtel', 'mobile', 'vahed'];
function pickNumberFields(body) {
  const out = {};
  for (const f of NUMBER_FIELDS) {
    const v = body?.[f];
    if (v !== undefined && v !== null) out[f] = String(v).trim();
    else out[f] = '';
  }
  return out;
}
app.post('/api/numbers', auth, async (req, res) => {
  const n = pickNumberFields(req.body);
  if (!n.name && !n.lastname) return res.status(400).json({ message: 'نام یا نام خانوادگی لازم است' });
  if (n.intel) {
    const [dup] = await pool.query('SELECT id FROM numbers WHERE TRIM(intel) = ?', [n.intel]);
    if (dup.length) return res.status(409).json({ message: 'این شماره داخلی قبلاً ثبت شده است' });
  }
  const [r] = await pool.query(
    'INSERT INTO numbers (name, lastname, samat, intel, outtel, mobile, vahed) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [n.name, n.lastname, n.samat, n.intel, n.outtel, n.mobile, n.vahed]
  );
  res.status(201).json({ id: r.insertId });
});
app.put('/api/numbers/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'شناسه نامعتبر است' });
  const n = pickNumberFields(req.body);
  if (!n.name && !n.lastname) return res.status(400).json({ message: 'نام یا نام خانوادگی لازم است' });
  if (n.intel) {
    const [dup] = await pool.query('SELECT id FROM numbers WHERE TRIM(intel) = ? AND id <> ?', [n.intel, id]);
    if (dup.length) return res.status(409).json({ message: 'این شماره داخلی قبلاً ثبت شده است' });
  }
  await pool.query(
    'UPDATE numbers SET name=?, lastname=?, samat=?, intel=?, outtel=?, mobile=?, vahed=? WHERE id=?',
    [n.name, n.lastname, n.samat, n.intel, n.outtel, n.mobile, n.vahed, id]
  );
  res.json({ updated: true });
});
app.delete('/api/numbers/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'شناسه نامعتبر است' });
  await pool.query('DELETE FROM numbers WHERE id = ?', [id]);
  res.json({ deleted: true });
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

// لیست مدل تلفن‌ها برای دراپ‌داون «مدل تلفن خود را انتخاب کنید»
app.get('/api/phone-models', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, brand, model FROM phone_models WHERE is_active = 1 ORDER BY brand ASC, model ASC"
    );
    res.json(rows);
  } catch (e) {
    console.error('phone-models error:', e.message);
    res.status(500).json({ error: 'خطا در خواندن مدل‌های تلفن' });
  }
});

// --- مدیریت مدل تلفن‌ها (پنل مدیریت) ---
app.get('/api/phone-models/all', auth, async (_req, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM phone_models ORDER BY brand ASC, model ASC"
  );
  res.json(rows);
});
app.post('/api/phone-models', auth, async (req, res) => {
  const brand = String(req.body?.brand || '').trim();
  const model = String(req.body?.model || '').trim();
  const profile = ['both', 'callinfo', 'alertinfo', 'none'].includes(req.body?.auto_answer_profile)
    ? req.body.auto_answer_profile : 'none';
  if (!brand || !model) return res.status(400).json({ message: 'برند و مدل لازم است' });
  try {
    const [r] = await pool.query(
      'INSERT INTO phone_models (brand, model, auto_answer_profile) VALUES (?, ?, ?)',
      [brand, model, profile]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'این برند/مدل قبلاً ثبت شده است' });
    console.error('phone-model insert:', e.message);
    res.status(500).json({ message: 'خطای دیتابیس' });
  }
});
app.put('/api/phone-models/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'شناسه مدل نامعتبر است' });
  const sets = [];
  const params = [];
  const profile = req.body?.auto_answer_profile;
  if (profile !== undefined) {
    if (!['both', 'callinfo', 'alertinfo', 'none'].includes(profile)) {
      return res.status(400).json({ message: 'پروفایل نامعتبر است' });
    }
    sets.push('auto_answer_profile = ?'); params.push(profile);
  }
  if (req.body?.is_active !== undefined) {
    sets.push('is_active = ?'); params.push(req.body.is_active ? 1 : 0);
  }
  if (!sets.length) return res.status(400).json({ message: 'مقداری برای تغییر ندارد' });
  params.push(id);
  await pool.query(`UPDATE phone_models SET ${sets.join(', ')} WHERE id = ?`, params);
  res.json({ updated: true });
});

// --- وضعیت اتصال به ایزابل (پنل مدیریت) ---
app.get('/api/settings/ami-status', auth, async (_req, res) => {
  const base = { host: AMI_HOST, port: AMI_PORT, user: AMI_USER, context: CLICK2CALL_CONTEXT, outsidePrefix: OUTSIDE_PREFIX };
  try {
    const ami = new AsteriskManager(AMI_PORT, AMI_HOST, AMI_USER, AMI_PASS, true);
    const withTimeout = (fn) => new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('تلاش به اتصال AMI قطع شد (متقاضی)')), 6000);
      ami.on('error', e => { clearTimeout(t); reject(e); });
      fn((err, evt) => { clearTimeout(t); err ? reject(err) : resolve(evt); });
    });
    await withTimeout(cb => ami.action({ Action: 'Ping' }, cb));
    const core = await withTimeout(cb => ami.action({ Action: 'Command', Command: 'core show uptime' }, cb));
    const uptime = [core?.output, core?.output1, core?.output2].filter(Boolean).join('\n');
    try { ami.disconnect(); } catch {}
    res.json({ connected: true, ...base, pbxUptime: uptime });
  } catch (e) {
    res.json({ connected: false, ...base, error: String(e.message || 'اتصال برقرار نشد') });
  }
});

app.use('/api/call', call(pool));

// --- مدیریت قفل داخلی‌ها (فقط مدیر لاگین‌شده) ---
app.get('/api/claims', auth, async (req, res) => {
  const [rows] = await pool.query(`
    SELECT ec.extension, ec.computer_ip, ec.created_at, ec.updated_at,
           ec.model_id, pm.brand, pm.model, pm.auto_answer_profile AS profile,
           CONCAT_WS(' ', n.name, n.lastname) AS owner
    FROM extension_claims ec
    LEFT JOIN phone_models pm ON ec.model_id = pm.id
    LEFT JOIN numbers n ON TRIM(n.intel) = ec.extension
    ORDER BY ec.extension ASC`);
  res.json(rows);
});
app.delete('/api/claims/:ext', auth, async (req, res) => {
  const ext = String(req.params.ext || '').replace(/\D/g, '');
  if (!ext) return res.status(400).json({ message: 'داخلی نامعتبر است' });
  await pool.query('DELETE FROM extension_claims WHERE extension = ?', [ext]);
  res.json({ released: true });
});
// تغییر مدل تلفن ثبت‌شده برای یک داخلی (بدون نیاز به آزادسازی و تأیید مجدد)
app.put('/api/claims/:ext/model', auth, async (req, res) => {
  const ext = String(req.params.ext || '').replace(/\D/g, '');
  const modelId = req.body?.modelId == null ? null : Number(req.body.modelId);
  if (!ext) return res.status(400).json({ message: 'داخلی نامعتبر است' });
  if (modelId != null && !Number.isInteger(modelId)) {
    return res.status(400).json({ message: 'مدل تلفن نامعتبر است' });
  }
  if (modelId != null) {
    const [m] = await pool.query('SELECT id FROM phone_models WHERE id = ?', [modelId]);
    if (!m.length) return res.status(400).json({ message: 'مدل موردنظر یافت نشد' });
  }
  await pool.query('UPDATE extension_claims SET model_id = ? WHERE extension = ?', [modelId, ext]);
  res.json({ updated: true });
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
