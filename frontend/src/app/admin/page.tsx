"use client";

import { useState, useCallback, useEffect } from "react";
import Navbar from "@/components/Navbar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────
type Status = "idle" | "loading" | "error" | "ready";

interface PlanStat {
    users: number; calls_today: number; total_calls: number; active_users: number;
}
interface Stats {
    chat: {
        total_users: number; active_users: number; users_with_key: number;
        active_this_week: number; plan_breakdown: Record<string, PlanStat>;
        total_api_calls: number; calls_today: number;
    };
    tts: {
        total_tts_keys: number; active_tts_keys: number;
        total_chars_synthesized: number; chars_today: number; daily_limit_per_key: number;
    };
    generated_at: string;
}
interface ChatUser {
    key: string; plan: string; used_today: number; total_calls: number;
    daily_limit: number; created_at: string; last_active_at: string | null;
    is_active: boolean; clerk_user_id: string | null;
    profile?: { name?: string; email?: string };
    tts_keys_count?: number; services?: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString();
const timeAgo = (iso: string | null | undefined) => {
    if (!iso) return "Never";
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};
const PLAN_COLOR: Record<string, string> = {
    free: "rgba(255,255,255,0.4)", basic: "var(--purple-300)", pro: "#fbbf24",
};

// ─────────────────────────────────────────────────────────────────────────────
export default function AdminPage() {
    const [secret, setSecret] = useState("");
    const [status, setStatus] = useState<Status>("idle");
    const [error, setError] = useState("");
    const [stats, setStats] = useState<Stats | null>(null);
    const [users, setUsers] = useState<ChatUser[]>([]);
    const [totalUsers, setTotalUsers] = useState(0);

    const fetchAll = useCallback(async (s: string) => {
        setStatus("loading");
        try {
            const h = { "x-admin-secret": s };
            const [sRes, uRes] = await Promise.all([
                fetch(`${API_BASE}/admin/stats`, { headers: h }),
                fetch(`${API_BASE}/admin/users?skip=0&limit=50`, { headers: h }),
            ]);
            if (sRes.status === 403) { setError("Wrong admin secret."); setStatus("error"); return; }
            if (!sRes.ok) { setError(`Stats error ${sRes.status}: ${await sRes.text()}`); setStatus("error"); return; }
            if (!uRes.ok) { setError(`Users error ${uRes.status}: ${await uRes.text()}`); setStatus("error"); return; }
            const [sd, ud] = await Promise.all([sRes.json(), uRes.json()]);
            if (!sd?.chat || !sd?.tts) { setError(`Unexpected response:\n${JSON.stringify(sd, null, 2)}`); setStatus("error"); return; }
            setStats(sd);
            setUsers(Array.isArray(ud.users) ? ud.users : []);
            setTotalUsers(ud.total ?? 0);
            setStatus("ready");
        } catch (e) { setError(`Cannot reach backend.\n${e}`); setStatus("error"); }
    }, []);

    // ── Login / Loading / Error ────────────────────────────────────────────────
    if (status !== "ready") return (
        <>
            <Navbar />
            <main className="admin-login-wrap">
                <div className="glass-card admin-login-card">
                    {status === "idle" && <>
                        <div className="admin-login-icon">🔐</div>
                        <h1 className="admin-login-title">Admin Dashboard</h1>
                        <p className="admin-login-sub">Enter your admin secret to view analytics</p>
                        <form onSubmit={(e) => { e.preventDefault(); fetchAll(secret); }} className="admin-login-form">
                            <input type="password" placeholder="Admin secret…" value={secret}
                                onChange={e => setSecret(e.target.value)} className="admin-secret-input" autoFocus />
                            <button type="submit" className="btn btn-primary" disabled={!secret} style={{ width: "100%" }}>
                                View Dashboard →
                            </button>
                        </form>
                    </>}
                    {status === "loading" && <>
                        <div className="admin-login-icon">⏳</div>
                        <p style={{ color: "var(--text-muted)" }}>Loading analytics…</p>
                    </>}
                    {status === "error" && <>
                        <div className="admin-login-icon">⚠️</div>
                        <pre style={{ color: "#f87171", fontSize: "0.78rem", whiteSpace: "pre-wrap", textAlign: "left", maxHeight: 200, overflowY: "auto" }}>{error}</pre>
                        <button className="btn btn-ghost" style={{ marginTop: "1rem", width: "100%" }} onClick={() => setStatus("idle")}>← Try again</button>
                    </>}
                </div>
            </main>
        </>
    );

    // ── Dashboard ─────────────────────────────────────────────────────────────
    const s = stats!;
    const chatUsers = users.filter(u => (u.services ?? ["chat"]).includes("chat")).length;
    const ttsUsers = users.filter(u => (u.services ?? []).includes("tts")).length;
    const bothServices = users.filter(u => (u.services ?? []).length > 1).length;
    const topService = s.tts.active_tts_keys > s.chat.total_users ? "TTS API" : "Chat API";

    return (
        <>
            <Navbar />
            <main className="admin-main">

                {/* ── Header ─────────────────────────────────────────── */}
                <div className="admin-header">
                    <div>
                        <h1 className="admin-title">⚙️ Admin Dashboard</h1>
                        <p className="admin-sub">Updated {new Date(s.generated_at).toLocaleTimeString()} · {totalUsers} total users</p>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => fetchAll(secret)}>🔄 Refresh</button>
                </div>

                {/* ── Top stat cards ─────────────────────────────────── */}
                <div className="admin-stats-grid">

                    <div className="glass-card admin-stat-card">
                        <div className="admin-stat-icon">👥</div>
                        <div className="admin-stat-val">{fmt(s.chat.total_users)}</div>
                        <div className="admin-stat-lbl">Total Users</div>
                        <div className="admin-stat-sub">{fmt(s.chat.active_users)} active · {fmt(s.chat.active_this_week)} this week</div>
                    </div>

                    <div className="glass-card admin-stat-card">
                        <div className="admin-stat-icon">⚡</div>
                        <div className="admin-stat-val">{fmt(s.chat.total_api_calls)}</div>
                        <div className="admin-stat-lbl">Total Chat Calls</div>
                        <div className="admin-stat-sub">{fmt(s.chat.calls_today)} calls today</div>
                    </div>

                    <div className="glass-card admin-stat-card">
                        <div className="admin-stat-icon">🎙️</div>
                        <div className="admin-stat-val">{fmt(s.tts.total_tts_keys)}</div>
                        <div className="admin-stat-lbl">TTS Keys Issued</div>
                        <div className="admin-stat-sub">{fmt(s.tts.active_tts_keys)} active</div>
                    </div>

                    <div className="glass-card admin-stat-card">
                        <div className="admin-stat-icon">🔤</div>
                        <div className="admin-stat-val">{fmt(s.tts.total_chars_synthesized)}</div>
                        <div className="admin-stat-lbl">TTS Chars Synthesized</div>
                        <div className="admin-stat-sub">{fmt(s.tts.chars_today)} chars today</div>
                    </div>

                </div>

                {/* ── Service Overview ────────────────────────────────── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.5rem" }}>

                    {/* Chat API card */}
                    <div className="glass-card" style={{ padding: "1.5rem", borderRadius: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                            <div>
                                <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>💬 Chat API</div>
                                <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: 2 }}>DMP AI Completions (OpenAI-compatible)</div>
                            </div>
                            {topService === "Chat API" && (
                                <span style={{ background: "#818cf820", color: "#818cf8", border: "1px solid #818cf840", fontSize: "0.65rem", fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.05em" }}>
                                    ★ MOST USED
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "#818cf8", lineHeight: 1 }}>{fmt(s.chat.total_users)}</div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: 14 }}>registered users</div>
                        <div style={{ display: "flex", gap: "1.5rem" }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{fmt(s.chat.calls_today)}</div>
                                <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>calls today</div>
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{fmt(s.chat.total_api_calls)}</div>
                                <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>total ever</div>
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{fmt(s.chat.active_this_week)}</div>
                                <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>active/week</div>
                            </div>
                        </div>
                    </div>

                    {/* TTS API card */}
                    <div className="glass-card" style={{ padding: "1.5rem", borderRadius: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                            <div>
                                <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>🎙️ TTS API</div>
                                <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: 2 }}>Text-to-Speech (Edge TTS)</div>
                            </div>
                            {topService === "TTS API" && (
                                <span style={{ background: "#34d39920", color: "#34d399", border: "1px solid #34d39940", fontSize: "0.65rem", fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.05em" }}>
                                    ★ MOST USED
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "#34d399", lineHeight: 1 }}>{fmt(s.tts.total_tts_keys)}</div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: 14 }}>TTS keys issued</div>
                        <div style={{ display: "flex", gap: "1.5rem" }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{fmt(s.tts.chars_today)}</div>
                                <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>chars today</div>
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{fmt(s.tts.total_chars_synthesized)}</div>
                                <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>total chars</div>
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{fmt(s.tts.active_tts_keys)}</div>
                                <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>active keys</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Plan Breakdown ──────────────────────────────────── */}
                <div className="glass-card admin-section" style={{ marginBottom: "1.5rem" }}>
                    <h2 className="admin-section-title">📊 Users by Plan</h2>
                    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                        {Object.entries(s.chat.plan_breakdown).map(([plan, p]) => {
                            const share = s.chat.total_users > 0 ? Math.round((p.users / s.chat.total_users) * 100) : 0;
                            return (
                                <div key={plan} className="glass-card" style={{ flex: 1, minWidth: 140, padding: "1.1rem", borderRadius: 12 }}>
                                    <div style={{ fontWeight: 700, color: PLAN_COLOR[plan] ?? "#aaa", textTransform: "capitalize", fontSize: "0.9rem", marginBottom: 6 }}>
                                        {plan}
                                    </div>
                                    <div style={{ fontSize: "1.8rem", fontWeight: 800 }}>{p.users}</div>
                                    <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginBottom: 8 }}>users · {share}% share</div>
                                    <div className="speed-bar">
                                        <div className="speed-fill" style={{
                                            width: `${share}%`,
                                            background: plan === "pro" ? "linear-gradient(90deg,#f59e0b,#fbbf24)" : plan === "basic" ? "var(--gradient-main)" : "rgba(255,255,255,0.15)"
                                        }} />
                                    </div>
                                    <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginTop: 6 }}>
                                        {p.calls_today} calls today · {p.total_calls} total
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── All Users Table ─────────────────────────────────── */}
                <div className="glass-card admin-section">
                    <h2 className="admin-section-title">
                        👥 All Users
                        <span className="admin-count-badge">{totalUsers} total</span>
                    </h2>
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>User / ID</th>
                                    <th>API Key</th>
                                    <th>Plan</th>
                                    <th>Services</th>
                                    <th>Calls Today</th>
                                    <th>Total Calls</th>
                                    <th>Status</th>
                                    <th>Last Active</th>
                                    <th>Joined</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.length === 0 ? (
                                    <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>No users yet</td></tr>
                                ) : users.map((u, i) => (
                                    <tr key={i}>
                                        <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{i + 1}</td>
                                        <td>
                                            <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{u.profile?.name || "—"}</div>
                                            <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
                                                {u.profile?.email || (u.clerk_user_id ? u.clerk_user_id.slice(0, 20) + "…" : "No ID")}
                                            </div>
                                        </td>
                                        <td><code style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{u.key}</code></td>
                                        <td>
                                            <span style={{ color: PLAN_COLOR[u.plan] ?? "#aaa", fontWeight: 700, fontSize: "0.8rem", textTransform: "capitalize" }}>
                                                {u.plan}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                                {(u.services ?? ["chat"]).map(svc => (
                                                    <span key={svc} style={{
                                                        fontSize: "0.62rem", fontWeight: 700, padding: "2px 6px", borderRadius: 999,
                                                        background: svc === "tts" ? "#34d39920" : "#818cf820",
                                                        color: svc === "tts" ? "#34d399" : "#818cf8",
                                                        border: `1px solid ${svc === "tts" ? "#34d39940" : "#818cf840"}`,
                                                        textTransform: "uppercase",
                                                    }}>{svc}</span>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{fmt(u.used_today)}</td>
                                        <td>{fmt(u.total_calls)}</td>
                                        <td>
                                            <span style={{
                                                fontSize: "0.75rem", fontWeight: 600,
                                                color: u.is_active ? "#34d399" : "#f87171",
                                            }}>
                                                {u.is_active ? "● Active" : "● Inactive"}
                                            </span>
                                        </td>
                                        <td style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>{timeAgo(u.last_active_at)}</td>
                                        <td style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {totalUsers > 50 && (
                        <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "1rem" }}>
                            Showing first 50 of {totalUsers} users · Refresh to see latest
                        </div>
                    )}
                </div>

            </main>
        </>
    );
}
