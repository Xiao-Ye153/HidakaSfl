"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Item = { from: string; out: string };
type View =
  | { s: "idle" }
  | { s: "loading" }
  | { s: "error"; msg: string }
  | { s: "done"; from: string; out: string };

const KEY = "hidakasfl:riwayat";

function normalize(raw: string) {
  const t = raw.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : "https://" + t;
}

function safeHref(u: string) {
  return /^https?:\/\//i.test(u) ? u : undefined;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    ta.remove();
    return ok;
  }
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [view, setView] = useState<View>({ s: "idle" });
  const [hist, setHist] = useState<Item[]>([]);
  const [quota, setQuota] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setHist(JSON.parse(localStorage.getItem(KEY) || "[]"));
    } catch {}
  }, []);

  function saveHist(next: Item[]) {
    setHist(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (view.s === "loading") return;
    const link = normalize(url);
    if (!link) {
      setView({ s: "error", msg: "Tempel link SFL dulu." });
      inputRef.current?.focus();
      return;
    }
    setUrl(link);
    setView({ s: "loading" });
    try {
      const res = await fetch("/api/bypass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setView({ s: "error", msg: data.error || "Gagal memproses link. Coba lagi." });
        return;
      }
      setView({ s: "done", from: link, out: data.url });
      if (typeof data.remaining === "number") setQuota(data.remaining);
      saveHist([{ from: link, out: data.url }, ...hist.filter((h) => h.out !== data.url)].slice(0, 6));
    } catch {
      setView({ s: "error", msg: "Tidak ada koneksi ke server. Periksa internet lalu coba lagi." });
    }
  }

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      setUrl(t.trim());
      if (view.s === "error") setView({ s: "idle" });
    } catch {
      inputRef.current?.focus();
    }
  }

  async function copy(text: string) {
    if (await copyText(text)) {
      setCopied(text);
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1600);
    }
  }

  const busy = view.s === "loading";

  return (
    <main className="shell">
      <header className="bar">
        <span className="mark">HidakaSFL</span>
        {quota !== null && <span className="quota">Sisa kuota {quota}</span>}
      </header>

      <h1>Link SFL, langsung ke tujuannya.</h1>

      <section className="tool" aria-label="Bypass link SFL">
        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="url">Link SFL</label>
          <div className="row">
            <input
              id="url"
              ref={inputRef}
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="sfl.gl/..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (view.s === "error") setView({ s: "idle" });
              }}
            />
            <button type="button" className="paste" onClick={paste}>
              Tempel
            </button>
          </div>

          <button type="submit" className="go" disabled={busy} data-busy={busy || undefined}>
            {busy ? "Memproses…" : "Bypass"}
          </button>
        </form>

        <p className={"msg" + (view.s === "error" ? " bad" : "")} role="status" aria-live="polite">
          {view.s === "error" && view.msg}
          {view.s === "loading" && "Menghubungi ZAPI, biasanya beberapa detik."}
        </p>

        {view.s === "done" && (
          <div className="result" key={view.out}>
            <p className="from">
              <span>{view.from}</span>
            </p>
            <p className="out">{view.out}</p>
            <div className="actions">
              <button type="button" className="btn fill" onClick={() => copy(view.out)}>
                {copied === view.out ? "Tersalin" : "Salin link"}
              </button>
              <a className="btn" href={safeHref(view.out)} target="_blank" rel="noopener noreferrer">
                Buka link
              </a>
            </div>
          </div>
        )}
      </section>

      <section className="hist" aria-label="Riwayat">
        <div className="hhead">
          <h2>Riwayat</h2>
          {hist.length > 0 && (
            <button type="button" className="linkbtn" onClick={() => saveHist([])}>
              Hapus semua
            </button>
          )}
        </div>
        {hist.length === 0 ? (
          <p className="empty">Hasil bypass terakhir akan tersimpan di sini, hanya di perangkat ini.</p>
        ) : (
          <ul>
            {hist.map((h) => (
              <li key={h.out}>
                <div className="hu">
                  <b>{h.out}</b>
                  <span>dari {h.from}</span>
                </div>
                <button type="button" className="linkbtn" onClick={() => copy(h.out)}>
                  {copied === h.out ? "Tersalin" : "Salin"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="foot">HidakaSFL memakai API ZAPI.</footer>
    </main>
  );
}
