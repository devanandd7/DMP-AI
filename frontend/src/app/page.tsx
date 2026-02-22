import Link from "next/link";
import { SignUpButton, SignedIn, SignedOut } from "@clerk/nextjs";
import Navbar from "@/components/Navbar";

const FEATURES = [
  {
    icon: "⚡", title: "OpenAI Compatible",
    desc: "Drop-in replacement for OpenAI SDK. Change base_url and api_key — existing code works instantly.",
    tag: "Chat API",
  },
  {
    icon: "🎙️", title: "Edge TTS API",
    desc: "Neural text-to-speech in 22+ voices. English, Hindi, Hinglish — 54,333 chars/day per key. MP3 streaming.",
    tag: "New",
  },
  {
    icon: "🔄", title: "Auto Key Rotation",
    desc: "Multiple backend API keys rotate automatically. Zero downtime, zero rate-limit errors. Always online.",
    tag: "Reliability",
  },
  {
    icon: "🛡️", title: "Usage Control",
    desc: "Per-user daily limits by plan. Monitor usage, upgrade tiers, revoke keys — full control in real-time.",
    tag: "Control",
  },
  {
    icon: "🚀", title: "Blazing Fast",
    desc: "Powered by Groq's LPU hardware. Sub-second responses on dmp1/dmp2. Speed you can feel.",
    tag: "Performance",
  },
  {
    icon: "🌏", title: "Multilingual TTS",
    desc: "Seamless Hindi+English mixing (Hinglish). Dedicated hi-IN voices. Best multilingual neural models.",
    tag: "Languages",
  },
  {
    icon: "🤖", title: "Multiple Models",
    desc: "dmp1 for speed, dmp2 for quality, dmp3 for complex reasoning. Plus dmp-tts for speech.",
    tag: "Models",
  },
  {
    icon: "🌐", title: "Deploy Anywhere",
    desc: "Railway, Render, VPS — deploy in minutes. Docker-ready, environment-based config.",
    tag: "DevOps",
  },
];

const TEXT_MODELS = [
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

const TTS_MODELS = [
  {
    id: "en-US-AvaMultilingualNeural", tag: "hinglish", tagLabel: "🌏 Hinglish",
    name: "Ava Neural", engine: "en-US-AvaMultilingualNeural · Female",
    desc: "Best multilingual voice. Handles English, Hindi script, and Hinglish mixing seamlessly. Most natural for Indian content.",
    naturalness: 97, clarity: 95, languages: "EN / HI / Hinglish",
    glowColor: "rgba(34,211,238,0.08)",
  },
  {
    id: "hi-IN-SwaraNeural", tag: "hindi", tagLabel: "🇮🇳 Hindi",
    name: "Swara Neural", engine: "hi-IN-SwaraNeural · Female",
    desc: "Best dedicated Hindi voice. Pure Devanagari script, natural prosody, expressive tone. Ideal for Hindi-only content.",
    naturalness: 95, clarity: 98, languages: "हिंदी",
    glowColor: "rgba(255,165,0,0.08)",
  },
  {
    id: "en-IN-NeerjaExpressiveNeural", tag: "english-in", tagLabel: "🎙️ India EN",
    name: "Neerja Expressive", engine: "en-IN-NeerjaExpressiveNeural · Female",
    desc: "Expressive Indian-accent English. Perfect for educational and professional content with a familiar Indian voice.",
    naturalness: 93, clarity: 97, languages: "English (India)",
    glowColor: "rgba(139,92,246,0.08)",
  },
];

const PRICING = [
  {
    name: "Free", price: "$0", period: "/month",
    desc: "Perfect to get started and test the API.",
    featured: false,
    features: [
      "100 chat calls/day",
      "54,333 TTS chars/day",
      "30 RPM · 35K tokens/min",
      "dmp1 & dmp2 access",
      "Community support",
    ],
  },
  {
    name: "Basic", price: "$9", period: "/month",
    desc: "For developers building real products.",
    featured: true,
    features: [
      "600 chat calls/day",
      "200K TTS chars/day",
      "30 RPM · 35K tokens/min",
      "All 3 chat models",
      "All 22 TTS voices",
      "Priority support",
    ],
  },
  {
    name: "Pro", price: "$29", period: "/month",
    desc: "For teams and production workloads.",
    featured: false,
    features: [
      "2,000 chat calls/day",
      "1M TTS chars/day",
      "30 RPM · 35K tokens/min",
      "All models & voices",
      "Dedicated support",
      "SLA guarantee",
    ],
  },
];

// Comparison: DMP AI vs calling Google/Edge TTS directly
const COMPARE_ROWS = [
  { feature: "Setup time", dmp: "30 seconds", google: "10–30 minutes", edgetts: "Code setup required" },
  { feature: "API format", dmp: "OpenAI-compatible", google: "Proprietary SDK", edgetts: "Python library only" },
  { feature: "Key management", dmp: "Auto key rotation", google: "Manual per project", edgetts: "No keys needed" },
  { feature: "Rate limit (chat)", dmp: "30 RPM · 35K TPM", google: "15 RPM (free tier)", edgetts: "N/A" },
  { feature: "Daily chat calls", dmp: "100–2,000/day", google: "1,500/day (free)", edgetts: "N/A" },
  { feature: "TTS voices", dmp: "22 Neural (Edge)", google: "220+ WaveNet", edgetts: "22 Neural voices" },
  { feature: "TTS daily limit", dmp: "54K chars/day (free)", google: "1M chars/day (paid)", edgetts: "Unlimited (local)" },
  { feature: "TTS pricing", dmp: "Free tier included", google: "$4–$16 / 1M chars", edgetts: "Free (self-host)" },
  { feature: "Hinglish / multilingual", dmp: "✅ Supported", google: "⚠️ Limited", edgetts: "✅ Supported" },
  { feature: "Usage dashboard", dmp: "✅ Built-in", google: "✅ Google Console", edgetts: "❌ None" },
  { feature: "OpenAI SDK drop-in", dmp: "✅ Yes", google: "❌ No", edgetts: "❌ No" },
  { feature: "Self-host option", dmp: "✅ Docker-ready", google: "❌ Cloud only", edgetts: "✅ Yes" },
];

export default function HomePage() {
  return (
    <>
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-badge">
          <span className="badge-dot" />
          Now live — Chat AI + Edge TTS API
        </div>

        <h1>
          The AI API Built<br />
          for <span className="gradient-text">Real Developers</span>
        </h1>

        <p className="hero-sub">
          OpenAI-compatible chat. Neural text-to-speech. Your brand.<br />
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
`}<span className="c-purple">import</span><span className="c-white"> requests  </span><span className="c-muted"># for TTS</span>{`

`}<span className="c-muted"># ── Chat (OpenAI-compatible) ────────────────────────</span>{`
`}<span className="c-white">client</span><span className="c-purple"> = </span><span className="c-cyan">openai</span><span className="c-white">.OpenAI(</span>{`
`}<span className="c-blue">    api_key</span><span className="c-white">=</span><span className="c-green">"sk-dmp-xxxxxxxxxxxx"</span><span className="c-white">,</span>{`
`}<span className="c-blue">    base_url</span><span className="c-white">=</span><span className="c-green">"http://your-api/v1"</span>{`
`}<span className="c-white">)</span>{`
`}<span className="c-white">resp </span><span className="c-purple">= </span><span className="c-white">client.chat.completions.create(</span>{`
`}<span className="c-blue">    model</span><span className="c-white">=</span><span className="c-green">"dmp1"</span><span className="c-white">,  </span><span className="c-muted"># dmp1 / dmp2 / dmp3</span>{`
`}<span className="c-blue">    messages</span><span className="c-white">=[{`{`}</span><span className="c-green">"role"</span><span className="c-white">: </span><span className="c-green">"user"</span><span className="c-white">, </span><span className="c-green">"content"</span><span className="c-white">: </span><span className="c-green">"Hello!"</span><span className="c-white">{`}`}]</span>{`

`}<span className="c-muted"># ── TTS — Neural speech in Hindi, English, Hinglish ─</span>{`
`}<span className="c-white">audio </span><span className="c-purple">= </span><span className="c-white">requests.post(</span><span className="c-green">"http://your-api/v1/tts/synthesize"</span><span className="c-white">,</span>{`
`}<span className="c-blue">    headers</span><span className="c-white">={`{`}</span><span className="c-green">"Authorization"</span><span className="c-white">: </span><span className="c-green">"Bearer sk-tts-xxxx"</span><span className="c-white">{`}`},</span>{`
`}<span className="c-blue">    json</span><span className="c-white">={`{`}</span><span className="c-green">"text"</span><span className="c-white">: </span><span className="c-green">"Hello दोस्तों!"</span><span className="c-white">, </span><span className="c-green">"voice"</span><span className="c-white">: </span><span className="c-green">"en-US-AvaMultilingualNeural"</span><span className="c-white">{`}`}</span>{`
`}<span className="c-white">)</span>{`
`}<span className="c-cyan">open</span><span className="c-white">(</span><span className="c-green">"output.mp3"</span><span className="c-white">, </span><span className="c-green">"wb"</span><span className="c-white">).write(audio.content)</span>
          </pre>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────── */}
      <section id="features" className="section">
        <p className="section-label">Why DMP AI</p>
        <h2 className="section-title">Two APIs. One key. Zero friction.</h2>
        <p className="section-sub">Chat completion + Neural TTS — built for developers who want power without complexity.</p>
        <div className="features-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass-card feature-card">
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                <div className="feature-icon">{f.icon}</div>
                <span className="feature-tag">{f.tag}</span>
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Models ────────────────────────────────────────────── */}
      <section id="models" className="section">
        <p className="section-label">Models</p>
        <h2 className="section-title">Chat + TTS — one unified API</h2>
        <p className="section-sub">Switch between text and speech models with a single endpoint change.</p>

        {/* Model Type Tabs (static, visual only) */}
        <div className="model-tabs">
          <div className="model-tab active">💬 Text Models</div>
          <div className="model-tab tts-tab">🎙️ TTS Models</div>
        </div>

        {/* Text Models */}
        <div style={{ marginBottom: "3rem" }}>
          <div className="models-section-label">💬 Text / Chat Models</div>
          <div className="models-grid">
            {TEXT_MODELS.map((m) => (
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
                        <div className="speed-fill" style={{ width: `${m.quality}%`, background: "linear-gradient(90deg,#8b5cf6,#22d3ee)" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TTS Models */}
        <div>
          <div className="models-section-label tts">🎙️ Text-to-Speech Voices</div>
          <div className="models-grid">
            {TTS_MODELS.map((m) => (
              <div
                key={m.id}
                className="glass-card model-card tts-model-card"
                style={{ "--glow-color": m.glowColor } as React.CSSProperties}
              >
                <span className={`model-tag ${m.tag}`}>{m.tagLabel}</span>
                <div className="model-name">{m.name}</div>
                <div className="model-engine">{m.engine}</div>
                <p className="model-desc">{m.desc}</p>
                <div className="model-stats">
                  <div className="model-stat">
                    <div className="model-stat-val" style={{ fontSize: "0.8rem" }}>{m.languages}</div>
                    <div className="model-stat-lbl">Languages</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: "0.5rem" }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Naturalness</div>
                      <div className="speed-bar">
                        <div className="speed-fill" style={{ width: `${m.naturalness}%`, background: "linear-gradient(90deg,#f59e0b,#22d3ee)" }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Clarity</div>
                      <div className="speed-bar">
                        <div className="speed-fill" style={{ width: `${m.clarity}%`, background: "linear-gradient(90deg,#8b5cf6,#22d3ee)" }} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="tts-daily-limit">54,333 chars/day · MP3 stream</div>
              </div>
            ))}
          </div>
          <div className="tts-voices-more">
            + 19 more voices including en-US, en-GB, hi-IN males &amp; females.{" "}
            <a href="#pricing">See all voices in dashboard →</a>
          </div>
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

      {/* ── Comparison Table ──────────────────────────────────── */}
      <section id="compare" className="section" style={{ maxWidth: "1100px" }}>
        <p className="section-label">Why not just use Google / Edge TTS directly?</p>
        <h2 className="section-title">DMP AI vs the alternatives</h2>
        <p className="section-sub">
          We use the same underlying models — but wrap them with OpenAI-compatibility, auto key rotation, usage tracking, and a unified dashboard.
        </p>

        <div className="compare-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th className="col-dmp">
                  <div className="compare-th-label">
                    <span className="compare-badge dmp">✦ DMP AI</span>
                    <span className="compare-th-sub">Our service</span>
                  </div>
                </th>
                <th>
                  <div className="compare-th-label">
                    <span className="compare-badge google">G Google AI</span>
                    <span className="compare-th-sub">Direct API</span>
                  </div>
                </th>
                <th>
                  <div className="compare-th-label">
                    <span className="compare-badge edge">🎙️ Edge TTS</span>
                    <span className="compare-th-sub">Direct use</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row, i) => (
                <tr key={row.feature} className={i % 2 === 0 ? "row-even" : ""}>
                  <td className="compare-feature">{row.feature}</td>
                  <td className="col-dmp compare-val">{row.dmp}</td>
                  <td className="compare-val">{row.google}</td>
                  <td className="compare-val">{row.edgetts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="compare-footnote">
          * Google Gemini API free tier: 15 RPM, 1,500 req/day, 1M TPM. Paid tier required for higher limits. Edge TTS requires self-hosting Python.
        </p>
      </section>

      {/* ── CTA Banner ────────────────────────────────────────── */}

      <div className="cta-banner">
        <h2>Start building <span style={{ background: "var(--gradient-main)", backgroundSize: "200%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>today</span></h2>
        <p>Free tier, no credit card needed. Chat API + TTS API with one account.</p>
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
