import { useState, useEffect, useRef, useCallback } from "react";

// ---------- Design tokens: "Royal Diamond" velvet & champagne ----------
const T = {
  bg: "#141019",        // deep velvet aubergine-black
  panel: "#1E1826",     // raised velvet
  line: "#3A3046",      // soft seam
  gold: "#D9BC7A",      // champagne gold
  goldDeep: "#A8873F",
  ivory: "#F5EFE4",     // warm ivory text
  dim: "#9B8FA8",       // muted lavender-grey
  rose: "#D98CA0",      // polish rose (alerts / time's up)
  green: "#8FBF9B",     // running
};

const STATIONS = [1, 2, 3];
const KEY = "rd-timers-v1";
const POLL_MS = 2000;

// ---------- shared storage helpers ----------
async function readTimers() {
  try {
    const r = await window.storage.get(KEY, true);
    return r ? JSON.parse(r.value) : {};
  } catch {
    return {};
  }
}
async function writeTimers(obj) {
  try {
    await window.storage.set(KEY, JSON.stringify(obj), true);
    return true;
  } catch {
    return false;
  }
}

// ---------- audio chime (needs a prior user tap) ----------
function useChime() {
  const ctxRef = useRef(null);
  const unlock = useCallback(() => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctxRef.current = new AC();
    }
    if (ctxRef.current && ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
  }, []);
  const ring = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    [0, 0.35, 0.7].forEach((off, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(i === 2 ? 1318 : 988, now + off);
      g.gain.setValueAtTime(0.0001, now + off);
      g.gain.exponentialRampToValueAtTime(0.4, now + off + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + off + 0.32);
      o.connect(g).connect(ctx.destination);
      o.start(now + off);
      o.stop(now + off + 0.35);
    });
  }, []);
  return { unlock, ring };
}

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// ---------- shared chrome ----------
function Crest({ small }) {
  return (
    <div style={{ textAlign: "center", padding: small ? "14px 0 4px" : "34px 0 8px" }}>
      <div style={{ color: T.gold, letterSpacing: "0.45em", fontSize: 10, fontFamily: "'Jost',sans-serif", textTransform: "uppercase" }}>
        Royal ◆ Diamond
      </div>
      {!small && (
        <div style={{ fontFamily: "'Cormorant Garamond',serif", color: T.ivory, fontSize: 34, fontWeight: 500, marginTop: 4 }}>
          Station Timers
        </div>
      )}
    </div>
  );
}

// ---------- role picker ----------
function RolePicker({ onPick }) {
  const btn = {
    display: "block", width: "100%", padding: "18px 20px", marginTop: 14,
    background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14,
    color: T.ivory, fontSize: 18, fontFamily: "'Jost',sans-serif",
    textAlign: "left", cursor: "pointer",
  };
  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 20px 40px" }}>
      <Crest />
      <p style={{ color: T.dim, fontFamily: "'Jost',sans-serif", fontSize: 14, textAlign: "center", margin: "6px 0 22px" }}>
        Who is using this device?
      </p>
      <button style={{ ...btn, borderColor: T.goldDeep }} onClick={() => onPick("reception")}>
        <span style={{ color: T.gold, fontSize: 12, letterSpacing: "0.2em", display: "block", textTransform: "uppercase" }}>Controller</span>
        Reception
      </button>
      {STATIONS.map((n) => (
        <button key={n} style={btn} onClick={() => onPick(n)}>
          <span style={{ color: T.dim, fontSize: 12, letterSpacing: "0.2em", display: "block", textTransform: "uppercase" }}>Technician</span>
          Station {n}
        </button>
      ))}
    </div>
  );
}

// ---------- reception ----------
const PRESETS = [5, 10, 15, 20, 30, 45];

function Reception({ timers, refresh, now }) {
  const [busy, setBusy] = useState(null);
  const [custom, setCustom] = useState("");

  const start = async (station, minutes) => {
    if (!minutes || minutes <= 0) return;
    setBusy(station);
    const t = await readTimers();
    t[station] = { endsAt: Date.now() + minutes * 60000, minutes, startedAt: Date.now() };
    await writeTimers(t);
    await refresh();
    setBusy(null);
    setCustom("");
  };
  const cancel = async (station) => {
    setBusy(station);
    const t = await readTimers();
    delete t[station];
    await writeTimers(t);
    await refresh();
    setBusy(null);
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 20px 40px" }}>
      <Crest />
      <p style={{ color: T.dim, fontFamily: "'Jost',sans-serif", fontSize: 13, textAlign: "center", margin: "0 0 18px" }}>
        Reception · tap a time to send it to a station
      </p>
      {STATIONS.map((n) => {
        const tm = timers[n];
        const remaining = tm ? tm.endsAt - now : 0;
        const running = tm && remaining > 0;
        const finished = tm && remaining <= 0;
        return (
          <div key={n} style={{
            background: T.panel, border: `1px solid ${finished ? T.rose : running ? T.goldDeep : T.line}`,
            borderRadius: 16, padding: "16px 18px", marginBottom: 14,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", color: T.ivory, fontSize: 24 }}>
                Station {n}
              </div>
              <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 14, color: finished ? T.rose : running ? T.green : T.dim }}>
                {finished ? "Time's up" : running ? `${fmt(remaining)} left` : "Idle"}
              </div>
            </div>
            {running || finished ? (
              <button onClick={() => cancel(n)} disabled={busy === n} style={{
                marginTop: 12, padding: "10px 18px", borderRadius: 10, border: `1px solid ${T.line}`,
                background: "transparent", color: T.dim, fontFamily: "'Jost',sans-serif", fontSize: 14, cursor: "pointer",
              }}>
                {finished ? "Clear" : "Cancel timer"}
              </button>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {PRESETS.map((m) => (
                  <button key={m} onClick={() => start(n, m)} disabled={busy === n} style={{
                    padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.goldDeep}`,
                    background: "transparent", color: T.gold, fontFamily: "'Jost',sans-serif",
                    fontSize: 15, cursor: "pointer", minWidth: 62,
                  }}>
                    {m} min
                  </button>
                ))}
                <input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="min"
                  inputMode="numeric"
                  style={{
                    width: 58, padding: "10px 10px", borderRadius: 10, border: `1px solid ${T.line}`,
                    background: T.bg, color: T.ivory, fontFamily: "'Jost',sans-serif", fontSize: 15,
                  }}
                />
                <button onClick={() => start(n, parseInt(custom, 10))} disabled={busy === n || !custom} style={{
                  padding: "10px 14px", borderRadius: 10, border: "none",
                  background: custom ? T.gold : T.line, color: T.bg,
                  fontFamily: "'Jost',sans-serif", fontSize: 15, cursor: "pointer", fontWeight: 500,
                }}>
                  Send
                </button>
              </div>
            )}
          </div>
        );
      })}
      <p style={{ color: T.dim, fontFamily: "'Jost',sans-serif", fontSize: 12, textAlign: "center", marginTop: 8 }}>
        Phones update within a couple of seconds. Keep this page open.
      </p>
    </div>
  );
}

// ---------- station (technician phone) ----------
function Station({ station, timers, now, ring }) {
  const tm = timers[station];
  const remaining = tm ? tm.endsAt - now : 0;
  const running = tm && remaining > 0;
  const finished = tm && remaining <= 0;
  const [dismissedAt, setDismissedAt] = useState(0);
  const alarmed = useRef(0);

  // ring repeatedly while finished and not dismissed
  useEffect(() => {
    if (finished && tm.endsAt !== dismissedAt) {
      if (Date.now() - alarmed.current > 2500) {
        alarmed.current = Date.now();
        ring();
      }
    }
  }, [finished, now, tm, dismissedAt, ring]);

  // keep screen awake
  useEffect(() => {
    let lock;
    if (navigator.wakeLock) {
      navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    }
    return () => lock && lock.release().catch(() => {});
  }, []);

  const total = tm ? tm.minutes * 60000 : 1;
  const frac = running ? Math.max(0, remaining / total) : 0;
  const R = 120, C = 2 * Math.PI * R;
  const showAlarm = finished && tm.endsAt !== dismissedAt;

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 20px 40px", textAlign: "center" }}>
      <Crest small />
      <div style={{ fontFamily: "'Cormorant Garamond',serif", color: T.ivory, fontSize: 30, margin: "4px 0 18px" }}>
        Station {station}
      </div>
      <div style={{ position: "relative", width: 280, height: 280, margin: "0 auto" }}>
        <svg width="280" height="280" viewBox="0 0 280 280" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="140" cy="140" r={R} fill="none" stroke={T.line} strokeWidth="6" />
          {running && (
            <circle cx="140" cy="140" r={R} fill="none" stroke={T.gold} strokeWidth="6"
              strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)}
              style={{ transition: "stroke-dashoffset 1s linear" }} />
          )}
          {showAlarm && (
            <circle cx="140" cy="140" r={R} fill="none" stroke={T.rose} strokeWidth="6" />
          )}
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}>
          {running ? (
            <>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", color: T.ivory, fontSize: 62, fontVariantNumeric: "tabular-nums" }}>
                {fmt(remaining)}
              </div>
              <div style={{ fontFamily: "'Jost',sans-serif", color: T.dim, fontSize: 13, letterSpacing: "0.15em", textTransform: "uppercase" }}>
                {tm.minutes} min timer
              </div>
            </>
          ) : showAlarm ? (
            <div style={{ fontFamily: "'Cormorant Garamond',serif", color: T.rose, fontSize: 40 }}>
              Time's up
            </div>
          ) : (
            <div style={{ fontFamily: "'Jost',sans-serif", color: T.dim, fontSize: 15 }}>
              Waiting for reception…
            </div>
          )}
        </div>
      </div>
      {showAlarm && (
        <button onClick={() => setDismissedAt(tm.endsAt)} style={{
          marginTop: 22, padding: "14px 34px", borderRadius: 12, border: "none",
          background: T.rose, color: T.bg, fontFamily: "'Jost',sans-serif", fontSize: 17, cursor: "pointer",
        }}>
          Got it
        </button>
      )}
      <p style={{ color: T.dim, fontFamily: "'Jost',sans-serif", fontSize: 12, marginTop: 26 }}>
        Keep this page open — the screen will stay awake.
      </p>
    </div>
  );
}

// ---------- root ----------
export default function App() {
  const [role, setRole] = useState(null);
  const [timers, setTimers] = useState({});
  const [now, setNow] = useState(Date.now());
  const { unlock, ring } = useChime();

  const refresh = useCallback(async () => {
    setTimers(await readTimers());
  }, []);

  useEffect(() => {
    if (!role) return;
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [role, refresh]);

  const pick = (r) => { unlock(); setRole(r); };

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(1100px 600px at 50% -10%, #241B2F 0%, ${T.bg} 60%)` }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Jost:wght@400;500&display=swap" rel="stylesheet" />
      {!role ? (
        <RolePicker onPick={pick} />
      ) : role === "reception" ? (
        <Reception timers={timers} refresh={refresh} now={now} />
      ) : (
        <Station station={role} timers={timers} now={now} ring={ring} />
      )}
      {role && (
        <div style={{ textAlign: "center", paddingBottom: 20 }}>
          <button onClick={() => setRole(null)} style={{
            background: "none", border: "none", color: T.dim, fontFamily: "'Jost',sans-serif",
            fontSize: 12, cursor: "pointer", textDecoration: "underline",
          }}>
            Switch role
          </button>
        </div>
      )}
    </div>
  );
}
