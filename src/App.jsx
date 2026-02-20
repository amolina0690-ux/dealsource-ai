import { useState, useMemo, useEffect, useCallback, useRef } from "react";

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
// Replace these with your values from Supabase → Settings → API
const SUPABASE_URL = "https://tobblkfhbjwxjygbswnl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvYmJsa2ZoYmp3eGp5Z2Jzd25sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTE4MDIsImV4cCI6MjA4NzE2NzgwMn0.ttG8sfON_SLmHRC86Y9PYrrGeVsTitshygg0-44K8yU";

// Minimal Supabase client (no SDK needed)
const supabase = {
  _url: SUPABASE_URL,
  _key: SUPABASE_ANON_KEY,
  _token: null,

  async _fetch(path, opts = {}) {
    const headers = {
      "Content-Type": "application/json",
      "apikey": this._key,
      ...(this._token ? { "Authorization": `Bearer ${this._token}` } : {}),
      ...opts.headers,
    };
    const res = await fetch(`${this._url}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error_description || data.message || data.msg || "Request failed");
    return data;
  },

  auth: {
    async signUp(email, password, meta = {}) {
      const data = await supabase._fetch("/auth/v1/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, data: meta }),
      });
      if (data.access_token) supabase._token = data.access_token;
      return data;
    },
    async signIn(email, password) {
      const data = await supabase._fetch("/auth/v1/token?grant_type=password", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (data.access_token) {
        supabase._token = data.access_token;
        try { localStorage.setItem("ds_token", data.access_token); } catch {}
      }
      return data;
    },
    async signOut() {
      try { await supabase._fetch("/auth/v1/logout", { method: "POST" }); } catch {}
      supabase._token = null;
      try { localStorage.removeItem("ds_token"); } catch {}
    },
    async getUser() {
      if (!supabase._token) return null;
      try {
        const data = await supabase._fetch("/auth/v1/user");
        return data;
      } catch { return null; }
    },
    restoreSession() {
      try {
        const t = localStorage.getItem("ds_token");
        if (t) supabase._token = t;
        return !!t;
      } catch { return false; }
    },
  },

  async getProfile(userId) {
    const data = await supabase._fetch(`/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: { "Accept": "application/json" },
    });
    return Array.isArray(data) ? data[0] : null;
  },

  async upsertProfile(profile) {
    return supabase._fetch("/rest/v1/profiles", {
      method: "POST",
      body: JSON.stringify(profile),
      headers: { "Prefer": "resolution=merge-duplicates" },
    });
  },

  async getDeals(userId) {
    const data = await supabase._fetch(`/rest/v1/deals?user_id=eq.${userId}&order=created_at.desc&select=*`);
    return Array.isArray(data) ? data : [];
  },

  async insertDeal(deal) {
    return supabase._fetch("/rest/v1/deals", {
      method: "POST",
      body: JSON.stringify(deal),
      headers: { "Prefer": "return=representation" },
    });
  },

  async deleteDeal(id) {
    return supabase._fetch(`/rest/v1/deals?id=eq.${id}`, { method: "DELETE" });
  },
};

// ─── Shared constants ─────────────────────────────────────────────────────────
const MODES = [
  { key: "rental",    label: "Rental",     sub: "Buy & Hold",      icon: "🏘️", color: "#059669", bg: "#f0fdf4", border: "#bbf7d0" },
  { key: "wholesale", label: "Wholesale",  sub: "MAO Calculator",  icon: "🏷️", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  { key: "flip",      label: "Fix & Flip", sub: "Profit & ROI",    icon: "🔨", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  { key: "brrrr",     label: "BRRRR",      sub: "Refi & Recycle",  icon: "♻️", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  { key: "subto",     label: "Subject-To", sub: "Loan Takeover",   icon: "🤝", color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc" },
  { key: "novation",  label: "Novation",   sub: "Contract Assign", icon: "💡", color: "#be185d", bg: "#fdf2f8", border: "#fbcfe8" },
];

const INVESTOR_TYPES = [
  "Buy & Hold Investor", "Fix & Flip Investor", "Wholesaler",
  "BRRRR Investor", "Short-Term Rental", "Commercial Investor", "Beginner / Learning",
];

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo({ onClick, size = "md" }) {
  const sz = size === "lg" ? 36 : 28;
  const fs = size === "lg" ? 22 : 17;
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 8, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ width: sz, height: sz, background: "linear-gradient(135deg, #10b981, #059669)", borderRadius: sz * 0.25, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "white", fontSize: sz * 0.5, fontWeight: 800 }}>D</span>
      </div>
      <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: fs, color: "#111827" }}>
        DealSource<span style={{ color: "#10b981" }}>.ai</span>
      </span>
    </div>
  );
}

// ─── Input component ──────────────────────────────────────────────────────────
function Input({ label, type = "text", value, onChange, placeholder, icon, error, hint }) {
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  const isPass = type === "password";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", letterSpacing: "0.02em" }}>{label}</label>}
      <div style={{ position: "relative" }}>
        {icon && <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 16, pointerEvents: "none" }}>{icon}</span>}
        <input
          type={isPass && show ? "text" : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%", padding: `11px ${isPass ? "42px" : "14px"} 11px ${icon ? "40px" : "14px"}`,
            borderRadius: 10, border: `1.5px solid ${error ? "#fca5a5" : focused ? "#10b981" : "#e5e7eb"}`,
            background: error ? "#fff5f5" : "white", fontSize: 14, color: "#111827",
            outline: "none", transition: "border-color 0.15s", fontFamily: "'DM Sans', sans-serif",
          }}
        />
        {isPass && (
          <button type="button" onClick={() => setShow(s => !s)}
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#9ca3af" }}>
            {show ? "🙈" : "👁️"}
          </button>
        )}
      </div>
      {error && <p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}>{error}</p>}
      {hint && !error && <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>{hint}</p>}
    </div>
  );
}

function Select({ label, value, onChange, options, placeholder }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid #e5e7eb", background: "white", fontSize: 14, color: value ? "#111827" : "#9ca3af", outline: "none", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
        <option value="">{placeholder || "Select..."}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", loading, disabled, fullWidth, type = "button" }) {
  const styles = {
    primary: { background: "#10b981", color: "white", border: "none" },
    secondary: { background: "white", color: "#374151", border: "1.5px solid #e5e7eb" },
    dark: { background: "#111827", color: "white", border: "none" },
    ghost: { background: "transparent", color: "#6b7280", border: "1.5px solid #e5e7eb" },
    danger: { background: "#dc2626", color: "white", border: "none" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      style={{ ...styles[variant], padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: disabled || loading ? "default" : "pointer", width: fullWidth ? "100%" : "auto", opacity: disabled ? 0.5 : 1, transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {loading ? <span style={{ animation: "spin 0.8s linear infinite", display: "inline-block" }}>⟳</span> : children}
    </button>
  );
}

function Alert({ type, children }) {
  const s = type === "error"
    ? { bg: "#fef2f2", border: "#fecaca", color: "#dc2626", icon: "⚠️" }
    : { bg: "#f0fdf4", border: "#bbf7d0", color: "#059669", icon: "✓" };
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 10 }}>
      <span style={{ fontSize: 14 }}>{s.icon}</span>
      <p style={{ fontSize: 13, color: s.color, lineHeight: 1.5, margin: 0 }}>{children}</p>
    </div>
  );
}

// ─── Auth split-screen layout ─────────────────────────────────────────────────
function AuthLayout({ children, title, subtitle }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", background: "#ffffff" }}>
      {/* Left — decorative panel */}
      <div style={{ background: "linear-gradient(160deg, #064e3b 0%, #065f46 40%, #047857 100%)", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "48px", position: "relative", overflow: "hidden" }}>
        {/* Background pattern */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 20% 80%, rgba(16,185,129,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(16,185,129,0.1) 0%, transparent 50%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: -60, right: -60, width: 300, height: 300, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -40, left: -40, width: 240, height: 240, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)", pointerEvents: "none" }} />

        <Logo size="md" />

        <div>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 900, color: "white", lineHeight: 1.2, marginBottom: 20 }}>
            Analyze deals like a<br />
            <span style={{ color: "#6ee7b7", fontStyle: "italic" }}>seasoned investor</span>
          </h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.65)", lineHeight: 1.7, marginBottom: 40, maxWidth: 340 }}>
            6 calculators, real-time results, and a deal library that grows with your portfolio.
          </p>

          {/* Mini stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[["🏘️", "6 Strategies", "Rental to Novation"],["⚡", "Real-Time", "Instant results"],["💾", "Cloud Saved", "Never lose a deal"],["$0", "Free to Start", "No card needed"]].map(([icon, title, sub]) => (
              <div key={title} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{title}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>© 2025 DealSource.ai</p>
      </div>

      {/* Right — form panel */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 56px", overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 800, color: "#111827", marginBottom: 6 }}>{title}</h1>
            <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Sign In Page ─────────────────────────────────────────────────────────────
function SignInPage({ onSignIn, onGoSignUp, onGoHome }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!email || !password) { setError("Please fill in all fields."); return; }
    setLoading(true); setError("");
    try {
      const data = await supabase.auth.signIn(email, password);
      const profile = await supabase.getProfile(data.user.id).catch(() => null);
      onSignIn(data.user, profile);
    } catch (err) {
      setError(err.message || "Sign in failed. Check your email and password.");
    } finally { setLoading(false); }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your DealSource.ai account to continue analyzing deals.">
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {error && <Alert type="error">{error}</Alert>}
        <Input label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@example.com" icon="📧" />
        <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="Your password" icon="🔒" />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button style={{ background: "none", border: "none", fontSize: 13, color: "#10b981", fontWeight: 600, cursor: "pointer" }}>Forgot password?</button>
        </div>
        <Btn variant="primary" fullWidth loading={loading} onClick={handleSubmit}>Sign In →</Btn>
        <div style={{ textAlign: "center", padding: "12px 0", borderTop: "1px solid #f3f4f6" }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>Don't have an account? </span>
          <button onClick={onGoSignUp} style={{ background: "none", border: "none", fontSize: 13, color: "#10b981", fontWeight: 700, cursor: "pointer" }}>Start free trial</button>
        </div>
        <button onClick={onGoHome} style={{ background: "none", border: "none", fontSize: 12, color: "#9ca3af", cursor: "pointer", textAlign: "center" }}>← Back to homepage</button>
      </div>
    </AuthLayout>
  );
}

// ─── Sign Up Page ─────────────────────────────────────────────────────────────
function SignUpPage({ onSignIn, onGoSignIn, onGoHome }) {
  const [step, setStep] = useState(1); // 1: account, 2: profile
  const [form, setForm] = useState({ email: "", password: "", confirm: "", full_name: "", phone: "", location: "", investor_type: "", bio: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const f = k => v => setForm(p => ({ ...p, [k]: v }));

  const handleStep1 = () => {
    if (!form.email || !form.password || !form.confirm) { setError("Please fill in all fields."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (form.password !== form.confirm) { setError("Passwords don't match."); return; }
    setError(""); setStep(2);
  };

  const handleSubmit = async () => {
    if (!form.full_name) { setError("Please enter your name."); return; }
    setLoading(true); setError("");
    try {
      const data = await supabase.auth.signUp(form.email, form.password, { full_name: form.full_name });
      const userId = data.user?.id || data.id;
      const profile = { id: userId, email: form.email, full_name: form.full_name, phone: form.phone, location: form.location, investor_type: form.investor_type, bio: form.bio };
      await supabase.upsertProfile(profile).catch(() => {});
      onSignIn(data.user || data, profile);
    } catch (err) {
      setError(err.message || "Sign up failed. Please try again.");
      setStep(1);
    } finally { setLoading(false); }
  };

  return (
    <AuthLayout title={step === 1 ? "Create your account" : "Complete your profile"} subtitle={step === 1 ? "Start your free trial — no credit card required." : "Tell us a bit about yourself so we can personalize your experience."}>
      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
        {[1, 2].map(n => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: step >= n ? "#10b981" : "#f3f4f6", color: step >= n ? "white" : "#9ca3af", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>{step > n ? "✓" : n}</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: step >= n ? "#111827" : "#9ca3af" }}>{n === 1 ? "Account" : "Profile"}</span>
            {n < 2 && <div style={{ width: 40, height: 1, background: step > n ? "#10b981" : "#e5e7eb" }} />}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {error && <Alert type="error">{error}</Alert>}

        {step === 1 && (
          <>
            <Input label="Email address" type="email" value={form.email} onChange={f("email")} placeholder="you@example.com" icon="📧" />
            <Input label="Password" type="password" value={form.password} onChange={f("password")} placeholder="Min. 8 characters" icon="🔒" hint="At least 8 characters" />
            <Input label="Confirm password" type="password" value={form.confirm} onChange={f("confirm")} placeholder="Repeat your password" icon="🔒" />
            <Btn variant="primary" fullWidth onClick={handleStep1}>Continue →</Btn>
          </>
        )}

        {step === 2 && (
          <>
            <Input label="Full name *" value={form.full_name} onChange={f("full_name")} placeholder="Jane Smith" icon="👤" />
            <Input label="Phone number" value={form.phone} onChange={f("phone")} placeholder="+1 (555) 000-0000" icon="📱" />
            <Input label="Location" value={form.location} onChange={f("location")} placeholder="Atlanta, GA" icon="📍" />
            <Select label="Investor type" value={form.investor_type} onChange={f("investor_type")} options={INVESTOR_TYPES} placeholder="What kind of investor are you?" />
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Bio <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span></label>
              <textarea value={form.bio} onChange={e => f("bio")(e.target.value)} placeholder="Tell us about your investing background..."
                rows={3} style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 14, color: "#111827", outline: "none", resize: "vertical", fontFamily: "'DM Sans', sans-serif" }} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="ghost" onClick={() => { setError(""); setStep(1); }}>← Back</Btn>
              <Btn variant="primary" fullWidth loading={loading} onClick={handleSubmit}>Create Account →</Btn>
            </div>
          </>
        )}

        <div style={{ textAlign: "center", paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>Already have an account? </span>
          <button onClick={onGoSignIn} style={{ background: "none", border: "none", fontSize: 13, color: "#10b981", fontWeight: 700, cursor: "pointer" }}>Sign in</button>
        </div>
        <button onClick={onGoHome} style={{ background: "none", border: "none", fontSize: 12, color: "#9ca3af", cursor: "pointer", textAlign: "center" }}>← Back to homepage</button>
      </div>
    </AuthLayout>
  );
}

// ─── Profile Page ─────────────────────────────────────────────────────────────
function ProfilePage({ user, profile, onUpdate, onSignOut, onBack }) {
  const [form, setForm] = useState({ full_name: "", phone: "", location: "", investor_type: "", bio: "", ...profile });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const f = k => v => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.full_name.trim()) { setError("Name is required."); return; }
    setLoading(true); setError("");
    try {
      await supabase.upsertProfile({ ...form, id: user.id, email: user.email, updated_at: new Date().toISOString() });
      onUpdate({ ...form, id: user.id, email: user.email });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message || "Failed to save profile.");
    } finally { setLoading(false); }
  };

  const initials = (form.full_name || user.email || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <header style={{ background: "white", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58 }}>
          <Logo onClick={onBack} />
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
            ← Back to Calculator
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 28px" }}>
        {/* Profile header card */}
        <div style={{ background: "white", borderRadius: 20, border: "1.5px solid #e5e7eb", padding: "36px 40px", marginBottom: 24, display: "flex", alignItems: "center", gap: 28 }}>
          {/* Avatar */}
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #10b981, #059669)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: "white", fontFamily: "'Fraunces', serif" }}>{initials}</span>
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 800, color: "#111827", marginBottom: 4 }}>
              {form.full_name || "Your Profile"}
            </h1>
            <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>{user.email}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {form.investor_type && (
                <span style={{ fontSize: 12, fontWeight: 600, color: "#059669", background: "#f0fdf4", padding: "3px 10px", borderRadius: 100, border: "1px solid #bbf7d0" }}>
                  {form.investor_type}
                </span>
              )}
              {form.location && (
                <span style={{ fontSize: 12, color: "#6b7280", background: "#f9fafb", padding: "3px 10px", borderRadius: 100, border: "1px solid #e5e7eb" }}>
                  📍 {form.location}
                </span>
              )}
            </div>
          </div>
          <Btn variant="danger" onClick={onSignOut}>Sign Out</Btn>
        </div>

        {/* Edit form */}
        <div style={{ background: "white", borderRadius: 20, border: "1.5px solid #e5e7eb", padding: "36px 40px" }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111827", marginBottom: 24 }}>Edit Profile</h2>

          {error && <div style={{ marginBottom: 20 }}><Alert type="error">{error}</Alert></div>}
          {saved && <div style={{ marginBottom: 20 }}><Alert type="success">Profile saved successfully!</Alert></div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
            <Input label="Full name *" value={form.full_name} onChange={f("full_name")} placeholder="Jane Smith" icon="👤" />
            <Input label="Email address" value={user.email} onChange={() => {}} placeholder="" hint="Email cannot be changed here" />
            <Input label="Phone number" value={form.phone || ""} onChange={f("phone")} placeholder="+1 (555) 000-0000" icon="📱" />
            <Input label="Location" value={form.location || ""} onChange={f("location")} placeholder="Atlanta, GA" icon="📍" />
          </div>
          <div style={{ marginBottom: 18 }}>
            <Select label="Investor type" value={form.investor_type || ""} onChange={f("investor_type")} options={INVESTOR_TYPES} placeholder="What kind of investor are you?" />
          </div>
          <div style={{ marginBottom: 28, display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Bio</label>
            <textarea value={form.bio || ""} onChange={e => f("bio")(e.target.value)}
              placeholder="Tell us about your investing background, goals, or strategy..."
              rows={4} style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 14, color: "#111827", outline: "none", resize: "vertical", fontFamily: "'DM Sans', sans-serif" }} />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn variant="primary" loading={loading} onClick={handleSave}>Save Changes</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Fast number input ────────────────────────────────────────────────────────
function Field({ label, value, onChange, prefix, suffix, step = 1 }) {
  const [draft, setDraft] = useState(String(value ?? ""));
  useEffect(() => setDraft(String(value ?? "")), [value]);
  const commit = () => { const n = parseFloat(draft); if (!isNaN(n)) onChange(n); else setDraft(String(value ?? "")); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</label>}
      <div style={{ display: "flex", alignItems: "center", background: "#f9fafb", border: "1.5px solid #e5e7eb", borderRadius: 8, overflow: "hidden", transition: "border-color 0.15s" }}
        onFocusCapture={e => e.currentTarget.style.borderColor = "#10b981"}
        onBlurCapture={e => e.currentTarget.style.borderColor = "#e5e7eb"}>
        {prefix && <span style={{ padding: "0 10px", color: "#9ca3af", fontSize: 13, borderRight: "1.5px solid #e5e7eb", background: "#f3f4f6", whiteSpace: "nowrap" }}>{prefix}</span>}
        <input type="number" step={step} value={draft}
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") { commit(); e.target.blur(); } }}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#111827", padding: "9px 12px", fontSize: 13, fontFamily: "'DM Mono', monospace", minWidth: 0 }} />
        {suffix && <span style={{ padding: "0 10px", color: "#9ca3af", fontSize: 12, borderLeft: "1.5px solid #e5e7eb", background: "#f3f4f6", whiteSpace: "nowrap" }}>{suffix}</span>}
      </div>
    </div>
  );
}

function CalcDivider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 2px" }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#10b981", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
    </div>
  );
}

function OutRow({ label, value, highlight, positive, negative }) {
  const color = positive ? "#059669" : negative ? "#dc2626" : highlight ? "#111827" : "#374151";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ fontSize: 12, color: "#6b7280" }}>{label}</span>
      <span style={{ fontSize: highlight ? 14 : 13, fontWeight: highlight ? 700 : 500, fontFamily: "'DM Mono', monospace", color }}>{value}</span>
    </div>
  );
}

function BigResult({ label, value, positive, negative }) {
  const bg = positive ? "#f0fdf4" : negative ? "#fef2f2" : "#f9fafb";
  const border = positive ? "#bbf7d0" : negative ? "#fecaca" : "#e5e7eb";
  const color = positive ? "#059669" : negative ? "#dc2626" : "#374151";
  return (
    <div style={{ textAlign: "center", padding: "18px 14px", background: bg, borderRadius: 12, border: `1.5px solid ${border}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'DM Mono', monospace", color }}>{value}</div>
    </div>
  );
}

const fmtD = (n) => n == null || isNaN(n) ? "—" : (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const fmtP = (n) => isNaN(n) ? "—" : `${(n * 100).toFixed(1)}%`;

// ─── Calculators ──────────────────────────────────────────────────────────────
function RentalCalc({ saved, onCalcChange }) {
  const [i, setI] = useState(saved || { pp: 320000, down: 20, cc: 8500, rehab: 0, rent: 2800, expenses: 750, pmt: 1420 });
  const s = k => v => setI(p => ({ ...p, [k]: v }));
  const c = useMemo(() => {
    const downAmt = +i.pp * +i.down / 100, totalInv = downAmt + +i.cc + +i.rehab;
    const noi = (+i.rent - +i.expenses) * 12, mcf = +i.rent - +i.expenses - +i.pmt, acf = mcf * 12;
    return { downAmt, totalInv, noi, mcf, acf, capRate: +i.pp > 0 ? noi / +i.pp : 0, coc: totalInv > 0 ? acf / totalInv : 0 };
  }, [i]);
  useEffect(() => onCalcChange(i, { primary: fmtD(c.mcf), secondary: fmtP(c.coc), label: "Mo. Cash Flow", label2: "CoC ROI" }), [i, c]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <CalcDivider label="Purchase" />
        <Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000} />
        <Field label="Down Payment" value={i.down} onChange={s("down")} suffix="%" step={0.5} />
        <Field label="Closing Costs" value={i.cc} onChange={s("cc")} prefix="$" step={500} />
        <Field label="Rehab Costs" value={i.rehab} onChange={s("rehab")} prefix="$" step={1000} />
        <CalcDivider label="Monthly" />
        <Field label="Monthly Rent" value={i.rent} onChange={s("rent")} prefix="$" step={50} />
        <Field label="Monthly Expenses" value={i.expenses} onChange={s("expenses")} prefix="$" step={50} />
        <Field label="Mortgage Payment" value={i.pmt} onChange={s("pmt")} prefix="$" step={25} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <BigResult label="Monthly Cash Flow" value={fmtD(c.mcf)} positive={c.mcf >= 0} negative={c.mcf < 0} />
          <BigResult label="Cash-on-Cash ROI" value={fmtP(c.coc)} positive={c.coc >= 0.08} negative={c.coc < 0} />
        </div>
        <div style={{ background: "#f9fafb", borderRadius: 12, padding: "2px 16px" }}>
          <OutRow label="Annual Cash Flow" value={fmtD(c.acf)} positive={c.acf >= 0} negative={c.acf < 0} />
          <OutRow label="Cap Rate" value={fmtP(c.capRate)} />
          <OutRow label="NOI" value={fmtD(c.noi)} />
          <OutRow label="Total Investment" value={fmtD(c.totalInv)} highlight />
        </div>
      </div>
    </div>
  );
}

function WholesaleCalc({ saved, onCalcChange }) {
  const [i, setI] = useState(saved || { arv: 240000, repairs: 28000, pct: 70, fee: 9000 });
  const s = k => v => setI(p => ({ ...p, [k]: v }));
  const mao = useMemo(() => +i.arv * +i.pct / 100 - +i.repairs - +i.fee, [i]);
  useEffect(() => onCalcChange(i, { primary: fmtD(mao), secondary: fmtD(+i.fee), label: "MAO", label2: "Your Fee" }), [i, mao]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <CalcDivider label="Deal Details" />
        <Field label="After Repair Value" value={i.arv} onChange={s("arv")} prefix="$" step={5000} />
        <Field label="Estimated Repairs" value={i.repairs} onChange={s("repairs")} prefix="$" step={1000} />
        <Field label="Max Offer %" value={i.pct} onChange={s("pct")} suffix="%" step={1} />
        <Field label="Wholesale Fee" value={i.fee} onChange={s("fee")} prefix="$" step={500} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <BigResult label="Max Allowable Offer" value={fmtD(mao)} positive={mao > 0} negative={mao <= 0} />
          <BigResult label="Your Fee" value={fmtD(+i.fee)} positive />
        </div>
        <div style={{ background: "#f9fafb", borderRadius: 12, padding: "2px 16px" }}>
          <OutRow label="ARV" value={fmtD(+i.arv)} />
          <OutRow label={`ARV × ${i.pct}%`} value={fmtD(+i.arv * +i.pct / 100)} />
          <OutRow label="Minus Repairs" value={`−${fmtD(+i.repairs)}`} />
          <OutRow label="Minus Fee" value={`−${fmtD(+i.fee)}`} />
          <OutRow label="MAO" value={fmtD(mao)} positive={mao > 0} negative={mao <= 0} highlight />
        </div>
      </div>
    </div>
  );
}

function FlipCalc({ saved, onCalcChange }) {
  const [i, setI] = useState(saved || { pp: 165000, rehab: 38000, arv: 275000, agent: 6, closing: 5000, holding: 4500, misc: 2000 });
  const s = k => v => setI(p => ({ ...p, [k]: v }));
  const c = useMemo(() => {
    const agentAmt = +i.arv * +i.agent / 100, totalCost = +i.pp + +i.rehab + agentAmt + +i.closing + +i.holding + +i.misc;
    return { agentAmt, totalCost, profit: +i.arv - totalCost, roi: totalCost > 0 ? (+i.arv - totalCost) / totalCost : 0 };
  }, [i]);
  useEffect(() => onCalcChange(i, { primary: fmtD(c.profit), secondary: fmtP(c.roi), label: "Net Profit", label2: "ROI" }), [i, c]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <CalcDivider label="Acquisition" />
        <Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000} />
        <Field label="Rehab Costs" value={i.rehab} onChange={s("rehab")} prefix="$" step={1000} />
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000} />
        <CalcDivider label="Selling Costs" />
        <Field label="Agent Fees" value={i.agent} onChange={s("agent")} suffix="%" step={0.5} />
        <Field label="Closing Costs" value={i.closing} onChange={s("closing")} prefix="$" step={500} />
        <Field label="Holding Costs" value={i.holding} onChange={s("holding")} prefix="$" step={500} />
        <Field label="Misc" value={i.misc} onChange={s("misc")} prefix="$" step={500} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <BigResult label="Net Profit" value={fmtD(c.profit)} positive={c.profit > 0} negative={c.profit <= 0} />
          <BigResult label="ROI" value={fmtP(c.roi)} positive={c.roi > 0.15} negative={c.roi <= 0} />
        </div>
        <div style={{ background: "#f9fafb", borderRadius: 12, padding: "2px 16px" }}>
          <OutRow label="Purchase + Rehab" value={fmtD(+i.pp + +i.rehab)} />
          <OutRow label="Agent Fees" value={fmtD(c.agentAmt)} />
          <OutRow label="Other Costs" value={fmtD(+i.closing + +i.holding + +i.misc)} />
          <OutRow label="Total Cost" value={fmtD(c.totalCost)} />
          <OutRow label="Net Profit" value={fmtD(c.profit)} positive={c.profit > 0} negative={c.profit <= 0} highlight />
        </div>
      </div>
    </div>
  );
}

function BRRRRCalc({ saved, onCalcChange }) {
  const [i, setI] = useState(saved || { pp: 110000, rehab: 45000, arv: 210000, refPct: 75, rent: 1750, expenses: 780 });
  const s = k => v => setI(p => ({ ...p, [k]: v }));
  const c = useMemo(() => {
    const totalInv = +i.pp + +i.rehab, refiAmt = +i.arv * +i.refPct / 100, cashOut = refiAmt - totalInv, mcf = +i.rent - +i.expenses;
    return { totalInv, refiAmt, cashOut, mcf, acf: mcf * 12, roi: totalInv > 0 ? (mcf * 12) / totalInv : 0 };
  }, [i]);
  useEffect(() => onCalcChange(i, { primary: fmtD(c.cashOut), secondary: fmtD(c.mcf), label: "Cash Out", label2: "Mo. Cash Flow" }), [i, c]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <CalcDivider label="Acquisition" />
        <Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000} />
        <Field label="Rehab Costs" value={i.rehab} onChange={s("rehab")} prefix="$" step={1000} />
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000} />
        <Field label="Refinance %" value={i.refPct} onChange={s("refPct")} suffix="%" step={1} />
        <CalcDivider label="Rental" />
        <Field label="Monthly Rent" value={i.rent} onChange={s("rent")} prefix="$" step={50} />
        <Field label="Monthly Expenses" value={i.expenses} onChange={s("expenses")} prefix="$" step={50} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <BigResult label="Cash Out at Refi" value={fmtD(c.cashOut)} positive={c.cashOut >= 0} negative={c.cashOut < 0} />
          <BigResult label="Monthly Cash Flow" value={fmtD(c.mcf)} positive={c.mcf >= 0} negative={c.mcf < 0} />
        </div>
        <div style={{ background: "#f9fafb", borderRadius: 12, padding: "2px 16px" }}>
          <OutRow label="Total Invested" value={fmtD(c.totalInv)} />
          <OutRow label="Refinance Amount" value={fmtD(c.refiAmt)} />
          <OutRow label="Annual Cash Flow" value={fmtD(c.acf)} />
          <OutRow label="Annual ROI" value={fmtP(c.roi)} positive={c.roi > 0.08} highlight />
        </div>
      </div>
    </div>
  );
}

function SubToCalc({ saved, onCalcChange }) {
  const [i, setI] = useState(saved || { balance: 175000, dp: 8000, cc: 2500, pmt: 1050, rent: 1700, expenses: 350 });
  const s = k => v => setI(p => ({ ...p, [k]: v }));
  const c = useMemo(() => {
    const totalInv = +i.dp + +i.cc, mcf = +i.rent - +i.pmt - +i.expenses, acf = mcf * 12;
    return { totalInv, mcf, acf, roi: totalInv > 0 ? acf / totalInv : 0 };
  }, [i]);
  useEffect(() => onCalcChange(i, { primary: fmtD(c.mcf), secondary: fmtP(c.roi), label: "Mo. Cash Flow", label2: "ROI" }), [i, c]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <CalcDivider label="Existing Loan" />
        <Field label="Loan Balance" value={i.balance} onChange={s("balance")} prefix="$" step={5000} />
        <Field label="Monthly Mortgage" value={i.pmt} onChange={s("pmt")} prefix="$" step={25} />
        <CalcDivider label="Your Investment" />
        <Field label="Down to Seller" value={i.dp} onChange={s("dp")} prefix="$" step={1000} />
        <Field label="Closing Costs" value={i.cc} onChange={s("cc")} prefix="$" step={500} />
        <CalcDivider label="Income" />
        <Field label="Monthly Rent" value={i.rent} onChange={s("rent")} prefix="$" step={50} />
        <Field label="Monthly Expenses" value={i.expenses} onChange={s("expenses")} prefix="$" step={50} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <BigResult label="Monthly Cash Flow" value={fmtD(c.mcf)} positive={c.mcf >= 0} negative={c.mcf < 0} />
          <BigResult label="ROI" value={fmtP(c.roi)} positive={c.roi > 0.10} negative={c.roi < 0} />
        </div>
        <div style={{ background: "#f9fafb", borderRadius: 12, padding: "2px 16px" }}>
          <OutRow label="Total Cash In" value={fmtD(c.totalInv)} />
          <OutRow label="Loan Balance" value={fmtD(+i.balance)} />
          <OutRow label="Annual Cash Flow" value={fmtD(c.acf)} positive={c.acf >= 0} negative={c.acf < 0} highlight />
        </div>
      </div>
    </div>
  );
}

function NovationCalc({ saved, onCalcChange }) {
  const [i, setI] = useState(saved || { pp: 155000, repairs: 22000, arv: 270000, agent: 6, closing: 4500, sellerPayout: 12000, holding: 3000, misc: 1500 });
  const s = k => v => setI(p => ({ ...p, [k]: v }));
  const c = useMemo(() => {
    const agentAmt = +i.arv * +i.agent / 100, totalCost = +i.pp + +i.repairs + agentAmt + +i.closing + +i.sellerPayout + +i.holding + +i.misc;
    return { agentAmt, totalCost, profit: +i.arv - totalCost, roi: totalCost > 0 ? (+i.arv - totalCost) / totalCost : 0 };
  }, [i]);
  useEffect(() => onCalcChange(i, { primary: fmtD(c.profit), secondary: fmtP(c.roi), label: "Net Profit", label2: "ROI" }), [i, c]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <CalcDivider label="Deal" />
        <Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000} />
        <Field label="Repair Costs" value={i.repairs} onChange={s("repairs")} prefix="$" step={1000} />
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000} />
        <CalcDivider label="Costs" />
        <Field label="Agent Fees" value={i.agent} onChange={s("agent")} suffix="%" step={0.5} />
        <Field label="Closing Costs" value={i.closing} onChange={s("closing")} prefix="$" step={500} />
        <Field label="Seller Payout" value={i.sellerPayout} onChange={s("sellerPayout")} prefix="$" step={1000} />
        <Field label="Holding + Misc" value={i.holding + i.misc} onChange={v => { s("holding")(v * 0.6); s("misc")(v * 0.4); }} prefix="$" step={500} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <BigResult label="Net Profit" value={fmtD(c.profit)} positive={c.profit > 0} negative={c.profit <= 0} />
          <BigResult label="ROI" value={fmtP(c.roi)} positive={c.roi > 0.15} negative={c.roi <= 0} />
        </div>
        <div style={{ background: "#f9fafb", borderRadius: 12, padding: "2px 16px" }}>
          <OutRow label="Total Costs" value={fmtD(c.totalCost)} />
          <OutRow label="ARV" value={fmtD(+i.arv)} />
          <OutRow label="Agent Fees" value={fmtD(c.agentAmt)} />
          <OutRow label="Net Profit" value={fmtD(c.profit)} positive={c.profit > 0} negative={c.profit <= 0} highlight />
        </div>
      </div>
    </div>
  );
}

const CALC_MAP = { rental: RentalCalc, wholesale: WholesaleCalc, flip: FlipCalc, brrrr: BRRRRCalc, subto: SubToCalc, novation: NovationCalc };

// ─── Save Deal Modal ──────────────────────────────────────────────────────────
function SaveDealModal({ mode, onSave, onClose }) {
  const [name, setName] = useState("");
  const m = MODES.find(m => m.key === mode);
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "white", borderRadius: 18, padding: 36, maxWidth: 400, width: "100%", boxShadow: "0 24px 60px rgba(0,0,0,0.15)", animation: "popIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>{m.icon}</div>
        <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 6 }}>Save this deal</h3>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>Give it a name — a property address works great.</p>
        <input autoFocus type="text" placeholder="e.g. 123 Main St, Atlanta"
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && name.trim()) onSave(name.trim()); }}
          style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 14, outline: "none", color: "#111827", fontFamily: "'DM Sans', sans-serif", marginBottom: 14 }} />
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" fullWidth disabled={!name.trim()} onClick={() => name.trim() && onSave(name.trim())}>Save Deal →</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Deal Card ────────────────────────────────────────────────────────────────
function DealCard({ deal, onLoad, onDelete }) {
  const m = MODES.find(m => m.key === deal.mode);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const date = new Date(deal.created_at || deal.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <div style={{ background: "white", borderRadius: 14, border: "1.5px solid #e5e7eb", overflow: "hidden", transition: "box-shadow 0.2s, transform 0.2s" }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.08)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "translateY(0)"; }}>
      <div style={{ height: 4, background: m.color, opacity: 0.7 }} />
      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 14 }}>{m.icon}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: m.color, background: m.bg, padding: "2px 8px", borderRadius: 100, border: `1px solid ${m.border}` }}>{m.label}</span>
        </div>
        <h4 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 2 }}>{deal.name}</h4>
        <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 14 }}>{date}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[["label", "primary"], ["label2", "secondary"]].map(([lbl, val]) => (
            <div key={lbl} style={{ background: "#f9fafb", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{deal.metrics[lbl]}</div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: "#111827" }}>{deal.metrics[val]}</div>
            </div>
          ))}
        </div>
        {confirmDelete ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Btn>
            <Btn variant="danger" fullWidth onClick={() => onDelete(deal.id)}>Delete</Btn>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="dark" fullWidth onClick={() => onLoad(deal)}>Load Deal →</Btn>
            <button onClick={() => setConfirmDelete(true)} style={{ padding: "9px 14px", borderRadius: 8, border: "1.5px solid #fee2e2", background: "#fff5f5", color: "#dc2626", fontSize: 12, cursor: "pointer" }}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Analyzer App ─────────────────────────────────────────────────────────────
function AnalyzerApp({ user, profile, onGoHome, onGoProfile, onSignOut }) {
  const [view, setView] = useState("calc");
  const [mode, setMode] = useState("rental");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [currentInputs, setCurrentInputs] = useState({});
  const [currentMetrics, setCurrentMetrics] = useState({});
  const [deals, setDeals] = useState([]);
  const [loadedDealId, setLoadedDealId] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [filterMode, setFilterMode] = useState("all");
  const [dealsLoading, setDealsLoading] = useState(true);

  // Load deals from Supabase on mount
  useEffect(() => {
    supabase.getDeals(user.id).then(d => { setDeals(d); setDealsLoading(false); }).catch(() => setDealsLoading(false));
  }, [user.id]);

  const handleCalcChange = useCallback((inputs, metrics) => { setCurrentInputs(inputs); setCurrentMetrics(metrics); }, []);

  const handleSave = async (name) => {
    const deal = { user_id: user.id, name, mode, inputs: currentInputs, metrics: currentMetrics, created_at: new Date().toISOString() };
    try {
      const saved = await supabase.insertDeal(deal);
      const newDeal = Array.isArray(saved) ? saved[0] : { ...deal, id: Date.now().toString() };
      setDeals(prev => [newDeal, ...prev]);
      setLoadedDealId(newDeal.id);
      setShowSaveModal(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch {
      // Fallback to local
      const localDeal = { ...deal, id: Date.now().toString() };
      setDeals(prev => [localDeal, ...prev]);
      setLoadedDealId(localDeal.id);
      setShowSaveModal(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    }
  };

  const handleDelete = async (id) => {
    try { await supabase.deleteDeal(id); } catch {}
    setDeals(prev => prev.filter(d => d.id !== id));
    if (loadedDealId === id) setLoadedDealId(null);
  };

  const handleLoad = (deal) => { setMode(deal.mode); setLoadedDealId(deal.id); setView("calc"); };

  const activeMode = MODES.find(m => m.key === mode);
  const CalcComponent = CALC_MAP[mode];
  const filteredDeals = filterMode === "all" ? deals : deals.filter(d => d.mode === filterMode);
  const initials = (profile?.full_name || user.email || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'DM Sans', sans-serif" }}>
      {showSaveModal && <SaveDealModal mode={mode} onSave={handleSave} onClose={() => setShowSaveModal(false)} />}

      {/* Header */}
      <header style={{ background: "white", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58 }}>
          <Logo onClick={onGoHome} />

          {/* Tab switcher */}
          <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 10, padding: 3, gap: 2 }}>
            {[{ key: "calc", label: "Calculator", icon: "⚡" }, { key: "deals", label: `Saved Deals${deals.length > 0 ? ` (${deals.length})` : ""}`, icon: "💾" }].map(tab => (
              <button key={tab.key} onClick={() => setView(tab.key)}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 18px", borderRadius: 8, border: "none", background: view === tab.key ? "white" : "transparent", color: view === tab.key ? "#111827" : "#6b7280", fontSize: 13, fontWeight: view === tab.key ? 700 : 500, cursor: "pointer", boxShadow: view === tab.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
                <span>{tab.icon}</span> {tab.label}
              </button>
            ))}
          </div>

          {/* User menu */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {savedFlash && <span style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>✓ Saved!</span>}
            <button onClick={onGoProfile}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px 6px 6px", borderRadius: 100, border: "1.5px solid #e5e7eb", background: "white", cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#10b981"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#e5e7eb"}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #10b981, #059669)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "white" }}>{initials}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{profile?.full_name?.split(" ")[0] || "Profile"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Calculator View */}
      {view === "calc" && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
            {MODES.map(m => (
              <button key={m.key} onClick={() => { setMode(m.key); setLoadedDealId(null); }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 100, border: `2px solid ${mode === m.key ? m.border : "#e5e7eb"}`, background: mode === m.key ? m.bg : "white", cursor: "pointer", transition: "all 0.15s" }}>
                <span style={{ fontSize: 15 }}>{m.icon}</span>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: mode === m.key ? m.color : "#374151" }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: mode === m.key ? m.color : "#9ca3af", opacity: 0.85 }}>{m.sub}</div>
                </div>
              </button>
            ))}
          </div>
          <div style={{ background: "white", borderRadius: 18, border: "1.5px solid #e5e7eb", overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: activeMode.bg, borderBottom: `1.5px solid ${activeMode.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 22 }}>{activeMode.icon}</span>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: activeMode.color }}>{activeMode.label} Calculator</h2>
                  <p style={{ fontSize: 11, color: activeMode.color, opacity: 0.7 }}>{activeMode.sub}</p>
                </div>
              </div>
              {loadedDealId && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "white", border: `1.5px solid ${activeMode.border}`, borderRadius: 100, padding: "5px 14px" }}>
                  <span style={{ fontSize: 12 }}>📂</span>
                  <span style={{ fontSize: 12, color: activeMode.color, fontWeight: 600 }}>Loaded from saved deals</span>
                </div>
              )}
            </div>
            <div style={{ padding: "28px 24px" }}>
              <CalcComponent key={`${mode}-${loadedDealId}`} saved={loadedDealId ? deals.find(d => d.id === loadedDealId)?.inputs : null} onCalcChange={handleCalcChange} />
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #f3f4f6", background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <p style={{ fontSize: 12, color: "#9ca3af" }}>Results update as you type · Deals sync to your account</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setView("deals")} style={{ padding: "9px 18px", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>View Saved Deals</button>
                <button onClick={() => setShowSaveModal(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 22px", borderRadius: 8, border: "none", background: "#111827", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  💾 Save Deal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Saved Deals View */}
      {view === "deals" && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 14 }}>
            <div>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 800, color: "#111827", marginBottom: 3 }}>Saved Deals</h2>
              <p style={{ fontSize: 13, color: "#9ca3af" }}>{deals.length} deal{deals.length !== 1 ? "s" : ""} · Synced to your account</p>
            </div>
            <Btn variant="primary" onClick={() => setView("calc")}>⚡ New Analysis</Btn>
          </div>
          {deals.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
              <button onClick={() => setFilterMode("all")} style={{ padding: "6px 16px", borderRadius: 100, border: `1.5px solid ${filterMode === "all" ? "#111827" : "#e5e7eb"}`, background: filterMode === "all" ? "#111827" : "white", color: filterMode === "all" ? "white" : "#6b7280", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>All ({deals.length})</button>
              {MODES.filter(m => deals.some(d => d.mode === m.key)).map(m => (
                <button key={m.key} onClick={() => setFilterMode(m.key)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 100, border: `1.5px solid ${filterMode === m.key ? m.border : "#e5e7eb"}`, background: filterMode === m.key ? m.bg : "white", color: filterMode === m.key ? m.color : "#6b7280", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  {m.icon} {m.label} ({deals.filter(d => d.mode === m.key).length})
                </button>
              ))}
            </div>
          )}
          {dealsLoading ? (
            <div style={{ textAlign: "center", padding: "60px 24px", color: "#9ca3af" }}>Loading your deals...</div>
          ) : deals.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 24px" }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🏠</div>
              <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 8 }}>No saved deals yet</h3>
              <p style={{ fontSize: 14, color: "#6b7280", maxWidth: 340, margin: "0 auto 24px", lineHeight: 1.7 }}>Run an analysis and hit "Save Deal" to build your deal library.</p>
              <Btn variant="primary" onClick={() => setView("calc")}>Go to Calculator →</Btn>
            </div>
          ) : filteredDeals.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 24px", color: "#9ca3af" }}>No {MODES.find(m => m.key === filterMode)?.label} deals saved.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 18 }}>
              {filteredDeals.map(deal => <DealCard key={deal.id} deal={deal} onLoad={handleLoad} onDelete={handleDelete} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Root() {
  const [page, setPage] = useState("loading"); // loading | home | signin | signup | app | profile
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  // Restore session on mount
  useEffect(() => {
    const restored = supabase.auth.restoreSession();
    if (restored) {
      supabase.auth.getUser().then(u => {
        if (u) {
          setUser(u);
          supabase.getProfile(u.id).then(p => { setProfile(p); setPage("app"); }).catch(() => setPage("app"));
        } else {
          supabase._token = null;
          try { localStorage.removeItem("ds_token"); } catch {}
          setPage("home");
        }
      }).catch(() => setPage("home"));
    } else {
      setPage("home");
    }
  }, []);

  const handleSignIn = (u, p) => { setUser(u); setProfile(p); setPage("app"); };
  const handleSignOut = async () => { await supabase.auth.signOut(); setUser(null); setProfile(null); setPage("home"); };
  const handleProfileUpdate = (p) => setProfile(p);

  if (page === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, background: "linear-gradient(135deg, #10b981, #059669)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", animation: "pulse 1.5s ease-in-out infinite" }}>
            <span style={{ color: "white", fontSize: 22, fontWeight: 800 }}>D</span>
          </div>
          <p style={{ color: "#9ca3af", fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Landing page (inline, minimal for space — reuses full landing from dealsource-full.jsx in production)
  if (page === "home") {
    return (
      <>
        <GlobalStyles />
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, #064e3b 0%, #065f46 50%, #f0fdf4 100%)", fontFamily: "'DM Sans', sans-serif", padding: 24 }}>
          <Logo size="lg" />
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 900, color: "white", textAlign: "center", lineHeight: 1.1, margin: "28px 0 16px", maxWidth: 600 }}>
            Analyze Any Real Estate Deal<br /><span style={{ color: "#6ee7b7", fontStyle: "italic" }}>in Seconds</span>
          </h1>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.7)", textAlign: "center", maxWidth: 480, lineHeight: 1.7, marginBottom: 40 }}>
            6 strategies. Instant calculations. Your deal library in the cloud.
          </p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
            <button onClick={() => setPage("signup")} style={{ padding: "14px 36px", borderRadius: 12, border: "none", background: "#10b981", color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 20px rgba(16,185,129,0.4)" }}>
              Start Free Trial →
            </button>
            <button onClick={() => setPage("signin")} style={{ padding: "14px 28px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.3)", background: "transparent", color: "white", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              Sign In
            </button>
          </div>
          <div style={{ display: "flex", gap: 32, marginTop: 56, flexWrap: "wrap", justifyContent: "center" }}>
            {[["🏘️", "6 Calculators"], ["⚡", "Real-Time"], ["💾", "Cloud Saved"], ["$0", "Free to Start"]].map(([icon, label]) => (
              <div key={label} style={{ textAlign: "center", color: "rgba(255,255,255,0.6)" }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <GlobalStyles />
      {page === "signin" && <SignInPage onSignIn={handleSignIn} onGoSignUp={() => setPage("signup")} onGoHome={() => setPage("home")} />}
      {page === "signup" && <SignUpPage onSignIn={handleSignIn} onGoSignIn={() => setPage("signin")} onGoHome={() => setPage("home")} />}
      {page === "app" && user && <AnalyzerApp user={user} profile={profile} onGoHome={() => setPage("home")} onGoProfile={() => setPage("profile")} onSignOut={handleSignOut} />}
      {page === "profile" && user && <ProfilePage user={user} profile={profile} onUpdate={handleProfileUpdate} onSignOut={handleSignOut} onBack={() => setPage("app")} />}
    </>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,700;0,800;0,900;1,800&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html { scroll-behavior: smooth; }
      input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
      ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }
      @keyframes popIn { from { opacity:0; transform:scale(0.94); } to { opacity:1; transform:scale(1); } }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
    `}</style>
  );
}
