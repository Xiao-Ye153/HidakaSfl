import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const ENDPOINT =
  process.env.ZAPI_ENDPOINT ??
  "https://api.zapi.ink/v1/bypass-tools:safelinku/resolve";
const ALLOWED_HOSTS = ["sfl.gl"];

// Pembatas sederhana per IP (best-effort; di serverless tiap instance punya memori sendiri)
const WINDOW_MS = 60_000;
const MAX_HITS = 8;
const hits = new Map<string, number[]>();

function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_HITS;
}

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function readRemaining(d: any): number | null {
  const q = d?.quota ?? d?.data?.quota ?? d;
  const v = q?.remaining ?? q?.sisa ?? q?.left ?? q?.quota_left;
  return typeof v === "number" ? v : v != null && !isNaN(Number(v)) ? Number(v) : null;
}

export async function POST(req: NextRequest) {
  const key = process.env.ZAPI_KEY;
  if (!key) return fail("Server belum diatur: ZAPI_KEY kosong.", 500);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "anon";
  if (limited(ip)) return fail("Terlalu cepat. Tunggu sebentar lalu coba lagi.", 429);

  let link = "";
  try {
    const body = await req.json();
    link = String(body?.url ?? "").trim();
  } catch {
    return fail("Permintaan tidak valid.", 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    return fail("Itu bukan URL yang valid.", 400);
  }
  const host = parsed.hostname.toLowerCase();
  if (!["http:", "https:"].includes(parsed.protocol) || !ALLOWED_HOSTS.some((d) => host === d || host.endsWith("." + d))) {
    return fail("Link ini bukan link SFL (sfl.gl).", 400);
  }

  try {
    const res = await fetch(`${ENDPOINT}?url=${encodeURIComponent(parsed.toString())}`, {
      headers: { "x-api-key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }

    if (!res.ok) {
      const apiMsg = data?.message || data?.error || data?.msg;
      if (res.status === 401 || res.status === 403) return fail("API key ditolak oleh ZAPI.", 502);
      if (res.status === 429 || /quota|kuota|limit/i.test(String(apiMsg ?? "")))
        return fail("Kuota API habis atau batas permintaan tercapai.", 429);
      return fail(String(apiMsg || `ZAPI membalas status ${res.status}.`), 502);
    }

    const out = data?.data?.finalUrl;
    if (typeof out !== "string" || !out) return fail("ZAPI tidak mengembalikan link tujuan.", 502);

    return NextResponse.json({ url: out, remaining: readRemaining(data) });
  } catch (e: any) {
    if (e?.name === "TimeoutError") return fail("ZAPI terlalu lama merespons. Coba lagi.", 504);
    return fail("Tidak bisa menghubungi ZAPI.", 502);
  }
}
