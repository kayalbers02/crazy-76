// Crazy 76: spelregels en puntentelling, gedeeld door de teamapp en het begeleidersdashboard.
// Alles wat punten oplevert of kost staat hier, zodat beide apps altijd dezelfde stand laten zien.
(() => {
  const C76 = window.C76 = window.C76 || {};

  C76.RULES = {
    durationMin: 180,      // speelduur
    latePer5: 3,           // strafpunten per begonnen 5 minuten te laat
    halveAfterMin: 30,     // meer dan 30 minuten te laat: helft van de punten
    juryMax: 5,            // jurybonus voor legendarische uitvoeringen
    dartsNr: 58,           // opdracht met een bonus bij winst
    dartsBonus: 2,
    maxMedia: 6,           // bestanden per inzending
    maxVideoMB: 150,
    maxImageMB: 30,
    teams: ['A', 'B'],
    penaltyPresets: [
      { amount: 10, reason: 'Taxi of Uber gebruikt' },
      { amount: 10, reason: 'Nep-bewijs of vals spelen' },
      { amount: 5, reason: 'Doorgegaan bij iemand die nee zei' },
    ],
    rejectPresets: [
      'Geen of onduidelijk bewijs',
      'Niet genoeg teamleden in beeld',
      'Opdracht niet volledig gedaan',
      'Verkeerde opdracht ingestuurd',
    ],
  };

  C76.DEFAULTS = {
    state: { startAt: null, durationMin: 180, finishedAt: null, pin: '7676', createdAt: null },
    teams: {
      A: { name: 'Team 1', code: '1010', dubbel: null, dubbelAt: null, finishAt: null, jury: 0, darts: false, penalties: [] },
      B: { name: 'Team 2', code: '2020', dubbel: null, dubbelAt: null, finishAt: null, jury: 0, darts: false, penalties: [] },
    },
  };

  const pad = n => String(n).padStart(2, '0');
  C76.fmt = {
    pad,
    hhmm: ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; },
    hms: ms => { const t = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(t / 3600)}:${pad(Math.floor(t % 3600 / 60))}:${pad(t % 60)}`; },
    signed: v => v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0',
    durText: min => min % 60 ? `${Math.floor(min / 60)} uur ${min % 60} min` : `${min / 60} uur`,
    ago: (ms, now = Date.now()) => {
      const m = Math.round((now - ms) / 60000);
      return m < 1 ? 'zojuist' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} u ${m % 60} min`;
    },
    mb: bytes => bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} kB` : `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`,
    dur: sec => sec ? `${Math.floor(sec / 60)}:${pad(Math.round(sec % 60))}` : '',
  };

  C76.endAt = state => state && state.startAt ? state.startAt + (state.durationMin || C76.RULES.durationMin) * 60000 : null;

  // Klok voor het hele spel (beide teams).
  C76.clock = (state, now = Date.now()) => {
    const dur = ((state && state.durationMin) || C76.RULES.durationMin) * 60000;
    if (!state || !state.startAt) return { phase: 'idle', label: 'Wacht op start', value: C76.fmt.hms(dur), endAt: null };
    const endAt = state.startAt + dur;
    if (state.finishedAt) return { phase: 'closed', label: 'Spel afgesloten', value: C76.fmt.hhmm(state.finishedAt), endAt };
    if (now < endAt) {
      const rem = endAt - now;
      return { phase: rem < 15 * 60000 ? 'soon' : 'run', label: `Nog · eind ${C76.fmt.hhmm(endAt)}`, value: C76.fmt.hms(rem), endAt, rem };
    }
    return { phase: 'over', label: 'Over tijd', value: '+' + C76.fmt.hms(now - endAt), endAt };
  };

  // Puntentelling van één team.
  C76.score = (teamId, team, subs, state, now = Date.now()) => {
    const R = C76.RULES;
    team = team || C76.DEFAULTS.teams[teamId];
    state = state || {};
    const mine = (subs || []).filter(s => s.team === teamId);
    const byNr = new Map(mine.map(s => [s.nr, s]));
    const approved = mine.filter(s => s.status === 'approved');
    const pending = mine.filter(s => s.status === 'pending');
    const rejected = mine.filter(s => s.status === 'rejected');
    const ptsOf = list => list.reduce((a, s) => a + ((C76.BY_NR.get(s.nr) || {}).pts || 0), 0);
    const base = ptsOf(approved);
    const pendingPts = ptsOf(pending);
    const openPts = C76.TASKS.filter(t => !byNr.has(t.nr)).reduce((a, t) => a + t.pts, 0);
    const endAt = C76.endAt(state);
    const closed = !!(team.finishAt || state.finishedAt);

    let dubbel = null;
    if (team.dubbel && C76.BY_NR.has(team.dubbel)) {
      const t = C76.BY_NR.get(team.dubbel);
      const s = byNr.get(team.dubbel);
      const st = !s ? (closed ? 'miss' : 'open')
        : s.status === 'approved' ? 'hit'
        : s.status === 'rejected' ? 'miss'
        : 'pending';
      dubbel = { nr: team.dubbel, pts: t.pts, state: st, value: st === 'hit' ? t.pts : st === 'miss' ? -t.pts : 0 };
    }

    const dartsSub = byNr.get(R.dartsNr);
    const darts = team.darts && dartsSub && dartsSub.status === 'approved' ? R.dartsBonus : 0;
    const jury = Math.min(R.juryMax, Math.max(0, team.jury || 0));
    const penalties = team.penalties || [];
    const penaltyPts = penalties.reduce((a, p) => a + (p.amount || 0), 0);

    let lateMin = 0;
    if (endAt) {
      const ref = team.finishAt || state.finishedAt || now;
      if (ref > endAt) lateMin = (ref - endAt) / 60000;
    }
    const latePen = lateMin > 0 ? Math.ceil(lateMin / 5) * R.latePer5 : 0;
    const halved = lateMin > R.halveAfterMin;
    const sub = base + (dubbel ? dubbel.value : 0) + jury + darts - latePen - penaltyPts;
    const total = halved ? Math.round(sub / 2) : sub;
    const dubbelOpen = dubbel && (dubbel.state === 'open' || dubbel.state === 'pending') ? dubbel.pts : 0;
    const maxReachable = total + openPts + pendingPts + dubbelOpen;

    return { teamId, base, approved, pending, rejected, openPts, pendingPts, dubbel, darts, jury, penalties, penaltyPts,
      lateMin, latePen, halved, sub, total, maxReachable, endAt, closed, byNr, mine };
  };

  // Per categorie: gedaan en punten.
  C76.catScore = (teamId, subs) => {
    const ok = new Set((subs || []).filter(s => s.team === teamId && s.status === 'approved').map(s => s.nr));
    return C76.SECTIONS.map(s => {
      const done = s.items.filter(t => ok.has(t.nr));
      return { title: s.title, n: s.items.length, done: done.length, pts: done.reduce((a, t) => a + t.pts, 0), max: s.max };
    });
  };

  // Status van één opdracht voor een team.
  C76.taskStatus = (sub) => sub ? sub.status : 'open';
})();
