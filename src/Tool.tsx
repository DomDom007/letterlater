import { useEffect, useState } from "react";
import { downloadIcs, localDate } from "./lib/ics";
import { uid, useCopy, useStored } from "./lib/store";
import { prettyDate, todayISO } from "./lib/time";
import { Section, Stat, Stats } from "./ui/kit";
import { QR } from "./ui/QR";

const T = "letterlater";
type Letter = { id: string; to: string; from: string; body: string; opens: string; written: string; link: string };
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const plusYears = (n: number) => { const d = new Date(); d.setFullYear(d.getFullYear() + n); return d.toISOString().slice(0, 10); };

/** Encrypt the letter; the key lives after # so it never reaches a server. The opening date is checked by the page. */
async function seal(l: Omit<Letter, "id" | "link">) {
  const k = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", k, "AES-GCM", false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(l)));
  return `${location.origin}${location.pathname}?${new URLSearchParams({ c: b64(ct), iv: b64(iv), o: l.opens, t: l.to })}#${b64(k)}`;
}

function Opened() {
  const [p] = useState(() => new URLSearchParams(window.location.search));

  const [l, setL] = useState<Omit<Letter, "id" | "link"> | null>(null);
  const [err, setErr] = useState("");
  const opens = p.get("o") ?? "", to = p.get("t") ?? "you";
  const early = opens > todayISO();
  const c = p.get("c") ?? "", iv = p.get("iv") ?? "";
  useEffect(() => {
    if (early) return;
    (async () => {
      try { const key = await crypto.subtle.importKey("raw", unb64(location.hash.slice(1)), "AES-GCM", false, ["decrypt"]); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) as BufferSource }, key, unb64(c) as BufferSource); setL(JSON.parse(new TextDecoder().decode(pt))); }
      catch { setErr("This letter's link is incomplete. Make sure the whole link was copied, including the part after #."); }
    })();
  }, [early, c, iv]);
  if (early) { const days = Math.ceil((new Date(opens).getTime() - Date.now()) / 86400000); return <section className="panel ll-sealed"><p className="eyebrow">A letter for {to}</p><h2>Sealed until {new Date(opens).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</h2><p className="ll-count num">{days.toLocaleString()} days to go</p><p className="note">Keep this link safe. It will open on the day.</p></section>; }
  if (err) return <section className="panel"><p className="pill bad">{err}</p></section>;
  if (!l) return <p className="empty-note">Opening…</p>;
  return <article className="ll-paper"><p className="ll-date">Written {new Date(l.written).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</p><p className="ll-to">Dear {l.to},</p><div className="ll-body">{l.body}</div><p className="ll-from">{l.from}</p></article>;
}

export default function Letterlater() {
  const [p] = useSearchParams();
  const [letters, setLetters] = useStored<Letter[]>(T, "letters", []);
  const [d, setD] = useState({ to: "Adam, on your 18th birthday", from: "Mum", body: "You are six as I write this. This morning you asked why the sea is salty and then, before I could answer, whether fish get thirsty.\n\nI want you to remember that you were always the one asking questions. Keep asking them.\n\nI hope you are kind, and that you still laugh at your own jokes before you finish telling them.", opens: plusYears(12) });
  const [made, setMade] = useState<Letter | null>(null);
  const { copy, copied } = useCopy();
  const css = <style>{`.ll-paper{background:#FBF8F1;color:#2a2622;border-radius:6px;padding:clamp(24px,5vw,56px);box-shadow:var(--shadow);max-width:680px;margin:0 auto;font-family:Georgia,var(--serif),serif;line-height:1.8;font-size:18px}.ll-date{font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8a8178}.ll-to{margin-top:18px;font-size:22px}.ll-body{white-space:pre-wrap;margin:14px 0}.ll-from{font-style:italic;text-align:right;font-size:22px}
  .ll-sealed{text-align:center;display:grid;gap:10px;justify-items:center;padding:48px 20px}.ll-sealed h2{font-size:clamp(26px,4vw,40px)}.ll-count{font-family:var(--serif);font-size:56px}
  .ll-card{background:#FBF8F1;color:#2a2622;border:2px solid #2a2622;border-radius:8px;padding:24px;display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center;max-width:560px}.ll-card h3{font-size:24px}
  @media print{body *{visibility:hidden}.ll-card,.ll-card *{visibility:visible}.ll-card{position:absolute;left:0;top:0}}`}</style>;
  if (p.get("c")) return <>{css}<Opened /></>;

  const make = async () => { const base = { to: d.to.trim(), from: d.from.trim(), body: d.body, opens: d.opens, written: todayISO() }; const link = await seal(base); const l = { ...base, id: uid(), link }; setLetters([l, ...letters]); setMade(l); };
  return (
    <div className="stack">{css}
      <Section title="Letters in the post">
        <Stats><Stat value={letters.length} label="Letters sealed" /><Stat value={letters.length ? prettyDate([...letters].sort((a, b) => a.opens.localeCompare(b.opens))[0].opens) : "–"} label="Next to open" /><Stat value={letters.length ? `${Math.max(...letters.map(l => +l.opens.slice(0, 4))) - new Date().getFullYear()} years` : "–"} label="Furthest ahead" /></Stats>
      </Section>
      <div className="grid2">
        <Section title="Write">
          <div className="stack" style={{ gap: 10 }}>
            <label className="field"><span>To</span><input className="input" value={d.to} onChange={e => setD({ ...d, to: e.target.value })} /></label>
            <label className="field"><span>Letter</span><textarea className="input" rows={10} value={d.body} onChange={e => setD({ ...d, body: e.target.value })} style={{ fontFamily: "Georgia, serif", fontSize: 16, lineHeight: 1.6 }} /></label>
            <div className="row" style={{ alignItems: "flex-end" }}><label className="field"><span>From</span><input className="input" value={d.from} onChange={e => setD({ ...d, from: e.target.value })} /></label><label className="field"><span>Opens on</span><input type="date" className="input" value={d.opens} min={todayISO()} onChange={e => setD({ ...d, opens: e.target.value })} /></label></div>
            <div className="row" style={{ gap: 6 }}>{[1, 5, 10, 20].map(n => <button key={n} className="btn small" onClick={() => setD({ ...d, opens: plusYears(n) })}>In {n} year{n > 1 ? "s" : ""}</button>)}</div>
            <button className="btn primary" style={{ alignSelf: "flex-start" }} disabled={!d.body.trim() || !d.to.trim()} onClick={make}>Seal the letter</button>
          </div>
        </Section>
        {made ? <Section title="Sealed. Now make sure it arrives">
          <div className="stack" style={{ gap: 12 }}>
            <div className="ll-card"><QR text={made.link} size={130} /><div><p className="eyebrow" style={{ color: "#8a8178" }}>Do not open before</p><h3>{new Date(made.opens).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</h3><p>A letter for {made.to}</p><p style={{ fontSize: 13 }}>Scan on the day.</p></div></div>
            <div className="row"><button className="btn primary" onClick={() => window.print()}>Print the sealed card</button><button className="btn" onClick={() => downloadIcs("letter-reminder.ics", [{ title: `Open your letter from ${made.from}`, start: localDate(made.opens), allDay: true, description: made.link, alarmMinutes: 0 }], "Letterlater")}>Calendar reminder</button><button className="btn ghost" onClick={() => copy(made.link)}>{copied ? "Copied" : "Copy link"}</button></div>
            <p className="note">Nothing online can promise to deliver in 20 years, so Letterlater gives you three copies of the key: a printed card to keep with birth certificates or in a keepsake box, a reminder in the recipient's own calendar, and the link. The letter stays sealed until the date, and only someone with the full link can read it.</p>
          </div>
        </Section> : <Section title="How it works"><ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}><li>Write your letter and pick the day it opens.</li><li>It is encrypted on this device into a link. No server stores it.</li><li>Print the sealed card with a QR code, and add a reminder to their calendar.</li><li>Before the date, the link only shows a countdown.</li></ol></Section>}
      </div>
      {letters.length > 0 && <Section title="Your sealed letters">{letters.map(l => <div key={l.id} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", alignItems: "center" }}><span style={{ flex: 1 }}><strong>{l.to}</strong> <span className="note">written {prettyDate(l.written)}</span></span><span className="pill">{l.opens <= todayISO() ? "Can be opened" : `Opens ${prettyDate(l.opens)}`}</span><button className="btn ghost small" onClick={() => setMade(l)}>Card</button><button className="btn ghost small danger" onClick={() => setLetters(letters.filter(x => x.id !== l.id))}>Forget</button></div>)}</Section>}
    </div>
  );
}
