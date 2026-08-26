import express from 'express';
import AsteriskManager from 'asterisk-manager';

// pool دیتابیس از server.js تزریق می‌شود (برای قفل داخلی‌ها)
export default function callRouter(pool) {
  const router = express.Router();

  // اطلاعات AMI از فایل .env
  const AMI_HOST = process.env.AMI_HOST;      // IP ایزابل
  const AMI_PORT = parseInt(process.env.AMI_PORT, 10) || 5038;
  const AMI_USER = process.env.AMI_USER;      // click2call
  const AMI_PASS = process.env.AMI_PASS;
  const CHANNEL_TECH = (process.env.AMI_CHANNEL_TECH || 'SIP').trim();   // SIP یا PJSIP
  const OUTSIDE_PREFIX = (process.env.OUTSIDE_PREFIX ?? '9').trim();     // پیش‌شماره خط بیرونی

  const EXT_RE = /^\d{2,6}$/;
  const TARGET_RE = /^\d{3,15}$/;
  const AUTO_ANSWER = process.env.AUTO_ANSWER !== '0'; // پیش‌فرض روشن
  const VERIFY_TTL_MS = 30000; // کل زمان تماس تأیید (شمارش ۳۰ ثانیه‌ای)

  // هدرهای Auto-Answer برای Fanvil/ZTE/Grandstream — گوشی خودکار جواب دهد روی بلندگو
  const AUTOANSWER_VARS = {
    '__SIPADDHEADER':  'Call-Info: <sip:${EXTEN}@${DOMAIN}>;answer-after=0',
    '__SIPADDHEADER1': 'Alert-Info: <sip:${EXTEN}@${DOMAIN}>;info=alert-autoanswer',
    '__SIPADDHEADER2': 'Require: replaces'
  };

  // جایگزینی متغیرها در هدرها
  function resolveAutoAnswerVars(ext) {
    const domain = AMI_HOST; // دامنه/آی‌پی سرور
    const vars = {};
    for (const [k, v] of Object.entries(AUTOANSWER_VARS)) {
      vars[k] = v.replace(/\$\{EXTEN\}/g, ext).replace(/\$\{DOMAIN\}/g, domain);
    }
    return vars;
  }

  function openAmi() {
    return new Promise((resolve, reject) => {
      const ami = new AsteriskManager(AMI_PORT, AMI_HOST, AMI_USER, AMI_PASS, true);
      ami.on('error', reject);
      resolve(ami);
    });
  }

  // یکسان‌سازی فرمت IP (حذف پیشوند IPv6-mapped مثل ::ffff:172.19.x.x)
  function normalizeIp(ip) {
    return String(ip || '').replace(/^::ffff:/i, '').trim();
  }

  // داخلی: ۲ تا ۵ رقم؛ هر چیز بلندتر = بیرونی → پیش‌شماره خط اضافه می‌شود
  function buildTarget(targetNumber) {
    if (/^\d{2,5}$/.test(targetNumber)) return targetNumber;
    // موبایل بدون صفر ابتدایی (مثل 9133916477) باید مثل شماره‌گیری دستی، با صفر بیرون برود: 9 + 0913...
    if (/^9\d{9}$/.test(targetNumber)) return OUTSIDE_PREFIX + '0' + targetNumber;
    return OUTSIDE_PREFIX + targetNumber;
  }

  function originateAndLog(ami, action, cb) {
    const onEvent = (evt) => {
      try {
        const s = JSON.stringify(evt);
        if (/originateresponse/i.test(s)) console.log('OriginateResponse:', s);
        else if (/"event":"hangup"/i.test(s)) console.log('Hangup:', s);
      } catch {}
    };
    ami.on('managerevent', onEvent);
    ami.action(action, (err, resAMI) => {
      setTimeout(() => {
        try { ami.removeListener('managerevent', onEvent); ami.disconnect(); } catch {}
      }, VERIFY_TTL_MS + 10000);
      cb(err, resAMI);
    });
  }

  // اگر داخلی قبلاً توسط رایانهٔ دیگری ثبت شده، پیام خطا برمی‌گرداند؛ وگرنه null
  async function checkClaim(ext, ip) {
    const [rows] = await pool.query('SELECT computer_ip FROM extension_claims WHERE extension = ?', [ext]);
    if (rows.length && normalizeIp(rows[0].computer_ip) !== normalizeIp(ip)) {
      return 'این داخلی قبلاً روی رایانهٔ دیگری تنظیم شده است؛ در صورت نیاز با مدیر سیستم تماس بگیرید';
    }
    return null;
  }

  /* ---------- تأیید داخلی دو مرحله‌ای با کد DTMF ---------- */

  const verifyAttempts = new Map(); // id -> attempt

  function genId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  function genCode() {
    let s = '';
    for (let i = 0; i < 4; i++) s += Math.floor(Math.random() * 10);
    return s;
  }

  function cleanupAttempt(id) {
    const a = verifyAttempts.get(id);
    if (!a) return;
    try { a.ami && a.ami.disconnect(); } catch {}
    if (a.killTimer) clearTimeout(a.killTimer);
    verifyAttempts.delete(id);
  }

  router.post('/verify/start', async (req, res) => {
    const callerExtension = String(req.body?.callerExtension ?? '').replace(/\D/g, '');
    if (!EXT_RE.test(callerExtension)) {
      return res.status(400).json({ verified: false, reason: 'شماره داخلی نامعتبر است' });
    }

    try {
      const blocked = await checkClaim(callerExtension, req.ip || '');
      if (blocked) return res.json({ verified: false, reason: blocked });

      const ip = normalizeIp(req.ip);
      const id = genId();
      const code = genCode();

      const ami = await openAmi();
      const attempt = {
        ext: callerExtension, ip, code,
        status: 'pending', reason: '', digits: '',
        origChannel: '', ami, killTimer: null
      };
      verifyAttempts.set(id, attempt);

      const finish = (status, reason) => {
        if (attempt.status !== 'pending') return;
        attempt.status = status;
        attempt.reason = reason || '';
        console.log(`Verify ${id} [${callerExtension}]: ${status} ${reason || ''}`);
      };

      const hangupOrig = () => {
        try {
          if (attempt.origChannel) ami.action({ Action: 'Hangup', Channel: attempt.origChannel }, () => {});
          else ami.action({ Action: 'Hangup', Channel: `${CHANNEL_TECH}/${callerExtension}` }, () => {});
        } catch {}
      };

      const onEvt = (evt) => {
        try {
          const evName = String(evt.event || '');
          const ch = String(evt.channel || '');
          const ownChannel = ch.startsWith(`${CHANNEL_TECH}/${callerExtension}-`) ||
                             (attempt.origChannel && ch === attempt.origChannel);

          if (/^originateResponse$/i.test(evName)) {
            if (String(evt.response).toLowerCase() === 'failure' && attempt.status === 'pending') {
              finish('failed', 'گوشی برداشته نشد یا داخلی در دسترس نیست');
            }
          } else if (/^newchannel$/i.test(evName)) {
            if (!attempt.origChannel && String(evt.calleridnum || '') === callerExtension) {
              attempt.origChannel = ch;
            }
          } else if (/^dtmfEnd$/i.test(evName) && ownChannel) {
            const d = String(evt.digit || '');
            if (/^[0-9]$/.test(d) && attempt.status === 'pending') {
              attempt.digits += d;
              console.log(`Verify ${id} [${callerExtension}]: digit received -> ${attempt.digits}`);
              if (attempt.digits === attempt.code) {
                finish('success', '');
                // ثبت/نوشتن قفل این داخلی برای همین رایانه
                pool.query(
                  'INSERT INTO extension_claims (extension, computer_ip) VALUES (?, ?) ON DUPLICATE KEY UPDATE computer_ip = VALUES(computer_ip)',
                  [attempt.ext, attempt.ip]
                ).catch(e => console.error('claim insert error:', e.message));
                hangupOrig();
              } else if (attempt.digits.length >= attempt.code.length) {
                finish('failed', 'کد وارد شده صحیح نیست');
                hangupOrig();
              }
            }
          } else if (/^hangup$/i.test(evName) && ownChannel && attempt.status === 'pending') {
            finish('failed', 'تماس بدون تأیید قطع شد');
          }
        } catch {}
      };
      ami.on('managerevent', onEvt);

      // موزیک انتظار نگه می‌دارد تا کاربر کد را با کیپد وارد کند
      ami.action({
        Action: 'Originate',
        Channel: `${CHANNEL_TECH}/${callerExtension}`,
        Application: 'MusiconHold',
        Data: 'default',
        CallerID: 'Answer if this phone is yours',
        Timeout: 12000,
        Async: 'true'
      }, (err) => {
        if (err && attempt.status === 'pending') {
          finish('failed', 'گوشی برداشته نشد یا داخلی در دسترس نیست');
        }
      });

      attempt.killTimer = setTimeout(() => {
        if (attempt.status === 'pending') finish('failed', 'در زمان تعیین شده تأیید انجام نشد');
        hangupOrig();
        setTimeout(() => cleanupAttempt(id), 4000);
      }, VERIFY_TTL_MS);

      res.json({ attemptId: id, code, ttl: Math.round(VERIFY_TTL_MS / 1000) });

    } catch (error) {
      console.error('Verify start error:', error.message);
      return res.status(500).json({ verified: false, reason: 'خطا در ارتباط با مرکز تلفن' });
    }
  });

  router.get('/verify/result', (req, res) => {
    const id = String(req.query.id || '');
    const a = verifyAttempts.get(id);
    if (!a) return res.status(404).json({ status: 'unknown' });
    if (a.ip !== normalizeIp(req.ip)) return res.status(403).json({ status: 'forbidden' });
    res.json({ status: a.status, reason: a.reason, digits: a.digits.length, expected: a.code.length });
    if (a.status !== 'pending') setTimeout(() => cleanupAttempt(id), 5000);
  });

  /* ---------- آزادسازی داخلی توسط همان رایانه ---------- */

  router.post('/release', async (req, res) => {
    const ext = String(req.body?.callerExtension ?? '').replace(/\D/g, '');
    if (!EXT_RE.test(ext)) return res.status(400).json({ released: false, error: 'داخلی نامعتبر است' });
    try {
      const ip = normalizeIp(req.ip);
      const [r] = await pool.query(
        "DELETE FROM extension_claims WHERE extension = ? AND REPLACE(LOWER(computer_ip),'::ffff:','') = ?",
        [ext, ip]
      );
      res.json({ released: r.affectedRows > 0 });
    } catch (e) {
      console.error('release error:', e.message);
      res.status(500).json({ released: false, error: 'خطا در آزادسازی داخلی' });
    }
  });

  /* ---------- تماس عادی ---------- */

  router.post('/', async (req, res) => {
    const callerExtension = String(req.body?.callerExtension ?? '').replace(/\D/g, '');
    const targetNumber = String(req.body?.targetNumber ?? '').replace(/\D/g, '');

    if (!EXT_RE.test(callerExtension)) {
      return res.status(400).json({ success: false, error: 'داخلی نامعتبر است' });
    }
    if (!TARGET_RE.test(targetNumber)) {
      return res.status(400).json({ success: false, error: 'شماره مقصد نامعتبر است' });
    }

    try {
      const blocked = await checkClaim(callerExtension, req.ip || '');
      if (blocked) return res.status(403).json({ success: false, error: blocked });

      const exten = buildTarget(targetNumber);
      const ami = await openAmi();

      originateAndLog(ami, {
        Action: 'Originate',
        Channel: `${CHANNEL_TECH}/${callerExtension}`,
        Context: 'from-internal',
        Exten: exten,
        Priority: 1,
        CallerID: `Click2Call <${callerExtension}>`,
        Variable: {
          'CALLERID(all)': `"Click2Call ${callerExtension}" <${callerExtension}>`,
          ...(AUTO_ANSWER ? resolveAutoAnswerVars(callerExtension) : {})
        },
        Timeout: 30000,
        Async: 'true'
      }, function(err, resAMI) {
        if (err) {
          console.error('AMI Error:', err);
          return res.status(500).json({ success: false, error: err.message || 'خطای AMI' });
        }
        return res.json({ success: true, dialed: exten, response: resAMI });
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // بررسی اینکه آیا داخلی متعلق به همین رایانه است
  router.get('/claim-check', async (req, res) => {
    const ext = String(req.query.ext ?? '').replace(/\D/g, '');
    if (!EXT_RE.test(ext)) return res.json({ mine: false, ip: req.ip });
    try {
      const [rows] = await pool.query('SELECT computer_ip FROM extension_claims WHERE extension = ?', [ext]);
      res.json({ mine: rows.length > 0 && normalizeIp(rows[0].computer_ip) === normalizeIp(req.ip), ip: req.ip });
    } catch (e) {
      console.error('claim-check error:', e.message);
      res.json({ mine: true, ip: req.ip }); // در صورت خطای DB وضعیت فعلی حفظ شود
    }
  });

  return router;
}
