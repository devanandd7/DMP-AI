"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const FRONTEND_SECRET = process.env.NEXT_PUBLIC_FRONTEND_SECRET || "dmp-frontend-secret";

interface Profile {
    name: string;
    email: string;
    avatar_url: string;
}

interface UserData {
    has_key: boolean;
    key?: string;
    plan?: string;
    daily_limit?: number;
    used_today?: number;
    total_calls?: number;
    created_at?: string;
    last_active_at?: string;
    is_active?: boolean;
    profile?: Profile;
    message?: string;
}

export default function DashboardPage() {
    const { user } = useUser();

    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showKey, setShowKey] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    // ── Fetch user data — clerk_user_id as query param + x-frontend-secret header
    const fetchUserData = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch(
                `${API_URL}/user/me?clerk_user_id=${encodeURIComponent(user.id)}`,
                { headers: { "x-frontend-secret": FRONTEND_SECRET } }
            );
            const data = await res.json();
            setUserData(data);
        } catch {
            setError("Could not connect to API server on port 8000. Is it running?");
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    // ── Generate / retrieve key — sends clerk_user_id + profile in body
    const generateKey = async () => {
        if (!user?.id) return;
        setGenerating(true);
        setError("");
        setSuccessMsg("");
        try {
            const res = await fetch(`${API_URL}/user/generate-key`, {
                method: "POST",
                headers: {
                    "x-frontend-secret": FRONTEND_SECRET,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    clerk_user_id: user.id,
                    name: user?.fullName || user?.firstName || "",
                    email: user?.primaryEmailAddress?.emailAddress || "",
                    avatar_url: user?.imageUrl || "",
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setUserData({ has_key: true, ...data });
                setSuccessMsg(data.message || "API key ready!");
                setTimeout(() => setSuccessMsg(""), 4000);
            } else {
                setError(data.detail || "Failed to generate key.");
            }
        } catch {
            setError("Request failed. Make sure the API server is running.");
        } finally {
            setGenerating(false);
        }
    };


    const copyKey = () => {
        if (userData?.key) {
            navigator.clipboard.writeText(userData.key);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const maskKey = (key: string) => {
        if (showKey) return key;
        return key.slice(0, 12) + "•".repeat(24) + key.slice(-4);
    };

    const formatDate = (iso?: string | null) => {
        if (!iso) return "—";
        try {
            return new Date(iso).toLocaleDateString("en-IN", {
                day: "numeric", month: "short", year: "numeric",
            });
        } catch { return iso; }
    };

    useEffect(() => { fetchUserData(); }, [fetchUserData]);

    const usedToday = userData?.used_today ?? 0;
    const dailyLimit = userData?.daily_limit ?? 50;
    const usagePercent = Math.min(Math.round((usedToday / dailyLimit) * 100), 100);

    const codeExample = userData?.key
        ? `import openai

client = openai.OpenAI(
    api_key="${showKey ? userData.key : userData.key.slice(0, 12) + "..."}",
    base_url="${API_URL}/v1"
)

response = client.chat.completions.create(
    model="dmp1",   # dmp1 / dmp2 / dmp3
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`
        : "";

    return (
        <>
            <Navbar />
            <div className="dashboard-page">

                {/* ── Header ──────────────────────────────────────────── */}
                <div className="dashboard-header">
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        {user?.imageUrl && (
                            <img
                                src={user.imageUrl}
                                alt="avatar"
                                style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid rgba(139,92,246,0.4)" }}
                            />
                        )}
                        <div>
                            <h1>
                                Welcome,{" "}
                                <span style={{ background: "var(--gradient-main)", backgroundSize: "200%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                                    {user?.firstName || "Developer"}
                                </span>{" "}
                                👋
                            </h1>
                            <p className="dashboard-welcome">
                                {user?.primaryEmailAddress?.emailAddress}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                        <button className="btn btn-ghost btn-sm" onClick={fetchUserData}>
                            ↻ Refresh
                        </button>
                        <Link href="/">
                            <button className="btn btn-ghost btn-sm">← Home</button>
                        </Link>
                    </div>
                </div>

                {/* ── Alerts ──────────────────────────────────────────── */}
                {error && (
                    <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "var(--red-400)", borderRadius: "var(--radius-sm)", padding: "0.85rem 1.25rem", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
                        ⚠️ {error}
                    </div>
                )}
                {successMsg && (
                    <div style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", color: "var(--green-400)", borderRadius: "var(--radius-sm)", padding: "0.85rem 1.25rem", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
                        ✅ {successMsg}
                    </div>
                )}

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
                ) : (
                    <div className="dashboard-grid">

                        {/* ── API Key Card ──────────────────────────────────── */}
                        <div className="dashboard-card-full glass-card apikey-box">
                            <div className="apikey-label">🔑 Your DMP API Key</div>

                            {userData?.has_key ? (
                                <>
                                    <div className="apikey-display">
                                        <span className="apikey-val">{maskKey(userData.key!)}</span>
                                        <button className="copy-btn" onClick={() => setShowKey(v => !v)}>
                                            {showKey ? "🙈 Hide" : "👁 Show"}
                                        </button>
                                        <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={copyKey}>
                                            {copied ? "✅ Copied!" : "📋 Copy"}
                                        </button>
                                    </div>

                                    {/* Status badge */}
                                    <div style={{ marginBottom: "1rem" }}>
                                        <span style={{
                                            padding: "3px 12px", borderRadius: "100px", fontSize: "0.72rem", fontWeight: 700,
                                            background: userData.is_active ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                                            color: userData.is_active ? "var(--green-400)" : "var(--red-400)",
                                            border: `1px solid ${userData.is_active ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`
                                        }}>
                                            {userData.is_active ? "● Active" : "● Deactivated"}
                                        </span>
                                    </div>

                                    {/* Usage bar */}
                                    <div className="usage-bar-wrap">
                                        <div className="usage-bar-header">
                                            <span>Daily Usage</span>
                                            <span style={{ color: usagePercent > 80 ? "var(--red-400)" : "var(--text-secondary)" }}>
                                                {usedToday} / {dailyLimit} calls ({usagePercent}%)
                                            </span>
                                        </div>
                                        <div className="usage-bar-track">
                                            <div
                                                className="usage-bar-fill"
                                                style={{
                                                    width: `${usagePercent}%`,
                                                    background: usagePercent > 80
                                                        ? "linear-gradient(90deg,#f87171,#ef4444)"
                                                        : "var(--gradient-main)"
                                                }}
                                            />
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

                        {/* ── Stat: Plan ────────────────────────────────────── */}
                        <div className="glass-card stat-card">
                            <div className="stat-label">Current Plan</div>
                            <div className="stat-value purple">{userData?.plan?.toUpperCase() || "—"}</div>
                            <span className={`stat-badge ${userData?.plan || "free"}`}>
                                {userData?.plan === "pro" ? "🔥 Pro" : userData?.plan === "basic" ? "⚡ Basic" : "🆓 Free"}
                            </span>
                            <div style={{ marginTop: "1rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                                {dailyLimit} calls / day limit
                            </div>
                        </div>

                        {/* ── Stat: Calls Today ─────────────────────────────── */}
                        <div className="glass-card stat-card">
                            <div className="stat-label">Today&apos;s Calls</div>
                            <div className="stat-value cyan">{usedToday}</div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                                of {dailyLimit} daily limit
                            </div>
                        </div>

                        {/* ── Stat: Total Calls ─────────────────────────────── */}
                        <div className="glass-card stat-card">
                            <div className="stat-label">Total API Calls</div>
                            <div className="stat-value green">{userData?.total_calls ?? "—"}</div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                                Lifetime requests
                            </div>
                        </div>

                        {/* ── Stat: Last Active ─────────────────────────────── */}
                        <div className="glass-card stat-card">
                            <div className="stat-label">Last Active</div>
                            <div className="stat-value" style={{ fontSize: "1rem", marginTop: "0.5rem", color: "var(--text-primary)" }}>
                                {formatDate(userData?.last_active_at)}
                            </div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                                Member since {formatDate(userData?.created_at)}
                            </div>
                        </div>

                        {/* ── Profile Card ──────────────────────────────────── */}
                        {userData?.has_key && (
                            <div className="glass-card apikey-box" style={{ padding: "2rem" }}>
                                <div className="apikey-label">👤 Profile (Saved in MongoDB)</div>
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

                        {/* ── Models ────────────────────────────────────────── */}
                        <div className="glass-card stat-card">
                            <div className="stat-label">Available Models</div>
                            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                                {[
                                    { id: "dmp1", color: "cyan" },
                                    { id: "dmp2", color: "purple" },
                                    { id: "dmp3", color: "blue" },
                                ].map(({ id, color }) => (
                                    <span key={id} style={{
                                        padding: "5px 14px", borderRadius: "100px", fontFamily: "monospace",
                                        fontSize: "0.82rem", fontWeight: 700,
                                        background: `rgba(var(--${color}-rgb, 139,92,246),0.1)`,
                                        border: `1px solid rgba(139,92,246,0.25)`,
                                        color: "var(--purple-300)"
                                    }}>{id}</span>
                                ))}
                            </div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
                                dmp1 = fast · dmp2 = pro · dmp3 = smart
                            </div>
                        </div>

                        {/* ── Quick Start Code ──────────────────────────────── */}
                        {userData?.has_key && codeExample && (
                            <div className="dashboard-card-full glass-card code-example-card">
                                <h3>⚡ Quick Start — Python</h3>
                                <pre className="code-block">{codeExample}</pre>
                                <div style={{ marginTop: "1rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                                    Works with any OpenAI-compatible SDK. Change <code style={{ color: "var(--purple-300)" }}>base_url</code> and <code style={{ color: "var(--purple-300)" }}>api_key</code> — that&apos;s it.
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </div>
        </>
    );
}
