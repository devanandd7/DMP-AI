import Link from "next/link";
import { SignUpButton, SignedIn, SignedOut } from "@clerk/nextjs";
import Navbar from "@/components/Navbar";

const FEATURES = [
  { icon: "⚡", title: "OpenAI Compatible", desc: "Drop-in replacement for OpenAI SDK. Just change base_url and api_key — your existing code works instantly." },
  { icon: "🔄", title: "Auto Key Rotation", desc: "Multiple backend API keys rotate automatically. Zero downtime, zero rate limit errors. Always online." },
  { icon: "🛡️", title: "Usage Control", desc: "Per-user daily limits by plan. Monitor usage, upgrade tiers, revoke keys — full control in real-time." },
  { icon: "🚀", title: "Blazing Fast", desc: "Powered by Groq's LPU hardware. Sub-second responses on dmp1 and dmp2 models. Speed you can feel." },
  { icon: "🤖", title: "Multiple Models", desc: "Three models for every need: dmp1 for speed, dmp2 for quality, dmp3 for complex reasoning." },
  { icon: "🌐", title: "Deploy Anywhere", desc: "Railway, Render, VPS — deploy in minutes. Docker-ready, environment-based config." },
];

const MODELS = [
  {
    id: "dmp1", tag: "fast", tagLabel: "⚡ Fast",
    name: "DMP-1", engine: "llama-3.1-8b-instant via Groq",
    desc: "Lightning-fast responses for real-time applications, chatbots, and simple tasks. Best latency in class.",
    speed: 98, quality: 65, tokens: "8K",
    glowColor: "rgba(34,211,238,0.08)",
  },
  {
    id: "dmp2", tag: "pro", tagLabel: "🔥 Pro",
    name: "DMP-2", engine: "mixtral-8x7b-32768 via Groq",
    desc: "Professional quality with long 32K context window. Perfect for summarization, code, and complex analysis.",
    speed: 80, quality: 85, tokens: "32K",
    glowColor: "rgba(139,92,246,0.08)",
  },
  {
    id: "dmp3", tag: "smart", tagLabel: "🧠 Smart",
    name: "DMP-3", engine: "gemini-1.5-flash via Google",
    desc: "Most capable model with multimodal understanding. Best for advanced reasoning, research, and insights.",
    speed: 70, quality: 98, tokens: "128K",
    glowColor: "rgba(59,130,246,0.08)",
  },
];

const PRICING = [
  {
    name: "Free", price: "$0", period: "/month",
    desc: "Perfect to get started and test the API.",
    featured: false,
    features: ["50 calls/day", "dmp1 & dmp2 access", "Community support", "API docs access"],
  },
  {
    name: "Basic", price: "$9", period: "/month",
    desc: "For developers building real products.",
    featured: true,
    features: ["300 calls/day", "All 3 models", "Priority support", "Usage dashboard", "Key rotation"],
  },
  {
    name: "Pro", price: "$29", period: "/month",
    desc: "For teams and production workloads.",
    featured: false,
    features: ["1000 calls/day", "All 3 models", "Dedicated support", "Custom rate limits", "SLA guarantee"],
  },
];

export default function HomePage() {
  return (
    <>
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-badge">
          <span className="badge-dot" />
          Now live — dmp1, dmp2, dmp3 models
        </div>

        <h1>
          The AI API Built<br />
          for <span className="gradient-text">Real Developers</span>
        </h1>

        <p className="hero-sub">
          OpenAI-compatible. Groq-powered. Your brand.<br />
          Drop into any existing project with a one-line change.
        </p>

        <div className="hero-cta">
          <SignedOut>
            <SignUpButton mode="modal">
              <button className="btn btn-primary btn-lg">🚀 Get Free API Key</button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard">
              <button className="btn btn-primary btn-lg">🔑 Go to Dashboard</button>
            </Link>
          </SignedIn>
          <a href="#models">
            <button className="btn btn-ghost btn-lg">View Models →</button>
          </a>
        </div>

        {/* Code Preview */}
        <div className="hero-code">
          <div className="hero-code-header">
            <span className="hero-code-dot" />
            <span className="hero-code-dot" />
            <span className="hero-code-dot" />
            <span className="hero-code-title">quickstart.py</span>
          </div>
          <pre>
            {``}<span className="c-purple">import</span><span className="c-white"> openai</span>{`

`}<span className="c-muted"># Just change these 2 lines from your OpenAI code 👇</span>{`
`}<span className="c-white">client</span><span className="c-purple"> = </span><span className="c-cyan">openai</span><span className="c-white">.OpenAI(</span>{`
`}<span className="c-blue">    api_key</span><span className="c-white">=</span><span className="c-green">"sk-dmp-xxxxxxxxxxxx"</span><span className="c-white">,</span>{`
`}<span className="c-blue">    base_url</span><span className="c-white">=</span><span className="c-green">"http://localhost:8000/v1"</span>{`
`}<span className="c-white">)</span>{`

`}<span className="c-white">response </span><span className="c-purple">= </span><span className="c-white">client.chat.completions.create(</span>{`
`}<span className="c-blue">    model</span><span className="c-white">=</span><span className="c-green">"dmp1"</span><span className="c-white">,  </span><span className="c-muted"># or dmp2 / dmp3</span>{`
`}<span className="c-blue">    messages</span><span className="c-white">=[{`{`}</span><span className="c-green">"role"</span><span className="c-white">: </span><span className="c-green">"user"</span><span className="c-white">, </span><span className="c-green">"content"</span><span className="c-white">: </span><span className="c-green">"Hello!"</span><span className="c-white">{`}`}]</span>{`
`}<span className="c-white">)</span>{`
`}<span className="c-cyan">print</span><span className="c-white">(response.choices[</span><span className="c-blue">0</span><span className="c-white">].message.content)</span>
          </pre>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────── */}
      <section id="features" className="section">
        <p className="section-label">Why DMP AI</p>
        <h2 className="section-title">Everything you need, nothing you don&apos;t</h2>
        <p className="section-sub">Built for developers who want power without complexity.</p>
        <div className="features-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass-card feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Models ────────────────────────────────────────────── */}
      <section id="models" className="section">
        <p className="section-label">Models</p>
        <h2 className="section-title">Three models, one API</h2>
        <p className="section-sub">Choose the right model for every task. Switch with one word.</p>
        <div className="models-grid">
          {MODELS.map((m) => (
            <div
              key={m.id}
              className="glass-card model-card"
              style={{ "--glow-color": m.glowColor } as React.CSSProperties}
            >
              <span className={`model-tag ${m.tag}`}>{m.tagLabel}</span>
              <div className="model-name">{m.name}</div>
              <div className="model-engine">{m.engine}</div>
              <p className="model-desc">{m.desc}</p>
              <div className="model-stats">
                <div className="model-stat">
                  <div className="model-stat-val">{m.tokens}</div>
                  <div className="model-stat-lbl">Context</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: "0.5rem" }}>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Speed</div>
                    <div className="speed-bar">
                      <div className="speed-fill" style={{ width: `${m.speed}%`, background: "var(--gradient-main)" }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Quality</div>
                    <div className="speed-bar">
                      <div className="speed-fill" style={{ width: `${m.quality}%`, background: "linear-gradient(90deg, #8b5cf6, #22d3ee)" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────── */}
      <section id="pricing" className="section">
        <p className="section-label">Pricing</p>
        <h2 className="section-title">Simple, honest pricing</h2>
        <p className="section-sub">Start free. Scale when you need. No hidden fees.</p>
        <div className="pricing-grid">
          {PRICING.map((p) => (
            <div key={p.name} className={`glass-card pricing-card ${p.featured ? "featured" : ""}`}>
              {p.featured && <div className="pricing-recommended">⭐ Most Popular</div>}
              <div className="pricing-name">{p.name}</div>
              <div className="pricing-price">
                {p.price}<span>{p.period}</span>
              </div>
              <p className="pricing-desc">{p.desc}</p>
              <ul className="pricing-features">
                {p.features.map((f) => (
                  <li key={f}><span className="check">✓</span>{f}</li>
                ))}
              </ul>
              <SignedOut>
                <SignUpButton mode="modal">
                  <button className={`btn ${p.featured ? "btn-primary" : "btn-ghost"}`} style={{ width: "100%" }}>
                    Get Started
                  </button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                <Link href="/dashboard" style={{ width: "100%" }}>
                  <button className={`btn ${p.featured ? "btn-primary" : "btn-ghost"}`} style={{ width: "100%" }}>
                    Go to Dashboard
                  </button>
                </Link>
              </SignedIn>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Banner ────────────────────────────────────────── */}
      <div className="cta-banner">
        <h2>Start building <span style={{ background: "var(--gradient-main)", backgroundSize: "200%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>today</span></h2>
        <p>Free tier, no credit card needed. Your first API key in 30 seconds.</p>
        <SignedOut>
          <SignUpButton mode="modal">
            <button className="btn btn-primary btn-lg">🚀 Create Free Account</button>
          </SignUpButton>
        </SignedOut>
        <SignedIn>
          <Link href="/dashboard">
            <button className="btn btn-primary btn-lg">Open Dashboard →</button>
          </Link>
        </SignedIn>
      </div>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="footer">
        <div className="footer-logo">DMP AI API</div>
        <div className="footer-links">
          <a href="#features">Features</a>
          <a href="#models">Models</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div>© 2025 CrossEye. All rights reserved.</div>
      </footer>
    </>
  );
}
