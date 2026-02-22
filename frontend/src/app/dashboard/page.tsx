"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const FRONTEND_SECRET = process.env.NEXT_PUBLIC_FRONTEND_SECRET || "dmp-frontend-secret";

const TTS_DAILY_LIMIT = 54_333;

interface Profile { name: string; email: string; avatar_url: string; }
interface UserData {
    has_key: boolean; key?: string; plan?: string;
    daily_limit?: number; used_today?: number; total_calls?: number;
    created_at?: string; last_active_at?: string; is_active?: boolean;
    profile?: Profile; message?: string;
}
interface TtsKeyData {
    tts_key: string; label: string; chars_today: number; remaining: number;
    total_chars: number; last_reset: string; created_at: string;
    last_active_at: string | null; is_active: boolean;
}

type ModelTab = "text" | "tts";

// ── Docs data ─────────────────────────────────────────────────────────────────
const DOCS = {
    text: [
        {
            method: "POST", path: "/v1/chat/completions",
            desc: "OpenAI-compatible chat endpoint. Drop-in for OpenAI SDK. Rate limits: 30 RPM · 35K tokens/min · 350 req/day hard cap.",
            auth: "Bearer sk-dmp-*",
            body: `{
  "model":    "dmp1",       // dmp1 (fast) | dmp2 (pro) | dmp3 (smart)
  "messages": [{"role": "user", "content": "Hello!"}],
  "max_tokens": 1024
}`,
        },
        {
            method: "GET", path: "/v1/models",
            desc: "List all available chat models. Returns dmp1 (llama-3.1-8b), dmp2 (mixtral-8x7b), dmp3 (gemini-1.5-flash).",
            auth: "Bearer sk-dmp-*",
            body: null,
        },
        {
            method: "POST", path: "/user/generate-key",
            desc: "Generate or retrieve your DMP API key. Free: 100/day · Basic: 600/day · Pro: 2,000/day.",
            auth: "x-frontend-secret header",
            body: `{ "clerk_user_id": "user_xxx", "name": "...", "email": "..." }`,
        },
    ],

    tts: [
        {
            method: "POST", path: "/v1/tts/generate-key",
            desc: "Generate a TTS API key (sk-tts-*). No auth required.",
            auth: "None",
            body: `{ "label": "My App", "linked_dmp_key": "sk-dmp-..." // optional }`,
        },
        {
            method: "GET", path: "/v1/tts/voices",
            desc: "List all 22 supported TTS voices — no auth required.",
            auth: "None",
            body: null,
        },
        {
            method: "GET", path: "/v1/tts/key-info",
            desc: "Check chars used today and remaining quota for a TTS key.",
            auth: "Bearer sk-tts-*",
            body: null,
        },
        {
            method: "POST", path: "/v1/tts/synthesize",
            desc: "Synthesize text → streaming MP3. Returns audio/mpeg. 54,333 chars/day limit.",
            auth: "Bearer sk-tts-*",
            body: `{
  "text":   "Hello दोस्तों!",
  "voice":  "en-US-AvaMultilingualNeural",
  "rate":   "+0%",           // speed: +20% faster, -20% slower
  "volume": "+0%"            // volume adjustment
}`,
        },
    ],
};

export default function DashboardPage() {
    const { user } = useUser();

    const [userData, setUserData] = useState<UserData | null>(null);
    const [ttsData, setTtsData] = useState<TtsKeyData | null>(null);
    const [ttsGen, setTtsGen] = useState<{ key: string; label: string } | null>(null);

    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [generatingTts, setGeneratingTts] = useState(false);
    const [copied, setCopied] = useState(false);
    const [ttsCopied, setTtsCopied] = useState(false);
    const [showKey, setShowKey] = useState(false);
    const [showTtsKey, setShowTtsKey] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const [modelTab, setModelTab] = useState<ModelTab>("text");
    const [docsTab, setDocsTab] = useState<ModelTab>("text");

    // ── Helpers ───────────────────────────────────────────────────────────────
    const fetchUserData = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true); setError("");
        try {
            const res = await fetch(
                `${API_URL}/user/me?clerk_user_id=${encodeURIComponent(user.id)}`,
                { headers: { "x-frontend-secret": FRONTEND_SECRET } }
            );
            setUserData(await res.json());
        } catch {
            setError("Could not connect to API server. Is it running?");
        } finally { setLoading(false); }
    }, [user?.id]);

    const generateKey = async () => {
        if (!user?.id) return;
        setGenerating(true); setError(""); setSuccessMsg("");
        try {
            const res = await fetch(`${API_URL}/user/generate-key`, {
                method: "POST",
                headers: { "x-frontend-secret": FRONTEND_SECRET, "Content-Type": "application/json" },
                body: JSON.stringify({
                    clerk_user_id: user.id,
                    name: user?.fullName || user?.firstName || "",
                    email: user?.primaryEmailAddress?.emailAddress || "",
                    avatar_url: user?.imageUrl || "",
                }),
            });
            const data = await res.json();
            if (res.ok) { setUserData({ has_key: true, ...data }); setSuccessMsg(data.message || "API key ready!"); setTimeout(() => setSuccessMsg(""), 4000); }
            else { setError(data.detail || "Failed to generate key."); }
        } catch { setError("Request failed. Make sure the API server is running."); }
        finally { setGenerating(false); }
    };

    const generateTtsKey = async () => {
        setGeneratingTts(true); setError("");
        try {
            const body: Record<string, string> = { label: `${user?.firstName || "My"} TTS Key` };
            if (userData?.key) body.linked_dmp_key = userData.key;
            const res = await fetch(`${API_URL}/v1/tts/generate-key`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (res.ok) {
                setTtsGen({ key: data.tts_key, label: data.label });
                setSuccessMsg("TTS key generated! 🎉 Save it — shown only once.");
                setTimeout(() => setSuccessMsg(""), 6000);
            } else { setError(data.detail || "Failed to generate TTS key."); }
        } catch { setError("Request failed."); }
        finally { setGeneratingTts(false); }
    };

    const copyKey = (text: string, setter: (v: boolean) => void) => {
        navigator.clipboard.writeText(text);
        setter(true); setTimeout(() => setter(false), 2000);
    };

    const maskKey = (key: string, show: boolean) =>
        show ? key : key.slice(0, 12) + "•".repeat(20) + key.slice(-4);

    const formatDate = (iso?: string | null) => {
        if (!iso) return "—";
        try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
        catch { return iso; }
    };

    useEffect(() => { fetchUserData(); }, [fetchUserData]);

    const usedToday = userData?.used_today ?? 0;
    const dailyLimit = userData?.daily_limit ?? 50;
    const usagePercent = Math.min(Math.round((usedToday / dailyLimit) * 100), 100);

    const ttsUsed = ttsData?.chars_today ?? 0;
    const ttsPercent = Math.min(Math.round((ttsUsed / TTS_DAILY_LIMIT) * 100), 100);

    const textCodeExample = userData?.key
        ? `import openai

client = openai.OpenAI(
    api_key="${showKey ? userData.key : userData.key.slice(0, 12) + "..."}",
    base_url="${API_URL}/v1"
)

response = client.chat.completions.create(
    model="dmp1",   # dmp1 / dmp2 / dmp3
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)` : "";

    const ttsCodeExample = ttsGen?.key
        ? `import requests

# Synthesize Hindi + English (Hinglish)
response = requests.post(
    "${API_URL}/v1/tts/synthesize",
    headers={"Authorization": "Bearer ${showTtsKey ? ttsGen.key : ttsGen.key.slice(0, 14) + "..."}"},
    json={
        "text":  "Hello दोस्तों! यह TTS API test है।",
        "voice": "en-US-AvaMultilingualNeural",
        "rate":  "+0%",
    }
)
open("speech.mp3", "wb").write(response.content)` : "";

    return (
        <>
            <Navbar />
            <div className="dashboard-page">

                {/* ── Header ──────────────────────────────────────────── */}
                <div className="dashboard-header">
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        {user?.imageUrl && (
                            <img src={user.imageUrl} alt="avatar"
                                style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid rgba(139,92,246,0.4)" }} />
                        )}
                        <div>
                            <h1>
                                Welcome,{" "}
                                <span style={{ background: "var(--gradient-main)", backgroundSize: "200%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                                    {user?.firstName || "Developer"}
                                </span>{" "}👋
                            </h1>
                            <p className="dashboard-welcome">{user?.primaryEmailAddress?.emailAddress}</p>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                        <button className="btn btn-ghost btn-sm" onClick={fetchUserData}>↻ Refresh</button>
                        <Link href="/"><button className="btn btn-ghost btn-sm">← Home</button></Link>
                    </div>
                </div>

                {/* ── Alerts ──────────────────────────────────────────── */}
                {error && <div className="dash-alert error">⚠️ {error}</div>}
                {successMsg && <div className="dash-alert success">✅ {successMsg}</div>}

                {/* ── Model Type Switcher ──────────────────────────────── */}
                <div className="dash-model-tabs">
                    <button
                        className={`dash-model-tab ${modelTab === "text" ? "active" : ""}`}
                        onClick={() => setModelTab("text")}
                    >
                        💬 Text Models
                        <span className="dash-tab-badge">dmp1 · dmp2 · dmp3</span>
                    </button>
                    <button
                        className={`dash-model-tab ${modelTab === "tts" ? "active tts" : ""}`}
                        onClick={() => setModelTab("tts")}
                    >
                        🎙️ TTS Model
                        <span className="dash-tab-badge">54,333 chars/day</span>
                    </button>
                </div>

                {/* ── Loading Skeleton ─────────────────────────────────── */}
                {loading ? (
                    <div className="dashboard-grid">
                        <div className="dashboard-card-full glass-card apikey-box">
                            <div className="skeleton" style={{ width: "40%", height: "14px" }} />
                            <div className="skeleton" style={{ height: "52px", marginTop: "1rem" }} />
                            <div className="skeleton" style={{ height: "8px", marginTop: "1rem", width: "100%" }} />
                        </div>
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="glass-card stat-card">
                                <div className="skeleton" style={{ width: "60%", height: "12px" }} />
                                <div className="skeleton" style={{ height: "36px", marginTop: "0.75rem", width: "50%" }} />
                            </div>
                        ))}
                    </div>
                ) : modelTab === "text" ? (

                    /* ═══════════════════════════════════════════════════════
                       TEXT MODEL DASHBOARD
                    ═══════════════════════════════════════════════════════ */
                    <div className="dashboard-grid">

                        {/* API Key Card */}
                        <div className="dashboard-card-full glass-card apikey-box">
                            <div className="apikey-label">🔑 Your DMP Chat API Key (sk-dmp-*)</div>
                            {userData?.has_key ? (
                                <>
                                    <div className="apikey-display">
                                        <span className="apikey-val">{maskKey(userData.key!, showKey)}</span>
                                        <button className="copy-btn" onClick={() => setShowKey(v => !v)}>{showKey ? "🙈 Hide" : "👁 Show"}</button>
                                        <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={() => copyKey(userData.key!, setCopied)}>
                                            {copied ? "✅ Copied!" : "📋 Copy"}
                                        </button>
                                    </div>
                                    <div style={{ marginBottom: "1rem" }}>
                                        <span style={{
                                            padding: "3px 12px", borderRadius: "100px", fontSize: "0.72rem", fontWeight: 700,
                                            background: userData.is_active ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                                            color: userData.is_active ? "var(--green-400)" : "var(--red-400)",
                                            border: `1px solid ${userData.is_active ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
                                        }}>
                                            {userData.is_active ? "● Active" : "● Deactivated"}
                                        </span>
                                    </div>
                                    <div className="usage-bar-wrap">
                                        <div className="usage-bar-header">
                                            <span>Daily Chat Calls</span>
                                            <span style={{ color: usagePercent > 80 ? "var(--red-400)" : "var(--text-secondary)" }}>
                                                {usedToday} / {dailyLimit} calls ({usagePercent}%)
                                            </span>
                                        </div>
                                        <div className="usage-bar-track">
                                            <div className="usage-bar-fill" style={{
                                                width: `${usagePercent}%`,
                                                background: usagePercent > 80 ? "linear-gradient(90deg,#f87171,#ef4444)" : "var(--gradient-main)"
                                            }} />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="generate-btn-area">
                                    <p>You don&apos;t have an API key yet. Generate one to get started.</p>
                                    <button className="btn btn-primary btn-lg" onClick={generateKey} disabled={generating}>
                                        {generating ? "⏳ Generating..." : "🚀 Generate My Free API Key"}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Plan */}
                        <div className="glass-card stat-card">
                            <div className="stat-label">Current Plan</div>
                            <div className="stat-value purple">{userData?.plan?.toUpperCase() || "—"}</div>
                            <span className={`stat-badge ${userData?.plan || "free"}`}>
                                {userData?.plan === "pro" ? "🔥 Pro" : userData?.plan === "basic" ? "⚡ Basic" : "🆓 Free"}
                            </span>
                            <div style={{ marginTop: "1rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                                {dailyLimit} chat calls / day
                            </div>
                        </div>

                        {/* Calls Today */}
                        <div className="glass-card stat-card">
                            <div className="stat-label">Today&apos;s Calls</div>
                            <div className="stat-value cyan">{usedToday}</div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>of {dailyLimit} daily limit</div>
                        </div>

                        {/* Total Calls */}
                        <div className="glass-card stat-card">
                            <div className="stat-label">Total API Calls</div>
                            <div className="stat-value green">{userData?.total_calls ?? "—"}</div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>Lifetime requests</div>
                        </div>

                        {/* Last Active */}
                        <div className="glass-card stat-card">
                            <div className="stat-label">Last Active</div>
                            <div className="stat-value" style={{ fontSize: "1rem", marginTop: "0.5rem", color: "var(--text-primary)" }}>
                                {formatDate(userData?.last_active_at)}
                            </div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                                Member since {formatDate(userData?.created_at)}
                            </div>
                        </div>

                        {/* Available Models */}
                        <div className="glass-card stat-card">
                            <div className="stat-label">Chat Models</div>
                            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                                {[{ id: "dmp1", desc: "Fast" }, { id: "dmp2", desc: "Pro" }, { id: "dmp3", desc: "Smart" }].map(({ id, desc }) => (
                                    <span key={id} style={{
                                        padding: "5px 14px", borderRadius: "100px", fontFamily: "monospace",
                                        fontSize: "0.82rem", fontWeight: 700,
                                        background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)",
                                        color: "var(--purple-300)"
                                    }}>{id}</span>
                                ))}
                            </div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
                                dmp1 = fast · dmp2 = pro · dmp3 = smart
                            </div>
                        </div>

                        {/* Quick Start */}
                        {userData?.has_key && textCodeExample && (
                            <div className="dashboard-card-full glass-card code-example-card">
                                <h3>⚡ Quick Start — Python (Chat API)</h3>
                                <pre className="code-block">{textCodeExample}</pre>
                                <div style={{ marginTop: "1rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                                    Works with any OpenAI-compatible SDK. Change <code style={{ color: "var(--purple-300)" }}>base_url</code> and <code style={{ color: "var(--purple-300)" }}>api_key</code> — that&apos;s it.
                                </div>
                            </div>
                        )}

                        {/* Profile Card */}
                        {userData?.has_key && (
                            <div className="glass-card apikey-box" style={{ padding: "2rem" }}>
                                <div className="apikey-label">👤 Profile (MongoDB)</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.75rem" }}>
                                    {[
                                        { label: "Name", value: userData.profile?.name || user?.fullName },
                                        { label: "Email", value: userData.profile?.email || user?.primaryEmailAddress?.emailAddress },
                                        { label: "Clerk ID", value: user?.id },
                                    ].map(({ label, value }) => (
                                        <div key={label} style={{ display: "flex", gap: "1rem", fontSize: "0.85rem" }}>
                                            <span style={{ color: "var(--text-muted)", minWidth: "80px" }}>{label}</span>
                                            <span style={{ color: "var(--text-primary)", fontFamily: label === "Clerk ID" ? "monospace" : undefined, fontSize: label === "Clerk ID" ? "0.75rem" : undefined }}>
                                                {value || "—"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                ) : (

                    /* ═══════════════════════════════════════════════════════
                       TTS MODEL DASHBOARD
                    ═══════════════════════════════════════════════════════ */
                    <div className="dashboard-grid">

                        {/* TTS Key Card */}
                        <div className="dashboard-card-full glass-card apikey-box tts-key-card">
                            <div className="apikey-label">🎙️ Your TTS API Key (sk-tts-*)</div>

                            {ttsGen ? (
                                <>
                                    <div className="tts-new-key-notice">
                                        ⚠️ Save this key — it&apos;s shown only once!
                                    </div>
                                    <div className="apikey-display">
                                        <span className="apikey-val tts-key-val">{maskKey(ttsGen.key, showTtsKey)}</span>
                                        <button className="copy-btn" onClick={() => setShowTtsKey(v => !v)}>{showTtsKey ? "🙈 Hide" : "👁 Show"}</button>
                                        <button className={`copy-btn ${ttsCopied ? "copied" : ""}`} onClick={() => copyKey(ttsGen.key, setTtsCopied)}>
                                            {ttsCopied ? "✅ Copied!" : "📋 Copy"}
                                        </button>
                                    </div>
                                    <div className="usage-bar-wrap">
                                        <div className="usage-bar-header">
                                            <span>Daily TTS Characters</span>
                                            <span>0 / 54,333 used</span>
                                        </div>
                                        <div className="usage-bar-track">
                                            <div className="usage-bar-fill tts-bar" style={{ width: "0%" }} />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="generate-btn-area">
                                    <p>Generate a TTS API key to start converting text to speech.</p>
                                    <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", justifyContent: "center", marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                        <span>🌏 Hinglish ready</span>
                                        <span>·</span>
                                        <span>🇮🇳 Hindi + English</span>
                                        <span>·</span>
                                        <span>🎵 MP3 stream</span>
                                        <span>·</span>
                                        <span>22 voices</span>
                                    </div>
                                    <button className="btn btn-tts btn-lg" onClick={generateTtsKey} disabled={generatingTts}>
                                        {generatingTts ? "⏳ Generating..." : "🎙️ Generate TTS API Key"}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* TTS Limit */}
                        <div className="glass-card stat-card">
                            <div className="stat-label">Daily Char Limit</div>
                            <div className="stat-value" style={{ color: "var(--cyan-400)", fontSize: "1.5rem" }}>54,333</div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>characters per day · resets midnight UTC</div>
                        </div>

                        {/* TTS Voices */}
                        <div className="glass-card stat-card">
                            <div className="stat-label">Available Voices</div>
                            <div className="stat-value green">22</div>
                            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
                                {["EN-US", "EN-IN", "EN-GB", "हिंदी"].map(lang => (
                                    <span key={lang} style={{
                                        padding: "2px 8px", borderRadius: "100px", fontSize: "0.68rem", fontWeight: 700,
                                        background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)",
                                        color: "var(--cyan-400)"
                                    }}>{lang}</span>
                                ))}
                            </div>
                        </div>

                        {/* TTS Format */}
                        <div className="glass-card stat-card">
                            <div className="stat-label">Output Format</div>
                            <div className="stat-value purple" style={{ fontSize: "1.5rem" }}>MP3</div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                                audio/mpeg stream · direct download · no storage
                            </div>
                        </div>

                        {/* TTS Best Voices */}
                        <div className="glass-card stat-card">
                            <div className="stat-label">Recommended Voices</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
                                {[
                                    { voice: "en-US-AvaMultilingualNeural", tag: "Hinglish 🌏" },
                                    { voice: "hi-IN-SwaraNeural", tag: "Hindi 🇮🇳" },
                                    { voice: "en-IN-NeerjaExpressiveNeural", tag: "India EN 🎙️" },
                                ].map(({ voice, tag }) => (
                                    <div key={voice} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.78rem" }}>
                                        <code style={{ color: "var(--purple-300)", fontSize: "0.72rem" }}>{voice}</code>
                                        <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap", marginLeft: "0.5rem" }}>{tag}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* TTS Quick Start */}
                        <div className="dashboard-card-full glass-card code-example-card">
                            <h3>🎙️ Quick Start — TTS API (Python)</h3>
                            {ttsGen ? (
                                <pre className="code-block">{ttsCodeExample}</pre>
                            ) : (
                                <pre className="code-block">{`import requests

# Generate your TTS key first (POST /v1/tts/generate-key)
TTS_KEY = "sk-tts-your-key-here"

response = requests.post(
    "${API_URL}/v1/tts/synthesize",
    headers={"Authorization": f"Bearer {TTS_KEY}"},
    json={
        "text":  "Hello दोस्तों! यह TTS API test है।",
        "voice": "en-US-AvaMultilingualNeural",  # best for Hinglish
        "rate":  "+0%",    # speed: +20% faster, -20% slower
    }
)
open("speech.mp3", "wb").write(response.content)
print("Chars used :", response.headers["X-Chars-Used"])
print("Remaining  :", response.headers["X-Chars-Remaining"])`}</pre>
                            )}
                            <div style={{ marginTop: "1rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                                Response includes <code style={{ color: "var(--cyan-400)" }}>X-Chars-Used</code>, <code style={{ color: "var(--cyan-400)" }}>X-Chars-Remaining</code>, and <code style={{ color: "var(--cyan-400)" }}>X-Daily-Limit</code> headers.
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════
                    DOCS SECTION  
                ═══════════════════════════════════════════════════════ */}
                <div className="docs-section">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
                        <h2 className="docs-title">📖 API Reference</h2>
                        <div className="docs-tabs">
                            <button className={`docs-tab ${docsTab === "text" ? "active" : ""}`} onClick={() => setDocsTab("text")}>💬 Chat API</button>
                            <button className={`docs-tab ${docsTab === "tts" ? "active tts" : ""}`} onClick={() => setDocsTab("tts")}>🎙️ TTS API</button>
                        </div>
                    </div>

                    <div className="docs-grid">
                        {DOCS[docsTab].map((endpoint) => (
                            <div key={endpoint.path} className="glass-card docs-card">
                                <div className="docs-card-header">
                                    <span className={`docs-method ${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                                    <code className="docs-path">{endpoint.path}</code>
                                </div>
                                <p className="docs-desc">{endpoint.desc}</p>
                                <div className="docs-auth">
                                    <span className="docs-auth-label">Auth:</span>
                                    <code>{endpoint.auth}</code>
                                </div>
                                {endpoint.body && (
                                    <div>
                                        <div className="docs-auth-label" style={{ marginBottom: "0.5rem" }}>Body:</div>
                                        <pre className="docs-code">{endpoint.body}</pre>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="docs-swagger-link">
                        <a href={`${API_URL}/docs`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                            📄 Open Full Swagger Docs →
                        </a>
                        <a href={`${API_URL}/v1/tts/voices`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                            🎙️ All 22 TTS Voices →
                        </a>
                    </div>
                </div>

            </div>
        </>
    );
}
