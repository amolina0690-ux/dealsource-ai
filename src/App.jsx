import { useState, useMemo, useEffect, useCallback, useRef } from "react";

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
const SUPABASE_URL = "https://tobblkfhbjwxjygbswnl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvYmJsa2ZoYmp3eGp5Z2Jzd25sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTE4MDIsImV4cCI6MjA4NzE2NzgwMn0.ttG8sfON_SLmHRC86Y9PYrrGeVsTitshygg0-44K8yU";

const supabase = {
  _url: SUPABASE_URL, _key: SUPABASE_ANON_KEY, _token: null,
  async _fetch(path, opts = {}) {
    const headers = { "Content-Type": "application/json", "apikey": this._key, ...(this._token ? { "Authorization": `Bearer ${this._token}` } : {}), ...opts.headers };
    const res = await fetch(`${this._url}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error_description || data.message || "Request failed");
    return data;
  },
  auth: {
    async signUp(email, password, meta = {}) { const d = await supabase._fetch("/auth/v1/signup", { method: "POST", body: JSON.stringify({ email, password, data: meta }) }); if (d.access_token) supabase._token = d.access_token; return d; },
    async signIn(email, password) { const d = await supabase._fetch("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) }); if (d.access_token) { supabase._token = d.access_token; try { localStorage.setItem("ds_token", d.access_token); } catch {} } return d; },
    async signOut() { try { await supabase._fetch("/auth/v1/logout", { method: "POST" }); } catch {} supabase._token = null; try { localStorage.removeItem("ds_token"); } catch {} },
    async getUser() { if (!supabase._token) return null; try { return await supabase._fetch("/auth/v1/user"); } catch { return null; } },
    restoreSession() { try { const t = localStorage.getItem("ds_token"); if (t) supabase._token = t; return !!t; } catch { return false; } },
  },
  async getProfile(uid) { const d = await supabase._fetch(`/rest/v1/profiles?id=eq.${uid}&select=*`); return Array.isArray(d) ? d[0] : null; },
  async upsertProfile(p) { return supabase._fetch("/rest/v1/profiles", { method: "POST", body: JSON.stringify(p), headers: { "Prefer": "resolution=merge-duplicates" } }); },
  async getDeals(uid) { const d = await supabase._fetch(`/rest/v1/deals?user_id=eq.${uid}&order=created_at.desc&select=*`); return Array.isArray(d) ? d : []; },
  async insertDeal(deal) { return supabase._fetch("/rest/v1/deals", { method: "POST", body: JSON.stringify(deal), headers: { "Prefer": "return=representation" } }); },
  async deleteDeal(id) { return supabase._fetch(`/rest/v1/deals?id=eq.${id}`, { method: "DELETE" }); },
  async getPosts() { try { const d = await supabase._fetch(`/rest/v1/forum_posts?order=created_at.desc&select=*`); return Array.isArray(d) ? d : []; } catch { return []; } },
  async insertPost(post) { return supabase._fetch("/rest/v1/forum_posts", { method: "POST", body: JSON.stringify(post), headers: { "Prefer": "return=representation" } }); },
  async getComments(postId) { try { const d = await supabase._fetch(`/rest/v1/forum_comments?post_id=eq.${postId}&order=created_at.asc&select=*`); return Array.isArray(d) ? d : []; } catch { return []; } },
  async insertComment(c) { return supabase._fetch("/rest/v1/forum_comments", { method: "POST", body: JSON.stringify(c), headers: { "Prefer": "return=representation" } }); },
};

// ─── Constants ────────────────────────────────────────────────────────────────
const MODES = [
  { key: "rental",    label: "Rental",     sub: "Buy & Hold",      icon: "🏘️", color: "#059669", bg: "#f0fdf4", border: "#bbf7d0" },
  { key: "wholesale", label: "Wholesale",  sub: "MAO Calculator",  icon: "🏷️", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  { key: "flip",      label: "Fix & Flip", sub: "Profit & ROI",    icon: "🔨", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  { key: "brrrr",     label: "BRRRR",      sub: "Refi & Recycle",  icon: "♻️", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  { key: "subto",     label: "Subject-To", sub: "Loan Takeover",   icon: "🤝", color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc" },
  { key: "novation",  label: "Novation",   sub: "Contract Assign", icon: "💡", color: "#be185d", bg: "#fdf2f8", border: "#fbcfe8" },
];

const INVESTOR_TYPES = ["Buy & Hold Investor","Fix & Flip Investor","Wholesaler","BRRRR Investor","Short-Term Rental","Commercial Investor","Beginner / Learning"];

const MEDALS = [
  { id: "bronze",   label: "Bronze",    icon: "🥉", min: 0,        max: 499999,   color: "#b45309", bg: "#fef3c7", desc: "Getting started" },
  { id: "silver",   label: "Silver",    icon: "🥈", min: 500000,   max: 1999999,  color: "#6b7280", bg: "#f3f4f6", desc: "Building momentum" },
  { id: "gold",     label: "Gold",      icon: "🥇", min: 2000000,  max: 4999999,  color: "#d97706", bg: "#fffbeb", desc: "Serious investor" },
  { id: "platinum", label: "Platinum",  icon: "💎", min: 5000000,  max: 9999999,  color: "#7c3aed", bg: "#f5f3ff", desc: "Elite portfolio" },
  { id: "diamond",  label: "Diamond",   icon: "💠", min: 10000000, max: Infinity, color: "#0891b2", bg: "#ecfeff", desc: "Top 1% investor" },
];

const getMedal = (val) => MEDALS.find(m => val >= m.min && val <= m.max) || MEDALS[0];

const fmtD = (n) => n == null || isNaN(n) ? "—" : (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const fmtP = (n) => isNaN(n) ? "—" : `${(n * 100).toFixed(1)}%`;
const fmtM = (n) => { if (!n) return "$0"; if (n >= 1000000) return `$${(n/1000000).toFixed(1)}M`; if (n >= 1000) return `$${(n/1000).toFixed(0)}K`; return `$${n}`; };

// ─── Global Styles ────────────────────────────────────────────────────────────
function GlobalStyles() {
  return <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,700;0,800;0,900;1,800&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
    ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }
    @keyframes popIn { from { opacity:0; transform:scale(0.94); } to { opacity:1; transform:scale(1); } }
    @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
    @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
    @keyframes shimmer { from { background-position:-200% 0; } to { background-position:200% 0; } }
    .fade-in { animation: fadeUp 0.4s ease both; }
  `}</style>;
}

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo({ onClick, size = "md" }) {
  const sz = size === "lg" ? 36 : 28;
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 8, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ width: sz, height: sz, background: "linear-gradient(135deg, #10b981, #059669)", borderRadius: sz * 0.25, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "white", fontSize: sz * 0.5, fontWeight: 800 }}>D</span>
      </div>
      <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: size === "lg" ? 22 : 17, color: "#111827" }}>
        DealSource<span style={{ color: "#10b981" }}>.ai</span>
      </span>
    </div>
  );
}

// ─── UI Components ────────────────────────────────────────────────────────────
function Input({ label, type = "text", value, onChange, placeholder, icon, error, hint, disabled }) {
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  const isPass = type === "password";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{label}</label>}
      <div style={{ position: "relative" }}>
        {icon && <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 16, pointerEvents: "none" }}>{icon}</span>}
        <input type={isPass && show ? "text" : type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{ width: "100%", padding: `11px ${isPass ? "42px" : "14px"} 11px ${icon ? "40px" : "14px"}`, borderRadius: 10, border: `1.5px solid ${error ? "#fca5a5" : focused ? "#10b981" : "#e5e7eb"}`, background: disabled ? "#f9fafb" : error ? "#fff5f5" : "white", fontSize: 14, color: "#111827", outline: "none", transition: "border-color 0.15s", fontFamily: "'DM Sans', sans-serif" }} />
        {isPass && <button type="button" onClick={() => setShow(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#9ca3af" }}>{show ? "🙈" : "👁️"}</button>}
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
      <select value={value} onChange={e => onChange(e.target.value)} style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid #e5e7eb", background: "white", fontSize: 14, color: value ? "#111827" : "#9ca3af", outline: "none", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
        <option value="">{placeholder || "Select..."}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", loading, disabled, fullWidth, small }) {
  const styles = {
    primary: { background: "#10b981", color: "white", border: "none" },
    secondary: { background: "white", color: "#374151", border: "1.5px solid #e5e7eb" },
    dark: { background: "#111827", color: "white", border: "none" },
    ghost: { background: "transparent", color: "#6b7280", border: "1.5px solid #e5e7eb" },
    danger: { background: "#dc2626", color: "white", border: "none" },
    teal: { background: "#0d9488", color: "white", border: "none" },
  };
  return (
    <button onClick={onClick} disabled={disabled || loading}
      style={{ ...styles[variant], padding: small ? "7px 14px" : "12px 24px", borderRadius: small ? 7 : 10, fontSize: small ? 12 : 14, fontWeight: 700, cursor: disabled || loading ? "default" : "pointer", width: fullWidth ? "100%" : "auto", opacity: disabled ? 0.5 : 1, transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap" }}>
      {loading ? <span style={{ animation: "spin 0.8s linear infinite", display: "inline-block" }}>⟳</span> : children}
    </button>
  );
}

function Alert({ type, children }) {
  const s = type === "error" ? { bg: "#fef2f2", border: "#fecaca", color: "#dc2626", icon: "⚠️" } : { bg: "#f0fdf4", border: "#bbf7d0", color: "#059669", icon: "✓" };
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 10 }}>
      <span style={{ fontSize: 14 }}>{s.icon}</span>
      <p style={{ fontSize: 13, color: s.color, lineHeight: 1.5, margin: 0 }}>{children}</p>
    </div>
  );
}

// ─── Auth Layout ──────────────────────────────────────────────────────────────
function AuthLayout({ children, title, subtitle }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", background: "#fff" }}>
      <div style={{ background: "linear-gradient(160deg, #064e3b 0%, #065f46 40%, #047857 100%)", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 48, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 20% 80%, rgba(16,185,129,0.15) 0%, transparent 50%)", pointerEvents: "none" }} />
        <Logo size="md" />
        <div>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(28px,3vw,42px)", fontWeight: 900, color: "white", lineHeight: 1.2, marginBottom: 20 }}>
            Analyze deals like a<br /><span style={{ color: "#6ee7b7", fontStyle: "italic" }}>seasoned investor</span>
          </h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.65)", lineHeight: 1.7, marginBottom: 40, maxWidth: 340 }}>6 calculators, community insights, portfolio tracking, and your deal library in the cloud.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[["🏘️","6 Strategies","Rental to Novation"],["⚡","Real-Time","Instant results"],["👥","Community","Share & get feedback"],["🏆","Rankings","Portfolio medals"]].map(([icon, t, sub]) => (
              <div key={t} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{t}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>© 2025 DealSource.ai</p>
      </div>
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

// ─── Sign In ──────────────────────────────────────────────────────────────────
function SignInPage({ onSignIn, onGoSignUp, onGoHome }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const handle = async () => {
    if (!email || !password) { setError("Please fill in all fields."); return; }
    setLoading(true); setError("");
    try { const d = await supabase.auth.signIn(email, password); const p = await supabase.getProfile(d.user.id).catch(() => null); onSignIn(d.user, p); }
    catch (e) { setError(e.message || "Sign in failed."); } finally { setLoading(false); }
  };
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your DealSource.ai account.">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {error && <Alert type="error">{error}</Alert>}
        <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" icon="📧" />
        <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="Your password" icon="🔒" />
        <Btn variant="primary" fullWidth loading={loading} onClick={handle}>Sign In →</Btn>
        <div style={{ textAlign: "center", paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>No account? </span>
          <button onClick={onGoSignUp} style={{ background: "none", border: "none", fontSize: 13, color: "#10b981", fontWeight: 700, cursor: "pointer" }}>Start free trial</button>
        </div>
        <button onClick={onGoHome} style={{ background: "none", border: "none", fontSize: 12, color: "#9ca3af", cursor: "pointer", textAlign: "center" }}>← Back to homepage</button>
      </div>
    </AuthLayout>
  );
}

// ─── Sign Up ──────────────────────────────────────────────────────────────────
function SignUpPage({ onSignIn, onGoSignIn, onGoHome }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ email: "", password: "", confirm: "", full_name: "", phone: "", location: "", investor_type: "", bio: "" });
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const f = k => v => setForm(p => ({ ...p, [k]: v }));
  const step1 = () => { if (!form.email || !form.password || !form.confirm) { setError("Fill in all fields."); return; } if (form.password.length < 8) { setError("Password must be 8+ characters."); return; } if (form.password !== form.confirm) { setError("Passwords don't match."); return; } setError(""); setStep(2); };
  const submit = async () => {
    if (!form.full_name) { setError("Name is required."); return; }
    setLoading(true); setError("");
    try {
      const d = await supabase.auth.signUp(form.email, form.password, { full_name: form.full_name });
      const uid = d.user?.id || d.id;
      const profile = { id: uid, email: form.email, full_name: form.full_name, phone: form.phone, location: form.location, investor_type: form.investor_type, bio: form.bio, portfolio_value: 0, portfolio_public: false };
      await supabase.upsertProfile(profile).catch(() => {});
      onSignIn(d.user || d, profile);
    } catch (e) { setError(e.message || "Sign up failed."); setStep(1); } finally { setLoading(false); }
  };
  return (
    <AuthLayout title={step === 1 ? "Create your account" : "Complete your profile"} subtitle={step === 1 ? "Free trial — no credit card required." : "Tell us about your investing background."}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        {[1,2].map(n => (<div key={n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: step >= n ? "#10b981" : "#f3f4f6", color: step >= n ? "white" : "#9ca3af", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{step > n ? "✓" : n}</div>
          <span style={{ fontSize: 12, fontWeight: 600, color: step >= n ? "#111827" : "#9ca3af" }}>{n === 1 ? "Account" : "Profile"}</span>
          {n < 2 && <div style={{ width: 32, height: 1, background: step > n ? "#10b981" : "#e5e7eb" }} />}
        </div>))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <Alert type="error">{error}</Alert>}
        {step === 1 && (<>
          <Input label="Email" type="email" value={form.email} onChange={f("email")} placeholder="you@example.com" icon="📧" />
          <Input label="Password" type="password" value={form.password} onChange={f("password")} placeholder="Min. 8 characters" icon="🔒" />
          <Input label="Confirm password" type="password" value={form.confirm} onChange={f("confirm")} placeholder="Repeat password" icon="🔒" />
          <Btn variant="primary" fullWidth onClick={step1}>Continue →</Btn>
        </>)}
        {step === 2 && (<>
          <Input label="Full name *" value={form.full_name} onChange={f("full_name")} placeholder="Jane Smith" icon="👤" />
          <Input label="Phone" value={form.phone} onChange={f("phone")} placeholder="+1 (555) 000-0000" icon="📱" />
          <Input label="Location" value={form.location} onChange={f("location")} placeholder="Atlanta, GA" icon="📍" />
          <Select label="Investor type" value={form.investor_type} onChange={f("investor_type")} options={INVESTOR_TYPES} placeholder="What kind of investor?" />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Bio</label>
            <textarea value={form.bio} onChange={e => f("bio")(e.target.value)} placeholder="Your investing background..." rows={3} style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 14, color: "#111827", outline: "none", resize: "vertical", fontFamily: "'DM Sans', sans-serif" }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" onClick={() => { setError(""); setStep(1); }}>← Back</Btn>
            <Btn variant="primary" fullWidth loading={loading} onClick={submit}>Create Account →</Btn>
          </div>
        </>)}
        <div style={{ textAlign: "center", paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>Have an account? </span>
          <button onClick={onGoSignIn} style={{ background: "none", border: "none", fontSize: 13, color: "#10b981", fontWeight: 700, cursor: "pointer" }}>Sign in</button>
        </div>
        <button onClick={onGoHome} style={{ background: "none", border: "none", fontSize: 12, color: "#9ca3af", cursor: "pointer", textAlign: "center" }}>← Back to homepage</button>
      </div>
    </AuthLayout>
  );
}

// ─── Calculator Shared ────────────────────────────────────────────────────────
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
        {prefix && <span style={{ padding: "0 10px", color: "#9ca3af", fontSize: 13, borderRight: "1.5px solid #e5e7eb", background: "#f3f4f6" }}>{prefix}</span>}
        <input type="number" step={step} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") { commit(); e.target.blur(); } }}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#111827", padding: "9px 12px", fontSize: 13, fontFamily: "'DM Mono', monospace", minWidth: 0 }} />
        {suffix && <span style={{ padding: "0 10px", color: "#9ca3af", fontSize: 12, borderLeft: "1.5px solid #e5e7eb", background: "#f3f4f6" }}>{suffix}</span>}
      </div>
    </div>
  );
}

function Divider({ label }) {
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

function AddressBar({ value, onChange }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 10 }}>
        <span style={{ fontSize: 16 }}>📍</span>
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="Enter property address (optional)..."
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#111827", fontFamily: "'DM Sans', sans-serif" }} />
      </div>
    </div>
  );
}

// ─── Calculators ──────────────────────────────────────────────────────────────
function RentalCalc({ saved, onCalcChange }) {
  const [addr, setAddr] = useState(saved?.address || "");
  const [i, setI] = useState(saved || { pp: 320000, down: 20, cc: 8500, rehab: 0, rent: 2800, expenses: 750, pmt: 1420 });
  const s = k => v => setI(p => ({ ...p, [k]: v }));
  const c = useMemo(() => {
    const downAmt = +i.pp * +i.down / 100, totalInv = downAmt + +i.cc + +i.rehab;
    const noi = (+i.rent - +i.expenses) * 12, mcf = +i.rent - +i.expenses - +i.pmt, acf = mcf * 12;
    return { downAmt, totalInv, noi, mcf, acf, capRate: +i.pp > 0 ? noi / +i.pp : 0, coc: totalInv > 0 ? acf / totalInv : 0 };
  }, [i]);
  useEffect(() => onCalcChange({ ...i, address: addr }, { primary: fmtD(c.mcf), secondary: fmtP(c.coc), label: "Mo. Cash Flow", label2: "CoC ROI" }), [i, c, addr]);
  return (<>
    <AddressBar value={addr} onChange={setAddr} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Divider label="Purchase" />
        <Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000} />
        <Field label="Down Payment" value={i.down} onChange={s("down")} suffix="%" step={0.5} />
        <Field label="Closing Costs" value={i.cc} onChange={s("cc")} prefix="$" step={500} />
        <Field label="Rehab Costs" value={i.rehab} onChange={s("rehab")} prefix="$" step={1000} />
        <Divider label="Monthly" />
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
  </>);
}

function WholesaleCalc({ saved, onCalcChange }) {
  const [addr, setAddr] = useState(saved?.address || "");
  const [i, setI] = useState(saved || { arv: 240000, repairs: 28000, pct: 70, fee: 9000 });
  const s = k => v => setI(p => ({ ...p, [k]: v }));
  const mao = useMemo(() => +i.arv * +i.pct / 100 - +i.repairs - +i.fee, [i]);
  useEffect(() => onCalcChange({ ...i, address: addr }, { primary: fmtD(mao), secondary: fmtD(+i.fee), label: "MAO", label2: "Your Fee" }), [i, mao, addr]);
  return (<>
    <AddressBar value={addr} onChange={setAddr} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Divider label="Deal Details" />
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
  </>);
}

function FlipCalc({ saved, onCalcChange }) {
  const [addr, setAddr] = useState(saved?.address || "");
  const [i, setI] = useState(saved || { pp: 165000, rehab: 38000, arv: 275000, agent: 6, closing: 5000, holding: 4500, misc: 2000 });
  const s = k => v => setI(p => ({ ...p, [k]: v }));
  const c = useMemo(() => { const agentAmt = +i.arv * +i.agent / 100, totalCost = +i.pp + +i.rehab + agentAmt + +i.closing + +i.holding + +i.misc; return { agentAmt, totalCost, profit: +i.arv - totalCost, roi: totalCost > 0 ? (+i.arv - totalCost) / totalCost : 0 }; }, [i]);
  useEffect(() => onCalcChange({ ...i, address: addr }, { primary: fmtD(c.profit), secondary: fmtP(c.roi), label: "Net Profit", label2: "ROI" }), [i, c, addr]);
  return (<>
    <AddressBar value={addr} onChange={setAddr} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Divider label="Acquisition" />
        <Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000} />
        <Field label="Rehab Costs" value={i.rehab} onChange={s("rehab")} prefix="$" step={1000} />
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000} />
        <Divider label="Selling Costs" />
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
          <OutRow label="Net Profit" value={fmtD(c.profit)} positive={c.profit > 0} negative={c.profit <= 0} highlight />
        </div>
      </div>
    </div>
  </>);
}

function BRRRRCalc({ saved, onCalcChange }) {
  const [addr, setAddr] = useState(saved?.address || "");
  const [i, setI] = useState(saved || { pp: 110000, rehab: 45000, arv: 210000, refPct: 75, rent: 1750, expenses: 780 });
  const s = k => v => setI(p => ({ ...p, [k]: v }));
  const c = useMemo(() => { const totalInv = +i.pp + +i.rehab, refiAmt = +i.arv * +i.refPct / 100, cashOut = refiAmt - totalInv, mcf = +i.rent - +i.expenses; return { totalInv, refiAmt, cashOut, mcf, acf: mcf * 12, roi: totalInv > 0 ? (mcf * 12) / totalInv : 0 }; }, [i]);
  useEffect(() => onCalcChange({ ...i, address: addr }, { primary: fmtD(c.cashOut), secondary: fmtD(c.mcf), label: "Cash Out", label2: "Mo. Cash Flow" }), [i, c, addr]);
  return (<>
    <AddressBar value={addr} onChange={setAddr} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Divider label="Acquisition" />
        <Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000} />
        <Field label="Rehab Costs" value={i.rehab} onChange={s("rehab")} prefix="$" step={1000} />
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000} />
        <Field label="Refinance %" value={i.refPct} onChange={s("refPct")} suffix="%" step={1} />
        <Divider label="Rental" />
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
          <OutRow label="Refi Amount" value={fmtD(c.refiAmt)} />
          <OutRow label="Annual Cash Flow" value={fmtD(c.acf)} />
          <OutRow label="Annual ROI" value={fmtP(c.roi)} positive={c.roi > 0.08} highlight />
        </div>
      </div>
    </div>
  </>);
}

function SubToCalc({ saved, onCalcChange, onGenerateLetter }) {
  const [addr, setAddr] = useState(saved?.address || "");
  const [i, setI] = useState(saved || { balance: 175000, dp: 8000, cc: 2500, pmt: 1050, rent: 1700, expenses: 350 });
  const s = k => v => setI(p => ({ ...p, [k]: v }));
  const c = useMemo(() => { const totalInv = +i.dp + +i.cc, mcf = +i.rent - +i.pmt - +i.expenses, acf = mcf * 12; return { totalInv, mcf, acf, roi: totalInv > 0 ? acf / totalInv : 0 }; }, [i]);
  useEffect(() => onCalcChange({ ...i, address: addr }, { primary: fmtD(c.mcf), secondary: fmtP(c.roi), label: "Mo. Cash Flow", label2: "ROI" }), [i, c, addr]);
  return (<>
    <AddressBar value={addr} onChange={setAddr} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Divider label="Existing Loan" />
        <Field label="Loan Balance" value={i.balance} onChange={s("balance")} prefix="$" step={5000} />
        <Field label="Monthly Mortgage" value={i.pmt} onChange={s("pmt")} prefix="$" step={25} />
        <Divider label="Your Investment" />
        <Field label="Down to Seller" value={i.dp} onChange={s("dp")} prefix="$" step={1000} />
        <Field label="Closing Costs" value={i.cc} onChange={s("cc")} prefix="$" step={500} />
        <Divider label="Income" />
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
        <button onClick={() => onGenerateLetter("subto", { ...i, address: addr }, c)}
          style={{ padding: "11px 16px", borderRadius: 10, border: "2px dashed #a5f3fc", background: "#ecfeff", color: "#0891b2", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          📄 Generate Offer Letter (.docx)
        </button>
      </div>
    </div>
  </>);
}

function NovationCalc({ saved, onCalcChange, onGenerateLetter }) {
  const [addr, setAddr] = useState(saved?.address || "");
  const [i, setI] = useState(saved || { pp: 155000, repairs: 22000, arv: 270000, agent: 6, closing: 4500, sellerPayout: 12000, holding: 3000, misc: 1500 });
  const s = k => v => setI(p => ({ ...p, [k]: v }));
  const c = useMemo(() => { const agentAmt = +i.arv * +i.agent / 100, totalCost = +i.pp + +i.repairs + agentAmt + +i.closing + +i.sellerPayout + +i.holding + +i.misc; return { agentAmt, totalCost, profit: +i.arv - totalCost, roi: totalCost > 0 ? (+i.arv - totalCost) / totalCost : 0 }; }, [i]);
  useEffect(() => onCalcChange({ ...i, address: addr }, { primary: fmtD(c.profit), secondary: fmtP(c.roi), label: "Net Profit", label2: "ROI" }), [i, c, addr]);
  return (<>
    <AddressBar value={addr} onChange={setAddr} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Divider label="Deal" />
        <Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000} />
        <Field label="Repair Costs" value={i.repairs} onChange={s("repairs")} prefix="$" step={1000} />
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000} />
        <Divider label="Costs" />
        <Field label="Agent Fees" value={i.agent} onChange={s("agent")} suffix="%" step={0.5} />
        <Field label="Closing Costs" value={i.closing} onChange={s("closing")} prefix="$" step={500} />
        <Field label="Seller Payout" value={i.sellerPayout} onChange={s("sellerPayout")} prefix="$" step={1000} />
        <Field label="Holding + Misc" value={+i.holding + +i.misc} onChange={v => { s("holding")(v * 0.6); s("misc")(v * 0.4); }} prefix="$" step={500} />
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
        <button onClick={() => onGenerateLetter("novation", { ...i, address: addr }, c)}
          style={{ padding: "11px 16px", borderRadius: 10, border: "2px dashed #fbcfe8", background: "#fdf2f8", color: "#be185d", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          📄 Generate Offer Letter (.docx)
        </button>
      </div>
    </div>
  </>);
}

const CALC_MAP = { rental: RentalCalc, wholesale: WholesaleCalc, flip: FlipCalc, brrrr: BRRRRCalc, subto: SubToCalc, novation: NovationCalc };

// ─── Letter Generator ─────────────────────────────────────────────────────────
function generateLetter(type, inputs, calcs, profile) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const addr = inputs.address || "[Property Address]";
  const investorName = profile?.full_name || "Investor";
  const investorPhone = profile?.phone || "";
  const investorEmail = profile?.email || "";

  let body = "";
  if (type === "subto") {
    body = `Dear Property Owner / Listing Agent,

I am writing to present a formal Subject-To purchase offer for the property located at ${addr}.

OFFER SUMMARY
─────────────────────────────────────────────────────────
Strategy:               Subject-To Existing Financing
Existing Loan Balance:  ${fmtD(+inputs.balance)}
Down Payment to Seller: ${fmtD(+inputs.dp)}
Closing Costs (Buyer):  ${fmtD(+inputs.cc)}
Monthly Mortgage:       ${fmtD(+inputs.pmt)}
Monthly Rent Income:    ${fmtD(+inputs.rent)}
Projected Cash Flow:    ${fmtD(calcs.mcf)} / month
Projected Annual ROI:   ${fmtP(calcs.roi)}

TERMS AND CONDITIONS
─────────────────────────────────────────────────────────
Under this Subject-To arrangement, I (the Buyer) propose to:

1. Take title to the above-referenced property subject to the existing mortgage currently in place.
2. Make all future mortgage payments directly to the existing lender, keeping the loan current and in good standing.
3. Pay the Seller the agreed down payment of ${fmtD(+inputs.dp)} at closing.
4. Assume all costs of ownership including insurance, taxes, maintenance, and repairs from the date of closing.
5. Close within 14–21 business days of signed agreement, subject to standard due diligence.

SELLER BENEFITS
─────────────────────────────────────────────────────────
• Immediate relief from mortgage obligations
• Fast, as-is closing — no repairs or renovations required
• Avoid foreclosure, late fees, or credit damage
• Receive ${fmtD(+inputs.dp)} cash at closing

This offer is made in good faith and is subject to a standard inspection period and title review. I am prepared to move quickly and professionally.

Please feel free to contact me with any questions or to schedule a call to discuss terms.

Sincerely,

${investorName}
${investorPhone}
${investorEmail}
Date: ${date}`;
  } else {
    body = `Dear Property Owner / Listing Agent,

I am pleased to present a Novation Agreement offer for the property located at ${addr}.

OFFER SUMMARY
─────────────────────────────────────────────────────────
Strategy:               Novation Agreement
Purchase Price:         ${fmtD(+inputs.pp)}
Repair Budget:          ${fmtD(+inputs.repairs)}
After Repair Value:     ${fmtD(+inputs.arv)}
Seller Payout:          ${fmtD(+inputs.sellerPayout)}
Projected Net Profit:   ${fmtD(calcs.profit)}
Projected ROI:          ${fmtP(calcs.roi)}

TERMS AND CONDITIONS
─────────────────────────────────────────────────────────
Under this Novation Agreement, I (the Investor) propose to:

1. Enter into a Novation Agreement with the Seller, replacing the existing listing agreement with a new contract in which I manage the sale of the property on the Seller's behalf.
2. Fund all necessary repairs and renovations (estimated at ${fmtD(+inputs.repairs)}) to maximize the property's market value.
3. List and sell the property at or near the After Repair Value of ${fmtD(+inputs.arv)}.
4. Pay the Seller a guaranteed minimum payout of ${fmtD(+inputs.sellerPayout)} at closing, regardless of final sale price.
5. Cover all agent commissions, closing costs, and holding expenses from the sale proceeds.
6. Complete all repairs and list the property within 60–90 days of signed agreement.

SELLER BENEFITS
─────────────────────────────────────────────────────────
• Guaranteed seller payout of ${fmtD(+inputs.sellerPayout)} — no uncertainty
• Zero out-of-pocket costs for repairs or closing
• Sell at full market value after renovation
• No need to manage showings, contractors, or negotiations
• Fast, hassle-free process managed entirely by our team

This offer is presented in good faith. I am committed to a transparent process and am happy to provide references from past transactions.

Please feel free to contact me to discuss any aspect of this proposal.

Sincerely,

${investorName}
${investorPhone}
${investorEmail}
Date: ${date}`;
  }

  return { title: type === "subto" ? "Subject-To Offer Letter" : "Novation Agreement Offer Letter", body, date, address: addr };
}

function downloadDocx(letter) {
  // Build a simple RTF-based Word document (compatible, no external library needed in browser)
  const rtfContent = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fmodern\\fcharset0 Courier New;}}
{\\colortbl ;\\red16\\green185\\blue129;}
\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440
\\f0\\fs24
{\\b\\fs32 ${letter.title.replace(/[{}\\]/g, "")}\\par}
\\par
{\\f1\\fs20 ${letter.address.replace(/[{}\\]/g, "")}\\par}
\\par
${letter.body.replace(/[{}\\]/g, "").split("\n").map(line => {
  if (line.startsWith("─")) return `{\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par}`;
  if (line.trim() === "") return "\\par";
  return `${line}\\line`;
}).join("\n")}
}`;

  // Use HTML blob approach for maximum browser compatibility
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Times New Roman', serif; font-size: 12pt; margin: 1in; line-height: 1.6; color: #1a1a1a; }
  h1 { font-size: 20pt; color: #064e3b; border-bottom: 2px solid #10b981; padding-bottom: 8px; margin-bottom: 24px; }
  .address { font-size: 11pt; color: #374151; margin-bottom: 24px; }
  .body { white-space: pre-wrap; font-size: 11pt; line-height: 1.8; }
  .section-title { font-weight: bold; letter-spacing: 0.05em; color: #064e3b; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin: 20px 0 10px; }
</style>
</head>
<body>
<h1>${letter.title}</h1>
<div class="address">📍 ${letter.address}</div>
<div class="body">${letter.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/─+/g, "<hr style='border:1px solid #e5e7eb;'>")}</div>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${letter.title.replace(/\s+/g, "_")}_${letter.date.replace(/,?\s+/g, "_")}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Save Deal Modal ──────────────────────────────────────────────────────────
function SaveDealModal({ mode, onSave, onClose }) {
  const [name, setName] = useState("");
  const m = MODES.find(m => m.key === mode);
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "white", borderRadius: 18, padding: 36, maxWidth: 400, width: "100%", boxShadow: "0 24px 60px rgba(0,0,0,0.15)", animation: "popIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>{m.icon}</div>
        <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 6 }}>Save this deal</h3>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>Give it a name — a property address works great.</p>
        <input autoFocus type="text" placeholder="e.g. 123 Main St, Atlanta" value={name} onChange={e => setName(e.target.value)}
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
  const [confirm, setConfirm] = useState(false);
  const date = new Date(deal.created_at || deal.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <div style={{ background: "white", borderRadius: 14, border: "1.5px solid #e5e7eb", overflow: "hidden", transition: "box-shadow 0.2s, transform 0.2s" }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.08)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "translateY(0)"; }}>
      <div style={{ height: 4, background: m.color, opacity: 0.7 }} />
      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span>{m.icon}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: m.color, background: m.bg, padding: "2px 8px", borderRadius: 100, border: `1px solid ${m.border}` }}>{m.label}</span>
        </div>
        <h4 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 2 }}>{deal.name}</h4>
        {deal.inputs?.address && <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>📍 {deal.inputs.address}</p>}
        <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 14 }}>{date}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[["label","primary"],["label2","secondary"]].map(([lbl,val]) => (
            <div key={lbl} style={{ background: "#f9fafb", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{deal.metrics[lbl]}</div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: "#111827" }}>{deal.metrics[val]}</div>
            </div>
          ))}
        </div>
        {confirm ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" small onClick={() => setConfirm(false)}>Cancel</Btn>
            <Btn variant="danger" small fullWidth onClick={() => onDelete(deal.id)}>Delete</Btn>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="dark" fullWidth small onClick={() => onLoad(deal)}>Load →</Btn>
            <button onClick={() => setConfirm(true)} style={{ padding: "7px 12px", borderRadius: 7, border: "1.5px solid #fee2e2", background: "#fff5f5", color: "#dc2626", fontSize: 12, cursor: "pointer" }}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Forum ────────────────────────────────────────────────────────────────────
function ForumView({ user, profile }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: "", mode: "", address: "", question: "", metrics: {} });
  const [submitting, setSubmitting] = useState(false);
  const [activePost, setActivePost] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => { supabase.getPosts().then(p => { setPosts(p); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const submit = async () => {
    if (!form.title || !form.mode || !form.question) return;
    setSubmitting(true);
    try {
      const post = { user_id: user.id, author_name: profile?.full_name || "Anonymous", author_type: profile?.investor_type || "", title: form.title, mode: form.mode, address: form.address, question: form.question, metrics: form.metrics, created_at: new Date().toISOString() };
      const saved = await supabase.insertPost(post).catch(() => null);
      const newPost = Array.isArray(saved) ? saved[0] : { ...post, id: Date.now().toString() };
      setPosts(p => [newPost, ...p]);
      setShowNew(false);
      setForm({ title: "", mode: "", address: "", question: "", metrics: {} });
    } finally { setSubmitting(false); }
  };

  const openPost = async (post) => {
    setActivePost(post);
    const c = await supabase.getComments(post.id).catch(() => []);
    setComments(c);
  };

  const submitComment = async () => {
    if (!newComment.trim() || !activePost) return;
    setPostingComment(true);
    try {
      const c = { post_id: activePost.id, user_id: user.id, author_name: profile?.full_name || "Anonymous", body: newComment.trim(), created_at: new Date().toISOString() };
      const saved = await supabase.insertComment(c).catch(() => null);
      const nc = Array.isArray(saved) ? saved[0] : { ...c, id: Date.now().toString() };
      setComments(prev => [...prev, nc]);
      setNewComment("");
    } finally { setPostingComment(false); }
  };

  if (activePost) {
    const m = MODES.find(m => m.key === activePost.mode);
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "28px" }}>
        <button onClick={() => setActivePost(null)} style={{ background: "none", border: "none", fontSize: 13, color: "#6b7280", cursor: "pointer", marginBottom: 20 }}>← Back to Community</button>
        <div style={{ background: "white", borderRadius: 18, border: "1.5px solid #e5e7eb", overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "24px 28px", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: m?.color, background: m?.bg, padding: "3px 10px", borderRadius: 100, border: `1px solid ${m?.border}` }}>{m?.icon} {m?.label}</span>
              {activePost.address && <span style={{ fontSize: 12, color: "#6b7280" }}>📍 {activePost.address}</span>}
            </div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 8 }}>{activePost.title}</h2>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Posted by <strong>{activePost.author_name}</strong>{activePost.author_type ? ` · ${activePost.author_type}` : ""}</p>
            <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, marginBottom: 20 }}>{activePost.question}</p>
            {activePost.metrics && Object.keys(activePost.metrics).length > 0 && (
              <div style={{ background: "#f9fafb", borderRadius: 12, padding: "16px 20px", display: "flex", gap: 24, flexWrap: "wrap" }}>
                {Object.entries(activePost.metrics).map(([k, v]) => (
                  <div key={k}><div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase" }}>{k}</div><div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: "#111827" }}>{v}</div></div>
                ))}
              </div>
            )}
          </div>
          <div style={{ padding: "20px 28px" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 16 }}>{comments.length} Response{comments.length !== 1 ? "s" : ""}</h3>
            {comments.map(c => (
              <div key={c.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #10b981, #059669)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "white" }}>{(c.author_name || "?")[0].toUpperCase()}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{c.author_name}</span>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, paddingLeft: 36 }}>{c.body}</p>
              </div>
            ))}
            <div style={{ marginTop: 20 }}>
              <textarea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Share your analysis or advice..."
                rows={3} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 14, color: "#111827", outline: "none", resize: "vertical", fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }} />
              <Btn variant="primary" loading={postingComment} onClick={submitComment}>Post Response</Btn>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 800, color: "#111827", marginBottom: 4 }}>👥 Community Forum</h2>
          <p style={{ fontSize: 13, color: "#9ca3af" }}>Share deals, ask questions, get feedback from fellow investors</p>
        </div>
        <Btn variant="primary" onClick={() => setShowNew(true)}>+ Share a Deal</Btn>
      </div>

      {showNew && (
        <div style={{ background: "white", borderRadius: 18, border: "1.5px solid #e5e7eb", padding: "28px", marginBottom: 28, animation: "fadeUp 0.3s ease both" }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 20 }}>Share a Deal for Feedback</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label="Deal title" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} placeholder="e.g. 3BR rental in Atlanta — good deal?" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Select label="Strategy type" value={form.mode} onChange={v => setForm(p => ({ ...p, mode: v }))} options={MODES.map(m => m.label)} placeholder="Select strategy..." />
              <Input label="Property address (optional)" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} placeholder="123 Main St, City, State" icon="📍" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Your question / what feedback do you need?</label>
              <textarea value={form.question} onChange={e => setForm(p => ({ ...p, question: e.target.value }))} placeholder="Describe the deal and what specific advice you're looking for..." rows={4}
                style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 14, color: "#111827", outline: "none", resize: "vertical", fontFamily: "'DM Sans', sans-serif" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 10 }}>Key numbers (optional — helps others analyze)</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {["Purchase Price","Monthly Rent","ARV","Cash Flow","ROI","Down Payment"].map(k => (
                  <div key={k}>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>{k}</label>
                    <input type="text" placeholder="e.g. $320,000" onChange={e => setForm(p => ({ ...p, metrics: { ...p.metrics, [k]: e.target.value } }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 12, outline: "none", fontFamily: "'DM Mono', monospace" }} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="ghost" onClick={() => setShowNew(false)}>Cancel</Btn>
              <Btn variant="primary" loading={submitting} disabled={!form.title || !form.mode || !form.question} onClick={submit}>Post to Community →</Btn>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 24px", color: "#9ca3af" }}>Loading community posts...</div>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 24px" }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>👋</div>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 8 }}>Be the first to share!</h3>
          <p style={{ fontSize: 14, color: "#6b7280", maxWidth: 340, margin: "0 auto" }}>Post a deal and get feedback from the community.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {posts.map(post => {
            const m = MODES.find(m => m.label === post.mode || m.key === post.mode);
            return (
              <div key={post.id} onClick={() => openPost(post)} style={{ background: "white", borderRadius: 14, border: "1.5px solid #e5e7eb", padding: "20px 24px", cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#10b981"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      {m && <span style={{ fontSize: 11, fontWeight: 700, color: m.color, background: m.bg, padding: "2px 8px", borderRadius: 100, border: `1px solid ${m.border}` }}>{m.icon} {m.label}</span>}
                      {post.address && <span style={{ fontSize: 11, color: "#9ca3af" }}>📍 {post.address}</span>}
                    </div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 6 }}>{post.title}</h3>
                    <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>{post.question.slice(0, 120)}{post.question.length > 120 ? "..." : ""}</p>
                    <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>By {post.author_name} · {new Date(post.created_at).toLocaleDateString()}</p>
                  </div>
                  <span style={{ fontSize: 20, color: "#9ca3af" }}>→</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Portfolio & Profile ──────────────────────────────────────────────────────
function ProfilePage({ user, profile, onUpdate, onSignOut, onBack }) {
  const [tab, setTab] = useState("profile");
  const [form, setForm] = useState({ full_name: "", phone: "", location: "", investor_type: "", bio: "", portfolio_value: 0, portfolio_public: false, ...profile });
  const [properties, setProperties] = useState(profile?.portfolio_properties || []);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const f = k => v => setForm(p => ({ ...p, [k]: v }));

  const medal = getMedal(+form.portfolio_value || 0);
  const initials = (form.full_name || user.email || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  const addProperty = () => setProperties(p => [...p, { id: Date.now(), address: "", type: "", value: "", equity: "", notes: "" }]);
  const updateProp = (id, k, v) => setProperties(p => p.map(x => x.id === id ? { ...x, [k]: v } : x));
  const removeProp = (id) => setProperties(p => p.filter(x => x.id !== id));

  const totalPortfolioValue = properties.reduce((sum, p) => sum + (parseFloat(p.value) || 0), 0);
  const totalEquity = properties.reduce((sum, p) => sum + (parseFloat(p.equity) || 0), 0);

  const handleSave = async () => {
    if (!form.full_name.trim()) { setError("Name is required."); return; }
    setLoading(true); setError("");
    try {
      const updatedProfile = { ...form, id: user.id, email: user.email, portfolio_value: totalPortfolioValue || +form.portfolio_value, portfolio_properties: properties, updated_at: new Date().toISOString() };
      await supabase.upsertProfile(updatedProfile);
      onUpdate(updatedProfile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { setError(e.message || "Save failed."); } finally { setLoading(false); }
  };

  const displayValue = totalPortfolioValue || +form.portfolio_value || 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'DM Sans', sans-serif" }}>
      <header style={{ background: "white", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58 }}>
          <Logo onClick={onBack} />
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: 13, cursor: "pointer" }}>← Back</button>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 28px" }}>
        {/* Profile hero */}
        <div style={{ background: "linear-gradient(135deg, #064e3b, #065f46)", borderRadius: 20, padding: "36px 40px", marginBottom: 24, display: "flex", alignItems: "center", gap: 28, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", right: -20, top: -20, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #10b981, #059669)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "3px solid rgba(255,255,255,0.2)" }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: "white", fontFamily: "'Fraunces', serif" }}>{initials}</span>
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 800, color: "white", marginBottom: 4 }}>{form.full_name || "Your Profile"}</h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", marginBottom: 10 }}>{user.email}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {form.investor_type && <span style={{ fontSize: 12, fontWeight: 600, color: "#6ee7b7", background: "rgba(16,185,129,0.2)", padding: "3px 10px", borderRadius: 100, border: "1px solid rgba(110,231,183,0.3)" }}>{form.investor_type}</span>}
              {form.location && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>📍 {form.location}</span>}
            </div>
          </div>
          {/* Medal badge */}
          <div style={{ textAlign: "center", background: "rgba(255,255,255,0.1)", borderRadius: 16, padding: "20px 24px", border: "1px solid rgba(255,255,255,0.15)", flexShrink: 0 }}>
            <div style={{ fontSize: 44, marginBottom: 6 }}>{medal.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{medal.label}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{medal.desc}</div>
            {form.portfolio_public ? (
              <div style={{ fontSize: 13, fontWeight: 700, color: "#6ee7b7", marginTop: 8 }}>{fmtM(displayValue)}</div>
            ) : (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 8 }}>🔒 Private</div>
            )}
          </div>
        </div>

        {/* Medal progression */}
        <div style={{ background: "white", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: "20px 24px", marginBottom: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>🏆 Rank Progression</p>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {MEDALS.map((m, idx) => {
              const isActive = m.id === medal.id;
              const isPast = MEDALS.indexOf(medal) > idx;
              return (
                <div key={m.id} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 22, marginBottom: 4, opacity: isPast || isActive ? 1 : 0.3 }}>{m.icon}</div>
                  <div style={{ height: 6, background: isPast || isActive ? "#10b981" : "#e5e7eb", borderRadius: 3, marginBottom: 4, border: isActive ? "2px solid #059669" : "none" }} />
                  <div style={{ fontSize: 10, fontWeight: isActive ? 800 : 500, color: isActive ? "#059669" : "#9ca3af" }}>{m.label}</div>
                  <div style={{ fontSize: 9, color: "#9ca3af" }}>{fmtM(m.min)}</div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 12, textAlign: "center" }}>
            {medal.id === "diamond" ? "🎉 You've reached the highest rank!" : `Add ${fmtM(MEDALS[MEDALS.indexOf(medal) + 1]?.min - displayValue)} more to reach ${MEDALS[MEDALS.indexOf(medal) + 1]?.label}`}
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 12, padding: 4, gap: 4, marginBottom: 24 }}>
          {[["profile", "👤 Profile"], ["portfolio", "🏠 Portfolio"]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", background: tab === key ? "white" : "transparent", color: tab === key ? "#111827" : "#6b7280", fontSize: 14, fontWeight: tab === key ? 700 : 500, cursor: "pointer", boxShadow: tab === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>{label}</button>
          ))}
        </div>

        {tab === "profile" && (
          <div style={{ background: "white", borderRadius: 20, border: "1.5px solid #e5e7eb", padding: "36px 40px" }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111827", marginBottom: 24 }}>Edit Profile</h2>
            {error && <div style={{ marginBottom: 20 }}><Alert type="error">{error}</Alert></div>}
            {saved && <div style={{ marginBottom: 20 }}><Alert type="success">Profile saved!</Alert></div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
              <Input label="Full name *" value={form.full_name} onChange={f("full_name")} placeholder="Jane Smith" icon="👤" />
              <Input label="Email" value={user.email} onChange={() => {}} disabled hint="Email cannot be changed here" />
              <Input label="Phone" value={form.phone || ""} onChange={f("phone")} placeholder="+1 (555) 000-0000" icon="📱" />
              <Input label="Location" value={form.location || ""} onChange={f("location")} placeholder="Atlanta, GA" icon="📍" />
            </div>
            <div style={{ marginBottom: 18 }}>
              <Select label="Investor type" value={form.investor_type || ""} onChange={f("investor_type")} options={INVESTOR_TYPES} placeholder="What kind of investor?" />
            </div>
            <div style={{ marginBottom: 28 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Bio</label>
              <textarea value={form.bio || ""} onChange={e => f("bio")(e.target.value)} rows={4}
                style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 14, color: "#111827", outline: "none", resize: "vertical", fontFamily: "'DM Sans', sans-serif" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Btn variant="danger" onClick={onSignOut}>Sign Out</Btn>
              <Btn variant="primary" loading={loading} onClick={handleSave}>Save Changes</Btn>
            </div>
          </div>
        )}

        {tab === "portfolio" && (
          <div style={{ background: "white", borderRadius: 20, border: "1.5px solid #e5e7eb", padding: "36px 40px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111827" }}>My Portfolio</h2>
              {/* Public toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "#f9fafb", borderRadius: 10, border: "1.5px solid #e5e7eb" }}>
                <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{form.portfolio_public ? "🌍 Public" : "🔒 Private"}</span>
                <div onClick={() => f("portfolio_public")(!form.portfolio_public)}
                  style={{ width: 44, height: 24, borderRadius: 12, background: form.portfolio_public ? "#10b981" : "#d1d5db", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: form.portfolio_public ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
                </div>
              </div>
            </div>

            {/* Portfolio summary */}
            {properties.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 28 }}>
                {[["Properties", properties.length, ""],["Total Value", fmtM(totalPortfolioValue), ""],["Total Equity", fmtM(totalEquity), ""]].map(([label, val]) => (
                  <div key={label} style={{ background: "#f0fdf4", borderRadius: 12, padding: "16px 18px", border: "1.5px solid #bbf7d0", textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: "#059669" }}>{val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Manual portfolio value (if no properties added) */}
            {properties.length === 0 && (
              <div style={{ marginBottom: 24 }}>
                <Input label="Total portfolio value (self-reported)" type="number" value={form.portfolio_value || ""} onChange={v => f("portfolio_value")(v)} placeholder="e.g. 1500000" icon="💰" hint="This determines your medal rank" />
              </div>
            )}

            {/* Properties list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
              {properties.map(prop => (
                <div key={prop.id} style={{ background: "#f9fafb", borderRadius: 12, padding: "20px", border: "1.5px solid #e5e7eb" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
                    <input value={prop.address} onChange={e => updateProp(prop.id, "address", e.target.value)} placeholder="Property address"
                      style={{ padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
                    <select value={prop.type} onChange={e => updateProp(prop.id, "type", e.target.value)}
                      style={{ padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none", fontFamily: "'DM Sans', sans-serif" }}>
                      <option value="">Type</option>
                      {["Single Family","Multi-Family","Commercial","Wholesale","Flip","STR"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input type="number" value={prop.value} onChange={e => updateProp(prop.id, "value", e.target.value)} placeholder="Value $"
                      style={{ padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none", fontFamily: "'DM Mono', monospace" }} />
                    <input type="number" value={prop.equity} onChange={e => updateProp(prop.id, "equity", e.target.value)} placeholder="Equity $"
                      style={{ padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none", fontFamily: "'DM Mono', monospace" }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input value={prop.notes} onChange={e => updateProp(prop.id, "notes", e.target.value)} placeholder="Notes (optional)"
                      style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 12, outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
                    <button onClick={() => removeProp(prop.id)} style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #fee2e2", background: "#fff5f5", color: "#dc2626", fontSize: 12, cursor: "pointer" }}>Remove</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={addProperty} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "2px dashed #bbf7d0", background: "#f0fdf4", color: "#059669", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Add Property</button>
              <Btn variant="primary" loading={loading} onClick={handleSave}>Save Portfolio</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Demo Calculator for Landing ──────────────────────────────────────────────
const DEMO = {
  rental: { inputs: [["Purchase Price","$320,000"],["Down Payment","20%"],["Monthly Rent","$2,800"],["Monthly Expenses","$750"],["Mortgage Payment","$1,420"],["Closing Costs","$8,500"]], highlights: [["Monthly Cash Flow","$630",true],["Cash-on-Cash ROI","8.4%",true],["Cap Rate","6.2%",false],["DSCR","1.34x",false]], },
  wholesale: { inputs: [["After Repair Value","$240,000"],["Repair Costs","$28,000"],["Max Offer %","70%"],["Wholesale Fee","$9,000"]], highlights: [["Max Allowable Offer","$131,000",true],["Your Fee","$9,000",true],["ARV × 70%","$168,000",false],["Profit Margin","6.4%",false]], },
  flip: { inputs: [["Purchase Price","$165,000"],["Rehab Costs","$38,000"],["ARV","$275,000"],["Agent Fees","6%"],["Holding Costs","$4,500"],["Closing Costs","$5,000"]], highlights: [["Net Profit","$46,000",true],["ROI","21.4%",true],["Total Costs","$229,000",false],["Profit Margin","16.7%",false]], },
  brrrr: { inputs: [["Purchase Price","$110,000"],["Rehab Costs","$45,000"],["ARV","$210,000"],["Refinance %","75%"],["Monthly Rent","$1,750"],["Monthly Expenses","$780"]], highlights: [["Cash Out at Refi","$7,500",true],["Monthly Cash Flow","$970",true],["Annual ROI","7.6%",false],["Capital Recycled","96.8%",false]], },
  subto: { inputs: [["Loan Balance","$175,000"],["Monthly Mortgage","$1,050"],["Down to Seller","$8,000"],["Monthly Rent","$1,700"],["Operating Expenses","$350"],["Closing Costs","$2,500"]], highlights: [["Monthly Cash Flow","$300",true],["ROI","17.1%",true],["Total Cash In","$10,500",false],["Annual Cash Flow","$3,600",false]], },
  novation: { inputs: [["Purchase Price","$155,000"],["Repair Costs","$22,000"],["ARV","$270,000"],["Agent Fees","6%"],["Seller Payout","$12,000"],["Holding + Misc","$4,500"]], highlights: [["Net Profit","$54,700",true],["ROI","25.1%",true],["Total Costs","$215,300",false],["Profit Margin","20.3%",false]], },
};

// ─── Landing Page ─────────────────────────────────────────────────────────────
function LandingPage({ onEnterApp, onGoSignIn, onGoSignUp }) {
  const [mode, setMode] = useState("rental");
  const [scrolled, setScrolled] = useState(false);
  const active = MODES.find(m => m.key === mode);
  const data = DEMO[mode];

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#fff", color: "#111827" }}>
      {/* Nav */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 200, transition: "all 0.25s", background: scrolled ? "rgba(255,255,255,0.97)" : "transparent", backdropFilter: scrolled ? "blur(12px)" : "none", borderBottom: scrolled ? "1px solid #e5e7eb" : "none" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, padding: "0 32px" }}>
          <Logo />
          <div style={{ display: "flex", gap: 28 }}>
            {["Features","Community","Pricing"].map(l => <a key={l} href={`#${l.toLowerCase()}`} style={{ fontSize: 14, color: "#6b7280", textDecoration: "none", fontWeight: 500 }}>{l}</a>)}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onGoSignIn} style={{ padding: "8px 18px", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "white", color: "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Sign In</button>
            <button onClick={onGoSignUp} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#111827", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Start Free Trial</button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ paddingTop: 80, background: "linear-gradient(180deg, #f0fdf4 0%, #fafafa 55%, #fff 100%)" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto", padding: "52px 32px 0" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 100, padding: "5px 16px", marginBottom: 22 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", display: "inline-block", boxShadow: "0 0 0 3px rgba(16,185,129,0.2)" }} />
              <span style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>Free trial — no credit card required</span>
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(36px,5.5vw,64px)", fontWeight: 900, color: "#111827", lineHeight: 1.08, marginBottom: 18 }}>
              Analyze Any Real Estate Deal<br /><span style={{ color: "#10b981", fontStyle: "italic" }}>in Seconds</span>
            </h1>
            <p style={{ fontSize: "clamp(15px,1.8vw,19px)", color: "#6b7280", maxWidth: 500, margin: "0 auto 32px", lineHeight: 1.65 }}>6 investment strategies. Instant calculations. Community insights. Built by investors, for investors.</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={onGoSignUp} style={{ padding: "14px 32px", borderRadius: 11, border: "none", background: "#10b981", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 20px rgba(16,185,129,0.35)" }}>Start Free Trial →</button>
              <a href="#demo" style={{ padding: "14px 28px", borderRadius: 11, border: "1.5px solid #e5e7eb", background: "white", color: "#374151", fontSize: 15, fontWeight: 500, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>▶ See Demo</a>
            </div>
          </div>

          {/* Strategy tabs */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
            {MODES.map(m => (
              <button key={m.key} onClick={() => setMode(m.key)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 100, border: `2px solid ${mode === m.key ? m.border : "#e5e7eb"}`, background: mode === m.key ? m.bg : "white", cursor: "pointer", transition: "all 0.15s" }}>
                <span style={{ fontSize: 15 }}>{m.icon}</span>
                <div style={{ textAlign: "left", lineHeight: 1.25 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: mode === m.key ? m.color : "#374151" }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: mode === m.key ? m.color : "#9ca3af", opacity: 0.85 }}>{m.sub}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Demo calculator */}
          <div id="demo" style={{ background: "white", borderRadius: "20px 20px 0 0", border: "1.5px solid #e5e7eb", borderBottom: "none", boxShadow: "0 -4px 40px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", background: active.bg, borderBottom: `1.5px solid ${active.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 20 }}>{active.icon}</span>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: active.color }}>{active.label} Calculator</h3>
                  <p style={{ fontSize: 11, color: active.color, opacity: 0.7 }}>{active.sub}</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "white", border: "1.5px solid #e5e7eb", borderRadius: 100, padding: "5px 14px" }}>
                <span style={{ fontSize: 12 }}>👀</span>
                <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>Demo — sign up to use your own numbers</span>
              </div>
            </div>
            <div style={{ padding: "28px 28px 24px", display: "grid", gridTemplateColumns: "260px 1fr", gap: 28, alignItems: "start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af" }}>Inputs</span>
                  <button onClick={onGoSignUp} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 100, border: "1.5px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✏️ Edit</button>
                </div>
                {data.inputs.map(([label, value], idx) => (
                  <div key={idx} onClick={onGoSignUp} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: "#f9fafb", border: "1.5px solid #e5e7eb", borderRadius: 8, cursor: "pointer", transition: "border-color 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = active.border}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "#e5e7eb"}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", fontFamily: "'DM Mono', monospace" }}>{value}</span>
                  </div>
                ))}
                <button onClick={onGoSignUp} style={{ marginTop: 8, padding: "11px 0", borderRadius: 10, border: "2px dashed #d1fae5", background: "#f0fdf4", color: "#059669", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>✏️ Enter your own numbers →</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {data.highlights.map(([label, value, positive], idx) => (
                    <div key={idx} style={{ textAlign: "center", padding: "16px 12px", background: positive ? "#f0fdf4" : "#f9fafb", borderRadius: 10, border: `1.5px solid ${positive ? "#bbf7d0" : "#e5e7eb"}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: positive ? "#059669" : "#374151" }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: "16px 28px", borderTop: "1px solid #f3f4f6", background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <p style={{ fontSize: 13, color: "#9ca3af" }}>🔒 Sample numbers. <button onClick={onGoSignUp} style={{ color: "#10b981", fontWeight: 700, background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 0 }}>Sign up free to run your deal →</button></p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={onGoSignUp} style={{ padding: "8px 16px", borderRadius: 8, border: "1.5px solid #bbf7d0", background: "#f0fdf4", color: "#059669", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>💾 Save Deal</button>
                <button onClick={onGoSignUp} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#111827", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>📄 Export Letter</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ height: 60, background: "#f9fafb", borderLeft: "1.5px solid #e5e7eb", borderRight: "1.5px solid #e5e7eb", maxWidth: 1140, margin: "0 auto" }} />

      {/* Video Demo Section */}
      <section style={{ padding: "88px 32px", background: "#f9fafb", borderTop: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#10b981", textTransform: "uppercase", marginBottom: 12 }}>See it in action</p>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(26px,4vw,40px)", fontWeight: 800, color: "#111827", marginBottom: 14 }}>Analyze a deal in under 30 seconds</h2>
          <p style={{ fontSize: 15, color: "#6b7280", maxWidth: 480, margin: "0 auto 40px", lineHeight: 1.7 }}>Watch how investors use DealSource.ai to quickly evaluate rental properties, flips, and creative finance deals.</p>
          {/* Video placeholder */}
          <div style={{ background: "linear-gradient(135deg, #064e3b, #065f46)", borderRadius: 20, aspectRatio: "16/9", maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", cursor: "pointer", boxShadow: "0 24px 60px rgba(6,78,59,0.25)" }}
            onClick={onGoSignUp}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 30% 70%, rgba(16,185,129,0.2) 0%, transparent 60%)", pointerEvents: "none" }} />
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, backdropFilter: "blur(8px)" }}>
              <span style={{ fontSize: 28, marginLeft: 4 }}>▶</span>
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "white", marginBottom: 6 }}>Watch Demo</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>2 min walkthrough</p>
            <div style={{ position: "absolute", bottom: 20, right: 20, background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 12px", fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>Coming Soon</div>
          </div>
        </div>
      </section>

      {/* Community Preview */}
      <section id="community" style={{ padding: "88px 32px", background: "white" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#10b981", textTransform: "uppercase", marginBottom: 12 }}>Community</p>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(26px,4vw,42px)", fontWeight: 800, color: "#111827", marginBottom: 14 }}>Learn from fellow investors</h2>
            <p style={{ fontSize: 15, color: "#6b7280", maxWidth: 480, margin: "0 auto" }}>Share deals, ask if the numbers work, and get real feedback from experienced investors.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            {[
              { title: "Is this rental a good deal?", tag: "🏘️ Rental", preview: "Found a 3BR/2BA in Atlanta for $285K. After PITI and expenses I'm showing $340/mo cash flow...", metrics: { "Cash Flow": "$340/mo", "CoC ROI": "6.8%", "Cap Rate": "5.9%" } },
              { title: "BRRRR in Cleveland — am I leaving money on the table?", tag: "♻️ BRRRR", preview: "Picked this up for $75K, put $35K into it. ARV came in at $160K but my lender will only do 70%...", metrics: { "All-In": "$110K", "Refi": "$112K", "Cash Out": "$2K" } },
              { title: "Sub-To deal — seller owes $210K, rate is 3.2%", tag: "🤝 Subject-To", preview: "Seller is behind 2 payments and motivated to leave. Existing loan is at 3.2% which is incredible...", metrics: { "Loan Rate": "3.2%", "Mo. CF": "$520", "ROI": "22%" } },
            ].map((p, idx) => (
              <div key={idx} onClick={onGoSignUp} style={{ background: "white", borderRadius: 14, border: "1.5px solid #e5e7eb", padding: "22px", cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.07)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#059669", background: "#f0fdf4", display: "inline-block", padding: "2px 8px", borderRadius: 100, border: "1px solid #bbf7d0", marginBottom: 10 }}>{p.tag}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 8 }}>{p.title}</h3>
                <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 14 }}>{p.preview}</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {Object.entries(p.metrics).map(([k, v]) => (
                    <div key={k} style={{ background: "#f9fafb", borderRadius: 8, padding: "6px 10px" }}>
                      <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase" }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: "#111827" }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 36 }}>
            <button onClick={onGoSignUp} style={{ padding: "12px 28px", borderRadius: 10, border: "1.5px solid #e5e7eb", background: "white", color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Join the Community →</button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ padding: "28px 32px", background: "#f9fafb", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 56, flexWrap: "wrap" }}>
          {[["6","Strategies"],["∞","Deals"],["$0","To Start"],["🏆","Medals & Ranks"],["30s","Per Analysis"]].map(([n, l]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 900, color: "#111827" }}>{n}</div>
              <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 500 }}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: "88px 32px", background: "white" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#10b981", textTransform: "uppercase", marginBottom: 12 }}>The full toolkit</p>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(26px,4vw,42px)", fontWeight: 800, color: "#111827", marginBottom: 14 }}>Everything in one place</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
            {[["⚡","Instant Calculations","Every number updates in real time. No spreadsheets, no waiting."],["💾","Save & Compare Deals","Build a cloud library of deals. Compare them side by side."],["📄","Auto-Generated Letters","Sub-To and Novation offer letters auto-generated as Word docs."],["👥","Community Forum","Share deals with the community and get real investor feedback."],["🏆","Portfolio Rankings","Track your portfolio value and earn medals as you grow."],["📍","Address Tracking","Add property addresses to every deal for easy reference."]].map(([icon, t, d]) => (
              <div key={t} style={{ padding: 26, borderRadius: 16, border: "1.5px solid #e5e7eb", background: "white", transition: "all 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.07)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
                <div style={{ fontSize: 28, marginBottom: 14 }}>{icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 7 }}>{t}</h3>
                <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.7 }}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ padding: "88px 32px", background: "#fafafa" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#10b981", textTransform: "uppercase", marginBottom: 12 }}>Pricing</p>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(26px,4vw,42px)", fontWeight: 800, color: "#111827", marginBottom: 12 }}>Simple. No surprises.</h2>
          <p style={{ fontSize: 15, color: "#6b7280", marginBottom: 52 }}>Cancel anytime. No hidden fees.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ padding: 32, borderRadius: 18, border: "1.5px solid #e5e7eb", background: "white", textAlign: "left" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 10 }}>Free</p>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 40, fontWeight: 900, color: "#111827", marginBottom: 28 }}>$0</div>
              {["All 6 calculators","Unlimited calculations","Community forum","Portfolio tracking"].map(f => (
                <div key={f} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <span style={{ color: "#10b981", fontWeight: 700 }}>✓</span><span style={{ fontSize: 14, color: "#374151" }}>{f}</span>
                </div>
              ))}
              {["Save deals","Export letters"].map(f => (
                <div key={f} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <span style={{ color: "#d1d5db" }}>–</span><span style={{ fontSize: 14, color: "#9ca3af" }}>{f}</span>
                </div>
              ))}
              <button onClick={onGoSignUp} style={{ width: "100%", marginTop: 24, padding: "12px 0", borderRadius: 10, border: "1.5px solid #e5e7eb", background: "white", color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Get Started Free</button>
            </div>
            <div style={{ padding: 32, borderRadius: 18, background: "#111827", textAlign: "left", position: "relative" }}>
              <div style={{ position: "absolute", top: 18, right: 18, background: "#10b981", color: "white", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 100 }}>POPULAR</div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 10 }}>Pro</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 28 }}>
                <span style={{ fontFamily: "'Fraunces', serif", fontSize: 40, fontWeight: 900, color: "white" }}>$20</span>
                <span style={{ fontSize: 14, color: "#6b7280" }}>/month</span>
              </div>
              {["All 6 calculators","Unlimited calculations","Community forum","Portfolio & medal ranking","Save & compare deals","Auto-generated offer letters (.docx)","Property data auto-fill","Priority support"].map(f => (
                <div key={f} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <span style={{ color: "#10b981", fontWeight: 700 }}>✓</span><span style={{ fontSize: 14, color: "#e5e7eb" }}>{f}</span>
                </div>
              ))}
              <button onClick={onGoSignUp} style={{ width: "100%", marginTop: 24, padding: "12px 0", borderRadius: 10, border: "none", background: "#10b981", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Start Free Trial</button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: "32px 32px", borderTop: "1px solid #e5e7eb", background: "#fafafa" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <Logo />
          <p style={{ fontSize: 12, color: "#9ca3af" }}>© 2025 DealSource.ai · Built for real estate investors</p>
          <div style={{ display: "flex", gap: 20 }}>
            {["Privacy","Terms","Support"].map(l => <a key={l} href="#" style={{ fontSize: 12, color: "#9ca3af", textDecoration: "none" }}>{l}</a>)}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Main Analyzer App ────────────────────────────────────────────────────────
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

  useEffect(() => { supabase.getDeals(user.id).then(d => { setDeals(d); setDealsLoading(false); }).catch(() => setDealsLoading(false)); }, [user.id]);

  const handleCalcChange = useCallback((inputs, metrics) => { setCurrentInputs(inputs); setCurrentMetrics(metrics); }, []);

  const handleSave = async (name) => {
    const deal = { user_id: user.id, name, mode, inputs: currentInputs, metrics: currentMetrics, created_at: new Date().toISOString() };
    try {
      const saved = await supabase.insertDeal(deal);
      const newDeal = Array.isArray(saved) ? saved[0] : { ...deal, id: Date.now().toString() };
      setDeals(prev => [newDeal, ...prev]);
      setLoadedDealId(newDeal.id);
    } catch { const ld = { ...deal, id: Date.now().toString() }; setDeals(prev => [ld, ...prev]); setLoadedDealId(ld.id); }
    setShowSaveModal(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  };

  const handleGenerateLetter = (type, inputs, calcs) => {
    const letter = generateLetter(type, inputs, calcs, profile);
    downloadDocx(letter);
  };

  const handleDelete = async (id) => { try { await supabase.deleteDeal(id); } catch {} setDeals(prev => prev.filter(d => d.id !== id)); if (loadedDealId === id) setLoadedDealId(null); };
  const handleLoad = (deal) => { setMode(deal.mode); setLoadedDealId(deal.id); setView("calc"); };

  const activeMode = MODES.find(m => m.key === mode);
  const CalcComponent = CALC_MAP[mode];
  const filteredDeals = filterMode === "all" ? deals : deals.filter(d => d.mode === filterMode);
  const initials = (profile?.full_name || user.email || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const medal = getMedal(+(profile?.portfolio_value || 0));

  const TABS = [
    { key: "calc", label: "Calculator", icon: "⚡" },
    { key: "deals", label: `Saved Deals${deals.length > 0 ? ` (${deals.length})` : ""}`, icon: "💾" },
    { key: "forum", label: "Community", icon: "👥" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'DM Sans', sans-serif" }}>
      {showSaveModal && <SaveDealModal mode={mode} onSave={handleSave} onClose={() => setShowSaveModal(false)} />}

      <header style={{ background: "white", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58 }}>
          <Logo onClick={onGoHome} />
          <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 10, padding: 3, gap: 2 }}>
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setView(tab.key)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 8, border: "none", background: view === tab.key ? "white" : "transparent", color: view === tab.key ? "#111827" : "#6b7280", fontSize: 13, fontWeight: view === tab.key ? 700 : 500, cursor: "pointer", boxShadow: view === tab.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
                <span>{tab.icon}</span> {tab.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {savedFlash && <span style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>✓ Saved!</span>}
            <button onClick={onGoProfile} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px 6px 6px", borderRadius: 100, border: "1.5px solid #e5e7eb", background: "white", cursor: "pointer", transition: "border-color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#10b981"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#e5e7eb"}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #10b981, #059669)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "white" }}>{initials}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{profile?.full_name?.split(" ")[0] || "Profile"}</span>
              <span style={{ fontSize: 14 }}>{medal.icon}</span>
            </button>
          </div>
        </div>
      </header>

      {view === "calc" && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
            {MODES.map(m => (
              <button key={m.key} onClick={() => { setMode(m.key); setLoadedDealId(null); }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 100, border: `2px solid ${mode === m.key ? m.border : "#e5e7eb"}`, background: mode === m.key ? m.bg : "white", cursor: "pointer", transition: "all 0.15s" }}>
                <span>{m.icon}</span>
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
              <CalcComponent
                key={`${mode}-${loadedDealId}`}
                saved={loadedDealId ? deals.find(d => d.id === loadedDealId)?.inputs : null}
                onCalcChange={handleCalcChange}
                onGenerateLetter={handleGenerateLetter}
              />
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #f3f4f6", background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <p style={{ fontSize: 12, color: "#9ca3af" }}>Results update as you type · Synced to your account</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setView("deals")} style={{ padding: "9px 18px", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>View Saved Deals</button>
                <button onClick={() => setShowSaveModal(true)} style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: "#111827", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>💾 Save Deal</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                <button key={m.key} onClick={() => setFilterMode(m.key)} style={{ padding: "6px 14px", borderRadius: 100, border: `1.5px solid ${filterMode === m.key ? m.border : "#e5e7eb"}`, background: filterMode === m.key ? m.bg : "white", color: filterMode === m.key ? m.color : "#6b7280", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
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
              <p style={{ fontSize: 14, color: "#6b7280", maxWidth: 340, margin: "0 auto 24px", lineHeight: 1.7 }}>Run an analysis and hit "Save Deal" to build your library.</p>
              <Btn variant="primary" onClick={() => setView("calc")}>Go to Calculator →</Btn>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 18 }}>
              {filteredDeals.map(deal => <DealCard key={deal.id} deal={deal} onLoad={handleLoad} onDelete={handleDelete} />)}
            </div>
          )}
        </div>
      )}

      {view === "forum" && <ForumView user={user} profile={profile} />}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Root() {
  const [page, setPage] = useState("loading");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (supabase.auth.restoreSession()) {
      supabase.auth.getUser().then(u => {
        if (u) { setUser(u); supabase.getProfile(u.id).then(p => { setProfile(p); setPage("app"); }).catch(() => setPage("app")); }
        else { supabase._token = null; try { localStorage.removeItem("ds_token"); } catch {} setPage("home"); }
      }).catch(() => setPage("home"));
    } else { setPage("home"); }
  }, []);

  const handleSignIn = (u, p) => { setUser(u); setProfile(p); setPage("app"); };
  const handleSignOut = async () => { await supabase.auth.signOut(); setUser(null); setProfile(null); setPage("home"); };
  const handleProfileUpdate = (p) => setProfile(p);

  if (page === "loading") return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 48, height: 48, background: "linear-gradient(135deg, #10b981, #059669)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", animation: "pulse 1.5s ease-in-out infinite" }}>
          <span style={{ color: "white", fontSize: 22, fontWeight: 800 }}>D</span>
        </div>
        <p style={{ color: "#9ca3af", fontSize: 14 }}>Loading...</p>
      </div>
    </div>
  );

  return (
    <>
      <GlobalStyles />
      {page === "home" && <LandingPage onEnterApp={() => setPage("app")} onGoSignIn={() => setPage("signin")} onGoSignUp={() => setPage("signup")} />}
      {page === "signin" && <SignInPage onSignIn={handleSignIn} onGoSignUp={() => setPage("signup")} onGoHome={() => setPage("home")} />}
      {page === "signup" && <SignUpPage onSignIn={handleSignIn} onGoSignIn={() => setPage("signin")} onGoHome={() => setPage("home")} />}
      {page === "app" && user && <AnalyzerApp user={user} profile={profile} onGoHome={() => setPage("home")} onGoProfile={() => setPage("profile")} onSignOut={handleSignOut} />}
      {page === "profile" && user && <ProfilePage user={user} profile={profile} onUpdate={handleProfileUpdate} onSignOut={handleSignOut} onBack={() => setPage("app")} />}
    </>
  );
}
