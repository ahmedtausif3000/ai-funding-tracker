(async function () {
  const $ = (s) => document.querySelector(s);
  const fmtUsd = (n) => n == null ? '<span class="muted">not disclosed</span>' : n >= 1e9 ? `$${(n / 1e9).toFixed(n % 1e9 ? 2 : 0)}B` : `$${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`;
  const fmtDate = (d) => { const t = new Date(d + 'T00:00:00Z'); return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

  let data = { rounds: [] }, meta = {};
  try {
    [data, meta] = await Promise.all([fetch('rounds.json', { cache: 'no-store' }).then((r) => r.json()), fetch('meta.json', { cache: 'no-store' }).then((r) => r.json())]);
  } catch (e) { $('#empty').hidden = false; $('#empty').textContent = 'Could not load rounds.json.'; return; }

  const lastRun = meta.last_run;
  const stats = [
    [meta.week?.count ?? 0, 'rounds this week'],
    [meta.week ? fmtUsd(meta.week.total_usd).replace(/<[^>]+>/g, '') : '—', 'raised this week'],
    [meta.week?.largest ? `${meta.week.largest.company}` : '—', meta.week?.largest ? `largest · ${fmtUsd(meta.week.largest.amount_usd).replace(/<[^>]+>/g, '')}` : 'largest this week'],
    [meta.in_view ?? 0, 'rounds on record'],
  ];
  $('#stats').innerHTML = stats.map(([b, s]) => `<div class="stat"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');
  $('#foot').textContent = `Last updated ${meta.generated_at ? new Date(meta.generated_at).toLocaleString() : 'unknown'} · latest run ${lastRun || 'none'} · ${meta.total_rounds || 0} rows stored including out-of-scope.`;

  const state = { q: '', stage: '', range: 30, min: 15, showall: false, sortKey: 'announced_date', asc: false, shown: 0 };
  const PAGE = 60;
  const stored = (() => { try { return JSON.parse(localStorage.getItem('aift:v1') || '{}'); } catch { return {}; } })();
  Object.assign(state, stored, { shown: 0 });
  $('#q').value = state.q; $('#stage').value = state.stage; $('#range').value = String(state.range); $('#min').value = state.min; $('#showall').checked = state.showall;

  function filtered() {
    const q = state.q.trim().toLowerCase();
    const since = state.range ? Date.now() - state.range * 86400e3 : 0;
    const min = (Number(state.min) || 0) * 1e6;
    return data.rounds.filter((r) => {
      if (!state.showall && !r.in_view) return false;
      if (state.stage && r.stage_bucket !== state.stage) return false;
      if (since && Date.parse(r.announced_date) < since) return false;
      if (min && (r.amount_usd || 0) < min && !(state.showall && r.amount_usd == null)) return false;
      if (q) {
        const hay = [r.company, r.description, r.round_type, ...(r.investors || []), r.hq_city, r.hq_state].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      const k = state.sortKey; let va = a[k], vb = b[k];
      if (Array.isArray(va)) va = va.join(', '); if (Array.isArray(vb)) vb = vb.join(', ');
      if (va == null) return 1; if (vb == null) return -1;
      const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return (state.asc ? c : -c) || b.announced_date.localeCompare(a.announced_date);
    });
  }

  function row(r) {
    const isNew = r.first_seen_run === lastRun;
    const chips = (arr) => arr && arr.length ? arr.map((x) => `<span class="chip">${esc(x)}</span>`).join('') : '<span class="muted">not disclosed</span>';
    const loc = [r.hq_city, r.hq_state || (r.hq_country !== 'US' ? r.hq_country : '')].filter(Boolean).join(', ');
    return `<tr class="${r.in_view ? '' : 'out'}">
      <td class="tx">${esc(r.transaction_name || `${r.round_type} - ${r.company}`)}${isNew ? '<span class="badge">NEW</span>' : ''}</td>
      <td class="num">${fmtUsd(r.amount_usd)}</td>
      <td>${esc(fmtDate(r.announced_date))}</td>
      <td>${esc(r.round_type)}<div class="muted" style="font-size:12px">${esc(r.stage_bucket)}</div></td>
      <td>${chips(r.lead_investors)}</td>
      <td><b>${r.website ? `<a href="https://${esc(r.website.replace(/^https?:\/\//, ''))}" target="_blank" rel="noopener">${esc(r.company)}</a>` : esc(r.company)}</b>${loc ? `<div class="muted" style="font-size:12px">${esc(loc)}</div>` : ''}</td>
      <td class="desc">${esc(r.description || '')}</td>
      <td>${chips(r.investors)}</td>
      <td class="src">${(r.source_urls || []).slice(0, 4).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))}</a>`).join('')}</td>
    </tr>`;
  }

  let current = [];
  function render(reset = true) {
    if (reset) { current = filtered(); state.shown = 0; $('#rows').innerHTML = ''; }
    const next = current.slice(state.shown, state.shown + PAGE);
    $('#rows').insertAdjacentHTML('beforeend', next.map(row).join(''));
    state.shown += next.length;
    $('#more').textContent = state.shown < current.length ? `Showing ${state.shown} of ${current.length} · scroll for more` : current.length ? `${current.length} round${current.length === 1 ? '' : 's'}` : '';
    $('#empty').hidden = current.length > 0;
    document.querySelectorAll('th[data-k]').forEach((th) => { th.classList.toggle('sorted', th.dataset.k === state.sortKey); th.classList.toggle('asc', th.dataset.k === state.sortKey && state.asc); });
    try { localStorage.setItem('aift:v1', JSON.stringify({ q: state.q, stage: state.stage, range: state.range, min: state.min, showall: state.showall, sortKey: state.sortKey, asc: state.asc })); } catch {}
  }

  $('#q').addEventListener('input', (e) => { state.q = e.target.value; render(); });
  $('#stage').addEventListener('change', (e) => { state.stage = e.target.value; render(); });
  $('#range').addEventListener('change', (e) => { state.range = Number(e.target.value); render(); });
  $('#min').addEventListener('input', (e) => { state.min = e.target.value; render(); });
  $('#showall').addEventListener('change', (e) => { state.showall = e.target.checked; render(); });
  document.querySelectorAll('th[data-k]').forEach((th) => th.addEventListener('click', () => { const k = th.dataset.k; if (state.sortKey === k) state.asc = !state.asc; else { state.sortKey = k; state.asc = k !== 'amount_usd' && k !== 'announced_date'; } render(); }));
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && state.shown < current.length) render(false); });
  io.observe($('#more'));
  render();
})();
