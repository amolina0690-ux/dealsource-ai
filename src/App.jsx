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
  async getProfile(uid) { try { const d = await supabase._fetch(`/rest/v1/profiles?id=eq.${uid}&select=*`); return Array.isArray(d) ? d[0] : null; } catch { return null; } },
  async upsertProfile(p) { return supabase._fetch("/rest/v1/profiles", { method: "POST", body: JSON.stringify(p), headers: { "Prefer": "resolution=merge-duplicates,return=representation" } }); },
  async getDeals(uid) { try { const d = await supabase._fetch(`/rest/v1/deals?user_id=eq.${uid}&order=created_at.desc&select=*`); return Array.isArray(d) ? d : []; } catch { return []; } },
  async insertDeal(deal) { return supabase._fetch("/rest/v1/deals", { method: "POST", body: JSON.stringify(deal), headers: { "Prefer": "return=representation" } }); },
  async deleteDeal(id) { return supabase._fetch(`/rest/v1/deals?id=eq.${id}`, { method: "DELETE" }); },
  async getPosts(mode) { try { const q = mode ? `&mode=eq.${mode}` : ""; const d = await supabase._fetch(`/rest/v1/forum_posts?order=upvotes.desc,created_at.desc&select=*${q}`); return Array.isArray(d) ? d : []; } catch { return []; } },
  async insertPost(p) { return supabase._fetch("/rest/v1/forum_posts", { method: "POST", body: JSON.stringify(p), headers: { "Prefer": "return=representation" } }); },
  async upvotePost(id, current) { return supabase._fetch(`/rest/v1/forum_posts?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ upvotes: current + 1 }) }); },
  async getComments(pid) { try { const d = await supabase._fetch(`/rest/v1/forum_comments?post_id=eq.${pid}&order=created_at.asc&select=*`); return Array.isArray(d) ? d : []; } catch { return []; } },
  async insertComment(c) { return supabase._fetch("/rest/v1/forum_comments", { method: "POST", body: JSON.stringify(c), headers: { "Prefer": "return=representation" } }); },
  async getLeaderboard() { try { const d = await supabase._fetch(`/rest/v1/profiles?is_verified=eq.true&portfolio_public=eq.true&order=portfolio_value.desc&limit=20&select=*`); return Array.isArray(d) ? d : []; } catch { return []; } },
  async submitVerification(uid, data) { return supabase._fetch("/rest/v1/verification_requests", { method: "POST", body: JSON.stringify({ user_id: uid, ...data, status: "pending", created_at: new Date().toISOString() }), headers: { "Prefer": "return=representation" } }); },
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
  { id: "bronze",   label: "Bronze",   icon: "🥉", min: 0,        color: "#b45309", bg: "#fef3c7", desc: "Getting started" },
  { id: "silver",   label: "Silver",   icon: "🥈", min: 500000,   color: "#6b7280", bg: "#f3f4f6", desc: "Building momentum" },
  { id: "gold",     label: "Gold",     icon: "🥇", min: 2000000,  color: "#d97706", bg: "#fffbeb", desc: "Serious investor" },
  { id: "platinum", label: "Platinum", icon: "💎", min: 5000000,  color: "#7c3aed", bg: "#f5f3ff", desc: "Elite portfolio" },
  { id: "diamond",  label: "Diamond",  icon: "💠", min: 10000000, color: "#0891b2", bg: "#ecfeff", desc: "Top 1% investor" },
];
const getMedal = (v) => [...MEDALS].reverse().find(m => v >= m.min) || MEDALS[0];
const fmtD = (n) => n == null || isNaN(n) ? "—" : (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString();
const fmtP = (n) => isNaN(n) ? "—" : `${(n*100).toFixed(1)}%`;
const fmtM = (n) => { if (!n) return "$0"; if (n >= 1000000) return `$${(n/1000000).toFixed(1)}M`; if (n >= 1000) return `$${(n/1000).toFixed(0)}K`; return `$${Math.round(n)}`; };

// ─── Global Styles ─────────────────────────────────────────────────────────────
function GlobalStyles() {
  return <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,700;0,800;0,900;1,800&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    html{scroll-behavior:smooth;}
    input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
    ::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:4px;}
    @keyframes popIn{from{opacity:0;transform:scale(0.94);}to{opacity:1;transform:scale(1);}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}
    @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
    @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.45;}}
    .fadein{animation:fadeUp 0.35s ease both;}
    @media(max-width:768px){
      .hide-mobile{display:none !important;}
      .show-mobile{display:flex !important;}
      .calc-grid{grid-template-columns:1fr !important;}
      .mode-pills{gap:6px !important; flex-wrap:wrap !important;}
      .mode-pill-sub{display:none !important;}
      .top-nav-tabs{display:none !important;}
      .calc-pad{padding:14px 12px !important;}
      .auth-split{grid-template-columns:1fr !important;}
      .auth-left{display:none !important;}
      .auth-right{padding:28px 20px !important;}
      .deal-cards-grid{grid-template-columns:1fr !important;}
      .profile-tabs{overflow-x:auto !important; flex-wrap:nowrap !important;}
      .profile-tabs button{white-space:nowrap; flex-shrink:0;}
      .decision-hero{padding:16px 14px !important;}
      .mentoring-grid{grid-template-columns:1fr !important; gap:32px !important;}
      .field-grid-2{grid-template-columns:1fr !important;}
      .results-grid{grid-template-columns:1fr !important;}
      .landing-padding{padding:60px 20px !important;}
      .header-profile-name{display:none !important;}
      .header-save-flash{display:none !important;}
      .main-content{padding-bottom:80px !important;}
      body{-webkit-text-size-adjust:100%;}
    }
    .show-mobile{display:none;}
    .bottom-nav{
      display:none;
      position:fixed;
      bottom:0; left:0; right:0;
      background:white;
      border-top:1.5px solid #e5e7eb;
      z-index:200;
      padding:6px 0 env(safe-area-inset-bottom, 6px);
      box-shadow:0 -4px 20px rgba(0,0,0,0.06);
    }
    @media(max-width:768px){
      .bottom-nav{display:flex !important;}
    }
  `}</style>;
}

// ─── Logo ──────────────────────────────────────────────────────────────────────
function Logo({ onClick, size="md" }) {
  const sz = size==="lg" ? 36 : 28;
  return (
    <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:8,cursor:onClick?"pointer":"default"}}>
      <div style={{width:sz,height:sz,background:"linear-gradient(135deg,#10b981,#059669)",borderRadius:sz*0.25,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{color:"white",fontSize:sz*0.5,fontWeight:800}}>D</span>
      </div>
      <span style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:size==="lg"?22:17,color:"#111827"}}>
        DealSource<span style={{color:"#10b981"}}>.ai</span>
      </span>
    </div>
  );
}

// ─── UI Kit ────────────────────────────────────────────────────────────────────
function Input({label,type="text",value,onChange,placeholder,icon,error,hint,disabled}) {
  const [focused,setFocused]=useState(false);
  const [show,setShow]=useState(false);
  const isPass=type==="password";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      {label&&<label style={{fontSize:12,fontWeight:600,color:"#374151"}}>{label}</label>}
      <div style={{position:"relative"}}>
        {icon&&<span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:16,pointerEvents:"none"}}>{icon}</span>}
        <input type={isPass&&show?"text":type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
          onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
          style={{width:"100%",padding:`11px ${isPass?"42px":"14px"} 11px ${icon?"40px":"14px"}`,borderRadius:10,border:`1.5px solid ${error?"#fca5a5":focused?"#10b981":"#e5e7eb"}`,background:disabled?"#f9fafb":error?"#fff5f5":"white",fontSize:14,color:"#111827",outline:"none",transition:"border-color 0.15s",fontFamily:"'DM Sans',sans-serif"}}/>
        {isPass&&<button type="button" onClick={()=>setShow(s=>!s)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#9ca3af"}}>{show?"🙈":"👁️"}</button>}
      </div>
      {error&&<p style={{fontSize:12,color:"#dc2626",margin:0}}>{error}</p>}
      {hint&&!error&&<p style={{fontSize:12,color:"#9ca3af",margin:0}}>{hint}</p>}
    </div>
  );
}
function Sel({label,value,onChange,options,placeholder}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      {label&&<label style={{fontSize:12,fontWeight:600,color:"#374151"}}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)} style={{padding:"11px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",background:"white",fontSize:14,color:value?"#111827":"#9ca3af",outline:"none",fontFamily:"'DM Sans',sans-serif",cursor:"pointer"}}>
        <option value="">{placeholder||"Select..."}</option>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
function Btn({children,onClick,variant="primary",loading,disabled,fullWidth,small,type="button"}) {
  const S={primary:{background:"#10b981",color:"white",border:"none"},secondary:{background:"white",color:"#374151",border:"1.5px solid #e5e7eb"},dark:{background:"#111827",color:"white",border:"none"},ghost:{background:"transparent",color:"#6b7280",border:"1.5px solid #e5e7eb"},danger:{background:"#dc2626",color:"white",border:"none"},teal:{background:"#0d9488",color:"white",border:"none"}};
  return <button type={type} onClick={onClick} disabled={disabled||loading} style={{...S[variant],padding:small?"7px 14px":"12px 24px",borderRadius:small?7:10,fontSize:small?12:14,fontWeight:700,cursor:disabled||loading?"default":"pointer",width:fullWidth?"100%":"auto",opacity:disabled?0.5:1,transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:"center",gap:8,whiteSpace:"nowrap"}}>{loading?<span style={{animation:"spin 0.8s linear infinite",display:"inline-block"}}>⟳</span>:children}</button>;
}
function Alert({type,children}) {
  const s=type==="error"?{bg:"#fef2f2",border:"#fecaca",color:"#dc2626",icon:"⚠️"}:{bg:"#f0fdf4",border:"#bbf7d0",color:"#059669",icon:"✓"};
  return <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"12px 14px",background:s.bg,border:`1.5px solid ${s.border}`,borderRadius:10}}><span style={{fontSize:14}}>{s.icon}</span><p style={{fontSize:13,color:s.color,lineHeight:1.5,margin:0}}>{children}</p></div>;
}
function Toggle({value,onChange,label}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <div onClick={()=>onChange(!value)} style={{width:44,height:24,borderRadius:12,background:value?"#10b981":"#d1d5db",cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0}}>
        <div style={{width:18,height:18,borderRadius:"50%",background:"white",position:"absolute",top:3,left:value?23:3,transition:"left 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.2)"}}/>
      </div>
      {label&&<span style={{fontSize:13,color:"#374151",fontWeight:500}}>{label}</span>}
    </div>
  );
}
function MedalBadge({profile,size="sm"}) {
  const medal=getMedal(+(profile?.portfolio_value||0));
  const verified=profile?.is_verified;
  return (
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      <span style={{fontSize:size==="sm"?14:18}}>{medal.icon}</span>
      {verified&&<span style={{fontSize:size==="sm"?10:12,background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:100,padding:"1px 6px",fontWeight:700}}>✓ Verified</span>}
    </div>
  );
}

// ─── Auth Layout ───────────────────────────────────────────────────────────────
function AuthLayout({children,title,subtitle}) {
  return (
    <div className="auth-split" style={{minHeight:"100vh",display:"grid",gridTemplateColumns:"1fr 1fr",background:"#fff"}}>
      <div className="auth-left" style={{background:"linear-gradient(160deg,#064e3b 0%,#065f46 40%,#047857 100%)",display:"flex",flexDirection:"column",justifyContent:"space-between",padding:48,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle at 20% 80%,rgba(16,185,129,0.15) 0%,transparent 50%)",pointerEvents:"none"}}/>
        <Logo size="md"/>
        <div>
          <h2 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(28px,3vw,42px)",fontWeight:900,color:"white",lineHeight:1.2,marginBottom:20}}>
            Analyze deals like a<br/><span style={{color:"#6ee7b7",fontStyle:"italic"}}>seasoned investor</span>
          </h2>
          <p style={{fontSize:15,color:"rgba(255,255,255,0.65)",lineHeight:1.7,marginBottom:40,maxWidth:340}}>6 calculators, community insights, leaderboards, mentoring, and your deal library in the cloud.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[["🏘️","6 Strategies","Rental to Novation"],["🏆","Leaderboards","Verified rankings"],["👥","Community","Share & get feedback"],["🎓","Mentoring","Learn from top investors"]].map(([icon,t,sub])=>(
              <div key={t} style={{background:"rgba(255,255,255,0.07)",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.1)"}}>
                <div style={{fontSize:20,marginBottom:6}}>{icon}</div>
                <div style={{fontSize:13,fontWeight:700,color:"white"}}>{t}</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:2}}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
        <p style={{fontSize:12,color:"rgba(255,255,255,0.3)"}}>© 2025 DealSource.ai</p>
      </div>
      <div className="auth-right" style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"48px 56px",overflowY:"auto"}}>
        <div style={{width:"100%",maxWidth:420}}>
          <div style={{marginBottom:32}}>
            <h1 style={{fontFamily:"'Fraunces',serif",fontSize:28,fontWeight:800,color:"#111827",marginBottom:6}}>{title}</h1>
            <p style={{fontSize:14,color:"#6b7280",lineHeight:1.6}}>{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Sign In ───────────────────────────────────────────────────────────────────
function SignInPage({onSignIn,onGoSignUp,onGoHome}) {
  const [email,setEmail]=useState("");const [pw,setPw]=useState("");const [loading,setLoading]=useState(false);const [err,setErr]=useState("");
  const handle=async()=>{
    if(!email||!pw){setErr("Please fill in all fields.");return;}
    setLoading(true);setErr("");
    try{const d=await supabase.auth.signIn(email,pw);const p=await supabase.getProfile(d.user.id);onSignIn(d.user,p);}
    catch(e){setErr(e.message||"Sign in failed.");}finally{setLoading(false);}
  };
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your DealSource.ai account.">
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {err&&<Alert type="error">{err}</Alert>}
        <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" icon="📧"/>
        <Input label="Password" type="password" value={pw} onChange={setPw} placeholder="Your password" icon="🔒"/>
        <Btn variant="primary" fullWidth loading={loading} onClick={handle}>Sign In →</Btn>
        <div style={{textAlign:"center",paddingTop:8,borderTop:"1px solid #f3f4f6"}}>
          <span style={{fontSize:13,color:"#6b7280"}}>No account? </span>
          <button onClick={onGoSignUp} style={{background:"none",border:"none",fontSize:13,color:"#10b981",fontWeight:700,cursor:"pointer"}}>Start free trial</button>
        </div>
        <button onClick={onGoHome} style={{background:"none",border:"none",fontSize:12,color:"#9ca3af",cursor:"pointer",textAlign:"center"}}>← Back to homepage</button>
      </div>
    </AuthLayout>
  );
}

// ─── Sign Up ───────────────────────────────────────────────────────────────────
function SignUpPage({onSignIn,onGoSignIn,onGoHome}) {
  const [step,setStep]=useState(1);
  const [form,setForm]=useState({email:"",password:"",confirm:"",full_name:"",phone:"",location:"",investor_type:"",bio:"",title:""});
  const [loading,setLoading]=useState(false);const [err,setErr]=useState("");
  const f=k=>v=>setForm(p=>({...p,[k]:v}));
  const step1=()=>{
    if(!form.email||!form.password||!form.confirm){setErr("Fill in all fields.");return;}
    if(form.password.length<8){setErr("Password must be 8+ chars.");return;}
    if(form.password!==form.confirm){setErr("Passwords don't match.");return;}
    setErr("");setStep(2);
  };
  const submit=async()=>{
    if(!form.full_name){setErr("Name is required.");return;}
    setLoading(true);setErr("");
    try{
      const d=await supabase.auth.signUp(form.email,form.password,{full_name:form.full_name});
      const uid=d.user?.id||d.id;
      const profile={id:uid,email:form.email,full_name:form.full_name,phone:form.phone,location:form.location,investor_type:form.investor_type,bio:form.bio,title:form.title,portfolio_value:0,portfolio_public:false,is_verified:false,mentoring_enabled:false,deal_count:0,upvotes_received:0,mentoring_sessions:0};
      await supabase.upsertProfile(profile).catch(()=>{});
      onSignIn(d.user||d,profile);
    }catch(e){setErr(e.message||"Sign up failed.");setStep(1);}finally{setLoading(false);}
  };
  return (
    <AuthLayout title={step===1?"Create your account":"Complete your profile"} subtitle={step===1?"Free trial — no credit card required.":"Tell us about your investing background."}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:24}}>
        {[1,2].map(n=>(<div key={n} style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:step>=n?"#10b981":"#f3f4f6",color:step>=n?"white":"#9ca3af",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{step>n?"✓":n}</div>
          <span style={{fontSize:12,fontWeight:600,color:step>=n?"#111827":"#9ca3af"}}>{n===1?"Account":"Profile"}</span>
          {n<2&&<div style={{width:32,height:1,background:step>n?"#10b981":"#e5e7eb"}}/>}
        </div>))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {err&&<Alert type="error">{err}</Alert>}
        {step===1&&(<>
          <Input label="Email" type="email" value={form.email} onChange={f("email")} placeholder="you@example.com" icon="📧"/>
          <Input label="Password" type="password" value={form.password} onChange={f("password")} placeholder="Min. 8 characters" icon="🔒"/>
          <Input label="Confirm password" type="password" value={form.confirm} onChange={f("confirm")} placeholder="Repeat password" icon="🔒"/>
          <Btn variant="primary" fullWidth onClick={step1}>Continue →</Btn>
        </>)}
        {step===2&&(<>
          <Input label="Full name *" value={form.full_name} onChange={f("full_name")} placeholder="Jane Smith" icon="👤"/>
          <Input label="Professional title" value={form.title} onChange={f("title")} placeholder="e.g. Managing Partner, Investor" icon="💼"/>
          <Input label="Phone" value={form.phone} onChange={f("phone")} placeholder="+1 (555) 000-0000" icon="📱"/>
          <Input label="Location" value={form.location} onChange={f("location")} placeholder="Atlanta, GA" icon="📍"/>
          <Sel label="Investor type" value={form.investor_type} onChange={f("investor_type")} options={INVESTOR_TYPES} placeholder="What kind of investor?"/>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <label style={{fontSize:12,fontWeight:600,color:"#374151"}}>Bio</label>
            <textarea value={form.bio} onChange={e=>f("bio")(e.target.value)} placeholder="Your investing background..." rows={3} style={{padding:"11px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:14,color:"#111827",outline:"none",resize:"vertical",fontFamily:"'DM Sans',sans-serif"}}/>
          </div>
          <div style={{display:"flex",gap:10}}>
            <Btn variant="ghost" onClick={()=>{setErr("");setStep(1);}}>← Back</Btn>
            <Btn variant="primary" fullWidth loading={loading} onClick={submit}>Create Account →</Btn>
          </div>
        </>)}
        <div style={{textAlign:"center",paddingTop:8,borderTop:"1px solid #f3f4f6"}}>
          <span style={{fontSize:13,color:"#6b7280"}}>Have an account? </span>
          <button onClick={onGoSignIn} style={{background:"none",border:"none",fontSize:13,color:"#10b981",fontWeight:700,cursor:"pointer"}}>Sign in</button>
        </div>
        <button onClick={onGoHome} style={{background:"none",border:"none",fontSize:12,color:"#9ca3af",cursor:"pointer",textAlign:"center"}}>← Back to homepage</button>
      </div>
    </AuthLayout>
  );
}

// ─── Calculator shared components ─────────────────────────────────────────────
function Field({label,value,onChange,prefix,suffix,step=1}) {
  const [draft,setDraft]=useState(String(value??""));
  useEffect(()=>setDraft(String(value??"")), [value]);
  const commit=()=>{const n=parseFloat(draft);if(!isNaN(n))onChange(n);else setDraft(String(value??""));};
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {label&&<label style={{fontSize:11,fontWeight:600,color:"#6b7280",letterSpacing:"0.05em",textTransform:"uppercase"}}>{label}</label>}
      <div style={{display:"flex",alignItems:"center",background:"#f9fafb",border:"1.5px solid #e5e7eb",borderRadius:8,overflow:"hidden",transition:"border-color 0.15s"}}
        onFocusCapture={e=>e.currentTarget.style.borderColor="#10b981"}
        onBlurCapture={e=>e.currentTarget.style.borderColor="#e5e7eb"}>
        {prefix&&<span style={{padding:"0 10px",color:"#9ca3af",fontSize:13,borderRight:"1.5px solid #e5e7eb",background:"#f3f4f6"}}>{prefix}</span>}
        <input type="number" step={step} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e=>{if(e.key==="Enter"){commit();e.target.blur();}}}
          style={{flex:1,background:"transparent",border:"none",outline:"none",color:"#111827",padding:"9px 12px",fontSize:13,fontFamily:"'DM Mono',monospace",minWidth:0}}/>
        {suffix&&<span style={{padding:"0 10px",color:"#9ca3af",fontSize:12,borderLeft:"1.5px solid #e5e7eb",background:"#f3f4f6"}}>{suffix}</span>}
      </div>
    </div>
  );
}
function Divider({label}) {
  return <div style={{display:"flex",alignItems:"center",gap:10,margin:"6px 0 2px"}}><span style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"#10b981",whiteSpace:"nowrap"}}>{label}</span><div style={{flex:1,height:1,background:"#e5e7eb"}}/></div>;
}
function OutRow({label,value,highlight,positive,negative}) {
  const color=positive?"#059669":negative?"#dc2626":highlight?"#111827":"#374151";
  return <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #f3f4f6",gap:12,minWidth:0}}><span style={{fontSize:12,color:"#6b7280",flex:"1 1 auto",minWidth:0}}>{label}</span><span style={{fontSize:highlight?14:13,fontWeight:highlight?700:500,fontFamily:"'DM Mono',monospace",color,textAlign:"right",flexShrink:0,whiteSpace:"nowrap"}}>{value}</span></div>;
}
function BigResult({label,value,positive,negative}) {
  const bg=positive?"#f0fdf4":negative?"#fef2f2":"#f9fafb";
  const border=positive?"#bbf7d0":negative?"#fecaca":"#e5e7eb";
  const color=positive?"#059669":negative?"#dc2626":"#374151";
  return <div style={{textAlign:"center",padding:"18px 14px",background:bg,borderRadius:12,border:`1.5px solid ${border}`}}><div style={{fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"#9ca3af",marginBottom:8}}>{label}</div><div style={{fontSize:24,fontWeight:800,fontFamily:"'DM Mono',monospace",color}}>{value}</div></div>;
}
function AddressBar({value, onChange, onDataFill}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const search = (q) => {
    onChange(q);
    if(q.length < 4){ setSuggestions([]); setOpen(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async()=>{
      setLoading(true);
      try {
        // Use Nominatim (free, no API key needed)
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5&countrycodes=us`);
        const data = await res.json();
        setSuggestions(data||[]);
        setOpen(data?.length>0);
      } catch { setSuggestions([]); }
      setLoading(false);
    }, 400);
  };

  const select = (item) => {
    const addr = item.display_name?.split(",").slice(0,3).join(",").trim();
    onChange(addr);
    setOpen(false);
    setSuggestions([]);
    // Pass back address data if parent wants to auto-fill
    if(onDataFill && item.address) {
      onDataFill({
        city: item.address.city||item.address.town||item.address.village||"",
        state: item.address.state||"",
        zip: item.address.postcode||"",
        county: item.address.county||"",
        lat: item.lat,
        lon: item.lon,
      });
    }
  };

  return (
    <div style={{marginBottom:18,position:"relative"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:10}}>
        <span style={{fontSize:16}}>{loading?"⏳":"📍"}</span>
        <input type="text" value={value} onChange={e=>search(e.target.value)}
          onBlur={()=>setTimeout(()=>setOpen(false),200)}
          onFocus={()=>suggestions.length>0&&setOpen(true)}
          placeholder="Enter property address (optional)..."
          style={{flex:1,background:"transparent",border:"none",outline:"none",fontSize:13,color:"#111827",fontFamily:"'DM Sans',sans-serif"}}/>
        {value&&<button onClick={()=>{onChange("");setSuggestions([]);}} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:14,padding:0}}>✕</button>}
      </div>
      {open&&suggestions.length>0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,background:"white",border:"1.5px solid #e5e7eb",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.1)",zIndex:200,marginTop:4,overflow:"hidden"}}>
          {suggestions.map((s,i)=>(
            <button key={i} onMouseDown={()=>select(s)}
              style={{width:"100%",padding:"10px 14px",textAlign:"left",background:"none",border:"none",borderBottom:i<suggestions.length-1?"1px solid #f3f4f6":"none",cursor:"pointer",fontSize:12,color:"#374151",lineHeight:1.4}}
              onMouseEnter={e=>e.currentTarget.style.background="#f0fdf4"}
              onMouseLeave={e=>e.currentTarget.style.background="none"}>
              📍 {s.display_name?.split(",").slice(0,4).join(",")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Calculators ───────────────────────────────────────────────────────────────
// ─── PRO GATE SYSTEM ──────────────────────────────────────────────────────────

function UpgradeModal({onClose, trigger="unlock", onActivatePro}) {
  const [activated, setActivated] = useState(false);
  const messages = {
    compare: {title:"Compare Deals Side-by-Side", desc:"Stack up to 5 deals in a comparison grid. See which one wins on every metric."},
    export:  {title:"Export Investor-Ready Reports", desc:"PDF reports, lender summaries, and shareable deal links."},
    save:    {title:"Save Unlimited Deals", desc:"Free plan is limited to 1 saved deal. Go Pro to save, organize, and revisit unlimited deals."},
    unlock:  {title:"Unlock Decision Intelligence", desc:"Risk scoring, stress testing, capital efficiency grades — institutional-grade underwriting."},
  };
  const msg = messages[trigger]||messages.unlock;

  const handleActivate = async() => {
    setActivated(true);
    try {
      // Call Vercel serverless function to create Stripe Checkout session
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: supabase._userId,
          email: supabase._userEmail||'',
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url; // Redirect to Stripe Checkout
      } else {
        throw new Error(data.error||'No checkout URL');
      }
    } catch(err) {
      console.error('Checkout error:', err);
      // Fallback: activate locally for testing if API not deployed yet
      await supabase._fetch(`/rest/v1/profiles?id=eq.${supabase._userId}`,{method:"PATCH",body:JSON.stringify({is_pro:true})}).catch(()=>{});
      onActivatePro&&onActivatePro();
      setTimeout(()=>onClose(),1000);
    }
  };

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div className="upgrade-modal" style={{background:"white",borderRadius:24,padding:0,maxWidth:460,width:"100%",boxShadow:"0 32px 80px rgba(0,0,0,0.2)",overflow:"hidden",animation:"popIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both"}}>
        <div style={{background:"linear-gradient(135deg,#064e3b,#065f46)",padding:"28px 32px"}}>
          <div style={{fontSize:36,marginBottom:12}}>🧠</div>
          <h2 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"white",marginBottom:6}}>{msg.title}</h2>
          <p style={{fontSize:13,color:"rgba(255,255,255,0.65)",lineHeight:1.6}}>{msg.desc}</p>
        </div>
        <div style={{padding:"24px 32px"}}>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:24}}>
            {["🧠 Risk Score Engine (A–F grade)","📊 Stress Testing (rent drops, rate hikes, vacancy spikes)","⚖️ Side-by-side deal comparison","💼 Portfolio dashboard & capital tracking","📄 Investor PDF & lender summary exports","♾️ Unlimited saved deals"].map(f=>(
              <div key={f} style={{display:"flex",alignItems:"center",gap:10,fontSize:13,color:"#374151"}}>
                <span style={{color:"#10b981",fontSize:14,flexShrink:0}}>✓</span>{f}
              </div>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,padding:"14px 16px",background:"#f0fdf4",borderRadius:12,border:"1.5px solid #bbf7d0"}}>
            <div><div style={{fontSize:13,fontWeight:700,color:"#374151"}}>DealSource Pro</div><div style={{fontSize:11,color:"#6b7280"}}>Cancel anytime</div></div>
            <div style={{textAlign:"right"}}><span style={{fontSize:26,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#059669"}}>$20</span><span style={{fontSize:12,color:"#6b7280"}}>/mo</span></div>
          </div>
          {activated?(
            <div style={{textAlign:"center",padding:"14px",background:"#f0fdf4",borderRadius:12,border:"1.5px solid #bbf7d0"}}>
              <div style={{fontSize:20,marginBottom:6}}>⏳</div>
              <div style={{fontSize:14,fontWeight:700,color:"#059669"}}>Redirecting to checkout...</div>
            </div>
          ):(
            <>
              <button onClick={handleActivate} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:"#10b981",color:"white",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:10,boxShadow:"0 4px 20px rgba(16,185,129,0.3)"}}>
                Upgrade to Pro — $20/mo →
              </button>
              <button onClick={onClose} style={{width:"100%",padding:"10px",borderRadius:12,border:"1.5px solid #e5e7eb",background:"white",color:"#6b7280",fontSize:13,cursor:"pointer"}}>Maybe later</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProGate({isPro, trigger="unlock", onActivatePro, children}) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  if(isPro) return children;
  return (
    <>
      {showUpgrade&&<UpgradeModal onClose={()=>setShowUpgrade(false)} trigger={trigger} onActivatePro={()=>{onActivatePro&&onActivatePro();setShowUpgrade(false);}}/>}
      <div style={{position:"relative",cursor:"pointer"}} onClick={()=>setShowUpgrade(true)}>
        <div style={{filter:"blur(3px)",pointerEvents:"none",userSelect:"none",opacity:0.5}}>{children}</div>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(255,255,255,0.7)",borderRadius:12}}>
          <div style={{background:"linear-gradient(135deg,#064e3b,#065f46)",borderRadius:14,padding:"14px 22px",textAlign:"center",boxShadow:"0 8px 32px rgba(0,0,0,0.15)"}}>
            <div style={{fontSize:18,marginBottom:6}}>🔒</div>
            <div style={{fontSize:13,fontWeight:700,color:"white",marginBottom:3}}>Pro Feature</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",marginBottom:10}}>Unlock Decision Intelligence</div>
            <div style={{fontSize:12,fontWeight:700,color:"#6ee7b7"}}>$20/mo → Upgrade</div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── RISK SCORE ENGINE ─────────────────────────────────────────────────────────
// ─── DECISION ENGINE v3 ────────────────────────────────────────────────────────

// ── Mortgage helper ──
function calcMortgage(principal, rate, termYears) {
  const r = rate/100/12, n = termYears*12;
  if(r===0||n===0) return principal/Math.max(n,1);
  return principal*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1);
}

// ── Loan balance at year Y ──
function loanBalance(principal, rate, termYears, yearsPaid) {
  const r = rate/100/12, n = termYears*12, p = Math.min(yearsPaid*12, n);
  if(r===0) return Math.max(0, principal*(1-p/n));
  return principal*(Math.pow(1+r,n)-Math.pow(1+r,p))/(Math.pow(1+r,n)-1);
}

// ── IRR via Newton-Raphson ──
function calcIRR(cashflows) {
  let rate = 0.1;
  for(let iter=0; iter<100; iter++) {
    let npv=0, dnpv=0;
    cashflows.forEach((cf,t)=>{ npv+=cf/Math.pow(1+rate,t); dnpv+=-t*cf/Math.pow(1+rate,t+1); });
    if(Math.abs(dnpv)<1e-10) break;
    const nr = rate - npv/dnpv;
    if(Math.abs(nr-rate)<0.0001) { rate=nr; break; }
    rate = nr;
  }
  return isFinite(rate)?rate:null;
}

// ── STRATEGY-WEIGHTED RISK SCORE ──
function calcRiskScore(metrics, strategy, strategyFit="cashflow") {
  let score = 0;
  const flags = [];   // {label, severity, cause}
  const strengths = [];

  const WEIGHTS = {
    cashflow:     {coc:0.30, dscr:0.25, mcf:0.20, beo:0.15, ltv:0.10},
    appreciation: {coc:0.10, dscr:0.15, mcf:0.10, beo:0.10, ltv:0.15, equity:0.40},
    brrrr:        {coc:0.15, dscr:0.20, mcf:0.15, beo:0.15, ltv:0.35},
    conservative: {coc:0.15, dscr:0.30, mcf:0.25, beo:0.20, ltv:0.10},
    aggressive:   {coc:0.35, dscr:0.15, mcf:0.20, beo:0.15, ltv:0.15},
  };
  const w = WEIGHTS[strategyFit] || WEIGHTS.cashflow;

  if(strategy==="rental"||strategy==="brrrr"||strategy==="subto") {
    const {mcf=0,coc=0,dscr=0,beo=0,ltv=0,rent=0,expenses=0,mortgage=0,pp=0,rate=7.5} = metrics;

    // CoC
    const cocPts = coc>=0.12?100:coc>=0.08?75:coc>=0.04?45:coc>=0?20:0;
    score += cocPts * w.coc;
    if(coc>=0.10) strengths.push("Strong CoC return");
    else if(coc<0.04) flags.push({label:`CoC ${fmtP(coc)}`,severity:"High",cause:"Return too low for risk taken"});
    else if(coc<0.08) flags.push({label:`CoC ${fmtP(coc)}`,severity:"Moderate",cause:"Below institutional benchmark"});

    // DSCR
    const dscrPts = dscr>=1.5?100:dscr>=1.35?80:dscr>=1.2?55:dscr>=1.0?30:0;
    score += dscrPts * w.dscr;
    if(dscr>=1.4) strengths.push("Debt well-covered");
    else if(dscr<1.0) flags.push({label:`DSCR ${dscr.toFixed(2)}x`,severity:"Critical",cause:`High leverage at ${rate}% rate`});
    else if(dscr<1.2) flags.push({label:`DSCR ${dscr.toFixed(2)}x`,severity:"Moderate",cause:"Near lender minimum — refi risk"});

    // Cash flow buffer
    const mcfPts = mcf>=500?100:mcf>=200?75:mcf>=0?40:0;
    score += mcfPts * w.mcf;
    if(mcf>=400) strengths.push("Healthy cash flow buffer");
    else if(mcf<0) flags.push({label:`Cash flow ${fmtD(mcf)}/mo`,severity:"High",cause:"Mgmt + capex drag exceeds rent"});
    else if(mcf<100) flags.push({label:`Cash flow ${fmtD(mcf)}/mo`,severity:"Moderate",cause:"Thin margin — 1 repair wipes buffer"});

    // Break-even occupancy
    const beoPts = beo<=0.75?100:beo<=0.85?70:beo<=0.95?40:10;
    score += beoPts * w.beo;
    if(beo<=0.80) strengths.push("Low break-even occupancy");
    else if(beo>=1.0) flags.push({label:`Break-even ${fmtP(beo)}`,severity:"Structural",cause:"Requires full occupancy to break even"});
    else if(beo>=0.95) flags.push({label:`Break-even ${fmtP(beo)}`,severity:"High",cause:`Only ${((1-beo)*100).toFixed(0)}% vacancy buffer`});
    else if(beo>=0.88) flags.push({label:`Break-even ${fmtP(beo)}`,severity:"Moderate",cause:"Limited vacancy tolerance"});

    // LTV
    const ltvPts = ltv<=0.65?100:ltv<=0.75?70:ltv<=0.80?45:20;
    score += ltvPts * w.ltv;
    if(ltv<=0.70) strengths.push("Conservative leverage");
    else if(ltv>=0.85) flags.push({label:`LTV ${fmtP(ltv)}`,severity:"High",cause:"Limited equity cushion"});

    // Equity appreciation (only for appreciation-focused)
    if(w.equity) score += 60 * w.equity; // base equity score
  }

  if(strategy==="wholesale") {
    const {mao=0,arv=0,repairs=0,fee=0} = metrics;
    const spread=arv-mao, margin=arv>0?spread/arv:0, repRatio=arv>0?repairs/arv:0;
    if(margin>=0.35){score+=88;strengths.push("Strong deal spread");}
    else if(margin>=0.25){score+=70;}
    else if(margin>=0.15){score+=45;flags.push({label:"Thin spread",severity:"High",cause:"< 25% margin — buyer resistance likely"});}
    else{flags.push({label:"Spread too thin",severity:"Critical",cause:"ARV-repair-fee math doesn't work"});}
    if(repRatio<=0.12){score+=12;strengths.push("Low repair ratio");}
    else if(repRatio>=0.2){flags.push({label:"High repair ratio",severity:"Moderate",cause:"Repairs eat into investor margin"});}
    if(fee>=8000) strengths.push("Solid assignment fee");
    else if(fee<4000) flags.push({label:"Low fee",severity:"Moderate",cause:"Assignment fee below market rate"});
  }

  if(strategy==="flip"||strategy==="novation") {
    const {profit=0,arv=0,roi=0,months=6,costs=0} = metrics;
    const margin=arv>0?profit/arv:0;
    if(margin>=0.20){score+=80;strengths.push("Strong profit margin");}
    else if(margin>=0.15){score+=62;}
    else if(margin>=0.10){score+=40;flags.push({label:`Margin ${fmtP(margin)}`,severity:"Moderate",cause:"Thin margin leaves no ARV buffer"});}
    else{flags.push({label:`Margin ${fmtP(margin)}`,severity:"High",cause:"< 10% — one surprise kills profit"});}
    if(roi>=0.30){score+=15;strengths.push("Excellent annualized ROI");}
    else if(roi<0.15){flags.push({label:`ROI ${fmtP(roi)}`,severity:"Moderate",cause:"Below 15% annualized threshold"});}
    if(months<=4){score+=5;strengths.push("Short hold = lower risk");}
    else if(months>=9){flags.push({label:`Hold ${months}mo`,severity:"High",cause:"Extended carry cost exposure"});}
  }

  score = Math.min(100, Math.max(0, Math.round(score)));
  const confidence = Math.min(95, 55 + Math.abs(score-50)*0.8);

  let grade, gradeColor, verdict, verdictBg, verdictColor, explanation;
  if(score>=85){grade="A";gradeColor="#059669";verdict="Strong Buy";verdictBg="#f0fdf4";verdictColor="#059669";explanation="Strong fundamentals across all key metrics. This deal performs well under the selected strategy.";}
  else if(score>=70){grade="B";gradeColor="#2563eb";verdict="Proceed";verdictBg="#eff6ff";verdictColor="#2563eb";explanation="Solid deal with minor weaknesses. Review flagged items before committing.";}
  else if(score>=55){grade="C";gradeColor="#d97706";verdict="Weak Hold";verdictBg="#fffbeb";verdictColor="#d97706";explanation="Marginal deal. Thin cushions and moderate leverage reduce safety margin.";}
  else if(score>=35){grade="D";gradeColor="#ea580c";verdict="High Risk";verdictBg="#fff7ed";verdictColor="#ea580c";explanation="Multiple structural weaknesses. This deal needs significant renegotiation.";}
  else{grade="F";gradeColor="#dc2626";verdict="Avoid";verdictBg="#fef2f2";verdictColor="#dc2626";explanation="Deal does not meet minimum investment criteria under any scenario.";}

  return{score,grade,gradeColor,verdict,verdictBg,verdictColor,flags,strengths,confidence:Math.round(confidence),explanation};
}

// ── FIX THE DEAL — reverse engineer targets ──
function calcFixTheDeal(metrics, strategy) {
  if(strategy!=="rental"&&strategy!=="brrrr"&&strategy!=="subto") return null;
  const {mcf=0,coc=0,dscr=0,rent=0,expenses=0,mortgage=0,pp=0,ti=0,rate=7.5,term=30,down=20} = metrics;
  const fixes = [];

  // Target: 8% CoC
  if(coc<0.08 && ti>0) {
    const targetACF = ti*0.08;
    const targetMCF = targetACF/12;
    const targetPP_coc = pp - (targetMCF - mcf)*12/0.08 * (1 - down/100);
    const targetRent_coc = rent + (targetMCF - mcf);
    const currentLoan = pp*(1-down/100);
    const targetDown_coc = down + Math.ceil((targetMCF-mcf)*12/ti*100);
    fixes.push({
      goal:"Reach 8% CoC",
      options:[
        {label:"Purchase price", value:`≤ ${fmtD(Math.round(targetPP_coc/5000)*5000)}`, icon:"🏷️"},
        {label:"Monthly rent", value:`≥ ${fmtD(Math.round(targetRent_coc/50)*50)}`, icon:"💰"},
        {label:"Down payment", value:`≥ ${Math.min(50,Math.round(targetDown_coc))}%`, icon:"📥"},
      ]
    });
  }

  // Target: DSCR 1.25
  if(dscr<1.25 && mortgage>0) {
    const targetNOI = mortgage*1.25;
    const targetRent_dscr = targetNOI + expenses;
    const targetLoan = (rent-expenses)/1.25 / (rate/100/12) * (1 - 1/Math.pow(1+rate/100/12, term*12));
    fixes.push({
      goal:"Reach DSCR 1.25",
      options:[
        {label:"Monthly rent", value:`≥ ${fmtD(Math.round(targetRent_dscr/50)*50)}`, icon:"💰"},
        {label:"Max loan", value:`≤ ${fmtD(Math.round(targetLoan/5000)*5000)}`, icon:"🏦"},
      ]
    });
  }

  // Target: $300/mo cash flow
  if(mcf<300) {
    const deficit = 300 - mcf;
    const targetPP_cf = pp - deficit*12/(rate/100) * (1-down/100);
    const targetRent_cf = rent + deficit;
    fixes.push({
      goal:"Get $300/mo cash flow",
      options:[
        {label:"Purchase price", value:`≤ ${fmtD(Math.round(Math.max(0,targetPP_cf)/5000)*5000)}`, icon:"🏷️"},
        {label:"Monthly rent", value:`≥ ${fmtD(Math.round(targetRent_cf/50)*50)}`, icon:"💰"},
      ]
    });
  }

  return fixes.length>0?fixes:null;
}

// ── MARGIN OF SAFETY ──
function calcMarginOfSafety(metrics, strategy) {
  if(strategy!=="rental"&&strategy!=="brrrr"&&strategy!=="subto") return null;
  const {pp=0,dscr=0,beo=0,rent=0,rate=7.5,term=30,down=20,appreciation=3} = metrics;

  // 5-yr equity cushion
  const loan = pp*(1-down/100);
  const bal5 = loanBalance(loan, rate, term, 5);
  const val5 = pp*Math.pow(1+appreciation/100,5);
  const equity5 = val5-bal5;
  const equityGain = equity5-(pp*down/100);

  // Buy discount estimate (assume market = pp unless we have better data)
  const buyDiscount = 0.03; // default - user can override
  const dscrScore = Math.min(100, dscr/1.5*100);
  const beoScore = Math.max(0, (1-beo)*100);
  const equityScore = Math.min(100, equityGain/pp*200);
  const composite = Math.round((dscrScore*0.3 + beoScore*0.4 + equityScore*0.3));

  let label, color;
  if(composite>=70){label="Strong";color="#059669";}
  else if(composite>=50){label="Moderate";color="#d97706";}
  else if(composite>=30){label="Low";color="#ea580c";}
  else{label="Very Low";color="#dc2626";}

  return{
    score:composite, label, color,
    equity5:Math.round(equity5),
    equityGain:Math.round(equityGain),
    beo, dscr,
    buyDiscount,
  };
}

// ── LIQUIDITY RISK ──
function calcLiquidityRisk(metrics, strategy) {
  if(strategy!=="rental"&&strategy!=="brrrr"&&strategy!=="subto") return null;
  const {ti=0,mcf=0,pp=0,rate=7.5,term=30,down=20} = metrics;
  const loan = pp*(1-down/100);
  const bal5 = loanBalance(loan, rate, term, 5);
  const principalPaydown5 = loan - bal5;
  const annualCF = mcf*12;
  const yearsToRecover = mcf>0 && ti>0 ? Math.ceil(ti/annualCF) : null;

  let riskLevel, riskColor, riskReason;
  if(mcf<0){riskLevel="Critical";riskColor="#dc2626";riskReason="Negative carry — capital bleeding every month";}
  else if(yearsToRecover===null||yearsToRecover>20){riskLevel="High";riskColor="#ea580c";riskReason="Capital recovery takes 20+ years via cash flow";}
  else if(yearsToRecover>12){riskLevel="Moderate";riskColor="#d97706";riskReason="Slow capital recovery — appreciation dependent";}
  else{riskLevel="Low";riskColor="#059669";riskReason="Cash flow recovers capital within reasonable timeframe";}

  return{
    capitalRequired:ti,
    principalPaydown5:Math.round(principalPaydown5),
    yearsToRecover,
    annualCF:Math.round(annualCF),
    riskLevel, riskColor, riskReason,
  };
}

// ── MONTE CARLO ENGINE ──
function runMonteCarlo(metrics, strategy, runs=1000) {
  if(strategy!=="rental"&&strategy!=="brrrr"&&strategy!=="subto") return null;
  const {rent=0,expenses=0,mortgage=0,vacancy=0,capex=0,ti=0} = metrics;
  const fixedExp = expenses - (vacancy||0);
  const annualCapThreshold = Math.max(200, (ti||50000)*0.01);

  let negCF=0, dscrBelow1=0, capitalInfusion=0;
  const cfSamples = [];

  for(let i=0;i<runs;i++) {
    const rentVar  = 1 + (Math.random()-0.5)*0.30;
    const vacRate  = Math.random()*0.20;
    const expVar   = 1 + (Math.random()-0.5)*0.40;
    const simGross = rent * rentVar;
    const simEff   = simGross * (1 - vacRate);
    const simExp   = (fixedExp-(capex||0))*expVar + (capex||0);
    const simMCF   = simEff - simExp - mortgage;
    const simDSCR  = mortgage>0 ? (simEff-simExp)/mortgage : 0;
    cfSamples.push(simMCF);
    if(simMCF<0) negCF++;
    if(simDSCR<1.0) dscrBelow1++;
    if(simMCF < -annualCapThreshold/12) capitalInfusion++;
  }

  cfSamples.sort((a,b)=>a-b);
  const median  = Math.round(cfSamples[Math.floor(runs*0.50)]);
  const worst10 = Math.round(cfSamples[Math.floor(runs*0.10)]);

  return{
    pNegCF:      Math.round(negCF/runs*100),
    pDSCR:       Math.round(dscrBelow1/runs*100),
    pCapInfusion:Math.round(capitalInfusion/runs*100),
    median, worst10, runs,
  };
}
    pCapInfusion:Math.round(capitalInfusion/runs*100),
    runs,
  };
}

// ── EXIT SCENARIO MODELING ──
function calcExitScenarios(metrics, strategy) {
  if(strategy!=="rental"&&strategy!=="brrrr"&&strategy!=="subto") return null;
  const {pp=0,rent=0,expenses=0,mortgage=0,ti=0,rate=7.5,term=30,down=20,appreciation=3,rentGrowth=2,expenseGrowth=2} = metrics;
  const loan = pp*(1-down/100);

  const scenarios = [];

  // Helper: build cashflows for IRR
  const getCFs = (exitYr, salePrice) => {
    const cfs = [-ti]; // initial investment
    for(let yr=1;yr<=exitYr;yr++) {
      const rentY = rent*12*Math.pow(1+rentGrowth/100,yr);
      const expY  = expenses*12*Math.pow(1+expenseGrowth/100,yr);
      const cf    = rentY - expY - mortgage*12;
      cfs.push(cf);
    }
    // Add sale proceeds at exit year
    const bal = loanBalance(loan, rate, term, exitYr);
    const netProceeds = salePrice - bal - salePrice*0.06; // 6% agent
    cfs[exitYr] = (cfs[exitYr]||0) + netProceeds;
    return cfs;
  };

  // Hold 10 years
  const val10 = pp*Math.pow(1+appreciation/100,10);
  const bal10 = loanBalance(loan, rate, term, 10);
  const cfs10 = getCFs(10, val10);
  const irr10 = calcIRR(cfs10);
  const totalCF10 = cfs10.slice(1,11).reduce((a,b)=>a+b,0);
  scenarios.push({label:"Hold 10 Years",yr:10,value:Math.round(val10),equity:Math.round(val10-bal10),cashReturned:Math.round(totalCF10),irr:irr10,loanBal:Math.round(bal10),multiple:ti>0?(totalCF10/ti):0});

  // Sell Year 5
  const val5 = pp*Math.pow(1+appreciation/100,5);
  const bal5 = loanBalance(loan, rate, term, 5);
  const cfs5 = getCFs(5, val5);
  const irr5 = calcIRR(cfs5);
  const totalCF5 = cfs5.slice(1,6).reduce((a,b)=>a+b,0);
  scenarios.push({label:"Sell Year 5",yr:5,value:Math.round(val5),equity:Math.round(val5-bal5),cashReturned:Math.round(totalCF5),irr:irr5,loanBal:Math.round(bal5),multiple:ti>0?(totalCF5/ti):0});

  // Refi Year 3
  const val3 = pp*Math.pow(1+appreciation/100,3);
  const bal3 = loanBalance(loan, rate, term, 3);
  const refiLoan = val3*0.75; // 75% LTV refi
  const cashOut = refiLoan - bal3;
  const newMortgage = calcMortgage(refiLoan, rate+0.25, 30);
  const cfs3 = getCFs(3, val3);
  scenarios.push({label:"Refi Year 3",yr:3,value:Math.round(val3),equity:Math.round(val3-refiLoan),cashReturned:Math.round(Math.max(0,cashOut)),irr:null,loanBal:Math.round(refiLoan),multiple:null,note:`Cash out: ${fmtD(Math.round(Math.max(0,cashOut)))} · New pmt: ${fmtD(Math.round(newMortgage))}/mo`});

  return scenarios;
}

// ─── DECISION MODE COMPONENTS ──────────────────────────────────────────────────
const STRATEGY_FIT_OPTIONS = [
  {key:"cashflow",    label:"Cash Flow",    icon:"💵"},
  {key:"appreciation",label:"Appreciation", icon:"📈"},
  {key:"brrrr",       label:"BRRRR",        icon:"♻️"},
  {key:"conservative",label:"Conservative", icon:"🛡️"},
  {key:"aggressive",  label:"Aggressive",   icon:"🚀"},
];

function DecisionMode({metrics, strategy, isPro, onActivatePro, allDeals=[], currentDealId=null}) {
  const [stratFit, setStratFit] = useState("cashflow");
  const [activeExit, setActiveExit] = useState(0);

  const risk    = useMemo(()=>calcRiskScore(metrics,strategy,stratFit),[metrics,strategy,stratFit]);
  const fixes   = useMemo(()=>calcFixTheDeal(metrics,strategy),[metrics,strategy]);
  const safety  = useMemo(()=>calcMarginOfSafety(metrics,strategy),[metrics,strategy]);
  const liq     = useMemo(()=>calcLiquidityRisk(metrics,strategy),[metrics,strategy]);
  const monte   = useMemo(()=>runMonteCarlo(metrics,strategy),[metrics,strategy]);
  const exits   = useMemo(()=>calcExitScenarios(metrics,strategy),[metrics,strategy]);

  // Portfolio ranking
  const portfolioRank = useMemo(()=>{
    if(!allDeals||allDeals.length<2) return null;
    const rentalDeals = allDeals.filter(d=>["rental","brrrr","subto"].includes(d.mode)&&d.metrics);
    if(rentalDeals.length<2) return null;
    const scores = rentalDeals.map(d=>{
      const coc = parseFloat(d.metrics?.secondary)||0;
      return{id:d.id, coc, name:d.name};
    }).sort((a,b)=>b.coc-a.coc);
    const rank = scores.findIndex(s=>s.id===currentDealId)+1||scores.length;
    const pct = Math.round(rank/scores.length*100);
    return{rank, total:scores.length, pct, deals:scores.slice(0,5)};
  },[allDeals,currentDealId]);

  const isRental = strategy==="rental"||strategy==="brrrr"||strategy==="subto";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* Strategy Fit Toggle */}
      <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
        <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",padding:"14px 16px"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Strategy Fit — Weights scoring to your goal</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {STRATEGY_FIT_OPTIONS.map(o=>(
              <button key={o.key} onClick={()=>setStratFit(o.key)}
                style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:100,border:`1.5px solid ${stratFit===o.key?"#059669":"#e5e7eb"}`,background:stratFit===o.key?"#f0fdf4":"white",color:stratFit===o.key?"#059669":"#6b7280",fontSize:11,fontWeight:700,cursor:"pointer",transition:"all 0.15s"}}>
                <span>{o.icon}</span>{o.label}
              </button>
            ))}
          </div>
        </div>
      </ProGate>

      {/* CARD 1 — Verdict + Confidence */}
      <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
        <div className="decision-hero" style={{background:"linear-gradient(135deg,#064e3b,#065f46)",borderRadius:16,padding:"20px 22px"}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:12}}>
            <div>
              <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.45)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Risk Score · {STRATEGY_FIT_OPTIONS.find(o=>o.key===stratFit)?.label} Strategy</div>
              <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                <span className="decision-score" style={{fontSize:52,fontWeight:900,fontFamily:"'DM Mono',monospace",color:risk.grade==="A"?"#6ee7b7":risk.grade==="B"?"#93c5fd":risk.grade==="C"?"#fde68a":risk.grade==="D"?"#fdba74":"#fca5a5",lineHeight:1}}>{risk.score}</span>
                <span style={{fontSize:14,color:"rgba(255,255,255,0.35)"}}>/100</span>
              </div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:4}}>Confidence: {risk.confidence}%</div>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <div style={{textAlign:"center"}}>
                <div style={{width:58,height:58,borderRadius:"50%",background:risk.gradeColor,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 0 5px ${risk.gradeColor}40`}}>
                  <span style={{fontSize:26,fontWeight:900,color:"white",fontFamily:"'Fraunces',serif"}}>{risk.grade}</span>
                </div>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.4)",marginTop:4}}>Grade</div>
              </div>
              <div style={{background:risk.verdictBg,borderRadius:10,padding:"10px 14px"}}>
                <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:2}}>Verdict</div>
                <div style={{fontSize:15,fontWeight:800,color:risk.verdictColor}}>{risk.verdict}</div>
              </div>
            </div>
          </div>
          <div style={{height:6,background:"rgba(255,255,255,0.1)",borderRadius:3,overflow:"hidden",marginBottom:10}}>
            <div style={{height:"100%",width:`${risk.score}%`,background:risk.gradeColor,borderRadius:3,transition:"width 0.6s ease"}}/>
          </div>
          <p style={{fontSize:12,color:"rgba(255,255,255,0.65)",lineHeight:1.6,marginBottom:10}}>{risk.explanation}</p>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {risk.strengths.map(s=><span key={s} style={{fontSize:10,background:"rgba(110,231,183,0.15)",color:"#6ee7b7",padding:"3px 9px",borderRadius:100,border:"1px solid rgba(110,231,183,0.3)"}}>✓ {s}</span>)}
          </div>
        </div>
      </ProGate>

      {/* CARD 2 — Risk Diagnosis */}
      {risk.flags.length>0&&(
        <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
          <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",overflow:"hidden"}}>
            <div style={{padding:"11px 16px",borderBottom:"1px solid #f3f4f6",display:"flex",alignItems:"center",gap:8,background:"#fffbeb"}}>
              <span style={{fontSize:13}}>🔬</span>
              <span style={{fontSize:11,fontWeight:700,color:"#92400e",textTransform:"uppercase",letterSpacing:"0.06em"}}>Risk Diagnosis</span>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:"#f9fafb"}}>
                    {["Risk Factor","Severity","Root Cause"].map(h=><th key={h} style={{padding:"8px 14px",textAlign:"left",fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.06em",whiteSpace:"nowrap"}}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {risk.flags.map((f,i)=>{
                    const sev=f.severity;
                    const sc=sev==="Critical"?"#dc2626":sev==="High"?"#ea580c":sev==="Structural"?"#7c3aed":"#d97706";
                    return(
                      <tr key={i} style={{borderTop:"1px solid #f3f4f6"}}>
                        <td style={{padding:"10px 14px",fontWeight:700,color:"#374151",whiteSpace:"nowrap"}}>{f.label}</td>
                        <td style={{padding:"10px 14px"}}><span style={{fontSize:10,background:`${sc}15`,color:sc,padding:"2px 8px",borderRadius:100,fontWeight:700,border:`1px solid ${sc}30`,whiteSpace:"nowrap"}}>{sev}</span></td>
                        <td style={{padding:"10px 14px",color:"#6b7280",fontSize:11}}>{f.cause}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </ProGate>
      )}

      {/* CARD 3 — Fix the Deal */}
      {fixes&&fixes.length>0&&(
        <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
          <div style={{background:"white",borderRadius:12,border:"1.5px solid #bbf7d0",overflow:"hidden"}}>
            <div style={{padding:"11px 16px",borderBottom:"1px solid #f0fdf4",display:"flex",alignItems:"center",gap:8,background:"#f0fdf4"}}>
              <span style={{fontSize:13}}>🔧</span>
              <span style={{fontSize:11,fontWeight:700,color:"#065f46",textTransform:"uppercase",letterSpacing:"0.06em"}}>Fix the Deal — Reverse Engineer Targets</span>
            </div>
            <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:14}}>
              {fixes.map((fix,fi)=>(
                <div key={fi}>
                  <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:8}}>To {fix.goal}:</div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {fix.options.map((opt,oi)=>(
                      <div key={oi} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#f9fafb",borderRadius:8,border:"1px solid #e5e7eb"}}>
                        <span style={{fontSize:14}}>{opt.icon}</span>
                        <span style={{fontSize:12,color:"#6b7280",flex:1}}>{opt.label}</span>
                        <span style={{fontSize:13,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#059669"}}>{opt.value}</span>
                      </div>
                    ))}
                  </div>
                  {fi<fixes.length-1&&<div style={{height:1,background:"#f3f4f6",marginTop:14}}/>}
                </div>
              ))}
            </div>
          </div>
        </ProGate>
      )}

      {/* CARD 4 — Margin of Safety */}
      {safety&&(
        <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
          <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",overflow:"hidden"}}>
            <div style={{padding:"11px 16px",borderBottom:"1px solid #f3f4f6",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13}}>🛡️</span>
                <span style={{fontSize:11,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:"0.06em"}}>Margin of Safety Index</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:18,fontWeight:900,fontFamily:"'DM Mono',monospace",color:safety.color}}>{safety.score}</span>
                <span style={{fontSize:11,fontWeight:700,color:safety.color,background:`${safety.color}15`,padding:"2px 8px",borderRadius:100}}>{safety.label}</span>
              </div>
            </div>
            <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}}>
              {[
                ["5-Year Equity Cushion", fmtD(safety.equityGain), safety.equityGain>50000?"#059669":"#d97706"],
                ["Total Equity at Yr 5", fmtD(safety.equity5), "#374151"],
                ["Break-Even Occupancy", fmtP(safety.beo), safety.beo<=0.85?"#059669":"#d97706"],
                ["DSCR Coverage", safety.dscr.toFixed(2)+"x", safety.dscr>=1.35?"#059669":safety.dscr>=1.2?"#d97706":"#dc2626"],
              ].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #f9fafb",gap:8}}>
                  <span style={{fontSize:12,color:"#6b7280",flex:1}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:c,flexShrink:0}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </ProGate>
      )}

      {/* CARD 5 — Liquidity Risk */}
      {liq&&(
        <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
          <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",overflow:"hidden"}}>
            <div style={{padding:"11px 16px",borderBottom:"1px solid #f3f4f6",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13}}>💧</span>
                <span style={{fontSize:11,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:"0.06em"}}>Liquidity Risk</span>
              </div>
              <span style={{fontSize:10,fontWeight:700,color:liq.riskColor,background:`${liq.riskColor}15`,padding:"3px 10px",borderRadius:100,border:`1px solid ${liq.riskColor}30`}}>{liq.riskLevel}</span>
            </div>
            <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}}>
              {[
                ["Capital Required",fmtD(liq.capitalRequired),"#374151"],
                ["5-Yr Principal Paydown",fmtD(liq.principalPaydown5),"#059669"],
                ["Annual Cash Flow",fmtD(liq.annualCF),liq.annualCF>=0?"#059669":"#dc2626"],
                ["Years to Recover Capital",liq.yearsToRecover?`${liq.yearsToRecover} yrs`:"Never",liq.yearsToRecover&&liq.yearsToRecover<=15?"#d97706":"#dc2626"],
              ].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #f9fafb",gap:8}}>
                  <span style={{fontSize:12,color:"#6b7280",flex:1}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:c,flexShrink:0}}>{v}</span>
                </div>
              ))}
              <p style={{fontSize:11,color:liq.riskColor,background:`${liq.riskColor}10`,padding:"8px 10px",borderRadius:8,marginTop:4,fontWeight:600}}>{liq.riskReason}</p>
            </div>
          </div>
        </ProGate>
      )}

      {/* Monte Carlo Probability Engine */}
      {monte&&(
        <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
          <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",overflow:"hidden"}}>
            <div style={{padding:"11px 16px",borderBottom:"1px solid #f3f4f6",display:"flex",alignItems:"center",gap:8,background:"#f5f3ff"}}>
              <span style={{fontSize:13}}>🎲</span>
              <span style={{fontSize:11,fontWeight:700,color:"#6d28d9",textTransform:"uppercase",letterSpacing:"0.06em"}}>Probability Engine — {monte.runs.toLocaleString()} Simulations</span>
            </div>
            <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
              {[
                {label:"Probability of negative cash flow",pct:monte.pNegCF,danger:50},
                {label:"Probability DSCR falls below 1.0",pct:monte.pDSCR,danger:40},
                {label:"Probability of forced capital infusion",pct:monte.pCapInfusion,danger:30},
              ].map(({label,pct,danger})=>{
                const c=pct>=danger?"#dc2626":pct>=danger*0.6?"#d97706":"#059669";
                return(
                  <div key={label}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <span style={{fontSize:12,color:"#374151"}}>{label}</span>
                      <span style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono',monospace",color:c}}>{pct}%</span>
                    </div>
                    <div style={{height:6,background:"#f3f4f6",borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${pct}%`,background:c,borderRadius:3,transition:"width 0.5s ease"}}/>
                    </div>
                  </div>
                );
              })}
              <p style={{fontSize:10,color:"#9ca3af",marginTop:4}}>Based on random variance: rent ±15%, vacancy 0-15%, expenses ±20%</p>
            </div>
          </div>
        </ProGate>
      )}

      {/* Exit Scenarios */}
      {exits&&exits.length>0&&(
        <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
          <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",overflow:"hidden"}}>
            <div style={{padding:"11px 16px",borderBottom:"1px solid #f3f4f6",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13}}>🚪</span>
              <span style={{fontSize:11,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:"0.06em"}}>Exit Scenario Modeling</span>
            </div>
            <div style={{display:"flex",gap:0,borderBottom:"1px solid #f3f4f6",overflowX:"auto"}}>
              {exits.map((e,i)=>(
                <button key={i} onClick={()=>setActiveExit(i)}
                  style={{flex:1,padding:"9px 10px",border:"none",borderBottom:`2px solid ${activeExit===i?"#059669":"transparent"}`,background:"transparent",color:activeExit===i?"#059669":"#9ca3af",fontSize:11,fontWeight:activeExit===i?700:500,cursor:"pointer",whiteSpace:"nowrap",minWidth:80}}>
                  {e.label}
                </button>
              ))}
            </div>
            <div style={{padding:"14px 16px"}}>
              {(()=>{
                const e=exits[activeExit];
                return(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {e.note&&<div style={{fontSize:11,color:"#6b7280",background:"#f9fafb",padding:"8px 10px",borderRadius:8,marginBottom:4}}>{e.note}</div>}
                    {[
                      ["Property Value",fmtD(e.value),"#374151"],
                      ["Equity at Exit",fmtD(e.equity),"#7c3aed"],
                      e.irr!=null?["IRR",`${(e.irr*100).toFixed(1)}%`,e.irr>=0.15?"#059669":"#d97706"]:null,
                      e.multiple!=null?["Equity Multiple",`${e.multiple.toFixed(2)}x`,e.multiple>=1.5?"#059669":"#d97706"]:null,
                      ["Cash Returned",fmtD(e.cashReturned),e.cashReturned>0?"#059669":"#dc2626"],
                      ["Remaining Loan",fmtD(e.loanBal),"#6b7280"],
                    ].filter(Boolean).map(([l,v,c])=>(
                      <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #f9fafb",gap:8}}>
                        <span style={{fontSize:12,color:"#6b7280",flex:1}}>{l}</span>
                        <span style={{fontSize:14,fontWeight:700,fontFamily:"'DM Mono',monospace",color:c,flexShrink:0}}>{v}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </ProGate>
      )}

      {/* Portfolio Ranking */}
      {portfolioRank&&(
        <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
          <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",overflow:"hidden"}}>
            <div style={{padding:"11px 16px",borderBottom:"1px solid #f3f4f6",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13}}>📊</span>
              <span style={{fontSize:11,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:"0.06em"}}>Portfolio Ranking</span>
            </div>
            <div style={{padding:"14px 16px"}}>
              <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                <div style={{background:"#f0fdf4",borderRadius:10,padding:"10px 14px",flex:1,minWidth:80,textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:900,fontFamily:"'DM Mono',monospace",color:"#059669"}}>#{portfolioRank.rank}</div>
                  <div style={{fontSize:10,color:"#6b7280"}}>of {portfolioRank.total} deals</div>
                </div>
                <div style={{background:"#f9fafb",borderRadius:10,padding:"10px 14px",flex:2,minWidth:120}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#374151",marginBottom:2}}>Percentile rank</div>
                  <div style={{height:6,background:"#e5e7eb",borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${100-portfolioRank.pct}%`,background:"#059669",borderRadius:3}}/>
                  </div>
                  <div style={{fontSize:10,color:"#6b7280",marginTop:3}}>Top {100-portfolioRank.pct}% in your portfolio</div>
                </div>
              </div>
            </div>
          </div>
        </ProGate>
      )}

      {!isPro&&(
        <div style={{textAlign:"center",padding:"16px",background:"#f0fdf4",borderRadius:12,border:"1.5px solid #bbf7d0"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#059669",marginBottom:4}}>🧠 Full Decision Intelligence — Pro Only</div>
          <div style={{fontSize:12,color:"#6b7280",marginBottom:10}}>Risk diagnosis, Fix the Deal, Monte Carlo, Exit IRR, Margin of Safety — all live.</div>
          <div style={{fontSize:12,color:"#374151",fontWeight:600}}>$20/mo — cancel anytime</div>
        </div>
      )}
    </div>
  );
}




// ─── RENTAL CALC v6 — Decision Intelligence Engine ───────────────────────────

// ══ SCORING ENGINE v5 — 3-Pillar Architecture ═══════════════════════════════

// ── Universal hard-fail gates ──
function checkHardFails(metrics) {
  const {mcf=0, dscr=0, beo=0} = metrics;
  const fails = [];
  if(dscr<1.00)  fails.push({rule:"DSCR < 1.00",       value:dscr.toFixed(2)+"x",       consequence:"Debt service exceeds income. No lender will fund this."});
  if(beo>=0.95)  fails.push({rule:"Break-even ≥ 95%",   value:(beo*100).toFixed(1)+"%",  consequence:"Zero vacancy tolerance. One turnover creates losses."});
  if(mcf<=-200)  fails.push({rule:"Cash flow ≤ −$200",  value:fmtD(mcf)+"/mo",           consequence:"Bleeding capital every month with no recovery path."});
  return {fails, hasFatalFail: fails.length > 0};
}

// ── Stress test — rent −10%, vacancy +5%, expenses +10% ──
function calcStressTest(metrics) {
  const {rent=0, expenses=0, vacancy=0, mortgage=0, capex=0} = metrics;
  const fixedExp = expenses - (vacancy||0);
  const sRent = rent * 0.90, sVac = sRent * 0.05;
  const sExp  = fixedExp * 1.10 + (capex||0);
  const sCF   = sRent - sVac - sExp - mortgage;
  const sDSCR = mortgage>0 ? (sRent - sVac - sExp) / mortgage : 0;
  return {stressCF: Math.round(sCF), stressDSCR: +sDSCR.toFixed(3)};
}

// ── PILLAR 1: SURVIVAL ──
function calcSurvivalPillar(metrics, pNegCF=50) {
  const {dscr=0, beo=0} = metrics;
  const gates = checkHardFails(metrics);
  if(gates.hasFatalFail) {
    const isStructural = gates.fails.some(f=>f.rule.includes("Break-even"));
    return {label:isStructural?"Structural Fail":"Fail", color:"#dc2626", bg:"#fef2f2", icon:"⛔", gates};
  }
  const vacTol = Math.max(0, 1 - beo);
  let label, color, bg, icon;
  if(dscr>=1.25 && vacTol>=0.10 && pNegCF<30)  {label="Strong";   color="#059669"; bg="#f0fdf4"; icon="✅";}
  else if(dscr<1.05||vacTol<0.05||pNegCF>60)   {label="Critical"; color="#dc2626"; bg="#fef2f2"; icon="🔴";}
  else if(dscr<1.25||vacTol<0.10||pNegCF>30)   {label="Fragile";  color="#d97706"; bg="#fffbeb"; icon="⚡";}
  else                                           {label="Stable";   color="#2563eb"; bg="#eff6ff"; icon="🔷";}
  return {label, color, bg, icon, gates, dscr, vacTol, pNegCF};
}

// ── PILLAR 2: INCOME QUALITY ──
function calcIncomePillar(metrics) {
  const {mcf=0, coc=0} = metrics;
  const cum5yrCF = mcf * 12 * 5;
  let label, color, bg, icon;
  if(mcf>=300 && coc>=0.08)    {label="Strong";   color="#059669"; bg="#f0fdf4"; icon="💪";}
  else if(mcf<=0 || coc<0.04) {label="Weak";     color="#dc2626"; bg="#fef2f2"; icon="📉";}
  else                         {label="Moderate"; color="#2563eb"; bg="#eff6ff"; icon="📊";}
  return {label, color, bg, icon, mcf, coc, cum5yrCF};
}

// ── PILLAR 3: CAPITAL EFFICIENCY ──
function calcCapitalPillar(metrics) {
  const {ti=0, pp=0, rate=7.5, term=30, down=20, mcf=0} = metrics;
  const loan  = pp * (1 - down/100);
  const bal5  = loanBalance(loan, rate, term, 5);
  const pd5   = loan - bal5;
  const cf5   = mcf * 12 * 5;
  const ratio = ti>0 ? (pd5 + cf5) / ti : 0;
  const recovery = mcf*12>0&&ti>0 ? Math.ceil(ti/(mcf*12)) : null;
  let label, color, bg, icon;
  if(ratio>0.30)       {label="Strong";   color="#059669"; bg="#f0fdf4"; icon="🏆";}
  else if(ratio>=0.15) {label="Moderate"; color="#2563eb"; bg="#eff6ff"; icon="⚙️";}
  else                 {label="Low";      color="#dc2626"; bg="#fef2f2"; icon="🔻";}
  return {label, color, bg, icon, ratio, paydown5:Math.round(pd5), cf5:Math.round(cf5), recovery};
}

// ── DETERMINISTIC VERDICT ──
function calcVerdict(survival, income, capital, riskTol="standard") {
  if(survival.label==="Fail"||survival.label==="Structural Fail"||survival.label==="Critical")
    return {label:"Avoid", color:"#dc2626", bg:"#fef2f2", icon:"🚫",
            reason:"Survival failure — deal does not meet minimum safety criteria."};

  if(survival.label==="Fragile") {
    if(riskTol==="conservative")
      return {label:"Avoid", color:"#dc2626", bg:"#fef2f2", icon:"🚫",
              reason:"Fragile survival is unacceptable at conservative risk tolerance."};
    if(riskTol==="standard" && income.label==="Weak")
      return {label:"Avoid", color:"#dc2626", bg:"#fef2f2", icon:"🚫",
              reason:"Fragile survival with weak income — too much risk at standard tolerance."};
    if(riskTol==="aggressive" && income.label!=="Weak")
      return {label:"Borderline", color:"#d97706", bg:"#fffbeb", icon:"⚠️",
              reason:"Fragile survival accepted at aggressive tolerance."};
    return {label:"Borderline", color:"#d97706", bg:"#fffbeb", icon:"⚠️",
            reason:"Fragile survival — income partially compensates but risk is elevated."};
  }

  if(survival.label==="Strong" && income.label==="Strong" && capital.label==="Strong")
    return {label:"Strong Buy", color:"#059669", bg:"#f0fdf4", icon:"🎯",
            reason:"Durable cash flow, strong debt coverage, and efficient capital deployment."};

  if(income.label==="Weak")
    return {label:"Borderline", color:"#d97706", bg:"#fffbeb", icon:"⚠️",
            reason:"Survival metrics acceptable but income quality is insufficient."};

  if((survival.label==="Strong"||survival.label==="Stable") && income.label!=="Weak")
    return {label:"Proceed", color:"#2563eb", bg:"#eff6ff", icon:"✅",
            reason:"Solid fundamentals. Review flagged items before committing capital."};

  return {label:"Borderline", color:"#d97706", bg:"#fffbeb", icon:"⚠️",
          reason:"Mixed signals — stable structure but income or capital needs improvement."};
}

// ── RISK FLAGS ──
function buildRiskFlags(metrics) {
  const {mcf=0, coc=0, dscr=0, beo=0, ltv=0, rate=7.5} = metrics;
  const {stressCF} = calcStressTest(metrics);
  const flags = [];
  if(dscr<1.0)       flags.push({severity:"Critical",  label:`DSCR ${dscr.toFixed(2)}x`,          cause:"Debt service exceeds net operating income.",            consequence:"Lender will not finance. Any vacancy triggers default.",          lever:"Price"});
  else if(dscr<1.15) flags.push({severity:"High",      label:`DSCR ${dscr.toFixed(2)}x`,          cause:`Near minimum at ${rate}% rate.`,                        consequence:"One vacancy event breaches coverage. Refi risk is real.",        lever:"Rent or Price"});
  if(mcf<0)          flags.push({severity:"High",      label:`Negative carry ${fmtD(mcf)}/mo`,    cause:"Total costs exceed rental income.",                      consequence:"You subsidize the property every month from your pocket.",        lever:"Rent or Expenses"});
  else if(mcf<100)   flags.push({severity:"Moderate",  label:`Thin buffer ${fmtD(mcf)}/mo`,       cause:"Cash buffer insufficient for routine repairs.",           consequence:"One unexpected expense wipes 3–6 months of cash flow.",          lever:"Rent"});
  if(beo>=0.95)      flags.push({severity:"Structural",label:`Break-even ${(beo*100).toFixed(1)}%`,cause:`Only ${((1-beo)*100).toFixed(1)}% vacancy tolerance.`,  consequence:"One month vacancy causes losses.",                               lever:"Price or Expenses"});
  else if(beo>=0.88) flags.push({severity:"Moderate",  label:`Break-even ${(beo*100).toFixed(1)}%`,cause:"Limited vacancy buffer.",                               consequence:"Extended vacancy will produce losses.",                           lever:"Price"});
  if(stressCF<0)     flags.push({severity:"High",      label:"Fails stress test",                  cause:"Rent −10%, vacancy +5%, expenses +10% → negative CF.", consequence:"Deal doesn't survive moderate market stress.",                   lever:"Price or Rent"});
  if(coc<0.04)       flags.push({severity:"High",      label:`CoC ${(coc*100).toFixed(1)}%`,      cause:"Return below risk-free alternatives.",                   consequence:"Capital earns more in Treasury bonds without landlord risk.",    lever:"Price or Rent"});
  else if(coc<0.08)  flags.push({severity:"Moderate",  label:`CoC ${(coc*100).toFixed(1)}%`,      cause:"Below 8% institutional benchmark.",                      consequence:"Marginal return for capital and effort deployed.",               lever:"Rent"});
  if(ltv>=0.85)      flags.push({severity:"Moderate",  label:`LTV ${(ltv*100).toFixed(0)}%`,      cause:"High leverage amplifies losses.",                        consequence:"Limited equity cushion for market downturns.",                   lever:"Down Payment"});
  return flags.slice(0,6);
}

// ── FIX-THE-DEAL TARGETS (with % delta, ranked by smallest change) ──
function buildFixTargets(metrics) {
  const {mcf=0,coc=0,dscr=0,rent=0,expenses=0,mortgage=0,pp=0,ti=0,
         rate=7.5,term=30,down=20,cc=0,rehab=0,vacancy=0,capex=0} = metrics;
  const annualCF = mcf*12;
  const fixTargets = [];
  const delta = (t,b) => { if(!b) return ""; const d=(t-b)/Math.abs(b)*100; return `${d>=0?"+":""}${d.toFixed(1)}%`; };

  if(coc<0.08&&ti>0) {
    const needACF=ti*0.08, tRent=rent+(needACF-annualCF)/12;
    let lo=50000,hi=pp*1.5,tPP=pp;
    for(let k=0;k<80;k++){const mid=(lo+hi)/2,L=mid*(1-down/100),rr=rate/100/12,nn=term*12,m=L*(rr*Math.pow(1+rr,nn))/(Math.pow(1+rr,nn)-1),nTI=mid*down/100+cc+rehab;((rent-expenses-m)*12/Math.max(nTI,1))>0.08?hi=mid:lo=mid;tPP=mid;}
    if(tPP<50000)tPP=pp*0.75;
    let lo2=down,hi2=50,tDown=down;
    for(let k=0;k<60;k++){const mid=(lo2+hi2)/2,L=pp*(1-mid/100),rr=rate/100/12,nn=term*12,m=L*(rr*Math.pow(1+rr,nn))/(Math.pow(1+rr,nn)-1),nTI=pp*mid/100+cc+rehab;((rent-expenses-m)*12/Math.max(nTI,1))>0.08?hi2=mid:lo2=mid;tDown=mid;}
    const tPP_r=Math.round(tPP/5000)*5000, tRent_r=Math.round(tRent/50)*50, tDown_r=Math.round(tDown);
    const opts=[
      {icon:"🏷️",label:"Purchase price",value:fmtD(tPP_r),            delta:delta(tPP_r,pp),                    feasible:tPP_r>=pp*0.70},
      {icon:"💰",label:"Monthly rent",  value:fmtD(tRent_r)+"/mo",    delta:delta(tRent_r,rent),                 feasible:(tRent_r-rent)/Math.max(rent,1)<=0.15},
      {icon:"📥",label:"Down payment",  value:tDown_r+"%",             delta:`+${(tDown_r-down).toFixed(0)}pp`, feasible:tDown_r<=40},
    ];
    fixTargets.push({goal:"8% CoC",options:opts.sort((a,b)=>Math.abs(parseFloat(a.delta||"99"))-Math.abs(parseFloat(b.delta||"99")))});
  }

  if(dscr<1.25&&mortgage>0) {
    const fxNoVac=expenses-(vacancy||0),tRent=mortgage*1.25+fxNoVac+(vacancy||0)+capex;
    const maxL=(rent-expenses)/1.25/(rate/100/12)*(1-1/Math.pow(1+rate/100/12,term*12));
    const tRent_r=Math.round(tRent/50)*50, tL_r=Math.round(Math.max(0,maxL)/5000)*5000;
    const opts=[
      {icon:"💰",label:"Monthly rent",value:fmtD(tRent_r)+"/mo",delta:delta(tRent_r,rent),          feasible:(tRent_r-rent)/Math.max(rent,1)<=0.12},
      {icon:"🏦",label:"Max loan",    value:fmtD(tL_r),          delta:delta(tL_r,pp*(1-down/100)), feasible:tL_r>=pp*0.50},
    ];
    fixTargets.push({goal:"DSCR 1.25",options:opts.sort((a,b)=>Math.abs(parseFloat(a.delta||"99"))-Math.abs(parseFloat(b.delta||"99")))});
  }

  if(mcf<300) {
    const def=300-mcf, tRent=rent+def;
    let lo3=50000,hi3=pp*1.2,tPP=pp;
    for(let k=0;k<60;k++){const mid=(lo3+hi3)/2,L=mid*(1-down/100),rr=rate/100/12,nn=term*12,m=L*(rr*Math.pow(1+rr,nn))/(Math.pow(1+rr,nn)-1);(rent-expenses-m>=300)?hi3=mid:lo3=mid;tPP=mid;}
    const tRent_r=Math.round(tRent/50)*50, tPP_r=Math.round(Math.max(0,tPP)/5000)*5000;
    const opts=[
      {icon:"💰",label:"Monthly rent",  value:fmtD(tRent_r)+"/mo",delta:delta(tRent_r,rent), feasible:def/Math.max(rent,1)<=0.15},
      {icon:"🏷️",label:"Purchase price",value:fmtD(tPP_r),        delta:delta(tPP_r,pp),     feasible:tPP_r>=pp*0.70},
    ];
    fixTargets.push({goal:"$300/mo CF",options:opts.sort((a,b)=>Math.abs(parseFloat(a.delta||"99"))-Math.abs(parseFloat(b.delta||"99")))});
  }

  const {stressCF} = calcStressTest(metrics);
  if(stressCF<0) {
    const def=Math.abs(stressCF), tRent=Math.round((rent+def/0.85)/50)*50;
    fixTargets.push({goal:"Survive stress",options:[
      {icon:"💰",label:"Monthly rent",     value:fmtD(tRent)+"/mo",               delta:delta(tRent,rent),                       feasible:def<rent*0.20},
      {icon:"✂️", label:"Expense reduction",value:"≥ "+fmtD(Math.round(def/10)*10)+"/mo", delta:"-"+(def/Math.max(expenses,1)*100).toFixed(1)+"%", feasible:true},
    ]});
  }

  return fixTargets;
}

// ── MASTER SCORER ──
function calcRentalScore(metrics, riskTol="standard", monteResult=null) {
  const pNegCF    = monteResult?.pNegCF ?? 50;
  const survival  = calcSurvivalPillar(metrics, pNegCF);
  const income    = calcIncomePillar(metrics);
  const capital   = calcCapitalPillar(metrics);
  const verdict   = calcVerdict(survival, income, capital, riskTol);
  const flags     = buildRiskFlags(metrics);
  const fixTargets = buildFixTargets(metrics);
  const {stressCF, stressDSCR} = calcStressTest(metrics);
  const gates     = checkHardFails(metrics);
  return {survival, income, capital, verdict, flags, fixTargets, stressCF, stressDSCR, gates};
}

// ══ CHART COMPONENTS (unchanged) ══

function LineChart({data, color="#10b981", height=100, fill=true}) {
  if(!data||data.length<2) return null;
  const min=Math.min(0,...data.map(d=>d.y));
  const max=Math.max(...data.map(d=>d.y),1);
  const W=300, H=height, pad=4;
  const xScale=i=>(i/(data.length-1))*(W-pad*2)+pad;
  const yScale=v=>H-pad-(((v-min)/(max-min||1))*(H-pad*2));
  const pts=data.map((d,i)=>`${xScale(i)},${yScale(d.y)}`).join(" ");
  const fillPts=`${pad},${H-pad} ${pts} ${W-pad},${H-pad}`;
  const zeroY=yScale(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height,overflow:"visible"}}>
      <defs>
        <linearGradient id={`lg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
        </linearGradient>
      </defs>
      {min<0&&<line x1={pad} y1={zeroY} x2={W-pad} y2={zeroY} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4,3"/>}
      {fill&&<polygon points={fillPts} fill={`url(#lg-${color.replace("#","")})`}/>}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {data.map((d,i)=>(
        <g key={i}>
          <circle cx={xScale(i)} cy={yScale(d.y)} r="3.5" fill={d.y>=0?color:"#dc2626"} stroke="white" strokeWidth="1.5"/>
          <text x={xScale(i)} y={H} textAnchor="middle" fontSize="8" fill="#9ca3af">{d.label}</text>
        </g>
      ))}
    </svg>
  );
}

function DualBarChart({data, height=100}) {
  if(!data||data.length===0) return null;
  const maxVal=Math.max(...data.map(d=>Math.max(d.a||0,d.b||0)),1);
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:4,height,paddingBottom:16}}>
      {data.map((d,i)=>(
        <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:1,height:"100%",justifyContent:"flex-end"}}>
          <div style={{width:"100%",display:"flex",gap:2,alignItems:"flex-end",height:height-16}}>
            <div style={{flex:1,background:"#bbf7d0",borderRadius:"2px 2px 0 0",height:`${Math.round((d.a||0)/maxVal*100)}%`,minHeight:2,transition:"height 0.5s ease"}}/>
            <div style={{flex:1,background:"#7c3aed",borderRadius:"2px 2px 0 0",height:`${Math.round((d.b||0)/maxVal*100)}%`,minHeight:2,transition:"height 0.5s ease"}}/>
          </div>
          <div style={{fontSize:8,color:"#9ca3af"}}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

function ProbabilityBar({label, pct, humanLabel}) {
  const color=pct>=60?"#dc2626":pct>=40?"#ea580c":pct>=25?"#d97706":"#059669";
  const bgColor=pct>=60?"#fef2f2":pct>=40?"#fff7ed":pct>=25?"#fffbeb":"#f0fdf4";
  return(
    <div style={{background:bgColor,borderRadius:10,padding:"12px 14px",border:`1px solid ${color}20`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:2}}>P({label})</div>
          <div style={{fontSize:10,color:"#9ca3af",fontStyle:"italic"}}>{humanLabel}</div>
        </div>
        <div style={{fontSize:20,fontWeight:900,fontFamily:"'DM Mono',monospace",color,lineHeight:1}}>{pct}%</div>
      </div>
      <div style={{height:5,background:"rgba(0,0,0,0.06)",borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:3,transition:"width 0.7s cubic-bezier(0.34,1.2,0.64,1)"}}/>
      </div>
    </div>
  );
}

function ScoreComponentBar({label, score, weight, color}) {
  return(
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <span style={{fontSize:11,color:"#6b7280"}}>{label}</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:9,color:"#9ca3af"}}>{weight}</span>
          <span style={{fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace",color,minWidth:28,textAlign:"right"}}>{score}</span>
        </div>
      </div>
      <div style={{height:4,background:"#f3f4f6",borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${score}%`,background:color,borderRadius:2,transition:"width 0.5s ease"}}/>
      </div>
    </div>
  );
}

function InputSection({title, accent="#10b981", children, badge, defaultOpen=true}) {
  const [open,setOpen]=useState(defaultOpen);
  return(
    <div style={{background:"white",borderRadius:12,border:"1.5px solid #f0f0f0",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"none",border:"none",cursor:"pointer",borderBottom:open?"1px solid #f9fafb":"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:3,height:14,borderRadius:2,background:accent,flexShrink:0}}/>
          <span style={{fontSize:11,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:"0.07em"}}>{title}</span>
          {badge&&<span style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:"#6b7280",background:"#f3f4f6",padding:"2px 8px",borderRadius:100}}>{badge}</span>}
        </div>
        <span style={{fontSize:11,color:"#9ca3af",transform:open?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
      </button>
      {open&&<div style={{padding:"12px 16px 14px"}}>{children}</div>}
    </div>
  );
}

function NF({label, value, onChange, prefix, suffix, step=1, min=0}) {
  const [focused,setFocused]=useState(false);
  return(
    <div>
      {label&&<div style={{fontSize:10,fontWeight:600,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{label}</div>}
      <div style={{display:"flex",alignItems:"center",border:`1.5px solid ${focused?"#10b981":"#e5e7eb"}`,borderRadius:8,background:"white",overflow:"hidden",transition:"border-color 0.15s"}}>
        {prefix&&<span style={{fontSize:12,color:"#9ca3af",paddingLeft:9,flexShrink:0}}>{prefix}</span>}
        <input type="number" value={value} onChange={e=>onChange(e.target.value)}
          onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
          style={{flex:1,border:"none",outline:"none",fontSize:14,fontWeight:600,color:"#111827",fontFamily:"'DM Mono',monospace",padding:"8px 4px",background:"transparent",minWidth:0}}/>
        {suffix&&<span style={{fontSize:11,color:"#9ca3af",paddingRight:8,flexShrink:0}}>{suffix}</span>}
        <div style={{display:"flex",flexDirection:"column",borderLeft:"1px solid #f3f4f6"}}>
          <button onClick={()=>onChange(Math.max(min,+value+step))} style={{border:"none",background:"none",cursor:"pointer",padding:"4px 7px",fontSize:9,color:"#9ca3af",lineHeight:1,display:"flex",alignItems:"center"}}>▲</button>
          <button onClick={()=>onChange(Math.max(min,+value-step))} style={{border:"none",background:"none",cursor:"pointer",padding:"4px 7px",fontSize:9,color:"#9ca3af",lineHeight:1,borderTop:"1px solid #f3f4f6",display:"flex",alignItems:"center"}}>▼</button>
        </div>
      </div>
    </div>
  );
}

function OSlider({label, value, onChange, min, max, step=1, display}) {
  const pct=Math.max(0,Math.min(100,((value-min)/(max-min||1))*100));
  return(
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
        <span style={{fontSize:11,color:"#6b7280"}}>{label}</span>
        <span style={{fontSize:13,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#111827"}}>{display(value)}</span>
      </div>
      <div style={{position:"relative",height:20,display:"flex",alignItems:"center"}}>
        <div style={{position:"absolute",inset:"0",height:5,top:"50%",transform:"translateY(-50%)",background:"#f3f4f6",borderRadius:3}}>
          <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#10b981,#059669)",borderRadius:3}}/>
        </div>
        <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)}
          style={{position:"absolute",width:"100%",opacity:0,cursor:"pointer",height:20,zIndex:2}}/>
        <div style={{position:"absolute",left:`${pct}%`,transform:"translateX(-50%)",width:15,height:15,borderRadius:"50%",background:"white",border:"2.5px solid #10b981",boxShadow:"0 2px 5px rgba(0,0,0,0.15)",pointerEvents:"none",zIndex:1}}/>
      </div>
    </div>
  );
}

// ══ MAIN RENTAL CALC v6 ═══════════════════════════════════════════════════════
function RentalCalc({saved,onCalcChange,profile,isPro:isProProp,onActivatePro,allDeals=[],currentDealId=null}) {
  const [addr,setAddr]=useState(saved?.address||"");
  const [viewMode,setViewMode]=useState("snapshot");
  const [optPP,setOptPP]=useState(null);
  const [optRent,setOptRent]=useState(null);
  const [optDown,setOptDown]=useState(null);
  const [optTarget,setOptTarget]=useState("$300CF");
  const [exitTab,setExitTab]=useState(0);
  const [riskTol,setRiskTol]=useState("standard");

  const isPro=isProProp||profile?.is_pro||false;

  const [i,setI]=useState(saved||{
    pp:320000,down:20,rate:7.5,term:30,cc:8500,rehab:0,
    rent:2800,otherIncome:0,
    taxes:350,insurance:120,vacancy:140,repairs:100,capex:100,mgmt:224,utilities:0,hoa:0,
    appreciation:3,rentGrowth:2,expenseGrowth:2,
  });
  const sv=k=>v=>setI(p=>({...p,[k]:v}));

  const mort=useMemo(()=>{
    const L=(+(optPP??i.pp))*(1-(+(optDown??i.down))/100);
    const r=+i.rate/100/12,n=+i.term*12;
    if(r===0||n===0) return L/Math.max(n,1);
    return L*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1);
  },[i,optPP,optDown]);

  const totalExp=useMemo(()=>+i.taxes+ +i.insurance+ +i.vacancy+ +i.repairs+ +i.capex+ +i.mgmt+ +i.utilities+ +i.hoa,[i]);

  const c=useMemo(()=>{
    const effPP=+(optPP??i.pp), effDown=+(optDown??i.down), effRent=(+(optRent??i.rent))+(+(i.otherIncome||0));
    const da=effPP*effDown/100, ti=da+ +i.cc+ +i.rehab;
    const noi=(effRent-(totalExp-+i.capex))*12;
    const mcf=effRent-totalExp-mort, acf=mcf*12;
    const capRate=effPP>0?noi/effPP:0;
    const coc=ti>0?acf/ti:0;
    const dscr=mort>0?(effRent-(totalExp-+i.capex))/mort:0;
    const beo=(totalExp-+i.vacancy+mort)>0?(totalExp-+i.vacancy+mort)/Math.max(effRent,1):0;
    const ltv=effPP>0?(effPP*(1-effDown/100))/effPP:0;
    const loan=effPP*(1-effDown/100);
    const proj=[1,5,10,15,20,30].map(yr=>{
      const rentY=effRent*Math.pow(1+(+i.rentGrowth||2)/100,yr);
      const expY=totalExp*Math.pow(1+(+i.expenseGrowth||2)/100,yr);
      const valY=effPP*Math.pow(1+(+i.appreciation||3)/100,yr);
      const bal=loanBalance(loan,+i.rate,+i.term,yr);
      return{yr,rent:Math.round(rentY),val:Math.round(valY),equity:Math.round(valY-bal),mcf:Math.round(rentY-expY-mort),bal:Math.round(bal)};
    });
    return{da,ti,noi,mcf,acf,capRate,coc,dscr,beo,ltv,loan,proj,effPP,effDown,effRent};
  },[i,mort,totalExp,optPP,optDown,optRent]);

  const metrics=useMemo(()=>({
    mcf:c.mcf,coc:c.coc,dscr:c.dscr,beo:c.beo,ltv:c.ltv,rent:c.effRent,
    expenses:totalExp,mortgage:mort,pp:c.effPP,rate:+i.rate,term:+i.term,
    down:c.effDown,ti:c.ti,appreciation:+i.appreciation||3,
    rentGrowth:+i.rentGrowth||2,expenseGrowth:+i.expenseGrowth||2,
    vacancy:+i.vacancy,capex:+i.capex,cc:+i.cc,rehab:+i.rehab,
  }),[c,totalExp,mort,i]);

  const riskData=useMemo(()=>calcRentalScore(metrics,riskTol,monte),[metrics,riskTol,monte]);

  useEffect(()=>{setOptPP(null);setOptRent(null);setOptDown(null);},[i.pp,i.rent,i.down]);
  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.mcf),secondary:fmtP(c.coc),label:"Mo. Cash Flow",label2:"CoC ROI"}),[i,c,addr]);

  const pp=+(optPP??i.pp), optRentVal=+(optRent??i.rent), down=+(optDown??i.down);

  const annualCF=c.mcf*12;
  const payback=annualCF>0&&c.ti>0?c.ti/annualCF:Infinity;
  const snapFlags=[
    {label:"DSCR ≥ 1.15",     pass:c.dscr>=1.15,         value:c.dscr.toFixed(2)+"x"},
    {label:"Cash Flow ≥ $0",   pass:c.mcf>=0,             value:fmtD(c.mcf)+"/mo"},
    {label:"Break-even ≤ 90%", pass:c.beo<=0.90,           value:(c.beo*100).toFixed(1)+"%"},
    {label:"Payback ≤ 7 yrs",  pass:isFinite(payback)&&payback<=7, value:isFinite(payback)?payback.toFixed(1)+" yrs":"Never"},
  ];
  const passCount=snapFlags.filter(f=>f.pass).length;
  const snapResult=passCount===4?"Pass":passCount>=2?"Borderline":"Fail";
  const snapColor=snapResult==="Pass"?"#059669":snapResult==="Borderline"?"#d97706":"#dc2626";
  const snapBg=snapResult==="Pass"?"#f0fdf4":snapResult==="Borderline"?"#fffbeb":"#fef2f2";

  let cumCF=0;
  const cfChartData=c.proj.map(p=>{cumCF+=p.mcf*12; return{y:Math.round(cumCF),label:`Y${p.yr}`};});
  const exitScenarios=exits||[];

  const {verdict,survival,income,capital} = riskData;
  const vColor=verdict.color, vBg=verdict.bg;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:0}}>
      <AddressBar value={addr} onChange={setAddr}/>

      {/* ══ HEADER STRIP ══ */}
      <div style={{background:"linear-gradient(135deg,#0f172a 0%,#1a2744 100%)",borderRadius:16,padding:"18px 20px",marginBottom:18,boxShadow:"0 6px 28px rgba(0,0,0,0.22)"}}>

        {/* Row 1: Verdict + Pillars + Snapshot */}
        <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:14,flexWrap:"wrap"}}>
          {/* Verdict card */}
          <div style={{background:vBg,borderRadius:10,padding:"10px 14px",flexShrink:0,minWidth:120}}>
            <div style={{fontSize:9,color:"#6b7280",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.07em",marginBottom:3}}>Decision</div>
            <div style={{fontSize:17,fontWeight:900,color:vColor,lineHeight:1,marginBottom:4}}>{verdict.icon} {verdict.label}</div>
            <div style={{fontSize:9,color:vColor,opacity:0.85,lineHeight:1.3,maxWidth:145}}>{verdict.reason}</div>
          </div>

          {/* Three pillars */}
          <div style={{display:"flex",gap:5,flex:1,minWidth:0}}>
            {[{name:"Survival",d:survival},{name:"Income",d:income},{name:"Capital",d:capital}].map(({name,d})=>(
              <div key={name} style={{flex:1,background:d.bg,borderRadius:8,padding:"8px 10px",border:`1.5px solid ${d.color}25`,minWidth:0}}>
                <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.06em",marginBottom:3,whiteSpace:"nowrap"}}>{name}</div>
                <div style={{fontSize:12,fontWeight:900,color:d.color,whiteSpace:"nowrap"}}>{d.icon} {d.label}</div>
              </div>
            ))}
          </div>

          {/* Snapshot pill */}
          <div style={{background:snapBg,borderRadius:10,padding:"8px 14px",flexShrink:0,textAlign:"center"}}>
            <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:1}}>Snapshot</div>
            <div style={{fontSize:15,fontWeight:900,color:snapColor}}>{snapResult}</div>
          </div>
        </div>

        {/* Row 2: KPI strip */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:1,background:"rgba(255,255,255,0.05)",borderRadius:10,overflow:"hidden",marginBottom:14}}>
          {[
            ["Cash Flow", fmtD(c.mcf)+"/mo", c.mcf>=200?"#6ee7b7":c.mcf>=0?"#fde68a":"#fca5a5"],
            ["CoC",       fmtP(c.coc),        c.coc>=0.08?"#6ee7b7":c.coc>=0.04?"#fde68a":"#fca5a5"],
            ["DSCR",      c.dscr.toFixed(2)+"x", c.dscr>=1.25?"#6ee7b7":c.dscr>=1.15?"#fde68a":"#fca5a5"],
            ["Cap Rate",  fmtP(c.capRate),    "#e2e8f0"],
            ["Cash Req.", fmtM(c.ti),         "#e2e8f0"],
          ].map(([l,v,col])=>(
            <div key={l} style={{padding:"10px 8px",textAlign:"center"}}>
              <div style={{fontSize:8,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.06em",marginBottom:3}}>{l}</div>
              <div style={{fontSize:12,fontWeight:800,fontFamily:"'DM Mono',monospace",color:col,lineHeight:1}}>{v}</div>
            </div>
          ))}
        </div>

        {/* Row 3: Mode selector */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
          {[
            ["snapshot","🧮","Snapshot","Fast screening"],
            ["projection","📊","Projection","Hold modeling"],
            ["decision","🧠","Decision","Risk + optimization"],
          ].map(([key,icon,label,sub])=>(
            <button key={key} onClick={()=>setViewMode(key)}
              style={{padding:"8px 10px",borderRadius:8,border:`1.5px solid ${viewMode===key?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.07)"}`,background:viewMode===key?"rgba(255,255,255,0.10)":"transparent",cursor:"pointer",textAlign:"left",transition:"all 0.15s"}}>
              <div style={{fontSize:12}}>{icon} <span style={{fontSize:11,fontWeight:700,color:viewMode===key?"white":"rgba(255,255,255,0.45)"}}>{label}</span></div>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.25)",marginTop:1}}>{sub}</div>
            </button>
          ))}
        </div>
      </div>
      {/* ══ MAIN GRID ══ */}
      <div className="calc-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,alignItems:"start"}}>

        {/* ── LEFT: INPUTS ── */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <InputSection title="Acquisition" accent="#10b981" key={`acq-${viewMode}`} defaultOpen={viewMode!=="decision"} badge={viewMode==="decision"?`${fmtD(c.effPP)} · ${fmtD(mort)}/mo`:undefined}>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <NF label="Purchase Price" value={i.pp} onChange={sv("pp")} prefix="$" step={5000}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <NF label="Down %" value={i.down} onChange={sv("down")} suffix="%" step={1}/>
                <NF label="Rate %" value={i.rate} onChange={sv("rate")} suffix="%" step={0.125}/>
                <NF label="Term" value={i.term} onChange={sv("term")} suffix="yr" step={5}/>
                <NF label="Closing $" value={i.cc} onChange={sv("cc")} prefix="$" step={500}/>
              </div>
              <NF label="Rehab" value={i.rehab} onChange={sv("rehab")} prefix="$" step={1000}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",background:"#f0fdf4",borderRadius:8,border:"1px solid #bbf7d0",marginTop:2}}>
                <span style={{fontSize:10,color:"#6b7280"}}>{fmtD(c.loan)} loan · {i.rate}% · {i.term}yr</span>
                <span style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#059669"}}>{fmtD(mort)}/mo</span>
              </div>
            </div>
          </InputSection>

          <InputSection title="Income" accent="#10b981" key={`inc-${viewMode}`} defaultOpen={viewMode!=="decision"} badge={viewMode==="decision"?`${fmtD(c.effRent)}/mo`:undefined}>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <NF label="Monthly Rent" value={i.rent} onChange={sv("rent")} prefix="$" step={50}/>
              <NF label="Other Income" value={i.otherIncome||0} onChange={sv("otherIncome")} prefix="$" step={25}/>
            </div>
          </InputSection>

          <InputSection title="Operating Expenses" accent="#6b7280" defaultOpen={false} badge={`${fmtD(totalExp)}/mo`}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["Taxes",sv("taxes"),i.taxes,25],["Insurance",sv("insurance"),i.insurance,10],["Vacancy",sv("vacancy"),i.vacancy,25],["Repairs",sv("repairs"),i.repairs,25],["CapEx",sv("capex"),i.capex,25],["Mgmt",sv("mgmt"),i.mgmt,25],["Utilities",sv("utilities"),i.utilities,25],["HOA",sv("hoa"),i.hoa,25]]
              .map(([l,fn,v,s])=><NF key={l} label={l} value={v} onChange={fn} prefix="$" step={s}/>)}
            </div>
          </InputSection>

          {viewMode==="projection"&&(
            <InputSection title="Growth Assumptions" accent="#7c3aed" defaultOpen={false}>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <NF label="Appreciation %" value={i.appreciation||3} onChange={sv("appreciation")} suffix="%" step={0.5}/>
                <NF label="Rent Growth %" value={i.rentGrowth||2} onChange={sv("rentGrowth")} suffix="%" step={0.5}/>
                <NF label="Expense Inflation %" value={i.expenseGrowth||2} onChange={sv("expenseGrowth")} suffix="%" step={0.5}/>
              </div>
            </InputSection>
          )}
        </div>

        {/* ── RIGHT: MODE-DRIVEN ── */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>

          {/* ════ SNAPSHOT MODE ════ */}
          {viewMode==="snapshot"&&(<>

            {/* Pass/Fail Gates */}
            <div style={{background:"white",borderRadius:12,border:`2px solid ${snapColor}30`,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
              <div style={{background:snapBg,padding:"12px 16px",borderBottom:`1px solid ${snapColor}20`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:snapColor,textTransform:"uppercase",letterSpacing:"0.07em"}}>Screening Result</div>
                  <div style={{fontSize:10,color:"#6b7280",marginTop:2}}>4 pass/fail criteria</div>
                </div>
                <div style={{fontSize:22,fontWeight:900,color:snapColor,fontFamily:"'DM Mono',monospace"}}>{snapResult}</div>
              </div>
              <div style={{padding:"10px 16px"}}>
                {snapFlags.map((f,idx)=>(
                  <div key={f.label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 0",borderBottom:idx<3?"1px solid #f9fafb":"none",gap:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:13,lineHeight:1}}>{f.pass?"✅":"❌"}</span>
                      <span style={{fontSize:12,color:"#374151",fontWeight:600}}>{f.label}</span>
                    </div>
                    <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:f.pass?"#059669":"#dc2626",fontWeight:700}}>{f.value}</span>
                  </div>
                ))}
              </div>
              <div style={{padding:"10px 16px",borderTop:"1px solid #f9fafb",display:"flex",gap:8}}>
                <button onClick={()=>setViewMode("decision")} style={{flex:1,padding:"8px",borderRadius:8,border:"none",background:"#111827",color:"white",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  🧠 Diagnose in Decision Mode
                </button>
                <button onClick={()=>setViewMode("projection")} style={{flex:1,padding:"8px",borderRadius:8,border:"1.5px solid #e5e7eb",background:"white",color:"#374151",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                  📊 Long-term Projection
                </button>
              </div>
            </div>

            {/* Deal Snapshot */}
            <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",padding:"16px",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:14}}>Deal Snapshot</div>
              {[
                ["Monthly Cash Flow", fmtD(c.mcf)+"/mo",       c.mcf>=0?"#059669":"#dc2626", true],
                ["DSCR",             c.dscr.toFixed(2)+"x",   c.dscr>=1.25?"#059669":c.dscr>=1.15?"#d97706":"#dc2626", false],
                ["Cash-on-Cash ROI", fmtP(c.coc),             c.coc>=0.08?"#059669":c.coc>=0.04?"#d97706":"#dc2626", false],
                ["Cap Rate",         fmtP(c.capRate),          "#374151", false],
                ["Break-even Occ.",  fmtP(c.beo),             c.beo<=0.85?"#059669":c.beo<=0.90?"#d97706":"#dc2626", false],
                ["Cash Required",    fmtD(c.ti),               "#374151", false],
                ["Mortgage Payment", fmtD(mort)+"/mo",         "#374151", false],
                ["NOI (annual)",     fmtD(c.noi),              "#374151", false],
                ["Annual Cash Flow", fmtD(c.acf),             c.acf>=0?"#059669":"#dc2626", false],
              ].map(([l,v,col,hl],idx,arr)=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:idx<arr.length-1?"1px solid #f9fafb":"none",gap:8}}>
                  <span style={{fontSize:12,color:"#6b7280",flex:1}}>{l}</span>
                  <span style={{fontSize:hl?15:13,fontWeight:hl?800:600,fontFamily:"'DM Mono',monospace",color:col,flexShrink:0}}>{v}</span>
                </div>
              ))}
            </div>

            {/* Sensitivity — 4 rows, spec-defined */}
            <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",padding:"16px",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>Sensitivity Analysis</div>
              {(()=>{
                const fixedExpNoVac=totalExp-+i.vacancy;
                const ratePlus1_r=(+i.rate+1)/100/12, n=+i.term*12;
                const loanAmt=c.effPP*(1-c.effDown/100);
                const mortPlus1=loanAmt*(ratePlus1_r*Math.pow(1+ratePlus1_r,n))/(Math.pow(1+ratePlus1_r,n)-1);
                const dscrPlus1=mortPlus1>0?(c.effRent-(totalExp-+i.capex))/mortPlus1:0;
                const cfPlus1=c.effRent-totalExp-mortPlus1;
                return [
                  {label:"Base case",       cf:c.mcf,              dscr:null,     isBase:true},
                  {label:"Rent −10%",       cf:c.effRent*0.9-totalExp-mort, dscr:null, isBase:false},
                  {label:"Vacancy +5%",     cf:c.effRent*(1-0.05)-fixedExpNoVac-(+i.vacancy)-+i.capex-mort, dscr:null, isBase:false},
                  {label:"Expenses +10%",   cf:c.effRent-totalExp*1.10-mort, dscr:null, isBase:false},
                  {label:"Rate +1%",        cf:cfPlus1,           dscr:dscrPlus1, isBase:false},
                ];
              })().map((row,idx,arr)=>(
                <div key={row.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:idx<arr.length-1?"1px solid #f9fafb":"none",gap:8}}>
                  <span style={{fontSize:12,color:row.isBase?"#374151":"#6b7280",fontWeight:row.isBase?700:400,flex:1}}>{row.label}</span>
                  <div style={{display:"flex",gap:12,alignItems:"center"}}>
                    {row.dscr!=null&&<span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:row.dscr>=1.15?"#059669":"#dc2626"}}>DSCR {row.dscr.toFixed(2)}x</span>}
                    <span style={{fontSize:row.isBase?14:12,fontWeight:row.isBase?800:600,fontFamily:"'DM Mono',monospace",color:row.cf>=0?"#059669":"#dc2626",flexShrink:0}}>{fmtD(row.cf)}/mo</span>
                  </div>
                </div>
              ))}
            </div>
          </>)}

          {/* ════ PROJECTION MODE ════ */}
          {viewMode==="projection"&&(
            <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
              <>
                {/* Exit scenarios */}
                <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
                  <div style={{padding:"12px 16px",borderBottom:"1px solid #f3f4f6",background:"linear-gradient(135deg,#f0fdf4,#ecfdf5)"}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#059669",textTransform:"uppercase",letterSpacing:"0.07em"}}>Exit Scenario Modeling</div>
                  </div>
                  <div style={{display:"flex",borderBottom:"1px solid #f3f4f6",overflowX:"auto"}}>
                    {["Hold 10yr","Sell Yr 5","Refi Yr 3"].map((l,idx)=>(
                      <button key={idx} onClick={()=>setExitTab(idx)}
                        style={{flex:1,padding:"9px 8px",border:"none",borderBottom:`2.5px solid ${exitTab===idx?"#059669":"transparent"}`,background:"transparent",color:exitTab===idx?"#059669":"#9ca3af",fontSize:11,fontWeight:exitTab===idx?700:500,cursor:"pointer",whiteSpace:"nowrap"}}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {exitScenarios[exitTab]&&(()=>{
                    const e=exitScenarios[exitTab];
                    return(
                      <div style={{padding:"14px 16px"}}>
                        {e.note&&<div style={{fontSize:11,color:"#6b7280",background:"#f9fafb",padding:"8px 10px",borderRadius:8,marginBottom:12}}>{e.note}</div>}
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          {[
                            ["Property Value",fmtD(e.value),"#374151"],
                            ["Equity at Exit",fmtD(e.equity),"#7c3aed"],
                            e.irr!=null?["IRR",`${((e.irr||0)*100).toFixed(1)}%`,e.irr>=0.15?"#059669":"#d97706"]:["Cash Out",fmtD(e.cashReturned),"#059669"],
                            e.multiple!=null?["Equity Multiple",`${(e.multiple||0).toFixed(2)}x`,(e.multiple||0)>=1.5?"#059669":"#d97706"]:["New Loan Bal",fmtD(e.loanBal),"#6b7280"],
                          ].filter(Boolean).map(([l,v,col])=>(
                            <div key={l} style={{background:"#f9fafb",borderRadius:8,padding:"10px 12px"}}>
                              <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:4}}>{l}</div>
                              <div style={{fontSize:16,fontWeight:800,fontFamily:"'DM Mono',monospace",color:col}}>{v}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Charts — dominant visual */}
                <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",padding:"18px",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#7c3aed",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Property Value vs Equity</div>
                  <DualBarChart data={c.proj.map(p=>({a:p.val,b:Math.max(0,p.equity),label:`Y${p.yr}`}))} height={120}/>
                  <div style={{display:"flex",gap:14,justifyContent:"center",marginTop:4}}>
                    {[["#bbf7d0","Value"],["#7c3aed","Equity"]].map(([col,l])=>(
                      <div key={l} style={{display:"flex",alignItems:"center",gap:5}}>
                        <div style={{width:8,height:8,borderRadius:2,background:col}}/>
                        <span style={{fontSize:9,color:"#9ca3af"}}>{l}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{height:1,background:"#f3f4f6",margin:"16px 0"}}/>
                  <div style={{fontSize:10,fontWeight:700,color:"#059669",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Cumulative Cash Flow</div>
                  <LineChart data={cfChartData} color={cfChartData[cfChartData.length-1]?.y>=0?"#10b981":"#dc2626"} height={90}/>

                  <div style={{height:1,background:"#f3f4f6",margin:"16px 0"}}/>
                  <div style={{fontSize:10,fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Loan Paydown</div>
                  <LineChart data={c.proj.map(p=>({y:p.bal,label:`Y${p.yr}`}))} color="#9ca3af" height={80} fill={false}/>
                </div>

                {/* Hold table — last */}
                <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
                  <div style={{padding:"10px 16px",borderBottom:"1px solid #f3f4f6",fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.07em"}}>Hold Projections</div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                      <thead><tr style={{background:"#f9fafb"}}>{["Yr","Value","Equity","Rent/mo","CF/mo"].map(h=><th key={h} style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:"#9ca3af",fontSize:9,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                      <tbody>{c.proj.map((p,idx)=>(
                        <tr key={idx} style={{borderTop:"1px solid #f9fafb"}}>
                          <td style={{padding:"7px 10px",fontWeight:700,color:"#374151",textAlign:"right"}}>{p.yr}</td>
                          <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"'DM Mono',monospace",color:"#059669",fontWeight:600}}>{fmtM(p.val)}</td>
                          <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"'DM Mono',monospace",color:"#7c3aed",fontWeight:600}}>{fmtM(p.equity)}</td>
                          <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"'DM Mono',monospace",color:"#374151"}}>{fmtD(p.rent)}</td>
                          <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"'DM Mono',monospace",color:p.mcf>=0?"#059669":"#dc2626",fontWeight:700}}>{fmtD(p.mcf)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              </>
            </ProGate>
          )}

          {/* ════ DECISION MODE ════ */}
          {viewMode==="decision"&&(
            <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
              <>
                {/* A: VERDICT HEADER */}
                <div style={{background:vBg,borderRadius:12,border:`2px solid ${vColor}30`,padding:"16px 18px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:200}}>
                      <div style={{fontSize:9,fontWeight:700,color:vColor,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Decision Engine</div>
                      <div style={{fontSize:24,fontWeight:900,color:vColor,lineHeight:1,marginBottom:6}}>{verdict.icon} {verdict.label}</div>
                      <div style={{fontSize:12,color:"#374151",lineHeight:1.5}}>{verdict.reason}</div>
                    </div>
                    {/* Risk tolerance — interpretation layer only */}
                    <div style={{flexShrink:0}}>
                      <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:6,textAlign:"right"}}>Risk Tolerance</div>
                      <div style={{display:"flex",gap:4}}>
                        {[["conservative","🛡️"],["standard","⚖️"],["aggressive","🚀"]].map(([key,icon])=>(
                          <button key={key} onClick={()=>setRiskTol(key)}
                            style={{padding:"5px 8px",borderRadius:7,border:`1.5px solid ${riskTol===key?vColor:"#e5e7eb"}`,background:riskTol===key?vBg:"white",color:riskTol===key?vColor:"#6b7280",fontSize:10,fontWeight:700,cursor:"pointer",transition:"all 0.12s",textTransform:"capitalize"}}>
                            {icon} {key.slice(0,4)}.
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* B: PILLAR CARDS — structural, categorical, no weights */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>

                  {/* ── SURVIVAL PILLAR ── */}
                  {(()=>{
                    const d=survival;
                    const isHardFail=d.label==="Fail"||d.label==="Structural Fail";
                    const diagnosis=
                      d.label==="Strong"?"Debt well covered. Vacancy buffer is healthy. Stress-tested as resilient.":
                      d.label==="Stable"?"Coverage adequate. Manageable vacancy tolerance with limited stress margin.":
                      d.label==="Fragile"?"Debt coverage fragile. One vacancy event could breach break-even.":
                      d.label==="Critical"?"Near-zero margin. Minor stress event eliminates coverage.":
                      d.label==="Structural Fail"?"Break-even requires 95%+ occupancy — structurally unsustainable.":
                      "Debt service exceeds income. This deal cannot support its own leverage.";
                    return(
                      <div style={{background:"white",borderRadius:12,border:`2px solid ${d.color}${isHardFail?"":"25"}`,overflow:"hidden",boxShadow:isHardFail?`0 0 0 1px ${d.color}40`:"0 1px 4px rgba(0,0,0,0.05)"}}>
                        <div style={{padding:"10px 14px",background:d.bg,borderBottom:`1.5px solid ${d.color}30`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:14}}>🧱</span>
                            <span style={{fontSize:9,fontWeight:800,color:d.color,textTransform:"uppercase",letterSpacing:"0.08em"}}>Survival</span>
                          </div>
                          <span style={{fontSize:11,fontWeight:900,color:d.color,background:`${d.color}18`,padding:"2px 8px",borderRadius:100}}>{d.label}</span>
                        </div>
                        <div style={{padding:"12px 14px"}}>
                          {[
                            ["DSCR",           c.dscr.toFixed(2)+"x",       c.dscr>=1.25?"#059669":c.dscr>=1.05?"#d97706":"#dc2626"],
                            ["Break-even",     (c.beo*100).toFixed(1)+"%",   c.beo<=0.85?"#059669":c.beo<=0.92?"#d97706":"#dc2626"],
                            ["P(Neg CF)",      (monte?.pNegCF??50)+"%",      (monte?.pNegCF??50)<30?"#059669":(monte?.pNegCF??50)<60?"#d97706":"#dc2626"],
                          ].map(([l,v,col])=>(
                            <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:"1px solid #f9fafb",gap:4}}>
                              <span style={{fontSize:11,color:"#9ca3af"}}>{l}</span>
                              <span style={{fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace",color:col}}>{v}</span>
                            </div>
                          ))}
                          <div style={{marginTop:10,padding:"8px 10px",background:`${d.color}08`,borderRadius:8,border:`1px solid ${d.color}18`}}>
                            <p style={{fontSize:10,color:"#374151",margin:0,lineHeight:1.5,fontStyle:"italic"}}>{diagnosis}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── INCOME QUALITY PILLAR ── */}
                  {(()=>{
                    const d=income;
                    const diagnosis=
                      d.label==="Strong"?"Property generates distributable cash flow above institutional benchmarks.":
                      d.label==="Moderate"?"Property pays modestly. Below benchmark but positive cash-on-cash.":
                      "Property does not produce distributable income at current inputs.";
                    return(
                      <div style={{background:"white",borderRadius:12,border:`2px solid ${d.color}25`,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
                        <div style={{padding:"10px 14px",background:d.bg,borderBottom:`1.5px solid ${d.color}30`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:14}}>💵</span>
                            <span style={{fontSize:9,fontWeight:800,color:d.color,textTransform:"uppercase",letterSpacing:"0.08em"}}>Income</span>
                          </div>
                          <span style={{fontSize:11,fontWeight:900,color:d.color,background:`${d.color}18`,padding:"2px 8px",borderRadius:100}}>{d.label}</span>
                        </div>
                        <div style={{padding:"12px 14px"}}>
                          {[
                            ["Monthly CF",  fmtD(c.mcf)+"/mo",               c.mcf>=300?"#059669":c.mcf>=0?"#d97706":"#dc2626"],
                            ["CoC Return",  fmtP(c.coc),                      c.coc>=0.08?"#059669":c.coc>=0.04?"#d97706":"#dc2626"],
                            ["5yr Cash",    fmtD(income.cum5yrCF),             income.cum5yrCF>0?"#059669":"#dc2626"],
                          ].map(([l,v,col])=>(
                            <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:"1px solid #f9fafb",gap:4}}>
                              <span style={{fontSize:11,color:"#9ca3af"}}>{l}</span>
                              <span style={{fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace",color:col}}>{v}</span>
                            </div>
                          ))}
                          <div style={{marginTop:10,padding:"8px 10px",background:`${d.color}08`,borderRadius:8,border:`1px solid ${d.color}18`}}>
                            <p style={{fontSize:10,color:"#374151",margin:0,lineHeight:1.5,fontStyle:"italic"}}>{diagnosis}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── CAPITAL EFFICIENCY PILLAR ── */}
                  {(()=>{
                    const d=capital;
                    const diagnosis=
                      d.label==="Strong"?"Capital working efficiently across amortization and cash flow.":
                      d.label==="Moderate"?"Capital growth driven primarily by amortization. Cash contribution limited.":
                      "Capital barely recovering through operations. Returns depend heavily on appreciation.";
                    return(
                      <div style={{background:"white",borderRadius:12,border:`2px solid ${d.color}25`,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
                        <div style={{padding:"10px 14px",background:d.bg,borderBottom:`1.5px solid ${d.color}30`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:14}}>🏦</span>
                            <span style={{fontSize:9,fontWeight:800,color:d.color,textTransform:"uppercase",letterSpacing:"0.08em"}}>Capital</span>
                          </div>
                          <span style={{fontSize:11,fontWeight:900,color:d.color,background:`${d.color}18`,padding:"2px 8px",borderRadius:100}}>{d.label}</span>
                        </div>
                        <div style={{padding:"12px 14px"}}>
                          {[
                            ["Cash Required",  fmtD(c.ti),                                   "#374151"],
                            ["5yr Paydown",    fmtD(capital.paydown5),                        "#059669"],
                            ["Efficiency",     (capital.ratio*100).toFixed(0)+"%",             d.color],
                          ].map(([l,v,col])=>(
                            <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:"1px solid #f9fafb",gap:4}}>
                              <span style={{fontSize:11,color:"#9ca3af"}}>{l}</span>
                              <span style={{fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace",color:col}}>{v}</span>
                            </div>
                          ))}
                          <div style={{marginTop:10,padding:"8px 10px",background:`${d.color}08`,borderRadius:8,border:`1px solid ${d.color}18`}}>
                            <p style={{fontSize:10,color:"#374151",margin:0,lineHeight:1.5,fontStyle:"italic"}}>{diagnosis}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                </div>

                {/* C: HARD FAIL SECTION */}
                {riskData.gates.fails.length>0&&(
                  <div style={{background:"#fef2f2",borderRadius:10,border:"1.5px solid #fecaca",padding:"12px 16px"}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#dc2626",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>⛔ Hard-Fail Gates</div>
                    {riskData.gates.fails.map((f,idx)=>(
                      <div key={idx} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 0",borderBottom:idx<riskData.gates.fails.length-1?"1px solid #fecaca40":"none"}}>
                        <span style={{fontSize:12,flexShrink:0}}>⛔</span>
                        <div>
                          <div style={{fontSize:12,fontWeight:700,color:"#dc2626"}}>{f.rule} <span style={{color:"#374151",fontWeight:600}}>({f.value})</span></div>
                          <div style={{fontSize:11,color:"#6b7280",marginTop:1}}>{f.consequence}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* D: RISK DIAGNOSIS CARDS */}
                {riskData.flags.length>0&&(
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Risk Diagnosis</div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {riskData.flags.map((f,idx)=>{
                        const sc=f.severity==="Critical"?"#dc2626":f.severity==="Structural"?"#7c3aed":f.severity==="High"?"#ea580c":"#d97706";
                        const bg=f.severity==="Critical"?"#fef2f2":f.severity==="Structural"?"#f5f3ff":f.severity==="High"?"#fff7ed":"#fffbeb";
                        return(
                          <div key={idx} style={{background:bg,borderRadius:10,padding:"13px 15px",border:`1.5px solid ${sc}20`}}>
                            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,gap:8}}>
                              <span style={{fontSize:10,fontWeight:800,color:sc,textTransform:"uppercase",letterSpacing:"0.05em"}}>{f.severity}</span>
                              <span style={{fontSize:10,fontWeight:700,color:sc,background:`${sc}15`,padding:"1px 7px",borderRadius:100,textTransform:"uppercase",flexShrink:0}}>Fix: {f.lever}</span>
                            </div>
                            <p style={{fontSize:13,color:"#111827",margin:"0 0 3px",fontWeight:700}}>{f.label}</p>
                            <p style={{fontSize:11,color:"#6b7280",margin:"0 0 3px",lineHeight:1.5}}>{f.cause}</p>
                            <p style={{fontSize:11,color:"#6b7280",margin:0,lineHeight:1.5,fontStyle:"italic"}}>{f.consequence}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* E: OPTIMIZATION ENGINE */}
                <div style={{background:"white",borderRadius:12,border:"1.5px solid #bbf7d0",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
                  <div style={{padding:"12px 16px",background:"#f0fdf4",borderBottom:"1px solid #e0fce8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:"#065f46",textTransform:"uppercase",letterSpacing:"0.06em"}}>🎯 Optimization Engine</div>
                      <div style={{fontSize:10,color:"#6b7280"}}>Exact targets, ranked smallest % change first</div>
                    </div>
                    <div style={{background:vBg,borderRadius:8,padding:"5px 10px",border:`1px solid ${vColor}30`}}>
                      <span style={{fontSize:11,fontWeight:800,color:vColor}}>{verdict.icon} {verdict.label}</span>
                    </div>
                  </div>

                  <div style={{padding:"12px 16px 6px"}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
                      {[
                        ["Cash Flow",fmtD(c.mcf)+"/mo",c.mcf>=0?"#059669":"#dc2626"],
                        ["CoC",fmtP(c.coc),c.coc>=0.08?"#059669":"#d97706"],
                        ["DSCR",c.dscr.toFixed(2)+"x",c.dscr>=1.25?"#059669":"#d97706"],
                      ].map(([l,v,col])=>(
                        <div key={l} style={{background:"#f9fafb",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                          <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:2}}>{l}</div>
                          <div style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono',monospace",color:col}}>{v}</div>
                        </div>
                      ))}
                    </div>

                    <OSlider label="Purchase Price" value={pp} onChange={v=>setOptPP(v)}
                      min={Math.round(+i.pp*0.55)} max={Math.round(+i.pp*1.2)} step={5000}
                      display={v=>`$${Math.round(v/1000)}K`}/>
                    <OSlider label="Monthly Rent" value={optRentVal} onChange={v=>setOptRent(v)}
                      min={Math.round(+i.rent*0.65)} max={Math.round(+i.rent*1.5)} step={50}
                      display={v=>`$${v.toLocaleString()}/mo`}/>
                    <OSlider label="Down Payment" value={down} onChange={v=>setOptDown(v)}
                      min={5} max={50} step={1} display={v=>`${v}%`}/>

                    <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",marginBottom:10,marginTop:4}}>
                      <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.06em",marginRight:4}}>Target:</div>
                      {["8% CoC","DSCR 1.25","$300/mo CF","Survive stress"].map(t=>(
                        <button key={t} onClick={()=>setOptTarget(t)}
                          style={{padding:"4px 10px",borderRadius:100,border:`1.5px solid ${optTarget===t?"#059669":"#e5e7eb"}`,background:optTarget===t?"#f0fdf4":"white",color:optTarget===t?"#059669":"#6b7280",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                          {t}
                        </button>
                      ))}
                    </div>

                    {(()=>{
                      const fix=riskData.fixTargets.find(f=>f.goal===optTarget||f.goal.includes(optTarget.split(" ")[0])||optTarget.includes(f.goal.split(" ")[0]));
                      if(!fix) return(
                        <div style={{padding:"10px",background:"#f0fdf4",borderRadius:8,textAlign:"center",fontSize:12,color:"#059669",fontWeight:700,marginBottom:10}}>✅ Already meets {optTarget}</div>
                      );
                      return(
                        <div style={{padding:"12px",background:"#f9fafb",borderRadius:10,border:"1px solid #e5e7eb",marginBottom:10}}>
                          <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:8}}>To reach <strong>{optTarget}</strong>, choose ONE:</div>
                          {fix.options.map((opt,oi)=>(
                            <div key={oi} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 0",borderBottom:oi<fix.options.length-1?"1px solid #f3f4f6":"none"}}>
                              <span style={{fontSize:14,flexShrink:0,marginTop:1}}>{opt.icon}</span>
                              <div style={{flex:1}}>
                                <div style={{fontSize:11,color:"#374151",fontWeight:600,marginBottom:3}}>{opt.label}</div>
                                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                  <span style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#059669"}}>{opt.value}</span>
                                  <span style={{fontSize:11,color:"#9ca3af",fontFamily:"'DM Mono',monospace"}}>{opt.delta}</span>
                                  {opt.feasible===false&&<span style={{fontSize:9,color:"#dc2626",background:"#fef2f2",padding:"1px 5px",borderRadius:100,fontWeight:700}}>Hard</span>}
                                  {opt.feasible===true&&<span style={{fontSize:9,color:"#059669",background:"#f0fdf4",padding:"1px 5px",borderRadius:100,fontWeight:700}}>✓ Feasible</span>}
                                </div>
                              </div>
                              {oi===0&&<span style={{fontSize:9,color:"#059669",background:"#f0fdf4",padding:"2px 7px",borderRadius:100,fontWeight:700,flexShrink:0,marginTop:2}}>Easiest</span>}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* F: PROBABILITY ENGINE */}
                {monte&&(
                  <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
                    <div style={{padding:"11px 16px",borderBottom:"1px solid #f3f4f6",background:"#f5f3ff"}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#6d28d9",textTransform:"uppercase",letterSpacing:"0.06em"}}>🎲 Probability Engine</div>
                      <div style={{fontSize:9,color:"#9ca3af",marginTop:2}}>1,000 Monte Carlo trials · Rent ±15% · Vacancy 0–20% · Expenses ±20%</div>
                    </div>
                    <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
                      <ProbabilityBar label="Negative Cash Flow" pct={monte.pNegCF}
                        humanLabel={monte.pNegCF>=60?`${Math.round(monte.pNegCF/20)} in 5 scenarios lose money.`:monte.pNegCF>=40?"Nearly half of scenarios produce losses.":"Most scenarios stay cash-flow positive."}/>
                      <ProbabilityBar label="DSCR below 1.0" pct={monte.pDSCR}
                        humanLabel={monte.pDSCR>=50?"More than half breach lender minimum.":monte.pDSCR>=30?"Significant debt coverage risk.":"Debt coverage holds in most scenarios."}/>
                      <ProbabilityBar label="Capital Infusion Required" pct={monte.pCapInfusion}
                        humanLabel={monte.pCapInfusion>=50?"1 in 2 scenarios require extra capital.":monte.pCapInfusion>=30?"Meaningful chance of capital call.":"Capital call risk is low."}/>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:4}}>
                        {[
                          ["Median outcome",fmtD(monte.median)+"/mo",monte.median>=0?"#059669":"#dc2626","50% of runs land here or better"],
                          ["Worst 10%",fmtD(monte.worst10)+"/mo","#dc2626","Bottom decile outcome"],
                        ].map(([l,v,col,sub])=>(
                          <div key={l} style={{background:"#f9fafb",borderRadius:8,padding:"10px 12px"}}>
                            <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:3}}>{l}</div>
                            <div style={{fontSize:16,fontWeight:800,fontFamily:"'DM Mono',monospace",color:col}}>{v}</div>
                            <div style={{fontSize:9,color:"#9ca3af",marginTop:2}}>{sub}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* G: LIQUIDITY */}
                {liq&&(
                  <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
                    <div style={{padding:"11px 16px",borderBottom:"1px solid #f3f4f6",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:14}}>💧</span>
                        <span style={{fontSize:11,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:"0.06em"}}>Liquidity</span>
                      </div>
                      <span style={{fontSize:10,fontWeight:700,color:liq.riskColor,background:`${liq.riskColor}15`,padding:"3px 10px",borderRadius:100}}>{liq.riskLevel}</span>
                    </div>
                    <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:7}}>
                      {[
                        ["Capital Required",      fmtD(liq.capitalRequired),   "#374151"],
                        ["5-Yr Principal Paydown", fmtD(liq.principalPaydown5), "#059669"],
                        ["Annual Cash Flow",        fmtD(liq.annualCF),          liq.annualCF>=0?"#059669":"#dc2626"],
                        ["Capital Recovery Time",   capital.recovery?capital.recovery+" yrs":"Never", capital.recovery&&capital.recovery<=12?"#d97706":"#dc2626"],
                      ].map(([l,v,col])=>(
                        <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid #f9fafb",gap:8}}>
                          <span style={{fontSize:12,color:"#6b7280",flex:1}}>{l}</span>
                          <span style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:col,flexShrink:0}}>{v}</span>
                        </div>
                      ))}
                      <p style={{fontSize:11,color:liq.riskColor,background:`${liq.riskColor}10`,padding:"8px 10px",borderRadius:8,marginTop:4,fontWeight:600,lineHeight:1.4}}>{liq.riskReason}</p>
                    </div>
                  </div>
                )}
              </>
            </ProGate>
          )}
        </div>
      </div>
    </div>
  );
}


function WholesaleCalc({saved,onCalcChange,isPro:isProProp,onActivatePro}) {
  const [addr,setAddr]=useState(saved?.address||"");
  const [advMode,setAdvMode]=useState(false);
  const [arvAdj,setArvAdj]=useState(0);
  const [profitMode,setProfitMode]=useState("fixed");
  const [i,setI]=useState(saved||{arv:240000,repairs:28000,pct:70,fee:9000,holding:3500,closing:4000,profitTarget:25000,profitPct:10});
  const s=k=>v=>setI(p=>({...p,[k]:v}));

  const adjArv=useMemo(()=>+i.arv*(1+arvAdj/100),[i.arv,arvAdj]);

  const c=useMemo(()=>{
    let mao;
    if(!advMode){
      mao=adjArv*+i.pct/100-+i.repairs-+i.fee;
    } else {
      const profitAmt=profitMode==="pct"?adjArv*+i.profitPct/100:+i.profitTarget;
      mao=adjArv-+i.repairs-+i.holding-+i.closing-profitAmt-+i.fee;
    }
    const spread=adjArv-mao;
    const investorMargin=adjArv-mao-+i.repairs;
    const feeOfSpread=spread>0?+i.fee/spread:0;
    const marginPct=adjArv>0?mao/adjArv:0;
    const strength=mao>0&&marginPct>0.45?"green":mao>0?"yellow":"red";
    return{mao,spread,investorMargin,feeOfSpread,strength,adjArv,marginPct};
  },[i,advMode,arvAdj,profitMode]);

  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.mao),secondary:fmtD(+i.fee),label:"MAO",label2:"Your Fee"}),[i,c,addr]);

  const [calcTab,setCalcTab]=useState("calc");
  const isPro=isProProp||false; // wire to profile.is_pro when Stripe ready
  const dmMetrics={mao:c.mao,arv:+i.arv,repairs:+i.repairs,fee:+i.fee,margin:c.marginPct};

  return (<>
    <AddressBar value={addr} onChange={setAddr}/>
    <div style={{display:"flex",gap:6,marginBottom:16,background:"#f3f4f6",borderRadius:10,padding:3}}>
      {[["calc","🏠 Calculator"],["decision","🧠 Decision Mode"]].map(([key,label])=>(
        <button key={key} onClick={()=>setCalcTab(key)} style={{flex:1,padding:"7px 12px",borderRadius:8,border:"none",background:calcTab===key?"white":"transparent",color:calcTab===key?"#111827":"#6b7280",fontSize:12,fontWeight:calcTab===key?700:500,cursor:"pointer",boxShadow:calcTab===key?"0 1px 4px rgba(0,0,0,0.08)":"none",transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
          {label}{key==="decision"&&!isPro&&<span style={{fontSize:9,background:"#f0fdf4",color:"#059669",padding:"1px 5px",borderRadius:100,fontWeight:700}}>PRO</span>}
        </button>
      ))}
    </div>
    {calcTab==="decision"&&<DecisionMode metrics={dmMetrics} strategy="wholesale" isPro={isPro} onActivatePro={onActivatePro}/>}
    {calcTab==="calc"&&<>
    {/* Mode toggle */}
    <div style={{display:"flex",gap:8,marginBottom:16}}>
      {[[false,"Basic (70% Rule)"],[true,"Advanced Mode"]].map(([adv,label])=>(
        <button key={String(adv)} onClick={()=>setAdvMode(adv)} style={{padding:"7px 18px",borderRadius:100,border:`1.5px solid ${advMode===adv?"#2563eb":"#e5e7eb"}`,background:advMode===adv?"#eff6ff":"white",color:advMode===adv?"#2563eb":"#6b7280",fontSize:12,fontWeight:700,cursor:"pointer"}}>{label}</button>
      ))}
    </div>
    {/* ARV Sensitivity */}
    <div style={{background:"#eff6ff",borderRadius:10,padding:"12px 16px",border:"1.5px solid #bfdbfe",marginBottom:18}}>
      <div style={{fontSize:10,fontWeight:700,color:"#2563eb",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>ARV Sensitivity</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {[[-10,"−10%"],[-5,"−5%"],[0,"Base"],[5,"+5%"]].map(([val,label])=>(
          <button key={val} onClick={()=>setArvAdj(val)} style={{padding:"5px 14px",borderRadius:100,border:`1.5px solid ${arvAdj===val?"#2563eb":"#bfdbfe"}`,background:arvAdj===val?"#2563eb":"white",color:arvAdj===val?"white":"#2563eb",fontSize:12,fontWeight:700,cursor:"pointer"}}>{label}</button>
        ))}
      </div>
      {arvAdj!==0&&<div style={{fontSize:11,color:"#2563eb",marginTop:6,fontWeight:600}}>Adjusted ARV: {fmtD(c.adjArv)} ({arvAdj>0?"+":""}{arvAdj}% from stated)</div>}
    </div>

    <div className="calc-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Divider label="Deal Details"/>
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/>
        <Field label="Estimated Repairs" value={i.repairs} onChange={s("repairs")} prefix="$" step={1000}/>
        <Field label="Wholesale Fee" value={i.fee} onChange={s("fee")} prefix="$" step={500}/>
        {!advMode&&<Field label="Max Offer %" value={i.pct} onChange={s("pct")} suffix="%" step={1}/>}
        {advMode&&(<>
          <Divider label="Advanced Costs"/>
          <Field label="Holding Costs" value={i.holding} onChange={s("holding")} prefix="$" step={500}/>
          <Field label="Closing Costs" value={i.closing} onChange={s("closing")} prefix="$" step={500}/>
          <Divider label="Investor Profit Target"/>
          <div style={{display:"flex",gap:8,marginBottom:4}}>
            {[["fixed","Fixed $"],["pct","% of ARV"]].map(([m,label])=>(
              <button key={m} onClick={()=>setProfitMode(m)} style={{padding:"5px 12px",borderRadius:100,border:`1.5px solid ${profitMode===m?"#2563eb":"#e5e7eb"}`,background:profitMode===m?"#eff6ff":"white",color:profitMode===m?"#2563eb":"#6b7280",fontSize:11,fontWeight:700,cursor:"pointer"}}>{label}</button>
            ))}
          </div>
          {profitMode==="fixed"
            ?<Field label="Target Investor Profit ($)" value={i.profitTarget} onChange={s("profitTarget")} prefix="$" step={1000}/>
            :<Field label="Target Investor Profit (%)" value={i.profitPct} onChange={s("profitPct")} suffix="%" step={1}/>
          }
        </>)}
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {/* Strength indicator */}
        <div style={{padding:"12px 16px",borderRadius:10,background:c.strength==="green"?"#f0fdf4":c.strength==="yellow"?"#fffbeb":"#fef2f2",border:`1.5px solid ${c.strength==="green"?"#bbf7d0":c.strength==="yellow"?"#fde68a":"#fecaca"}`,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>{c.strength==="green"?"💪":c.strength==="yellow"?"⚠️":"❌"}</span>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:c.strength==="green"?"#059669":c.strength==="yellow"?"#d97706":"#dc2626"}}>{c.strength==="green"?"Strong Wholesale Deal":c.strength==="yellow"?"Thin Margin":"Deal Doesn't Work"}</div>
            <div style={{fontSize:11,color:"#6b7280"}}>MAO is {fmtP(c.marginPct)} of ARV</div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <BigResult label="Max Allowable Offer" value={fmtD(c.mao)} positive={c.mao>0} negative={c.mao<=0}/>
          <BigResult label="Your Fee" value={fmtD(+i.fee)} positive/>
        </div>

        <div style={{background:"#f9fafb",borderRadius:12,padding:"2px 16px"}}>
          <OutRow label="ARV (adjusted)" value={fmtD(c.adjArv)}/>
          {!advMode&&<OutRow label={`ARV × ${i.pct}%`} value={fmtD(c.adjArv*+i.pct/100)}/>}
          {advMode&&<>
            <OutRow label="Minus Repairs" value={`− ${fmtD(+i.repairs)}`}/>
            <OutRow label="Minus Holding" value={`− ${fmtD(+i.holding)}`}/>
            <OutRow label="Minus Closing" value={`− ${fmtD(+i.closing)}`}/>
            <OutRow label="Minus Profit Target" value={`− ${fmtD(profitMode==="pct"?c.adjArv*+i.profitPct/100:+i.profitTarget)}`}/>
            <OutRow label="Minus Fee" value={`− ${fmtD(+i.fee)}`}/>
          </>}
          <OutRow label="Total Spread (ARV − MAO)" value={fmtD(c.spread)}/>
          <OutRow label="Investor Margin After Repairs" value={fmtD(c.investorMargin)} positive={c.investorMargin>0}/>
          <OutRow label="Your Fee % of Spread" value={fmtP(c.feeOfSpread)}/>
          <OutRow label="MAO" value={fmtD(c.mao)} positive={c.mao>0} negative={c.mao<=0} highlight/>
        </div>
      </div>
    </div>
    </>}
  </>);
}
function FlipCalc({saved,onCalcChange,isPro:isProProp,onActivatePro}) {
  const [addr,setAddr]=useState(saved?.address||"");
  const [financing,setFinancing]=useState("cash");
  const [targetMode,setTargetMode]=useState("fixed");
  const [i,setI]=useState(saved||{
    pp:165000,rehab:38000,arv:275000,months:6,
    agent:6,closing:5000,
    taxesMo:200,insuranceMo:150,utilitiesMo:100,
    targetProfit:40000,targetPct:15,
    rate:12,points:2,downPct:20,
  });
  const s=k=>v=>setI(p=>({...p,[k]:v}));

  const c=useMemo(()=>{
    const agentAmt=+i.arv*+i.agent/100;
    const holdingTotal=(+i.taxesMo+ +i.insuranceMo+ +i.utilitiesMo)*+i.months;
    let financingCost=0;
    if(financing!=="cash"){
      const loanAmt=+i.pp*(1-+i.downPct/100);
      financingCost=loanAmt*+i.points/100 + loanAmt*+i.rate/100/12*+i.months;
    }
    const totalCost=+i.pp+ +i.rehab+agentAmt+ +i.closing+holdingTotal+financingCost;
    const profit=+i.arv-totalCost;
    const roi=totalCost>0?profit/totalCost:0;
    const annRoi=+i.months>0?roi*(12/+i.months):roi;
    const profitPctArv=+i.arv>0?profit/+i.arv:0;
    const targetAmt=targetMode==="pct"?+i.arv*+i.targetPct/100:+i.targetProfit;
    const meetsTarget=profit>=targetAmt;
    const risk=profitPctArv>=0.15?"green":profitPctArv>=0.10?"yellow":"red";
    const breakeven=totalCost;
    const reqForTarget=totalCost+targetAmt;
    return{agentAmt,holdingTotal,financingCost,totalCost,profit,roi,annRoi,profitPctArv,targetAmt,meetsTarget,risk,breakeven,reqForTarget};
  },[i,financing,targetMode]);

  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.profit),secondary:fmtP(c.annRoi),label:"Net Profit",label2:"Ann. ROI"}),[i,c,addr]);

  const [calcTab,setCalcTab]=useState("calc");
  const isPro=isProProp||false;
  const dmMetrics={profit:c.profit,arv:+i.arv,roi:c.annRoi,margin:+i.arv>0?c.profit/+i.arv:0,months:+i.months,costs:c.totalCosts,holdingMoCost:(+i.taxesMo+ +i.insuranceMo+ +i.utilitiesMo)};

  return (<>
    <AddressBar value={addr} onChange={setAddr}/>
    <div style={{display:"flex",gap:6,marginBottom:16,background:"#f3f4f6",borderRadius:10,padding:3}}>
      {[["calc","🏠 Calculator"],["decision","🧠 Decision Mode"]].map(([key,label])=>(
        <button key={key} onClick={()=>setCalcTab(key)} style={{flex:1,padding:"7px 12px",borderRadius:8,border:"none",background:calcTab===key?"white":"transparent",color:calcTab===key?"#111827":"#6b7280",fontSize:12,fontWeight:calcTab===key?700:500,cursor:"pointer",boxShadow:calcTab===key?"0 1px 4px rgba(0,0,0,0.08)":"none",transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
          {label}{key==="decision"&&!isPro&&<span style={{fontSize:9,background:"#f0fdf4",color:"#059669",padding:"1px 5px",borderRadius:100,fontWeight:700}}>PRO</span>}
        </button>
      ))}
    </div>
    {calcTab==="decision"&&<DecisionMode metrics={dmMetrics} strategy="flip" isPro={isPro} onActivatePro={onActivatePro}/>}
    {calcTab==="calc"&&<>
    {/* Financing toggle */}
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
      {[["cash","💵 Cash"],["hard","🏦 Hard Money"],["private","🤝 Private Money"],["conventional","🏠 Conventional"]].map(([k,label])=>(
        <button key={k} onClick={()=>setFinancing(k)} style={{padding:"7px 14px",borderRadius:100,border:`1.5px solid ${financing===k?"#d97706":"#e5e7eb"}`,background:financing===k?"#fffbeb":"white",color:financing===k?"#d97706":"#6b7280",fontSize:12,fontWeight:700,cursor:"pointer"}}>{label}</button>
      ))}
    </div>

    <div className="calc-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Divider label="Acquisition"/>
        <Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000}/>
        <Field label="Rehab Costs" value={i.rehab} onChange={s("rehab")} prefix="$" step={1000}/>
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/>
        <Field label="Project Duration" value={i.months} onChange={s("months")} suffix="mo" step={1}/>

        {financing!=="cash"&&(<>
          <Divider label="Financing Costs"/>
          <div className="field-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Field label="Interest Rate" value={i.rate} onChange={s("rate")} suffix="%" step={0.5}/>
            <Field label="Points" value={i.points} onChange={s("points")} suffix="pts" step={0.5}/>
            <Field label="Down Payment" value={i.downPct} onChange={s("downPct")} suffix="%" step={5}/>
          </div>
        </>)}

        <Divider label="Selling Costs"/>
        <Field label="Agent Fees" value={i.agent} onChange={s("agent")} suffix="%" step={0.5}/>
        <Field label="Closing Costs" value={i.closing} onChange={s("closing")} prefix="$" step={500}/>

        <Divider label="Monthly Holding Costs"/>
        <div className="field-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Field label="Taxes/mo" value={i.taxesMo} onChange={s("taxesMo")} prefix="$" step={50}/>
          <Field label="Insurance/mo" value={i.insuranceMo} onChange={s("insuranceMo")} prefix="$" step={25}/>
          <Field label="Utilities/mo" value={i.utilitiesMo} onChange={s("utilitiesMo")} prefix="$" step={25}/>
        </div>

        <Divider label="Target Profit"/>
        <div style={{display:"flex",gap:8,marginBottom:4}}>
          {[["fixed","Fixed $"],["pct","% of ARV"]].map(([m,label])=>(
            <button key={m} onClick={()=>setTargetMode(m)} style={{padding:"5px 12px",borderRadius:100,border:`1.5px solid ${targetMode===m?"#d97706":"#e5e7eb"}`,background:targetMode===m?"#fffbeb":"white",color:targetMode===m?"#d97706":"#6b7280",fontSize:11,fontWeight:700,cursor:"pointer"}}>{label}</button>
          ))}
        </div>
        {targetMode==="fixed"
          ?<Field label="Target Profit ($)" value={i.targetProfit} onChange={s("targetProfit")} prefix="$" step={1000}/>
          :<Field label="Target Profit (% of ARV)" value={i.targetPct} onChange={s("targetPct")} suffix="%" step={1}/>
        }
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {/* Risk + target badge */}
        <div style={{padding:"12px 16px",borderRadius:10,background:c.risk==="green"?"#f0fdf4":c.risk==="yellow"?"#fffbeb":"#fef2f2",border:`1.5px solid ${c.risk==="green"?"#bbf7d0":c.risk==="yellow"?"#fde68a":"#fecaca"}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>{c.risk==="green"?"✅":c.risk==="yellow"?"⚠️":"🔴"}</span>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:c.risk==="green"?"#059669":c.risk==="yellow"?"#d97706":"#dc2626"}}>{c.risk==="green"?"Strong Flip":c.risk==="yellow"?"Thin Margin":"Weak Deal"}</div>
              <div style={{fontSize:11,color:"#6b7280"}}>Profit = {fmtP(c.profitPctArv)} of ARV</div>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:12,fontWeight:700,color:c.meetsTarget?"#059669":"#dc2626"}}>{c.meetsTarget?"✅ Meets Target":"❌ Below Target"}</div>
            <div style={{fontSize:10,color:"#9ca3af"}}>Target: {fmtD(c.targetAmt)}</div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <BigResult label="Net Profit" value={fmtD(c.profit)} positive={c.profit>0} negative={c.profit<=0}/>
          <BigResult label="Annualized ROI" value={fmtP(c.annRoi)} positive={c.annRoi>0.20} negative={c.annRoi<=0}/>
        </div>

        <div style={{background:"#f9fafb",borderRadius:12,padding:"2px 16px"}}>
          <OutRow label="Purchase + Rehab" value={fmtD(+i.pp+ +i.rehab)}/>
          <OutRow label="Agent Fees" value={fmtD(c.agentAmt)}/>
          <OutRow label={`Holding (${i.months} mo)`} value={fmtD(c.holdingTotal)}/>
          {financing!=="cash"&&<OutRow label="Financing Cost" value={fmtD(c.financingCost)}/>}
          <OutRow label="Total Cost" value={fmtD(c.totalCost)}/>
          <OutRow label="Raw ROI" value={fmtP(c.roi)}/>
          <OutRow label="Profit % of ARV" value={fmtP(c.profitPctArv)} positive={c.profitPctArv>=0.15}/>
          <OutRow label="Net Profit" value={fmtD(c.profit)} positive={c.profit>0} negative={c.profit<=0} highlight/>
        </div>

        <div style={{background:"#fffbeb",borderRadius:10,padding:"14px 16px",border:"1.5px solid #fde68a"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#92400e",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Decision Metrics</div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}><span style={{fontSize:12,color:"#6b7280"}}>Breakeven Sale Price</span><span style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"#374151"}}>{fmtD(c.breakeven)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:"#6b7280"}}>Required Sale for Target</span><span style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"#374151"}}>{fmtD(c.reqForTarget)}</span></div>
        </div>      </div>
    </div>
    </>}
  </>);
}
function BRRRRCalc({saved,onCalcChange,isPro:isProProp,onActivatePro}) {
  const [addr,setAddr]=useState(saved?.address||"");
  const [i,setI]=useState(saved||{
    pp:110000,rehab:45000,arv:210000,
    stabilizeMonths:4,holdingMo:600,
    refPct:75,refiRate:7.0,refiTerm:30,refiPoints:1,refiClosing:3500,
    rent:1750,
    taxes:200,insurance:100,vacancy:88,repairs:88,capex:88,mgmt:140,
  });
  const s=k=>v=>setI(p=>({...p,[k]:v}));

  const totalExp=useMemo(()=>+i.taxes+ +i.insurance+ +i.vacancy+ +i.repairs+ +i.capex+ +i.mgmt,[i]);

  const c=useMemo(()=>{
    const holdingCost=+i.holdingMo*+i.stabilizeMonths;
    const totalIn=+i.pp+ +i.rehab+holdingCost;
    const refiAmt=+i.arv*+i.refPct/100;
    const refiCost=refiAmt*+i.refiPoints/100+ +i.refiClosing;
    const netRefi=refiAmt-refiCost;
    const cashLeftInDeal=Math.max(0,totalIn-netRefi);
    const pctRecovered=totalIn>0?Math.min(netRefi/totalIn,1):0;
    const infiniteReturn=cashLeftInDeal<=0;
    // refi mortgage
    const r=+i.refiRate/100/12, n=+i.refiTerm*12;
    const refiPmt=r===0?refiAmt/n:refiAmt*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1);
    const mcf=+i.rent-totalExp-refiPmt;
    const acf=mcf*12;
    const noi=(+i.rent-totalExp)*12;
    const dscr=refiPmt>0?(+i.rent-totalExp)/refiPmt:0;
    const forcedEquity=+i.arv-totalIn;
    const coc=cashLeftInDeal>0?acf/cashLeftInDeal:null;
    const dscrColor=dscr>=1.35?"#059669":dscr>=1.2?"#d97706":"#dc2626";
    return{totalIn,holdingCost,refiAmt,refiCost,netRefi,cashLeftInDeal,pctRecovered,infiniteReturn,refiPmt,mcf,acf,noi,dscr,dscrColor,forcedEquity,coc};
  },[i,totalExp]);

  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.cashLeftInDeal===0?c.netRefi-c.totalIn:-(c.cashLeftInDeal)),secondary:fmtD(c.mcf),label:"Cash Left In",label2:"Mo. Cash Flow"}),[i,c,addr]);

  const [calcTab,setCalcTab]=useState("calc");
  const isPro=isProProp||false;
  const dmMetrics={mcf:c.mcf,coc:c.coc||0,dscr:c.dscr,beo:0,ltv:+i.arv>0?c.refiAmt/+i.arv:0,rent:+i.rent,expenses:totalExp,mortgage:c.refiPmt,pp:+i.pp};

  return (<>
    <AddressBar value={addr} onChange={setAddr}/>
    <div style={{display:"flex",gap:6,marginBottom:16,background:"#f3f4f6",borderRadius:10,padding:3}}>
      {[["calc","🏠 Calculator"],["decision","🧠 Decision Mode"]].map(([key,label])=>(
        <button key={key} onClick={()=>setCalcTab(key)} style={{flex:1,padding:"7px 12px",borderRadius:8,border:"none",background:calcTab===key?"white":"transparent",color:calcTab===key?"#111827":"#6b7280",fontSize:12,fontWeight:calcTab===key?700:500,cursor:"pointer",boxShadow:calcTab===key?"0 1px 4px rgba(0,0,0,0.08)":"none",transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
          {label}{key==="decision"&&!isPro&&<span style={{fontSize:9,background:"#f0fdf4",color:"#059669",padding:"1px 5px",borderRadius:100,fontWeight:700}}>PRO</span>}
        </button>
      ))}
    </div>
    {calcTab==="decision"&&<DecisionMode metrics={dmMetrics} strategy="brrrr" isPro={isPro} onActivatePro={onActivatePro}/>}
    {calcTab==="calc"&&<>
    <div className="calc-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Divider label="Acquisition"/>
        <Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000}/>
        <Field label="Rehab Costs" value={i.rehab} onChange={s("rehab")} prefix="$" step={1000}/>
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/>
        <div className="field-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Field label="Stabilize Months" value={i.stabilizeMonths} onChange={s("stabilizeMonths")} suffix="mo" step={1}/>
          <Field label="Holding Cost/mo" value={i.holdingMo} onChange={s("holdingMo")} prefix="$" step={100}/>
        </div>
        <Divider label="Refinance Terms"/>
        <Field label="Refinance LTV" value={i.refPct} onChange={s("refPct")} suffix="%" step={1}/>
        <div className="field-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Field label="Refi Rate" value={i.refiRate} onChange={s("refiRate")} suffix="%" step={0.125}/>
          <Field label="Refi Term" value={i.refiTerm} onChange={s("refiTerm")} suffix="yr" step={5}/>
          <Field label="Points" value={i.refiPoints} onChange={s("refiPoints")} suffix="pts" step={0.5}/>
          <Field label="Closing Costs" value={i.refiClosing} onChange={s("refiClosing")} prefix="$" step={500}/>
        </div>
        <Divider label="Rental Income"/>
        <Field label="Monthly Rent" value={i.rent} onChange={s("rent")} prefix="$" step={50}/>
        <Divider label="Expenses (monthly)"/>
        <div className="field-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Field label="Taxes" value={i.taxes} onChange={s("taxes")} prefix="$" step={25}/>
          <Field label="Insurance" value={i.insurance} onChange={s("insurance")} prefix="$" step={10}/>
          <Field label="Vacancy" value={i.vacancy} onChange={s("vacancy")} prefix="$" step={25}/>
          <Field label="Repairs" value={i.repairs} onChange={s("repairs")} prefix="$" step={25}/>
          <Field label="CapEx" value={i.capex} onChange={s("capex")} prefix="$" step={25}/>
          <Field label="Mgmt" value={i.mgmt} onChange={s("mgmt")} prefix="$" step={25}/>
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {/* THE BRRRR metric — cash left in deal */}
        <div style={{borderRadius:14,padding:"18px 20px",background:c.infiniteReturn?"linear-gradient(135deg,#064e3b,#065f46)":"#f9fafb",border:`1.5px solid ${c.infiniteReturn?"transparent":c.cashLeftInDeal<10000?"#bbf7d0":"#e5e7eb"}`}}>
          <div style={{fontSize:10,fontWeight:700,color:c.infiniteReturn?"rgba(255,255,255,0.6)":"#9ca3af",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Cash Left In Deal</div>
          <div style={{fontSize:28,fontWeight:800,fontFamily:"'DM Mono',monospace",color:c.infiniteReturn?"#6ee7b7":c.cashLeftInDeal===0?"#059669":"#374151"}}>
            {c.infiniteReturn?"$0 — Fully Recycled 🎯":fmtD(c.cashLeftInDeal)}
          </div>
          <div style={{fontSize:12,color:c.infiniteReturn?"rgba(255,255,255,0.65)":"#6b7280",marginTop:4}}>
            {c.infiniteReturn?"∞ Infinite return — all capital recovered!":
            `${fmtP(c.pctRecovered)} of capital recovered`}
          </div>
        </div>

        {/* Forced equity */}
        <div style={{background:"#f5f3ff",borderRadius:10,padding:"12px 16px",border:"1.5px solid #ddd6fe",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#7c3aed",textTransform:"uppercase",marginBottom:2}}>Forced Equity Created</div>
            <div style={{fontSize:11,color:"#6b7280"}}>ARV − Total Invested</div>
          </div>
          <div style={{fontSize:22,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#7c3aed"}}>{fmtD(c.forcedEquity)}</div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <BigResult label="Monthly Cash Flow" value={fmtD(c.mcf)} positive={c.mcf>=0} negative={c.mcf<0}/>
          <BigResult label="Refi Mortgage" value={fmtD(c.refiPmt)}/>
        </div>

        {/* Transparent cost stack */}
        <div style={{background:"#f9fafb",borderRadius:12,padding:"2px 16px"}}>
          <div style={{padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}><span style={{fontSize:11,fontWeight:700,color:"#374151"}}>Total Invested Breakdown</span></div>
          <OutRow label="  Purchase" value={fmtD(+i.pp)}/>
          <OutRow label="  Rehab" value={fmtD(+i.rehab)}/>
          <OutRow label={`  Holding (${i.stabilizeMonths}mo)`} value={fmtD(c.holdingCost)}/>
          <OutRow label="Total Invested" value={fmtD(c.totalIn)} highlight/>
          <OutRow label="Refi Amount" value={fmtD(c.refiAmt)}/>
          <OutRow label="Refi Costs (pts+closing)" value={fmtD(c.refiCost)}/>
          <OutRow label="Net Refi Proceeds" value={fmtD(c.netRefi)}/>
          <OutRow label="Annual Cash Flow" value={fmtD(c.acf)} positive={c.acf>=0} negative={c.acf<0}/>
          <OutRow label="Cash-on-Cash ROI" value={c.coc===null?"∞ (infinite)":fmtP(c.coc)} positive/>
        </div>

        {/* DSCR */}
        <div style={{background:"#f9fafb",borderRadius:12,padding:"2px 16px"}}>
          <div style={{padding:"8px 0",borderBottom:"1px solid #f3f4f6",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:12,color:"#6b7280"}}>DSCR</span>
            <span style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono',monospace",color:c.dscrColor}}>{c.dscr.toFixed(2)}x {c.dscr>=1.35?"✅":c.dscr>=1.2?"⚠️":"🔴"}</span>
          </div>
          <OutRow label="NOI (annual)" value={fmtD(c.noi)}/>
          <OutRow label="Total Expenses/mo" value={fmtD(totalExp)}/>
        </div>
      </div>
    </div>
    </>}
  </>);
}

// generate offer letter and download
function generateAndDownload(type,inputs,calcs,profile) {
  const date=new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});
  const addr=inputs.address||"[Property Address]";
  const name=profile?.full_name||"Investor";
  const titleLine=profile?.title?`${name}, ${profile.title}`:name;
  const phone=profile?.phone||"";
  const email=profile?.email||"";
  let body="";
  if(type==="subto"){
    body=`Dear Property Owner / Listing Agent,\n\nI am writing to present a formal Subject-To purchase offer for the property located at ${addr}.\n\nOFFER SUMMARY\n─────────────────────────────────────\nStrategy:               Subject-To Existing Financing\nExisting Loan Balance:  ${fmtD(+inputs.balance)}\nDown Payment to Seller: ${fmtD(+inputs.dp)}\nClosing Costs (Buyer):  ${fmtD(+inputs.cc)}\nMonthly Mortgage:       ${fmtD(+inputs.pmt)}\nRent Income:            ${fmtD(+inputs.rent)}\nProjected Cash Flow:    ${fmtD(calcs.mcf)} / month\nProjected Annual ROI:   ${fmtP(calcs.roi)}\n\nTERMS\n─────────────────────────────────────\n1. Buyer takes title subject to the existing mortgage.\n2. Buyer makes all future mortgage payments to keep the loan current.\n3. Seller receives ${fmtD(+inputs.dp)} cash at closing.\n4. Buyer assumes all ownership costs from the date of closing.\n5. Close within 14–21 business days of signed agreement.\n\nThis offer is made in good faith and is subject to standard due diligence.\n\nSincerely,\n\n${titleLine}\n${phone}\n${email}\nDate: ${date}`;
  } else {
    body=`Dear Property Owner / Listing Agent,\n\nI am pleased to present a Novation Agreement offer for the property located at ${addr}.\n\nOFFER SUMMARY\n─────────────────────────────────────\nStrategy:               Novation Agreement\nPurchase Price:         ${fmtD(+inputs.pp)}\nRepair Budget:          ${fmtD(+inputs.repairs)}\nAfter Repair Value:     ${fmtD(+inputs.arv)}\nSeller Payout:          ${fmtD(+inputs.sellerPayout)}\nProjected Net Profit:   ${fmtD(calcs.profit)}\nProjected ROI:          ${fmtP(calcs.roi)}\n\nTERMS\n─────────────────────────────────────\n1. Investor manages sale of the property on Seller's behalf via Novation Agreement.\n2. Investor funds all repairs (estimated ${fmtD(+inputs.repairs)}) to maximize market value.\n3. Property listed and sold at or near ARV of ${fmtD(+inputs.arv)}.\n4. Seller receives guaranteed payout of ${fmtD(+inputs.sellerPayout)} at closing.\n5. All agent commissions, closing costs, and holding expenses covered by Investor.\n\nThis offer is presented in good faith. References available upon request.\n\nSincerely,\n\n${titleLine}\n${phone}\n${email}\nDate: ${date}`;
  }
  const title=type==="subto"?"Subject-To Offer Letter":"Novation Agreement Offer Letter";
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Times New Roman',serif;font-size:12pt;margin:1in;line-height:1.7;color:#1a1a1a;}h1{font-size:18pt;color:#064e3b;border-bottom:2px solid #10b981;padding-bottom:8px;margin-bottom:20px;}pre{white-space:pre-wrap;font-family:'Times New Roman',serif;font-size:11pt;line-height:1.8;}</style></head><body><h1>${title}</h1><pre>${body.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre></body></html>`;
  const blob=new Blob([html],{type:"application/msword"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=`${title.replace(/\s+/g,"_")}.doc`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}

function SubToCalc({saved,onCalcChange,profile,isPro:isProProp,onActivatePro}) {
  const [addr,setAddr]=useState(saved?.address||"");
  const [exitPlan,setExitPlan]=useState("hold");
  const [i,setI]=useState(saved||{
    balance:175000,rate:3.5,yearsLeft:25,pmt:1050,
    dp:8000,cc:2500,
    marketValue:220000,
    rent:1700,
    taxes:180,insurance:90,maintenance:85,vacancy:85,mgmt:136,
    appreciation:3,exitYears:5,
  });
  const s=k=>v=>setI(p=>({...p,[k]:v}));

  const totalExp=useMemo(()=>+i.taxes+ +i.insurance+ +i.maintenance+ +i.vacancy+ +i.mgmt,[i]);

  const c=useMemo(()=>{
    const ti=+i.dp+ +i.cc;
    const equity=+i.marketValue-+i.balance;
    const equityPct=+i.marketValue>0?equity/+i.marketValue:0;
    const immediateEquityGain=equity;
    const mcf=+i.rent-+i.pmt-totalExp;
    const acf=mcf*12;
    const roi=ti>0?acf/ti:0;
    // Exit projection
    const futureValue=+i.marketValue*Math.pow(1+i.appreciation/100,+i.exitYears);
    // rough remaining balance at exit (simple amortization approximation)
    const r=+i.rate/100/12, n=+i.yearsLeft*12;
    const exitN=Math.max(n-+i.exitYears*12,0);
    const futureBal=r>0?+i.balance*(Math.pow(1+r,n)-Math.pow(1+r,n-exitN))/(Math.pow(1+r,n)-1):+i.balance*(exitN/n);
    const futureEquity=futureValue-futureBal;
    const totalProfit=acf*+i.exitYears+futureEquity-ti;
    // Risk
    const risk=mcf>=200?"green":mcf>=0?"yellow":"red";
    return{ti,equity,equityPct,immediateEquityGain,mcf,acf,roi,futureValue,futureBal,futureEquity,totalProfit,risk};
  },[i,totalExp]);

  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.mcf),secondary:fmtP(c.roi),label:"Mo. Cash Flow",label2:"ROI"}),[i,c,addr]);

  const [calcTab,setCalcTab]=useState("calc");
  const isPro=isProProp||profile?.is_pro||false;
  const dmMetrics={mcf:c.mcf,coc:c.roi,dscr:+i.pmt>0?(+i.rent-totalExp)/+i.pmt:0,beo:+i.rent>0?(totalExp+ +i.pmt)/+i.rent:0,ltv:+i.marketValue>0?+i.balance/+i.marketValue:0,rent:+i.rent,expenses:totalExp,mortgage:+i.pmt,pp:+i.marketValue};

  return (<>
    <AddressBar value={addr} onChange={setAddr}/>
    <div style={{display:"flex",gap:6,marginBottom:16,background:"#f3f4f6",borderRadius:10,padding:3}}>
      {[["calc","🏠 Calculator"],["decision","🧠 Decision Mode"]].map(([key,label])=>(
        <button key={key} onClick={()=>setCalcTab(key)} style={{flex:1,padding:"7px 12px",borderRadius:8,border:"none",background:calcTab===key?"white":"transparent",color:calcTab===key?"#111827":"#6b7280",fontSize:12,fontWeight:calcTab===key?700:500,cursor:"pointer",boxShadow:calcTab===key?"0 1px 4px rgba(0,0,0,0.08)":"none",transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
          {label}{key==="decision"&&!isPro&&<span style={{fontSize:9,background:"#f0fdf4",color:"#059669",padding:"1px 5px",borderRadius:100,fontWeight:700}}>PRO</span>}
        </button>
      ))}
    </div>
    {calcTab==="decision"&&<DecisionMode metrics={dmMetrics} strategy="subto" isPro={isPro} onActivatePro={onActivatePro}/>}
    {calcTab==="calc"&&<>
    <div className="calc-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Divider label="Existing Loan"/>
        <Field label="Loan Balance" value={i.balance} onChange={s("balance")} prefix="$" step={5000}/>
        <div className="field-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Field label="Interest Rate" value={i.rate} onChange={s("rate")} suffix="%" step={0.125}/>
          <Field label="Years Remaining" value={i.yearsLeft} onChange={s("yearsLeft")} suffix="yr" step={1}/>
        </div>
        <Field label="Monthly Mortgage (PITI)" value={i.pmt} onChange={s("pmt")} prefix="$" step={25}/>
        <Field label="Current Market Value" value={i.marketValue} onChange={s("marketValue")} prefix="$" step={5000}/>
        <Divider label="Your Investment"/>
        <Field label="Down to Seller" value={i.dp} onChange={s("dp")} prefix="$" step={1000}/>
        <Field label="Closing Costs" value={i.cc} onChange={s("cc")} prefix="$" step={500}/>
        <Divider label="Income"/>
        <Field label="Monthly Rent" value={i.rent} onChange={s("rent")} prefix="$" step={50}/>
        <Divider label="Expenses (monthly)"/>
        <div className="field-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Field label="Taxes" value={i.taxes} onChange={s("taxes")} prefix="$" step={25}/>
          <Field label="Insurance" value={i.insurance} onChange={s("insurance")} prefix="$" step={10}/>
          <Field label="Maintenance" value={i.maintenance} onChange={s("maintenance")} prefix="$" step={25}/>
          <Field label="Vacancy" value={i.vacancy} onChange={s("vacancy")} prefix="$" step={25}/>
          <Field label="Management" value={i.mgmt} onChange={s("mgmt")} prefix="$" step={25}/>
        </div>
        <Divider label="Exit Planning"/>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:4}}>
          {[["hold","Hold Long-Term"],["refi","Refinance"],["sell","Sell"]].map(([k,label])=>(
            <button key={k} onClick={()=>setExitPlan(k)} style={{padding:"5px 12px",borderRadius:100,border:`1.5px solid ${exitPlan===k?"#0891b2":"#e5e7eb"}`,background:exitPlan===k?"#ecfeff":"white",color:exitPlan===k?"#0891b2":"#6b7280",fontSize:11,fontWeight:700,cursor:"pointer"}}>{label}</button>
          ))}
        </div>
        {exitPlan!=="hold"&&(
          <div className="field-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Field label="Exit in (years)" value={i.exitYears} onChange={s("exitYears")} suffix="yr" step={1}/>
            <Field label="Appreciation %" value={i.appreciation} onChange={s("appreciation")} suffix="%" step={0.5}/>
          </div>
        )}
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {/* Risk badge */}
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"11px 14px",borderRadius:10,background:c.risk==="green"?"#f0fdf4":c.risk==="yellow"?"#fffbeb":"#fef2f2",border:`1.5px solid ${c.risk==="green"?"#bbf7d0":c.risk==="yellow"?"#fde68a":"#fecaca"}`}}>
          <span style={{fontSize:18}}>{c.risk==="green"?"✅":c.risk==="yellow"?"⚠️":"🔴"}</span>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:c.risk==="green"?"#059669":c.risk==="yellow"?"#d97706":"#dc2626"}}>{c.risk==="green"?"Strong Sub-To Deal":c.risk==="yellow"?"Marginal Cash Flow":"Negative Cash Flow"}</div>
            <div style={{fontSize:11,color:"#6b7280"}}>Locked in at {i.rate}% — today's rate is much higher</div>
          </div>
        </div>

        {/* Equity position */}
        <div style={{background:"#ecfeff",borderRadius:10,padding:"14px 16px",border:"1.5px solid #a5f3fc"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#0891b2",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Equity Position</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:12,color:"#6b7280"}}>Market Value</span>
            <span style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"#374151"}}>{fmtD(+i.marketValue)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:12,color:"#6b7280"}}>Loan Balance</span>
            <span style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"#374151"}}>− {fmtD(+i.balance)}</span>
          </div>
          <div style={{height:1,background:"#a5f3fc",margin:"6px 0"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,fontWeight:700,color:"#0891b2"}}>Immediate Equity</span>
            <span style={{fontSize:18,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#0891b2"}}>{fmtD(c.equity)} <span style={{fontSize:12}}>({fmtP(c.equityPct)})</span></span>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <BigResult label="Monthly Cash Flow" value={fmtD(c.mcf)} positive={c.mcf>=0} negative={c.mcf<0}/>
          <BigResult label="ROI on Cash In" value={fmtP(c.roi)} positive={c.roi>0.10} negative={c.roi<0}/>
        </div>

        <div style={{background:"#f9fafb",borderRadius:12,padding:"2px 16px"}}>
          <OutRow label="Total Cash In" value={fmtD(c.ti)}/>
          <OutRow label="Total Expenses/mo" value={fmtD(totalExp)}/>
          <OutRow label="Annual Cash Flow" value={fmtD(c.acf)} positive={c.acf>=0} negative={c.acf<0}/>
          <OutRow label="ROI = Annual CF / Cash In" value={fmtP(c.roi)} positive={c.roi>0.10} highlight/>
        </div>

        {/* Exit projection */}
        {exitPlan!=="hold"&&(
          <div style={{background:"#f0fdf4",borderRadius:12,padding:"14px 16px",border:"1.5px solid #bbf7d0"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#059669",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>{exitPlan==="refi"?"Refinance":"Sale"} Projection — Year {i.exitYears}</div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:12,color:"#6b7280"}}>Future Value</span><span style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"#059669"}}>{fmtD(c.futureValue)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:12,color:"#6b7280"}}>Remaining Loan</span><span style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"#374151"}}>{fmtD(c.futureBal)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:12,color:"#6b7280"}}>Future Equity</span><span style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"#059669"}}>{fmtD(c.futureEquity)}</span></div>
            <div style={{height:1,background:"#bbf7d0",margin:"6px 0"}}/>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,fontWeight:700,color:"#059669"}}>Total Profit (CF + Equity)</span><span style={{fontSize:15,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#059669"}}>{fmtD(c.totalProfit)}</span></div>
          </div>
        )}

        <button onClick={()=>generateAndDownload("subto",{...i,address:addr},c,profile)} style={{padding:"11px 16px",borderRadius:10,border:"2px dashed #a5f3fc",background:"#ecfeff",color:"#0891b2",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}>
          📄 Generate Subject-To Offer Letter (.doc)
        </button>      </div>
    </div>
    </>}
  </>);
}
function NovationCalc({saved,onCalcChange,profile,isPro:isProProp,onActivatePro}) {
  const [addr,setAddr]=useState(saved?.address||"");
  const [saleAdj,setSaleAdj]=useState(100);
  const [targetMode,setTargetMode]=useState("fixed");
  const [i,setI]=useState(saved||{
    pp:155000,repairs:22000,arv:270000,months:4,
    agent:6,closing:4500,
    sellerPayout:12000,sellerPayoutType:"cash",
    taxesMo:180,insuranceMo:120,utilitiesMo:80,
    targetProfit:40000,targetPct:15,
  });
  const s=k=>v=>setI(p=>({...p,[k]:v}));

  const adjSale=useMemo(()=>+i.arv*saleAdj/100,[i.arv,saleAdj]);

  const c=useMemo(()=>{
    const agentAmt=adjSale*+i.agent/100;
    const holdingTotal=(+i.taxesMo+ +i.insuranceMo+ +i.utilitiesMo)*+i.months;
    const tc=+i.pp+ +i.repairs+agentAmt+ +i.closing+ +i.sellerPayout+holdingTotal;
    const profit=adjSale-tc;
    const roi=tc>0?profit/tc:0;
    const annRoi=+i.months>0?roi*(12/+i.months):roi;
    const profitPctArv=+i.arv>0?profit/+i.arv:0;
    const grossSpread=adjSale-+i.pp;
    const netSpread=adjSale-tc;
    const targetAmt=targetMode==="pct"?+i.arv*+i.targetPct/100:+i.targetProfit;
    const meetsTarget=profit>=targetAmt;
    const risk=profitPctArv>=0.15?"green":profitPctArv>=0.10?"yellow":"red";
    const breakeven=tc;
    const reqForTarget=tc+targetAmt;
    return{agentAmt,holdingTotal,tc,profit,roi,annRoi,profitPctArv,grossSpread,netSpread,targetAmt,meetsTarget,risk,breakeven,reqForTarget,adjSale};
  },[i,adjSale,targetMode]);

  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.profit),secondary:fmtP(c.annRoi),label:"Net Profit",label2:"Ann. ROI"}),[i,c,addr]);

  const [calcTab,setCalcTab]=useState("calc");
  const isPro=isProProp||profile?.is_pro||false;
  const dmMetrics={profit:c.profit,arv:+i.arv,roi:c.annRoi,margin:c.profitPctArv,months:+i.months,costs:c.tc,holdingMoCost:(+i.taxesMo+ +i.insuranceMo+ +i.utilitiesMo)};

  return (<>
    <AddressBar value={addr} onChange={setAddr}/>
    <div style={{display:"flex",gap:6,marginBottom:16,background:"#f3f4f6",borderRadius:10,padding:3}}>
      {[["calc","🏠 Calculator"],["decision","🧠 Decision Mode"]].map(([key,label])=>(
        <button key={key} onClick={()=>setCalcTab(key)} style={{flex:1,padding:"7px 12px",borderRadius:8,border:"none",background:calcTab===key?"white":"transparent",color:calcTab===key?"#111827":"#6b7280",fontSize:12,fontWeight:calcTab===key?700:500,cursor:"pointer",boxShadow:calcTab===key?"0 1px 4px rgba(0,0,0,0.08)":"none",transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
          {label}{key==="decision"&&!isPro&&<span style={{fontSize:9,background:"#f0fdf4",color:"#059669",padding:"1px 5px",borderRadius:100,fontWeight:700}}>PRO</span>}
        </button>
      ))}
    </div>
    {calcTab==="decision"&&<DecisionMode metrics={dmMetrics} strategy="novation" isPro={isPro} onActivatePro={onActivatePro}/>}
    {calcTab==="calc"&&<>
    {/* Sale price sensitivity */}
    <div style={{background:"#fdf2f8",borderRadius:10,padding:"12px 16px",border:"1.5px solid #fbcfe8",marginBottom:18}}>
      <div style={{fontSize:10,fontWeight:700,color:"#be185d",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Sale Price Sensitivity</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {[[95,"95% of ARV"],[98,"98% of ARV"],[100,"Full ARV"],[102,"102% of ARV"]].map(([val,label])=>(
          <button key={val} onClick={()=>setSaleAdj(val)} style={{padding:"5px 14px",borderRadius:100,border:`1.5px solid ${saleAdj===val?"#be185d":"#fbcfe8"}`,background:saleAdj===val?"#be185d":"white",color:saleAdj===val?"white":"#be185d",fontSize:11,fontWeight:700,cursor:"pointer"}}>{label}</button>
        ))}
      </div>
      {saleAdj!==100&&<div style={{fontSize:11,color:"#be185d",marginTop:6,fontWeight:600}}>Adjusted Sale: {fmtD(c.adjSale)} ({saleAdj}% of ARV)</div>}
    </div>

    <div className="calc-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Divider label="Deal"/>
        <Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000}/>
        <Field label="Repair Costs" value={i.repairs} onChange={s("repairs")} prefix="$" step={1000}/>
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/>
        <Field label="Months to Sell" value={i.months} onChange={s("months")} suffix="mo" step={1}/>

        <Divider label="Selling Costs"/>
        <Field label="Agent Fees" value={i.agent} onChange={s("agent")} suffix="%" step={0.5}/>
        <Field label="Closing Costs" value={i.closing} onChange={s("closing")} prefix="$" step={500}/>

        <Divider label="Seller Incentive / Payout"/>
        <div style={{display:"flex",gap:8,marginBottom:4,flexWrap:"wrap"}}>
          {[["cash","Cash at Close"],["arrears","Cure Arrears"],["incentive","Negotiated Incentive"]].map(([k,label])=>(
            <button key={k} onClick={()=>s("sellerPayoutType")(k)} style={{padding:"4px 10px",borderRadius:100,border:`1.5px solid ${i.sellerPayoutType===k?"#be185d":"#e5e7eb"}`,background:i.sellerPayoutType===k?"#fdf2f8":"white",color:i.sellerPayoutType===k?"#be185d":"#6b7280",fontSize:11,fontWeight:700,cursor:"pointer"}}>{label}</button>
          ))}
        </div>
        <Field label="Seller Payout Amount" value={i.sellerPayout} onChange={s("sellerPayout")} prefix="$" step={1000}/>

        <Divider label="Monthly Holding Costs"/>
        <div className="field-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Field label="Taxes/mo" value={i.taxesMo} onChange={s("taxesMo")} prefix="$" step={50}/>
          <Field label="Insurance/mo" value={i.insuranceMo} onChange={s("insuranceMo")} prefix="$" step={25}/>
          <Field label="Utilities/mo" value={i.utilitiesMo} onChange={s("utilitiesMo")} prefix="$" step={25}/>
        </div>

        <Divider label="Target Profit"/>
        <div style={{display:"flex",gap:8,marginBottom:4}}>
          {[["fixed","Fixed $"],["pct","% of ARV"]].map(([m,label])=>(
            <button key={m} onClick={()=>setTargetMode(m)} style={{padding:"5px 12px",borderRadius:100,border:`1.5px solid ${targetMode===m?"#be185d":"#e5e7eb"}`,background:targetMode===m?"#fdf2f8":"white",color:targetMode===m?"#be185d":"#6b7280",fontSize:11,fontWeight:700,cursor:"pointer"}}>{label}</button>
          ))}
        </div>
        {targetMode==="fixed"
          ?<Field label="Target Profit ($)" value={i.targetProfit} onChange={s("targetProfit")} prefix="$" step={1000}/>
          :<Field label="Target Profit (% of ARV)" value={i.targetPct} onChange={s("targetPct")} suffix="%" step={1}/>
        }
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {/* Risk + target badge */}
        <div style={{padding:"12px 16px",borderRadius:10,background:c.risk==="green"?"#f0fdf4":c.risk==="yellow"?"#fffbeb":"#fef2f2",border:`1.5px solid ${c.risk==="green"?"#bbf7d0":c.risk==="yellow"?"#fde68a":"#fecaca"}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>{c.risk==="green"?"✅":c.risk==="yellow"?"⚠️":"🔴"}</span>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:c.risk==="green"?"#059669":c.risk==="yellow"?"#d97706":"#dc2626"}}>{c.risk==="green"?"Strong Novation":c.risk==="yellow"?"Thin Margin":"Weak Deal"}</div>
              <div style={{fontSize:11,color:"#6b7280"}}>Profit = {fmtP(c.profitPctArv)} of ARV</div>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:12,fontWeight:700,color:c.meetsTarget?"#059669":"#dc2626"}}>{c.meetsTarget?"✅ Meets Target":"❌ Below Target"}</div>
            <div style={{fontSize:10,color:"#9ca3af"}}>Target: {fmtD(c.targetAmt)}</div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <BigResult label="Net Profit" value={fmtD(c.profit)} positive={c.profit>0} negative={c.profit<=0}/>
          <BigResult label="Annualized ROI" value={fmtP(c.annRoi)} positive={c.annRoi>0.20} negative={c.annRoi<=0}/>
        </div>

        {/* Transparent cost stack */}
        <div style={{background:"#f9fafb",borderRadius:12,padding:"2px 16px"}}>
          <div style={{padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}><span style={{fontSize:11,fontWeight:700,color:"#374151"}}>Total Cost Stack</span></div>
          <OutRow label="  Purchase Price" value={fmtD(+i.pp)}/>
          <OutRow label="  Repairs" value={fmtD(+i.repairs)}/>
          <OutRow label="  Agent Fees" value={fmtD(c.agentAmt)}/>
          <OutRow label="  Closing Costs" value={fmtD(+i.closing)}/>
          <OutRow label="  Seller Payout" value={fmtD(+i.sellerPayout)}/>
          <OutRow label={`  Holding (${i.months}mo)`} value={fmtD(c.holdingTotal)}/>
          <OutRow label="Total Costs" value={fmtD(c.tc)} highlight/>
          <OutRow label="Sale Price" value={fmtD(c.adjSale)}/>
          <OutRow label="Net Profit" value={fmtD(c.profit)} positive={c.profit>0} negative={c.profit<=0} highlight/>
        </div>

        {/* Spread metrics */}
        <div style={{background:"#fdf2f8",borderRadius:10,padding:"14px 16px",border:"1.5px solid #fbcfe8"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#be185d",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Spread Metrics</div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:12,color:"#6b7280"}}>Gross Spread (Sale − Purchase)</span><span style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"#374151"}}>{fmtD(c.grossSpread)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:12,color:"#6b7280"}}>Net Spread After All Costs</span><span style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:c.netSpread>0?"#059669":"#dc2626"}}>{fmtD(c.netSpread)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:12,color:"#6b7280"}}>Profit % of ARV</span><span style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:c.profitPctArv>=0.15?"#059669":"#d97706"}}>{fmtP(c.profitPctArv)}</span></div>
          <div style={{height:1,background:"#fbcfe8",margin:"8px 0"}}/>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:"#6b7280"}}>Breakeven Sale Price</span><span style={{fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"#374151"}}>{fmtD(c.breakeven)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:"#6b7280"}}>Required Sale for Target</span><span style={{fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"#374151"}}>{fmtD(c.reqForTarget)}</span></div>
        </div>

        <button onClick={()=>generateAndDownload("novation",{...i,address:addr},c,profile)} style={{padding:"11px 16px",borderRadius:10,border:"2px dashed #fbcfe8",background:"#fdf2f8",color:"#be185d",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}>
          📄 Generate Novation Offer Letter (.doc)
        </button>
      </div>
    </div>
    </>}
  </>);
}

// ─── Forum ─────────────────────────────────────────────────────────────────────
// ─── FORUM 2.0 ─────────────────────────────────────────────────────────────────

// Strategy-specific feedback prompts
const FEEDBACK_PROMPTS = {
  rental: ["Is my cash flow realistic?","Is the rent estimate accurate for this market?","Does the expense ratio look right?","Would you buy this at this price?"],
  wholesale: ["Is my ARV realistic?","Is the repair estimate too low?","Is MAO competitive in this market?","Would your buyer pay this?"],
  flip: ["Is my timeline realistic?","Profit margin vs risk — worth it?","What would you cut to protect downside?","Is rehab estimate accurate?"],
  brrrr: ["Does DSCR work after refi?","How much cash should I leave in?","Does rent support the refi?","Is ARV realistic post-rehab?"],
  subto: ["Is this rate worth taking over?","Is cash flow strong enough?","Any red flags on this loan?","Exit strategy thoughts?"],
  novation: ["Is ARV realistic for a retail sale?","Is seller payout too high?","Timeline realistic?","Risk vs reward here?"],
};

// Deal Card component shown inline in posts
function DealCard({snapshot, mode, collapsed=true}) {
  const [open, setOpen] = useState(!collapsed);
  const m = MODES.find(m=>m.key===mode);
  if(!snapshot) return null;

  const keyMetrics = {
    rental: [["Purchase",snapshot.pp],["Rent/mo",snapshot.rent],["CF/mo",snapshot.mcf_display],["CoC ROI",snapshot.coc_display]],
    wholesale: [["ARV",snapshot.arv],["Repairs",snapshot.repairs],["MAO",snapshot.mao_display],["Your Fee",snapshot.fee]],
    flip: [["Purchase",snapshot.pp],["Rehab",snapshot.rehab],["ARV",snapshot.arv],["Net Profit",snapshot.profit_display]],
    brrrr: [["Purchase",snapshot.pp],["Rehab",snapshot.rehab],["ARV",snapshot.arv],["Cash Left",snapshot.cash_left_display]],
    subto: [["Balance",snapshot.balance],["Rate",snapshot.rate+"%"],["CF/mo",snapshot.mcf_display],["Cash In",snapshot.ti_display]],
    novation: [["Purchase",snapshot.pp],["Repairs",snapshot.repairs],["ARV",snapshot.arv],["Profit",snapshot.profit_display]],
  }[mode]||[];

  return (
    <div style={{background:m?.bg||"#f9fafb",border:`1.5px solid ${m?.border||"#e5e7eb"}`,borderRadius:12,overflow:"hidden",marginBottom:12}}>
      <button onClick={e=>{e.stopPropagation();setOpen(v=>!v);}} style={{width:"100%",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"none",border:"none",cursor:"pointer"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:14}}>{m?.icon}</span>
          <span style={{fontSize:12,fontWeight:700,color:m?.color||"#374151"}}>{m?.label} Deal</span>
          {snapshot.address&&<span style={{fontSize:11,color:"#9ca3af"}}>· {snapshot.address}</span>}
        </div>
        <span style={{fontSize:11,color:"#9ca3af"}}>{open?"▲ Hide":"▼ Show"} Deal</span>
      </button>
      {open&&(
        <div style={{padding:"0 14px 14px"}}>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:10}}>
            {keyMetrics.filter(([,v])=>v).map(([label,val])=>(
              <div key={label} style={{background:"white",borderRadius:8,padding:"8px 12px",border:`1px solid ${m?.border||"#e5e7eb"}`}}>
                <div style={{fontSize:9,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",marginBottom:3}}>{label}</div>
                <div style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono',monospace",color:m?.color||"#374151"}}>{val||"—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Reaction button component
function ReactionBar({post, onReact, userReaction}) {
  const reactions = [
    {type:"solid", label:"✅ Solid", active:"#059669", bg:"#f0fdf4", border:"#bbf7d0"},
    {type:"tight", label:"⚠️ Tight", active:"#d97706", bg:"#fffbeb", border:"#fde68a"},
    {type:"pass",  label:"❌ Pass",  active:"#dc2626", bg:"#fef2f2", border:"#fecaca"},
  ];
  const counts = post.reactions||{};
  return (
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      {reactions.map(r=>{
        const isActive = userReaction===r.type;
        const count = counts[r.type]||0;
        return (
          <button key={r.type} onClick={e=>{e.stopPropagation();onReact(post,r.type);}}
            style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:100,border:`1.5px solid ${isActive?r.border:"#e5e7eb"}`,background:isActive?r.bg:"white",cursor:"pointer",fontSize:12,fontWeight:isActive?700:500,color:isActive?r.active:"#6b7280",transition:"all 0.15s"}}>
            {r.label}{count>0&&<span style={{fontSize:11,fontWeight:700,color:isActive?r.active:"#9ca3af"}}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ForumView({user, profile, savedDeals=[]}) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [filterMode, setFilterMode] = useState("all");
  const [activePost, setActivePost] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [bestAnswer, setBestAnswer] = useState(null);
  const [userReactions, setUserReactions] = useState({});

  // New post form state
  const [postType, setPostType] = useState("deal"); // deal | general
  const [form, setForm] = useState({title:"", mode:"", question:"", selectedPrompt:"", address:"", locationVisibility:"full", snapshot:null});
  const [submitting, setSubmitting] = useState(false);

  const loadPosts = async(m) => {
    setLoading(true);
    const p = await supabase.getPosts(m==="all"?"":m).catch(()=>[]);
    setPosts(p);
    setLoading(false);
  };
  useEffect(()=>{loadPosts("all");},[]);

  const handleFilter = (m) => { setFilterMode(m); loadPosts(m); };

  // Build snapshot from current calculator state (passed via saved deals)
  const buildSnapshot = (dealId) => {
    const deal = savedDeals.find(d=>d.id===dealId);
    if(!deal) return null;
    return {...deal.inputs, ...deal.metrics, address: deal.inputs?.address||"", _deal_name: deal.name};
  };

  const submit = async() => {
    if(!form.title||!form.mode||!form.question) return;
    setSubmitting(true);
    try{
      const snap = form.snapshot;
      const post = {
        user_id: user.id,
        author_name: profile?.full_name||"Anonymous",
        author_type: profile?.investor_type||"",
        author_verified: profile?.is_verified||false,
        author_portfolio: profile?.portfolio_value||0,
        title: form.title,
        mode: form.mode,
        address: form.locationVisibility==="hidden"?"":form.locationVisibility==="city"&&form.address?form.address.split(",").slice(-2).join(",").trim():form.address,
        question: form.question,
        deal_snapshot: snap,
        post_type: postType,
        reactions: {solid:0,tight:0,pass:0},
        upvotes: 0,
        created_at: new Date().toISOString(),
      };
      const saved = await supabase.insertPost(post).catch(()=>null);
      const np = Array.isArray(saved)?saved[0]:{...post,id:Date.now().toString()};
      setPosts(p=>[np,...p]);
      setShowNew(false);
      setForm({title:"",mode:"",question:"",selectedPrompt:"",address:"",locationVisibility:"full",snapshot:null});
      setPostType("deal");
    }finally{setSubmitting(false);}
  };

  const openPost = async(post) => {
    setActivePost(post);
    setBestAnswer(post.best_answer_id||null);
    const c = await supabase.getComments(post.id).catch(()=>[]);
    setComments(c);
  };

  const handleUpvote = async(post, e) => {
    e.stopPropagation();
    await supabase.upvotePost(post.id, post.upvotes||0).catch(()=>{});
    setPosts(prev=>prev.map(p=>p.id===post.id?{...p,upvotes:(p.upvotes||0)+1}:p));
  };

  const handleReact = async(post, type) => {
    const key = `${post.id}_${user.id}`;
    const prev = userReactions[key];
    if(prev===type) return;
    const newReactions = {...(post.reactions||{solid:0,tight:0,pass:0})};
    if(prev) newReactions[prev]=Math.max(0,(newReactions[prev]||0)-1);
    newReactions[type]=(newReactions[type]||0)+1;
    setUserReactions(r=>({...r,[key]:type}));
    setPosts(prev=>prev.map(p=>p.id===post.id?{...p,reactions:newReactions}:p));
    if(activePost?.id===post.id) setActivePost(p=>({...p,reactions:newReactions}));
    await supabase._fetch(`/rest/v1/forum_posts?id=eq.${post.id}`,{method:"PATCH",body:JSON.stringify({reactions:newReactions})}).catch(()=>{});
  };

  const submitComment = async() => {
    if(!newComment.trim()||!activePost) return;
    setPostingComment(true);
    try{
      const c = {post_id:activePost.id,user_id:user.id,author_name:profile?.full_name||"Anonymous",author_verified:profile?.is_verified||false,body:newComment.trim(),created_at:new Date().toISOString()};
      const saved = await supabase.insertComment(c).catch(()=>null);
      const nc = Array.isArray(saved)?saved[0]:{...c,id:Date.now().toString()};
      setComments(prev=>[...prev,nc]);
      setNewComment("");
    }finally{setPostingComment(false);}
  };

  const markBestAnswer = (commentId) => {
    setBestAnswer(commentId);
    supabase._fetch(`/rest/v1/forum_posts?id=eq.${activePost.id}`,{method:"PATCH",body:JSON.stringify({best_answer_id:commentId})}).catch(()=>{});
  };

  // ── POST DETAIL VIEW ──
  if(activePost) {
    const m = MODES.find(m=>m.key===activePost.mode);
    const medal = getMedal(+(activePost.author_portfolio||0));
    const userReactionKey = `${activePost.id}_${user.id}`;
    return (
      <div style={{maxWidth:800,margin:"0 auto",padding:"28px"}}>
        <button onClick={()=>setActivePost(null)} style={{background:"none",border:"none",fontSize:13,color:"#6b7280",cursor:"pointer",marginBottom:20,display:"flex",alignItems:"center",gap:5}}>← Back to Community</button>
        <div style={{background:"white",borderRadius:18,border:"1.5px solid #e5e7eb",overflow:"hidden",marginBottom:24}}>
          <div style={{padding:"24px 28px",borderBottom:"1px solid #f3f4f6"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              {m&&<span style={{fontSize:11,fontWeight:700,color:m.color,background:m.bg,padding:"3px 10px",borderRadius:100,border:`1px solid ${m.border}`}}>{m.icon} {m.label}</span>}
              {activePost.post_type==="deal"&&<span style={{fontSize:11,background:"#f0fdf4",color:"#059669",padding:"2px 8px",borderRadius:100,border:"1px solid #bbf7d0",fontWeight:600}}>📊 Deal Post</span>}
              {activePost.address&&<span style={{fontSize:12,color:"#6b7280"}}>📍 {activePost.address}</span>}
            </div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"#111827",marginBottom:12}}>{activePost.title}</h2>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,flexWrap:"wrap"}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:13,fontWeight:800,color:"white"}}>{(activePost.author_name||"?")[0].toUpperCase()}</span>
              </div>
              <span style={{fontSize:14,fontWeight:600,color:"#111827"}}>{activePost.author_name}</span>
              <span style={{fontSize:14}}>{medal.icon}</span>
              {activePost.author_verified&&<span style={{fontSize:10,background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:100,padding:"1px 6px",fontWeight:700}}>✓ Verified</span>}
              {activePost.author_type&&<span style={{fontSize:12,color:"#9ca3af"}}>· {activePost.author_type}</span>}
              <span style={{fontSize:12,color:"#9ca3af"}}>· {new Date(activePost.created_at).toLocaleDateString()}</span>
            </div>

            {/* Deal Card */}
            {activePost.deal_snapshot&&<DealCard snapshot={activePost.deal_snapshot} mode={activePost.mode} collapsed={false}/>}

            <p style={{fontSize:14,color:"#374151",lineHeight:1.75,marginBottom:20}}>{activePost.question}</p>

            {/* Reactions */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,paddingTop:16,borderTop:"1px solid #f3f4f6"}}>
              <ReactionBar post={activePost} onReact={handleReact} userReaction={userReactions[userReactionKey]}/>
              <button onClick={e=>handleUpvote(activePost,e)} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:100,border:"1.5px solid #e5e7eb",background:"white",cursor:"pointer",fontSize:12,fontWeight:600,color:"#374151"}}>
                ▲ {activePost.upvotes||0} upvotes
              </button>
            </div>
          </div>

          {/* Comments */}
          <div style={{padding:"20px 28px"}}>
            <h3 style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:16}}>{comments.length} Response{comments.length!==1?"s":""}</h3>
            {comments.map(c=>(
              <div key={c.id} style={{marginBottom:16,paddingBottom:16,borderBottom:"1px solid #f3f4f6",background:bestAnswer===c.id?"#f0fdf4":"transparent",borderRadius:bestAnswer===c.id?10:0,padding:bestAnswer===c.id?"12px 14px":"0 0 16px 0"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:11,fontWeight:800,color:"white"}}>{(c.author_name||"?")[0].toUpperCase()}</span>
                    </div>
                    <span style={{fontSize:13,fontWeight:600,color:"#111827"}}>{c.author_name}</span>
                    {c.author_verified&&<span style={{fontSize:10,background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:100,padding:"1px 6px",fontWeight:700}}>✓</span>}
                    {bestAnswer===c.id&&<span style={{fontSize:10,background:"#f0fdf4",color:"#059669",borderRadius:100,padding:"2px 8px",fontWeight:700,border:"1px solid #bbf7d0"}}>⭐ Best Answer</span>}
                    <span style={{fontSize:11,color:"#9ca3af"}}>{new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                  {activePost.user_id===user.id&&bestAnswer!==c.id&&(
                    <button onClick={()=>markBestAnswer(c.id)} style={{padding:"3px 10px",borderRadius:100,border:"1px solid #e5e7eb",background:"white",color:"#6b7280",fontSize:11,cursor:"pointer"}}>Mark Best Answer</button>
                  )}
                </div>
                <p style={{fontSize:14,color:"#374151",lineHeight:1.6,paddingLeft:36}}>{c.body}</p>
              </div>
            ))}
            <div style={{marginTop:20}}>
              <textarea value={newComment} onChange={e=>setNewComment(e.target.value)} placeholder="Share your analysis or advice..." rows={3}
                style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:14,color:"#111827",outline:"none",resize:"vertical",fontFamily:"'DM Sans',sans-serif",marginBottom:10}}/>
              <Btn variant="primary" loading={postingComment} onClick={submitComment}>Post Response</Btn>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── FEED VIEW ──
  return (
    <div style={{maxWidth:960,margin:"0 auto",padding:"28px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22,flexWrap:"wrap",gap:14}}>
        <div>
          <h2 style={{fontFamily:"'Fraunces',serif",fontSize:26,fontWeight:800,color:"#111827",marginBottom:4}}>👥 Community Forum</h2>
          <p style={{fontSize:13,color:"#9ca3af"}}>Deal-backed posts · Real numbers · Honest feedback</p>
        </div>
        <Btn variant="primary" onClick={()=>setShowNew(true)}>+ Share a Deal</Btn>
      </div>

      {/* Filters */}
      <div className="mode-pills" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:22}}>
        <button onClick={()=>handleFilter("all")} style={{padding:"6px 14px",borderRadius:100,border:`1.5px solid ${filterMode==="all"?"#111827":"#e5e7eb"}`,background:filterMode==="all"?"#111827":"white",color:filterMode==="all"?"white":"#6b7280",fontSize:12,fontWeight:600,cursor:"pointer"}}>All</button>
        {MODES.map(m=>(
          <button key={m.key} onClick={()=>handleFilter(m.key)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 14px",borderRadius:100,border:`1.5px solid ${filterMode===m.key?m.border:"#e5e7eb"}`,background:filterMode===m.key?m.bg:"white",color:filterMode===m.key?m.color:"#6b7280",fontSize:12,fontWeight:600,cursor:"pointer"}}>{m.icon} {m.label}</button>
        ))}
      </div>

      {/* New Post Form */}
      {showNew&&(
        <div style={{background:"white",borderRadius:18,border:"1.5px solid #e5e7eb",padding:"28px",marginBottom:24,animation:"fadeUp 0.3s ease both"}}>
          <h3 style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:800,color:"#111827",marginBottom:18}}>Share with the Community</h3>

          {/* Post type selector */}
          <div style={{display:"flex",gap:10,marginBottom:20}}>
            {[["deal","📊 Deal-Backed Post","Attach deal numbers — get better feedback"],["general","💬 General Question","Ask without deal numbers"]].map(([type,label,desc])=>(
              <button key={type} onClick={()=>setPostType(type)} style={{flex:1,padding:"12px 14px",borderRadius:12,border:`2px solid ${postType===type?"#10b981":"#e5e7eb"}`,background:postType===type?"#f0fdf4":"white",cursor:"pointer",textAlign:"left",transition:"all 0.15s"}}>
                <div style={{fontSize:13,fontWeight:700,color:postType===type?"#059669":"#374151",marginBottom:3}}>{label} {postType===type?"✓":""}</div>
                <div style={{fontSize:11,color:"#9ca3af"}}>{desc}</div>
              </button>
            ))}
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* Strategy + Title */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:14}}>
              <Sel label="Strategy *" value={form.mode} onChange={v=>setForm(p=>({...p,mode:v,selectedPrompt:""}))} options={MODES.map(m=>m.key)} placeholder="Select..."/>
              <Input label="Title *" value={form.title} onChange={v=>setForm(p=>({...p,title:v}))} placeholder="e.g. 3BR rental in Atlanta — does this cash flow?"/>
            </div>

            {/* Strategy-specific prompts */}
            {form.mode&&FEEDBACK_PROMPTS[form.mode]&&(
              <div>
                <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>What feedback do you need? (tap to select)</label>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {FEEDBACK_PROMPTS[form.mode].map(prompt=>(
                    <button key={prompt} onClick={()=>setForm(p=>({...p,selectedPrompt:prompt,question:prompt+"\n\n"+(p.question||"")}))}
                      style={{padding:"5px 12px",borderRadius:100,border:`1.5px solid ${form.selectedPrompt===prompt?"#10b981":"#e5e7eb"}`,background:form.selectedPrompt===prompt?"#f0fdf4":"white",color:form.selectedPrompt===prompt?"#059669":"#6b7280",fontSize:11,fontWeight:600,cursor:"pointer"}}>{prompt}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Question */}
            <div>
              <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:5}}>Your question / context *</label>
              <textarea value={form.question} onChange={e=>setForm(p=>({...p,question:e.target.value}))} placeholder="Describe the deal and what you want feedback on..." rows={4}
                style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:14,color:"#111827",outline:"none",resize:"vertical",fontFamily:"'DM Sans',sans-serif"}}/>
            </div>

            {/* Address + privacy */}
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
              <Input label="Property address" value={form.address} onChange={v=>setForm(p=>({...p,address:v}))} placeholder="123 Main St, Atlanta, GA" icon="📍"/>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:5}}>Location privacy</label>
                <select value={form.locationVisibility} onChange={e=>setForm(p=>({...p,locationVisibility:e.target.value}))} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:13,outline:"none",color:"#374151"}}>
                  <option value="full">Show full address</option>
                  <option value="city">City/State only</option>
                  <option value="hidden">Hide location</option>
                </select>
              </div>
            </div>

            {/* Deal snapshot (manual key numbers for now) */}
            {postType==="deal"&&form.mode&&(
              <div style={{background:"#f9fafb",borderRadius:12,padding:"16px 18px",border:"1.5px solid #e5e7eb"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:12}}>📊 Key Deal Numbers <span style={{fontSize:11,color:"#9ca3af",fontWeight:400}}>(readers see this as a deal card)</span></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                  {(()=>{
                    const fields={
                      rental:[["pp","Purchase Price"],["rent","Monthly Rent"],["mcf_display","Cash Flow/mo"],["coc_display","CoC ROI"]],
                      wholesale:[["arv","ARV"],["repairs","Repairs"],["mao_display","MAO"],["fee","Your Fee"]],
                      flip:[["pp","Purchase"],["rehab","Rehab"],["arv","ARV"],["profit_display","Net Profit"]],
                      brrrr:[["pp","Purchase"],["rehab","Rehab"],["arv","ARV"],["cash_left_display","Cash Left"]],
                      subto:[["balance","Loan Balance"],["rate","Rate %"],["mcf_display","CF/mo"],["ti_display","Cash In"]],
                      novation:[["pp","Purchase"],["repairs","Repairs"],["arv","ARV"],["profit_display","Net Profit"]],
                    };
                    return (fields[form.mode]||[]).map(([key,label])=>(
                      <div key={key}>
                        <label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:3}}>{label}</label>
                        <input type="text" placeholder="e.g. $320,000" onChange={e=>setForm(p=>({...p,snapshot:{...p.snapshot,[key]:e.target.value,address:p.address}}))}
                          style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:12,outline:"none",fontFamily:"'DM Mono',monospace",color:"#374151"}}/>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            <div style={{display:"flex",gap:10}}>
              <Btn variant="ghost" onClick={()=>setShowNew(false)}>Cancel</Btn>
              <Btn variant="primary" loading={submitting} disabled={!form.title||!form.mode||!form.question} onClick={submit}>Post to Community →</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Feed */}
      {loading?<div style={{textAlign:"center",padding:"60px",color:"#9ca3af"}}>Loading...</div>
      :posts.length===0?<div style={{textAlign:"center",padding:"80px 24px"}}><div style={{fontSize:52,marginBottom:16}}>👋</div><h3 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"#111827",marginBottom:8}}>Be the first to share!</h3><p style={{fontSize:14,color:"#6b7280"}}>Post a deal and get feedback from the community.</p></div>
      :(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {posts.map(post=>{
            const m = MODES.find(m=>m.key===post.mode);
            const medal = getMedal(+(post.author_portfolio||0));
            const userReactionKey = `${post.id}_${user.id}`;
            const reactions = post.reactions||{};
            const totalReactions = (reactions.solid||0)+(reactions.tight||0)+(reactions.pass||0);
            return (
              <div key={post.id} onClick={()=>openPost(post)} style={{background:"white",borderRadius:14,border:"1.5px solid #e5e7eb",overflow:"hidden",cursor:"pointer",transition:"all 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#10b981";e.currentTarget.style.boxShadow="0 4px 20px rgba(0,0,0,0.06)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="#e5e7eb";e.currentTarget.style.boxShadow="none";}}>
                {m&&<div style={{height:3,background:m.color,opacity:0.6}}/>}
                <div style={{padding:"16px 20px"}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:14}}>
                    <div style={{flex:1,minWidth:0}}>
                      {/* Tags */}
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                        {m&&<span style={{fontSize:11,fontWeight:700,color:m.color,background:m.bg,padding:"2px 8px",borderRadius:100,border:`1px solid ${m.border}`}}>{m.icon} {m.label}</span>}
                        {post.post_type==="deal"&&<span style={{fontSize:10,background:"#f0fdf4",color:"#059669",padding:"1px 7px",borderRadius:100,border:"1px solid #bbf7d0",fontWeight:600}}>📊 Deal</span>}
                        {post.address&&<span style={{fontSize:11,color:"#9ca3af"}}>📍 {post.address}</span>}
                      </div>
                      <h3 style={{fontSize:15,fontWeight:700,color:"#111827",marginBottom:5}}>{post.title}</h3>

                      {/* Mini deal card in feed */}
                      {post.deal_snapshot&&(()=>{
                        const snap=post.deal_snapshot;
                        const key1=Object.entries(snap).find(([k,v])=>v&&!["address","_deal_name"].includes(k));
                        const key2=Object.entries(snap).filter(([k,v])=>v&&!["address","_deal_name"].includes(k))[1];
                        const key3=Object.entries(snap).filter(([k,v])=>v&&!["address","_deal_name"].includes(k))[2];
                        return key1&&<div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                          {[key1,key2,key3].filter(Boolean).map(([k,v])=>(
                            <span key={k} style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"#374151",background:"#f9fafb",padding:"2px 8px",borderRadius:6,border:"1px solid #e5e7eb",fontWeight:600}}>{k.replace(/_display|_/g," ")}: {v}</span>
                          ))}
                        </div>;
                      })()}

                      <p style={{fontSize:13,color:"#6b7280",lineHeight:1.6,marginBottom:8}}>{post.question?.slice(0,100)}{post.question?.length>100?"...":""}</p>

                      {/* Reaction summary in feed */}
                      {totalReactions>0&&(
                        <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                          {reactions.solid>0&&<span style={{fontSize:11,color:"#059669",background:"#f0fdf4",padding:"2px 8px",borderRadius:100,border:"1px solid #bbf7d0",fontWeight:600}}>✅ Solid ×{reactions.solid}</span>}
                          {reactions.tight>0&&<span style={{fontSize:11,color:"#d97706",background:"#fffbeb",padding:"2px 8px",borderRadius:100,border:"1px solid #fde68a",fontWeight:600}}>⚠️ Tight ×{reactions.tight}</span>}
                          {reactions.pass>0&&<span style={{fontSize:11,color:"#dc2626",background:"#fef2f2",padding:"2px 8px",borderRadius:100,border:"1px solid #fecaca",fontWeight:600}}>❌ Pass ×{reactions.pass}</span>}
                        </div>
                      )}

                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <div style={{width:22,height:22,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <span style={{fontSize:9,fontWeight:800,color:"white"}}>{(post.author_name||"?")[0].toUpperCase()}</span>
                        </div>
                        <span style={{fontSize:12,fontWeight:600,color:"#374151"}}>{post.author_name}</span>
                        <span style={{fontSize:12}}>{medal.icon}</span>
                        {post.author_verified&&<span style={{fontSize:10,background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:100,padding:"1px 5px",fontWeight:700}}>✓</span>}
                        <span style={{fontSize:11,color:"#9ca3af"}}>· {new Date(post.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Upvote */}
                    <button onClick={e=>handleUpvote(post,e)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"8px 12px",borderRadius:10,border:"1.5px solid #e5e7eb",background:"white",cursor:"pointer",flexShrink:0,transition:"all 0.15s"}}
                      onMouseEnter={e=>{e.currentTarget.style.background="#f0fdf4";e.currentTarget.style.borderColor="#bbf7d0";}}
                      onMouseLeave={e=>{e.currentTarget.style.background="white";e.currentTarget.style.borderColor="#e5e7eb";}}>
                      <span style={{fontSize:14}}>▲</span>
                      <span style={{fontSize:12,fontWeight:700,color:"#374151"}}>{post.upvotes||0}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─── Leaderboard ───────────────────────────────────────────────────────────────
function LeaderboardView({user,profile,onGoProfile}) {
  const [leaders,setLeaders]=useState([]);const [loading,setLoading]=useState(true);
  useEffect(()=>{supabase.getLeaderboard().then(d=>{setLeaders(d);setLoading(false);}).catch(()=>setLoading(false));},[]);

  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"28px"}}>
      <div style={{marginBottom:32}}>
        <h2 style={{fontFamily:"'Fraunces',serif",fontSize:26,fontWeight:800,color:"#111827",marginBottom:4}}>🏆 Investor Leaderboard</h2>
        <p style={{fontSize:13,color:"#9ca3af"}}>Verified investors only · Ranked by portfolio value · Updated in real time</p>
      </div>

      {/* Current user rank card */}
      {profile&&(
        <div style={{background:"linear-gradient(135deg,#064e3b,#065f46)",borderRadius:16,padding:"20px 24px",marginBottom:28,display:"flex",alignItems:"center",justifyContent:"space-between",gap:20,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <div style={{width:46,height:46,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid rgba(255,255,255,0.2)"}}>
              <span style={{fontSize:17,fontWeight:800,color:"white"}}>{(profile.full_name||"?")[0].toUpperCase()}</span>
            </div>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:15,fontWeight:700,color:"white"}}>{profile.full_name||"You"}</span>
                {profile.is_verified&&<span style={{fontSize:10,background:"rgba(16,185,129,0.3)",color:"#6ee7b7",border:"1px solid rgba(110,231,183,0.3)",borderRadius:100,padding:"1px 8px",fontWeight:700}}>✓ Verified</span>}
              </div>
              <span style={{fontSize:12,color:"rgba(255,255,255,0.6)"}}>{getMedal(+(profile.portfolio_value||0)).icon} {getMedal(+(profile.portfolio_value||0)).label}</span>
            </div>
          </div>
          <div style={{display:"flex",gap:24,flexWrap:"wrap"}}>
            {[["Portfolio",profile.portfolio_public?fmtM(+profile.portfolio_value||0):"Private"],["Deals",profile.deal_count||0],["Upvotes",profile.upvotes_received||0]].map(([l,v])=>(
              <div key={l} style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"white"}}>{v}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div></div>
            ))}
          </div>
          {!profile.is_verified&&<button onClick={onGoProfile} style={{padding:"9px 18px",borderRadius:9,border:"1.5px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"white",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>Get Verified →</button>}
        </div>
      )}

      {loading?<div style={{textAlign:"center",padding:"60px",color:"#9ca3af"}}>Loading leaderboard...</div>
      :leaders.length===0?(
        <div style={{textAlign:"center",padding:"80px 24px"}}>
          <div style={{fontSize:52,marginBottom:16}}>🏆</div>
          <h3 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"#111827",marginBottom:8}}>No verified investors yet</h3>
          <p style={{fontSize:14,color:"#6b7280",maxWidth:340,margin:"0 auto 24px"}}>Be the first! Verify your portfolio to appear on the leaderboard.</p>
          <Btn variant="primary" onClick={onGoProfile}>Get Verified →</Btn>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {leaders.map((l,idx)=>{
            const medal=getMedal(+(l.portfolio_value||0));
            const isMentor=l.mentoring_enabled;
            return (
              <div key={l.id} style={{background:"white",borderRadius:14,border:`1.5px solid ${idx<3?"#fde68a":"#e5e7eb"}`,padding:"18px 22px",display:"flex",alignItems:"center",gap:16,transition:"all 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 20px rgba(0,0,0,0.06)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                {/* Rank */}
                <div style={{width:36,height:36,borderRadius:"50%",background:idx===0?"linear-gradient(135deg,#f59e0b,#d97706)":idx===1?"linear-gradient(135deg,#9ca3af,#6b7280)":idx===2?"linear-gradient(135deg,#b45309,#92400e)":"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:idx<3?16:13,fontWeight:800,color:idx<3?"white":"#6b7280"}}>{idx<3?["🥇","🥈","🥉"][idx]:idx+1}</span>
                </div>
                {/* Avatar */}
                <div style={{width:42,height:42,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:16,fontWeight:800,color:"white"}}>{(l.full_name||"?")[0].toUpperCase()}</span>
                </div>
                {/* Info */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                    <span style={{fontSize:15,fontWeight:700,color:"#111827"}}>{l.full_name}</span>
                    <span style={{fontSize:14}}>{medal.icon}</span>
                    <span style={{fontSize:10,background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:100,padding:"1px 6px",fontWeight:700}}>✓ Verified</span>
                    {isMentor&&<span style={{fontSize:10,background:"#fffbeb",color:"#d97706",border:"1px solid #fde68a",borderRadius:100,padding:"1px 6px",fontWeight:700}}>🎓 Mentor</span>}
                  </div>
                  <div style={{fontSize:12,color:"#6b7280"}}>{l.investor_type||""}{l.location?` · 📍 ${l.location}`:""}</div>
                </div>
                {/* Stats */}
                <div style={{display:"flex",gap:20,flexShrink:0}}>
                  {[["Portfolio",fmtM(+(l.portfolio_value||0))],["Deals",l.deal_count||0],["Upvotes",l.upvotes_received||0],["Sessions",l.mentoring_sessions||0]].map(([lbl,val])=>(
                    <div key={lbl} style={{textAlign:"center"}}>
                      <div style={{fontSize:15,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#111827"}}>{val}</div>
                      <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.06em"}}>{lbl}</div>
                    </div>
                  ))}
                </div>
                {/* Mentor CTA */}
                {isMentor&&l.calendly_link&&(
                  <a href={l.calendly_link} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{padding:"9px 16px",borderRadius:9,border:"none",background:"#111827",color:"white",fontSize:12,fontWeight:700,cursor:"pointer",textDecoration:"none",whiteSpace:"nowrap",flexShrink:0}}>Book Session</a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Verification Modal ────────────────────────────────────────────────────────
function VerificationModal({user,profile,onClose,onSubmitted}) {
  const [file,setFile]=useState(null);const [notes,setNotes]=useState("");const [loading,setLoading]=useState(false);const [done,setDone]=useState(false);
  const submit=async()=>{
    setLoading(true);
    try{
      await supabase.submitVerification(user.id,{notes,filename:file?.name||"",status:"pending"}).catch(()=>{});
      setDone(true);onSubmitted();
    }finally{setLoading(false);}
  };
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(4px)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:"white",borderRadius:20,padding:36,maxWidth:480,width:"100%",boxShadow:"0 24px 60px rgba(0,0,0,0.15)",animation:"popIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both"}}>
        {done?(
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:52,marginBottom:16}}>⏳</div>
            <h3 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"#111827",marginBottom:10}}>Verification Submitted!</h3>
            <p style={{fontSize:14,color:"#6b7280",lineHeight:1.6,marginBottom:24}}>We'll review your submission and update your badge within 24–48 hours. You'll receive an email notification when approved.</p>
            <Btn variant="primary" onClick={onClose}>Done</Btn>
          </div>
        ):(
          <>
            <div style={{fontSize:36,marginBottom:12}}>✅</div>
            <h3 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"#111827",marginBottom:6}}>Verify Your Portfolio</h3>
            <p style={{fontSize:14,color:"#6b7280",lineHeight:1.6,marginBottom:24}}>Upload a screenshot of a mortgage statement showing your name and lender. This is optional but unlocks leaderboard eligibility and a verified badge.</p>
            <div style={{background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:12,padding:"14px 18px",marginBottom:20}}>
              <p style={{fontSize:12,fontWeight:600,color:"#059669",marginBottom:4}}>What to upload:</p>
              <p style={{fontSize:12,color:"#374151",lineHeight:1.6}}>A mortgage statement, deed, or appraisal showing your name and the lender/company name. You can redact sensitive info like account numbers.</p>
            </div>
            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Upload document (image or PDF)</label>
              <div style={{border:"2px dashed #d1fae5",borderRadius:10,padding:"24px",textAlign:"center",cursor:"pointer",background:file?"#f0fdf4":"white"}} onClick={()=>document.getElementById("verif-upload").click()}>
                {file?<p style={{fontSize:14,color:"#059669",fontWeight:600}}>📎 {file.name}</p>:<><p style={{fontSize:14,color:"#9ca3af"}}>Click to upload or drag & drop</p><p style={{fontSize:12,color:"#d1d5db",marginTop:4}}>JPG, PNG, or PDF</p></>}
                <input id="verif-upload" type="file" accept="image/*,.pdf" style={{display:"none"}} onChange={e=>setFile(e.target.files[0])}/>
              </div>
            </div>
            <div style={{marginBottom:24}}>
              <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Additional notes (optional)</label>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. 3 properties in Atlanta, 2 in Dallas..." rows={3} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:13,outline:"none",resize:"vertical",fontFamily:"'DM Sans',sans-serif"}}/>
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              <Btn variant="primary" fullWidth loading={loading} disabled={!file} onClick={submit}>Submit for Review →</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── PORTFOLIO RISK ENGINE ────────────────────────────────────────────────────
function calcPortfolioRisk(propCalcs) {
  if(!propCalcs||propCalcs.length===0) return null;

  // Weighted avg DSCR
  const totalDebt = propCalcs.reduce((s,p)=>s+(parseFloat(p.monthly_mortgage)||0),0);
  const wDSCR = totalDebt>0
    ? propCalcs.reduce((s,p)=>s+p.dscr*(parseFloat(p.monthly_mortgage)||0),0)/totalDebt
    : 0;

  // Probability at least one property goes negative CF
  // P(at least one) = 1 - ∏(1 - P(neg_i))
  const pAtLeastOneNeg = 1 - propCalcs.reduce((prod,p)=>{
    const pNeg = (p.pNegCF||50)/100; // use stored or default 50%
    return prod * (1 - pNeg);
  },1);

  // Portfolio P(neg CF) weighted by CF contribution
  const totalAbsCF = propCalcs.reduce((s,p)=>s+Math.abs(p.mcf),1);
  const portfolioPNeg = propCalcs.reduce((s,p)=>s+(p.pNegCF||50)*Math.abs(p.mcf)/totalAbsCF,0);

  // Capital deployed (rough: equity = value - loan)
  const capitalDeployed = propCalcs.reduce((s,p)=>s+((parseFloat(p.value)||0)-(parseFloat(p.loan_balance)||0)),0);

  // Concentration risk: largest single property CF as % of total portfolio CF
  const totalCF = propCalcs.reduce((s,p)=>s+Math.max(p.mcf,0),0);
  const maxSingleCF = Math.max(...propCalcs.map(p=>Math.max(p.mcf,0)),0);
  const concentrationRisk = totalCF>0 ? maxSingleCF/totalCF : 0;

  // Liquidity buffer required (monthly capital infusion if any go neg)
  const negCFProps = propCalcs.filter(p=>p.mcf<0);
  const liquidityBuffer = negCFProps.reduce((s,p)=>s+Math.abs(p.mcf),0);

  // % properties in each survival state
  const survivalStrong   = propCalcs.filter(p=>p.survivalLabel==="Strong").length;
  const survivalFragile  = propCalcs.filter(p=>p.survivalLabel==="Fragile"||p.survivalLabel==="Critical").length;
  const incomeWeak       = propCalcs.filter(p=>p.incomeLabel==="Weak").length;
  const pctStrong        = propCalcs.length>0 ? survivalStrong/propCalcs.length : 0;
  const pctFragile       = propCalcs.length>0 ? survivalFragile/propCalcs.length : 0;
  const pctIncomeWeak    = propCalcs.length>0 ? incomeWeak/propCalcs.length : 0;

  // Portfolio posture
  let posture, postureColor, postureBg, postureIcon, postureDesc;
  if(wDSCR>=1.30 && pctFragile<=0.10 && portfolioPNeg<25 && concentrationRisk<0.40) {
    posture="Defensive"; postureColor="#059669"; postureBg="#f0fdf4"; postureIcon="🛡️";
    postureDesc="Low risk across properties. Strong coverage with diversified cash flow.";
  } else if(wDSCR>=1.15 && pctFragile<=0.30 && portfolioPNeg<45 && concentrationRisk<0.55) {
    posture="Balanced"; postureColor="#2563eb"; postureBg="#eff6ff"; postureIcon="⚖️";
    postureDesc="Mix of stable and moderate-risk assets. Manageable aggregate exposure.";
  } else if(wDSCR>=1.05 && concentrationRisk>=0.40) {
    posture="Levered"; postureColor="#d97706"; postureBg="#fffbeb"; postureIcon="📈";
    postureDesc="Heavily reliant on one or two properties. Concentration amplifies risk.";
  } else {
    posture="Fragile"; postureColor="#dc2626"; postureBg="#fef2f2"; postureIcon="⚠️";
    postureDesc="Multiple properties at risk. Portfolio resilience is low.";
  }

  return {
    wDSCR, pAtLeastOneNeg:Math.min(1,pAtLeastOneNeg), portfolioPNeg,
    capitalDeployed, concentrationRisk, liquidityBuffer,
    pctStrong, pctFragile, pctIncomeWeak,
    posture, postureColor, postureBg, postureIcon, postureDesc,
    negCFProps: negCFProps.length,
  };
}

// Portfolio stress test: −10% rent, 1 vacancy/property, +100bps rates
function calcPortfolioStress(propCalcs) {
  if(!propCalcs||propCalcs.length===0) return null;
  const results = propCalcs.map(p=>{
    const rent    = parseFloat(p.monthly_rent)||0;
    const exp     = parseFloat(p.monthly_expenses)||0;
    const mtg     = parseFloat(p.monthly_mortgage)||0;
    const rate    = parseFloat(p.mortgage_rate)||7;
    const loan    = parseFloat(p.loan_balance)||0;
    const term    = parseFloat(p.mortgage_term)||30;

    const sRent = rent * 0.90;                   // −10% rent
    const vacLoss = sRent / 12;                  // ~1 month vacancy
    const rr = (rate+1)/100/12, n=term*12;
    const sMtg = loan>0&&rr>0 ? loan*(rr*Math.pow(1+rr,n))/(Math.pow(1+rr,n)-1) : mtg; // +100bps
    const sMCF = sRent - vacLoss/12 - exp - sMtg; // rough monthly
    const sDSCR = sMtg>0 ? (sRent-vacLoss/12-exp)/sMtg : 0;
    return {address:p.address, baseMCF:p.mcf, stressMCF:Math.round(sMCF), sDSCR:+sDSCR.toFixed(2), goesNeg:sMCF<0};
  });
  const totalStressCF = results.reduce((s,r)=>s+r.stressMCF,0);
  const propsGoNeg = results.filter(r=>r.goesNeg).length;
  const capitalShortfall = results.filter(r=>r.goesNeg).reduce((s,r)=>s+Math.abs(r.stressMCF),0);
  return {results, totalStressCF:Math.round(totalStressCF), propsGoNeg, capitalShortfall:Math.round(capitalShortfall)};
}

// ─── PORTFOLIO ANALYZER v2 — Risk Intelligence Edition ────────────────────────
function PortfolioAnalyzer({profile,onSave}) {
  const [properties,setProperties]=useState(profile?.portfolio_properties||[]);
  const [showAdd,setShowAdd]=useState(false);
  const [refiProp,setRefiProp]=useState(null);
  const [expandedProp,setExpandedProp]=useState(null);
  const [portfolioTab,setPortfolioTab]=useState("properties"); // properties | risk | projections
  const [newProp,setNewProp]=useState({
    address:"",type:"Single Family",value:"",loan_balance:"",
    monthly_rent:"",monthly_expenses:"",monthly_mortgage:"",
    mortgage_rate:"7",mortgage_term:"30",notes:"",
    pNegCF:50, // estimated % probability of negative CF
  });
  const [projYears,setProjYears]=useState(5);
  const [projGrowth,setProjGrowth]=useState(4);
  const [projRentGrowth,setProjRentGrowth]=useState(2);
  const [projExpGrowth,setProjExpGrowth]=useState(2);
  const [projAcqValue,setProjAcqValue]=useState(250000);
  const [projAcqCF,setProjAcqCF]=useState(400);
  const [projAcqCount,setProjAcqCount]=useState(1);
  const np=k=>v=>setNewProp(p=>({...p,[k]:v}));

  // Per-property calcs — augment scoreProperty with pillar labels
  const propCalcs=useMemo(()=>properties.map(p=>{
    const base=scoreProperty(p);
    // Derive pillar labels for aggregation
    const dscr=base.dscr, beo=base.breakEven, mcf=base.mcf, coc=base.coc;
    const survivalLabel=
      dscr<1.0||beo>=0.95?"Fail":
      dscr>=1.25&&(1-beo)>=0.10?"Strong":
      dscr<1.05||(1-beo)<0.05?"Critical":
      dscr<1.25||(1-beo)<0.10?"Fragile":"Stable";
    const incomeLabel=
      mcf>=300&&coc>=0.08?"Strong":
      mcf<=0||coc<0.04?"Weak":"Moderate";
    return {...p,...base,survivalLabel,incomeLabel};
  }),[properties]);

  // Portfolio totals
  const totals=useMemo(()=>{
    const tv=propCalcs.reduce((s,p)=>s+(parseFloat(p.value)||0),0);
    const tl=propCalcs.reduce((s,p)=>s+(parseFloat(p.loan_balance)||0),0);
    const te=tv-tl;
    const tmcf=propCalcs.reduce((s,p)=>s+p.mcf,0);
    const tacf=tmcf*12;
    const tnoi=propCalcs.reduce((s,p)=>s+p.noi,0);
    const tdebt=propCalcs.reduce((s,p)=>s+(parseFloat(p.monthly_mortgage)||0),0);
    const wdscr=tdebt>0?propCalcs.reduce((s,p)=>s+p.dscr*(parseFloat(p.monthly_mortgage)||0),0)/tdebt:0;
    const wltv=tv>0?tl/tv:0;
    const coc=te>0?tacf/te:0;
    return{tv,tl,te,tmcf,tacf,tnoi,wdscr,wltv,coc,count:properties.length};
  },[propCalcs]);

  const riskData=useMemo(()=>calcPortfolioRisk(propCalcs),[propCalcs]);
  const stressData=useMemo(()=>calcPortfolioStress(propCalcs),[propCalcs]);

  // Projections
  const projections=useMemo(()=>{
    return Array.from({length:projYears+1},(_,yr)=>{
      const valY=totals.tv*Math.pow(1+projGrowth/100,yr);
      const loanY=totals.tl*(1-yr/30);
      const equityY=valY-Math.max(loanY,0);
      const rentGF=Math.pow(1+projRentGrowth/100,yr);
      const expGF=Math.pow(1+projExpGrowth/100,yr);
      const baseMcf=propCalcs.reduce((s,p)=>{
        const r=(parseFloat(p.monthly_rent)||0)*rentGF;
        const e=(parseFloat(p.monthly_expenses)||0)*expGF;
        return s+r-e-(parseFloat(p.monthly_mortgage)||0);
      },0);
      const newCF=yr>0?projAcqCount*yr*projAcqCF:0;
      const newVal=yr>0?projAcqCount*yr*projAcqValue*Math.pow(1+projGrowth/100,yr/2):0;
      return{yr,val:Math.round(valY+newVal),equity:Math.round(equityY+newVal*0.2),mcf:Math.round(baseMcf+newCF),props:totals.count+(yr>0?projAcqCount*yr:0)};
    });
  },[totals,propCalcs,projYears,projGrowth,projRentGrowth,projExpGrowth,projAcqCount,projAcqValue,projAcqCF]);

  const addProp=()=>{
    if(!newProp.address)return;
    setProperties(prev=>[...prev,{...newProp,id:Date.now().toString()}]);
    setNewProp({address:"",type:"Single Family",value:"",loan_balance:"",monthly_rent:"",monthly_expenses:"",monthly_mortgage:"",mortgage_rate:"7",mortgage_term:"30",notes:"",pNegCF:50});
    setShowAdd(false);
  };
  const removeProp=id=>setProperties(p=>p.filter(x=>x.id!==id));
  const handleSave=()=>onSave({portfolio_properties:properties,portfolio_value:totals.tv});

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      {refiProp&&<RefiSimulator prop={refiProp} onClose={()=>setRefiProp(null)}/>}

      {/* ── DASHBOARD HEADER ── */}
      <div style={{background:"linear-gradient(135deg,#0f172a 0%,#1a2744 100%)",borderRadius:18,padding:"24px 28px",boxShadow:"0 6px 28px rgba(0,0,0,0.22)"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
          <div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:800,color:"white",marginBottom:3}}>Portfolio Risk Dashboard</h2>
            <p style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>{totals.count} propert{totals.count===1?"y":"ies"} · Decision Intelligence</p>
          </div>
          {/* Portfolio posture badge */}
          {riskData&&(
            <div style={{background:riskData.postureBg,borderRadius:10,padding:"8px 14px",border:`1.5px solid ${riskData.postureColor}30`}}>
              <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:2}}>Portfolio Posture</div>
              <div style={{fontSize:16,fontWeight:900,color:riskData.postureColor}}>{riskData.postureIcon} {riskData.posture}</div>
            </div>
          )}
        </div>

        {/* KPI strip */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:1,background:"rgba(255,255,255,0.05)",borderRadius:10,overflow:"hidden",marginBottom:16}}>
          {[
            ["Total CF",    fmtD(totals.tmcf)+"/mo", totals.tmcf>=0?"#6ee7b7":"#fca5a5"],
            ["Avg DSCR",    totals.wdscr.toFixed(2)+"x", totals.wdscr>=1.25?"#6ee7b7":totals.wdscr>=1.10?"#fde68a":"#fca5a5"],
            ["Capital",     fmtM(riskData?.capitalDeployed??0), "#e2e8f0"],
            ["P(One Neg)",  riskData?Math.round(riskData.pAtLeastOneNeg*100)+"%":"—", riskData&&riskData.pAtLeastOneNeg<0.30?"#6ee7b7":riskData&&riskData.pAtLeastOneNeg<0.60?"#fde68a":"#fca5a5"],
            ["Liquidity",   fmtD(riskData?.liquidityBuffer??0)+"/mo", "#e2e8f0"],
          ].map(([l,v,col])=>(
            <div key={l} style={{padding:"10px 8px",textAlign:"center"}}>
              <div style={{fontSize:8,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.06em",marginBottom:3}}>{l}</div>
              <div style={{fontSize:12,fontWeight:800,fontFamily:"'DM Mono',monospace",color:col}}>{v}</div>
            </div>
          ))}
        </div>

        {/* Risk aggregation row */}
        {riskData&&(
          <div style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"12px 16px",border:"1px solid rgba(255,255,255,0.08)"}}>
            <div style={{fontSize:9,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.06em",marginBottom:8}}>Portfolio Risk Aggregation</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {[
                {label:"P(At Least 1 Neg)", value:Math.round(riskData.pAtLeastOneNeg*100)+"%",
                 sub:"Probability any property goes negative", color:riskData.pAtLeastOneNeg<0.30?"#6ee7b7":riskData.pAtLeastOneNeg<0.60?"#fde68a":"#fca5a5"},
                {label:"Concentration Risk", value:Math.round(riskData.concentrationRisk*100)+"%",
                 sub:"Largest property's share of portfolio CF", color:riskData.concentrationRisk<0.40?"#6ee7b7":riskData.concentrationRisk<0.55?"#fde68a":"#fca5a5"},
                {label:"Weighted Avg DSCR", value:totals.wdscr.toFixed(2)+"x",
                 sub:"Debt service coverage across portfolio", color:totals.wdscr>=1.25?"#6ee7b7":totals.wdscr>=1.10?"#fde68a":"#fca5a5"},
              ].map(({label,value,sub,color})=>(
                <div key={label} style={{background:"rgba(255,255,255,0.05)",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.35)",textTransform:"uppercase",fontWeight:700,marginBottom:4}}>{label}</div>
                  <div style={{fontSize:18,fontWeight:900,fontFamily:"'DM Mono',monospace",color,marginBottom:3}}>{value}</div>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.25)",lineHeight:1.3}}>{sub}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:10,padding:"8px 12px",background:`${riskData.postureColor}15`,borderRadius:8,border:`1px solid ${riskData.postureColor}25`}}>
              <span style={{fontSize:10,color:riskData.postureColor,fontWeight:700}}>{riskData.postureIcon} {riskData.posture}: </span>
              <span style={{fontSize:10,color:"rgba(255,255,255,0.5)"}}>{riskData.postureDesc}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── TABS ── */}
      <div style={{display:"flex",background:"#f3f4f6",borderRadius:10,padding:4,gap:3}}>
        {[["properties","🏘️ Properties"],["risk","⚠️ Risk Intelligence"],["projections","📈 Projections"]].map(([key,label])=>(
          <button key={key} onClick={()=>setPortfolioTab(key)} style={{flex:1,padding:"8px 12px",borderRadius:8,border:"none",background:portfolioTab===key?"white":"transparent",color:portfolioTab===key?"#111827":"#6b7280",fontSize:12,fontWeight:portfolioTab===key?700:500,cursor:"pointer",boxShadow:portfolioTab===key?"0 1px 4px rgba(0,0,0,0.08)":"none",transition:"all 0.15s"}}>{label}</button>
        ))}
      </div>

      {/* ── PROPERTIES TAB ── */}
      {portfolioTab==="properties"&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {properties.length===0?(
            <div style={{textAlign:"center",padding:"48px 24px",background:"white",borderRadius:16,border:"2px dashed #e5e7eb"}}>
              <div style={{fontSize:36,marginBottom:12}}>🏘️</div>
              <h3 style={{fontSize:16,fontWeight:700,color:"#374151",marginBottom:6}}>No properties yet</h3>
              <p style={{fontSize:13,color:"#9ca3af",marginBottom:16}}>Add your properties to analyze portfolio risk and aggregated metrics.</p>
              <button onClick={()=>setShowAdd(true)} style={{padding:"10px 20px",borderRadius:10,border:"none",background:"#059669",color:"white",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Add First Property</button>
            </div>
          ):(
            propCalcs.map(p=>{
              const isExp=expandedProp===p.id;
              const sColor=p.survivalLabel==="Strong"?"#059669":p.survivalLabel==="Stable"?"#2563eb":p.survivalLabel==="Fragile"?"#d97706":"#dc2626";
              const iColor=p.incomeLabel==="Strong"?"#059669":p.incomeLabel==="Moderate"?"#2563eb":"#dc2626";
              return(
                <div key={p.id} style={{background:"white",borderRadius:14,border:"1.5px solid #f0f0f0",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                  <div style={{padding:"14px 16px",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,cursor:"pointer"}} onClick={()=>setExpandedProp(isExp?null:p.id)}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                        <span style={{fontSize:13,fontWeight:700,color:"#111827",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.address||"Unnamed Property"}</span>
                        <span style={{fontSize:9,color:"#9ca3af",background:"#f3f4f6",padding:"2px 7px",borderRadius:100,flexShrink:0}}>{p.type}</span>
                      </div>
                      {/* Pillar badges */}
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        {[
                          {label:p.survivalLabel,color:sColor,icon:"🧱"},
                          {label:p.incomeLabel,  color:iColor,icon:"💵"},
                        ].map(({label,color,icon})=>(
                          <span key={icon} style={{fontSize:9,fontWeight:700,color,background:`${color}15`,padding:"2px 7px",borderRadius:100}}>{icon} {label}</span>
                        ))}
                        {p.mcf>=0?<span style={{fontSize:9,color:"#059669",background:"#f0fdf4",padding:"2px 7px",borderRadius:100,fontWeight:700}}>{fmtD(p.mcf)}/mo</span>:<span style={{fontSize:9,color:"#dc2626",background:"#fef2f2",padding:"2px 7px",borderRadius:100,fontWeight:700}}>{fmtD(p.mcf)}/mo</span>}
                        {p.flags.map(f=><span key={f} style={{fontSize:9,color:"#ea580c",background:"#fff7ed",padding:"2px 7px",borderRadius:100,fontWeight:600}}>{f}</span>)}
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#111827"}}>{fmtM(parseFloat(p.value)||0)}</div>
                        <div style={{fontSize:10,color:"#9ca3af"}}>{fmtD(p.equity)} equity</div>
                      </div>
                      <span style={{fontSize:11,color:"#9ca3af",transition:"transform 0.2s",transform:isExp?"rotate(180deg)":"none"}}>▼</span>
                    </div>
                  </div>

                  {isExp&&(
                    <div style={{borderTop:"1px solid #f3f4f6",padding:"14px 16px",background:"#fafafa"}}>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
                        {[
                          ["DSCR",       p.dscr.toFixed(2)+"x",   p.dscr>=1.25?"#059669":p.dscr>=1.0?"#d97706":"#dc2626"],
                          ["Break-even", fmtP(p.breakEven),        p.breakEven<=0.85?"#059669":p.breakEven<=0.92?"#d97706":"#dc2626"],
                          ["CoC",        fmtP(p.coc),              p.coc>=0.08?"#059669":p.coc>=0.04?"#d97706":"#dc2626"],
                          ["Equity",     fmtD(p.equity),           "#374151"],
                          ["LTV",        fmtP(p.ltv),              p.ltv<=0.75?"#059669":p.ltv<=0.85?"#d97706":"#dc2626"],
                          ["NOI/yr",     fmtD(p.noi),              p.noi>0?"#059669":"#dc2626"],
                        ].map(([l,v,col])=>(
                          <div key={l} style={{background:"white",borderRadius:8,padding:"8px 10px",border:"1px solid #f0f0f0"}}>
                            <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:2}}>{l}</div>
                            <div style={{fontSize:13,fontWeight:800,fontFamily:"'DM Mono',monospace",color:col}}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>setRefiProp(p)} style={{flex:1,padding:"8px",borderRadius:8,border:"1.5px solid #e5e7eb",background:"white",fontSize:11,fontWeight:700,cursor:"pointer",color:"#374151"}}>♻️ Refi Sim</button>
                        <button onClick={()=>removeProp(p.id)} style={{padding:"8px 12px",borderRadius:8,border:"1.5px solid #fee2e2",background:"#fef2f2",fontSize:11,fontWeight:700,cursor:"pointer",color:"#dc2626"}}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {properties.length>0&&(
            <button onClick={()=>setShowAdd(!showAdd)} style={{padding:"11px",borderRadius:10,border:"1.5px dashed #d1d5db",background:"transparent",fontSize:12,fontWeight:600,cursor:"pointer",color:"#6b7280",width:"100%"}}>
              {showAdd?"✕ Cancel":"+ Add Property"}
            </button>
          )}

          {showAdd&&(
            <div style={{background:"white",borderRadius:14,border:"1.5px solid #e5e7eb",padding:"18px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:14}}>Add Property</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  <label style={{fontSize:10,fontWeight:600,color:"#6b7280",textTransform:"uppercase"}}>Address</label>
                  <input value={newProp.address} onChange={e=>np("address")(e.target.value)} placeholder="123 Main St, City, ST" style={{border:"1.5px solid #e5e7eb",borderRadius:8,padding:"8px 12px",fontSize:13,outline:"none"}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[["Property Value","value","$"],["Loan Balance","loan_balance","$"],["Monthly Rent","monthly_rent","$"],["Monthly Expenses","monthly_expenses","$"],["Monthly Mortgage","monthly_mortgage","$"],["Mortgage Rate","mortgage_rate","%"],["Mortgage Term","mortgage_term","yr"],["Est. P(Neg CF)","pNegCF","%"]].map(([l,k,unit])=>(
                    <div key={k} style={{display:"flex",flexDirection:"column",gap:3}}>
                      <label style={{fontSize:10,fontWeight:600,color:"#6b7280",textTransform:"uppercase"}}>{l}</label>
                      <div style={{display:"flex",alignItems:"center",border:"1.5px solid #e5e7eb",borderRadius:8,overflow:"hidden"}}>
                        {unit==="$"&&<span style={{padding:"0 8px",color:"#9ca3af",fontSize:12,background:"#f9fafb",borderRight:"1px solid #e5e7eb"}}>$</span>}
                        <input type="number" value={newProp[k]||""} onChange={e=>np(k)(e.target.value)} style={{flex:1,border:"none",outline:"none",padding:"8px 10px",fontSize:13,fontFamily:"'DM Mono',monospace",color:"#111827",background:"transparent"}}/>
                        {unit!=="$"&&<span style={{padding:"0 8px",color:"#9ca3af",fontSize:12,background:"#f9fafb",borderLeft:"1px solid #e5e7eb"}}>{unit}</span>}
                      </div>
                    </div>
                  ))}
                </div>
                <select value={newProp.type} onChange={e=>np("type")(e.target.value)} style={{border:"1.5px solid #e5e7eb",borderRadius:8,padding:"8px 12px",fontSize:13,background:"white",outline:"none"}}>
                  {["Single Family","Multi-Family","Commercial","Condo/Townhouse","Land"].map(t=><option key={t}>{t}</option>)}
                </select>
                <button onClick={addProp} style={{padding:"10px",borderRadius:10,border:"none",background:"#059669",color:"white",fontSize:13,fontWeight:700,cursor:"pointer"}}>Add Property</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── RISK INTELLIGENCE TAB ── */}
      {portfolioTab==="risk"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>

          {/* Portfolio posture card */}
          {riskData&&(
            <div style={{background:riskData.postureBg,borderRadius:14,border:`2px solid ${riskData.postureColor}30`,padding:"18px 20px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:riskData.postureColor,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Portfolio Posture</div>
                  <div style={{fontSize:26,fontWeight:900,color:riskData.postureColor,lineHeight:1}}>{riskData.postureIcon} {riskData.posture}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>Properties at risk</div>
                  <div style={{fontSize:22,fontWeight:900,fontFamily:"'DM Mono',monospace",color:riskData.negCFProps>0?"#dc2626":"#059669"}}>{riskData.negCFProps}</div>
                </div>
              </div>
              <p style={{fontSize:12,color:"#374151",margin:0,lineHeight:1.5}}>{riskData.postureDesc}</p>
            </div>
          )}

          {/* Risk probability */}
          {riskData&&(
            <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
              <div style={{padding:"11px 16px",borderBottom:"1px solid #f3f4f6",background:"#f5f3ff"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#6d28d9",textTransform:"uppercase",letterSpacing:"0.06em"}}>🎲 Portfolio Probability</div>
                <div style={{fontSize:9,color:"#9ca3af",marginTop:2}}>Aggregate risk across all properties</div>
              </div>
              <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:12}}>
                <ProbabilityBar label="At Least 1 Property Goes Negative" pct={Math.round(riskData.pAtLeastOneNeg*100)}
                  humanLabel={`Derived from individual property probabilities using: 1 − ∏(1 − P_i)`}/>
                <ProbabilityBar label="Portfolio Avg P(Neg CF)" pct={Math.round(riskData.portfolioPNeg)}
                  humanLabel="Weighted average probability across all properties"/>
                {riskData.concentrationRisk>0.40&&(
                  <div style={{padding:"10px 12px",background:"#fffbeb",borderRadius:8,border:"1px solid #fde68a",fontSize:11,color:"#92400e",fontWeight:600}}>
                    ⚠️ Concentration risk: {Math.round(riskData.concentrationRisk*100)}% of portfolio CF from one property. Diversification recommended.
                  </div>
                )}
                {riskData.liquidityBuffer>0&&(
                  <div style={{padding:"10px 12px",background:"#fef2f2",borderRadius:8,border:"1px solid #fecaca",fontSize:11,color:"#dc2626",fontWeight:600}}>
                    💧 Liquidity buffer required: {fmtD(riskData.liquidityBuffer)}/mo to cover negative-CF properties
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Portfolio stress test */}
          {stressData&&(
            <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
              <div style={{padding:"11px 16px",borderBottom:"1px solid #f3f4f6",background:"#fff7ed"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#ea580c",textTransform:"uppercase",letterSpacing:"0.06em"}}>🔥 Portfolio Stress Test</div>
                <div style={{fontSize:9,color:"#9ca3af",marginTop:2}}>Rent −10% · 1 vacancy/property · Rates +100bps</div>
              </div>
              <div style={{padding:"14px 16px"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
                  {[
                    ["Stressed CF",     fmtD(stressData.totalStressCF)+"/mo",    stressData.totalStressCF>=0?"#059669":"#dc2626"],
                    ["Props Go Neg",    stressData.propsGoNeg+"/"+properties.length, stressData.propsGoNeg===0?"#059669":stressData.propsGoNeg<properties.length*0.5?"#d97706":"#dc2626"],
                    ["Capital Need",    fmtD(stressData.capitalShortfall)+"/mo",  stressData.capitalShortfall===0?"#059669":"#dc2626"],
                  ].map(([l,v,col])=>(
                    <div key={l} style={{background:"#f9fafb",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                      <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:3}}>{l}</div>
                      <div style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono',monospace",color:col}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {stressData.results.map((r,idx)=>(
                    <div key={idx} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px",background:r.goesNeg?"#fef2f2":"#f9fafb",borderRadius:8,gap:8}}>
                      <span style={{fontSize:11,color:"#374151",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.address||`Property ${idx+1}`}</span>
                      <div style={{display:"flex",gap:12,alignItems:"center",flexShrink:0}}>
                        <span style={{fontSize:10,color:"#9ca3af"}}>base {fmtD(r.baseMCF)}</span>
                        <span style={{fontSize:11,fontWeight:700,fontFamily:"'DM Mono',monospace",color:r.goesNeg?"#dc2626":"#059669"}}>{fmtD(r.stressMCF)}/mo</span>
                        {r.goesNeg&&<span style={{fontSize:9,color:"#dc2626",background:"#fecaca",padding:"1px 5px",borderRadius:100,fontWeight:700}}>⚠ Neg</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Survival distribution */}
          {propCalcs.length>0&&(
            <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",padding:"16px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>Survival Distribution</div>
              {[["Strong","#059669"],["Stable","#2563eb"],["Fragile","#d97706"],["Critical","#ea580c"],["Fail","#dc2626"]].map(([label,color])=>{
                const count=propCalcs.filter(p=>p.survivalLabel===label).length;
                if(count===0)return null;
                return(
                  <div key={label} style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
                    <div style={{width:60,fontSize:10,fontWeight:700,color,textAlign:"right"}}>{label}</div>
                    <div style={{flex:1,height:14,background:"#f3f4f6",borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${count/propCalcs.length*100}%`,background:color,borderRadius:3,transition:"width 0.5s"}}/>
                    </div>
                    <div style={{fontSize:11,fontWeight:700,color:"#374151",width:20,textAlign:"center"}}>{count}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PROJECTIONS TAB ── */}
      {portfolioTab==="projections"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",padding:"16px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:12}}>Growth Assumptions</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              {[["Appreciation %",projGrowth,setProjGrowth],["Rent Growth %",projRentGrowth,setProjRentGrowth],["Expense Inflation %",projExpGrowth,setProjExpGrowth],["Projection Years",projYears,setProjYears]].map(([l,v,setter])=>(
                <div key={l} style={{display:"flex",flexDirection:"column",gap:4}}>
                  <label style={{fontSize:10,fontWeight:600,color:"#6b7280",textTransform:"uppercase"}}>{l}</label>
                  <div style={{display:"flex",alignItems:"center",border:"1.5px solid #e5e7eb",borderRadius:8,overflow:"hidden"}}>
                    <input type="number" value={v} onChange={e=>setter(+e.target.value)} step="0.5" style={{flex:1,border:"none",outline:"none",padding:"8px 12px",fontSize:13,fontFamily:"'DM Mono',monospace",color:"#111827"}}/>
                  </div>
                </div>
              ))}
            </div>
            <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:8}}>Future Acquisitions</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[["Properties/yr",projAcqCount,setProjAcqCount],["Avg Value",projAcqValue,setProjAcqValue],["CF/unit",projAcqCF,setProjAcqCF]].map(([l,v,setter])=>(
                <div key={l} style={{display:"flex",flexDirection:"column",gap:4}}>
                  <label style={{fontSize:10,fontWeight:600,color:"#6b7280",textTransform:"uppercase"}}>{l}</label>
                  <input type="number" value={v} onChange={e=>setter(+e.target.value)} style={{border:"1.5px solid #e5e7eb",borderRadius:8,padding:"8px 12px",fontSize:13,fontFamily:"'DM Mono',monospace",color:"#111827",outline:"none"}}/>
                </div>
              ))}
            </div>
          </div>

          <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",overflow:"hidden"}}>
            <div style={{padding:"10px 16px",borderBottom:"1px solid #f3f4f6",fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.07em"}}>Portfolio Projections</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{background:"#f9fafb"}}>{["Yr","Value","Equity","CF/mo","Props"].map(h=><th key={h} style={{padding:"7px 12px",textAlign:"right",fontWeight:700,color:"#9ca3af",fontSize:9,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                <tbody>{projections.map((p,idx)=>(
                  <tr key={idx} style={{borderTop:"1px solid #f9fafb"}}>
                    <td style={{padding:"7px 12px",fontWeight:700,color:"#374151",textAlign:"right"}}>{p.yr}</td>
                    <td style={{padding:"7px 12px",textAlign:"right",fontFamily:"'DM Mono',monospace",color:"#059669",fontWeight:600}}>{fmtM(p.val)}</td>
                    <td style={{padding:"7px 12px",textAlign:"right",fontFamily:"'DM Mono',monospace",color:"#7c3aed",fontWeight:600}}>{fmtM(p.equity)}</td>
                    <td style={{padding:"7px 12px",textAlign:"right",fontFamily:"'DM Mono',monospace",color:p.mcf>=0?"#059669":"#dc2626",fontWeight:700}}>{fmtD(p.mcf)}</td>
                    <td style={{padding:"7px 12px",textAlign:"right",color:"#374151"}}>{p.props}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Btn variant="primary" onClick={handleSave}>💾 Save Portfolio</Btn>
    </div>
  );
}
// ─── Profile Page ──────────────────────────────────────────────────────────────
function ProfilePage({user,profile,onUpdate,onSignOut,onBack}) {
  const [tab,setTab]=useState("profile");
  const [form,setForm]=useState({full_name:"",phone:"",location:"",investor_type:"",bio:"",title:"",portfolio_value:0,portfolio_public:false,mentoring_enabled:false,hourly_rate:"",calendly_link:"",mentoring_bio:"",...profile});
  const [loading,setLoading]=useState(false);const [saved,setSaved]=useState(false);const [err,setErr]=useState("");
  const [showVerifModal,setShowVerifModal]=useState(false);
  const f=k=>v=>setForm(p=>({...p,[k]:v}));
  const medal=getMedal(+(form.portfolio_value||0));
  const initials=(form.full_name||user.email||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);

  const handleSave=async()=>{
    if(!form.full_name.trim()){setErr("Name is required.");return;}
    setLoading(true);setErr("");
    try{
      const updated={...form,id:user.id,email:user.email,updated_at:new Date().toISOString()};
      await supabase.upsertProfile(updated);
      onUpdate(updated);setSaved(true);setTimeout(()=>setSaved(false),2500);
    }catch(e){setErr(e.message||"Save failed.");}finally{setLoading(false);}
  };

  const handlePortfolioSave=async({portfolio_properties,portfolio_value})=>{
    const updated={...form,portfolio_properties,portfolio_value,id:user.id,email:user.email};
    setForm(updated);
    setLoading(true);
    try{await supabase.upsertProfile(updated);onUpdate(updated);setSaved(true);setTimeout(()=>setSaved(false),2500);}
    catch(e){setErr(e.message);}finally{setLoading(false);}
  };

  return (
    <div style={{minHeight:"100vh",background:"#f9fafb",fontFamily:"'DM Sans',sans-serif"}}>
      {showVerifModal&&<VerificationModal user={user} profile={profile} onClose={()=>setShowVerifModal(false)} onSubmitted={()=>{setForm(p=>({...p,verification_pending:true}));}}/>}
      <header style={{background:"white",borderBottom:"1px solid #e5e7eb",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:960,margin:"0 auto",padding:"0 28px",display:"flex",alignItems:"center",justifyContent:"space-between",height:58}}>
          <Logo onClick={onBack}/>
          <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,border:"1.5px solid #e5e7eb",background:"white",color:"#6b7280",fontSize:13,cursor:"pointer"}}>← Back to App</button>
        </div>
      </header>

      <div style={{maxWidth:960,margin:"0 auto",padding:"40px 28px"}}>
        {/* Hero */}
        <div style={{background:"linear-gradient(135deg,#064e3b,#065f46)",borderRadius:20,padding:"32px 40px",marginBottom:24,display:"flex",alignItems:"center",gap:24,flexWrap:"wrap",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",right:-30,top:-30,width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,0.04)",pointerEvents:"none"}}/>
          <div style={{width:76,height:76,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,border:"3px solid rgba(255,255,255,0.2)"}}>
            <span style={{fontSize:26,fontWeight:800,color:"white",fontFamily:"'Fraunces',serif"}}>{initials}</span>
          </div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4,flexWrap:"wrap"}}>
              <h1 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"white"}}>{form.full_name||"Your Profile"}</h1>
              {form.is_verified&&<span style={{fontSize:11,background:"rgba(16,185,129,0.3)",color:"#6ee7b7",border:"1px solid rgba(110,231,183,0.3)",borderRadius:100,padding:"2px 10px",fontWeight:700}}>✓ Verified</span>}
              {form.verification_pending&&!form.is_verified&&<span style={{fontSize:11,background:"rgba(251,191,36,0.2)",color:"#fbbf24",border:"1px solid rgba(251,191,36,0.3)",borderRadius:100,padding:"2px 10px",fontWeight:700}}>⏳ Pending Review</span>}
            </div>
            {form.title&&<p style={{fontSize:13,color:"rgba(255,255,255,0.7)",marginBottom:4}}>{form.title}</p>}
            <p style={{fontSize:13,color:"rgba(255,255,255,0.55)"}}>{user.email}</p>
          </div>
          {/* Medal */}
          <div style={{textAlign:"center",background:"rgba(255,255,255,0.1)",borderRadius:16,padding:"18px 22px",border:"1px solid rgba(255,255,255,0.15)",flexShrink:0}}>
            <div style={{fontSize:42,marginBottom:6}}>{medal.icon}</div>
            <div style={{fontSize:13,fontWeight:800,color:"white"}}>{medal.label}</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginTop:2}}>{medal.desc}</div>
            {form.portfolio_public?<div style={{fontSize:12,fontWeight:700,color:"#6ee7b7",marginTop:8}}>{fmtM(+(form.portfolio_value)||0)}</div>:<div style={{fontSize:11,color:"rgba(255,255,255,0.35)",marginTop:8}}>🔒 Private</div>}
          </div>
        </div>

        {/* Medal progression */}
        <div style={{background:"white",borderRadius:16,border:"1.5px solid #e5e7eb",padding:"18px 22px",marginBottom:22}}>
          <p style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:14,textTransform:"uppercase",letterSpacing:"0.06em"}}>🏆 Rank Progression</p>
          <div style={{display:"flex",alignItems:"center",gap:2}}>
            {MEDALS.map((m,idx)=>{const isActive=m.id===medal.id,isPast=MEDALS.indexOf(medal)>idx;return(
              <div key={m.id} style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:20,marginBottom:4,opacity:isPast||isActive?1:0.28}}>{m.icon}</div>
                <div style={{height:6,background:isPast||isActive?"#10b981":"#e5e7eb",borderRadius:3,marginBottom:4,border:isActive?"2px solid #059669":"none"}}/>
                <div style={{fontSize:10,fontWeight:isActive?800:500,color:isActive?"#059669":"#9ca3af"}}>{m.label}</div>
                <div style={{fontSize:9,color:"#d1d5db"}}>{fmtM(m.min)}</div>
              </div>
            );})}
          </div>
          <p style={{fontSize:12,color:"#6b7280",marginTop:12,textAlign:"center"}}>
            {medal.id==="diamond"?"🎉 You've reached the highest rank!":`Add ${fmtM((MEDALS[MEDALS.indexOf(medal)+1]?.min||0)-(+(form.portfolio_value)||0))} to reach ${MEDALS[MEDALS.indexOf(medal)+1]?.label}`}
          </p>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",background:"#f3f4f6",borderRadius:12,padding:4,gap:3,marginBottom:24,flexWrap:"wrap"}}>
          {[["profile","👤 Profile"],["portfolio","🏠 Portfolio"],["mentoring","🎓 Mentoring"],["verify","✅ Verify"]].map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)} style={{flex:1,padding:"9px 12px",borderRadius:9,border:"none",background:tab===key?"white":"transparent",color:tab===key?"#111827":"#6b7280",fontSize:13,fontWeight:tab===key?700:500,cursor:"pointer",boxShadow:tab===key?"0 1px 4px rgba(0,0,0,0.08)":"none",transition:"all 0.15s",minWidth:120}}>{label}</button>
          ))}
        </div>

        {/* Profile tab */}
        {tab==="profile"&&(
          <div style={{background:"white",borderRadius:20,border:"1.5px solid #e5e7eb",padding:"32px 36px"}}>
            <h2 style={{fontSize:17,fontWeight:700,color:"#111827",marginBottom:22}}>Edit Profile</h2>
            {err&&<div style={{marginBottom:16}}><Alert type="error">{err}</Alert></div>}
            {saved&&<div style={{marginBottom:16}}><Alert type="success">Profile saved successfully!</Alert></div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
              <Input label="Full name *" value={form.full_name} onChange={f("full_name")} placeholder="Jane Smith" icon="👤"/>
              <Input label="Professional title" value={form.title||""} onChange={f("title")} placeholder="e.g. Managing Partner" icon="💼"/>
              <Input label="Phone" value={form.phone||""} onChange={f("phone")} placeholder="+1 (555) 000-0000" icon="📱"/>
              <Input label="Location" value={form.location||""} onChange={f("location")} placeholder="Atlanta, GA" icon="📍"/>
            </div>
            <div style={{marginBottom:16}}><Sel label="Investor type" value={form.investor_type||""} onChange={f("investor_type")} options={INVESTOR_TYPES} placeholder="What kind of investor?"/></div>
            <div style={{marginBottom:24}}>
              <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:5}}>Bio</label>
              <textarea value={form.bio||""} onChange={e=>f("bio")(e.target.value)} rows={4} style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:14,color:"#111827",outline:"none",resize:"vertical",fontFamily:"'DM Sans',sans-serif"}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:24,padding:"14px 16px",background:"#f9fafb",borderRadius:10,border:"1.5px solid #e5e7eb"}}>
              <Toggle value={form.portfolio_public} onChange={f("portfolio_public")} label={form.portfolio_public?"Portfolio value is public 🌍":"Portfolio value is private 🔒"}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <Btn variant="danger" onClick={onSignOut}>Sign Out</Btn>
              <Btn variant="primary" loading={loading} onClick={handleSave}>Save Changes</Btn>
            </div>
          </div>
        )}

        {/* Portfolio tab */}
        {tab==="portfolio"&&<PortfolioAnalyzer profile={{...form,portfolio_properties:form.portfolio_properties||[]}} onSave={handlePortfolioSave}/>}

        {/* Mentoring tab */}
        {tab==="mentoring"&&(
          <div style={{background:"white",borderRadius:20,border:"1.5px solid #e5e7eb",padding:"32px 36px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22,flexWrap:"wrap",gap:14}}>
              <div>
                <h2 style={{fontSize:17,fontWeight:700,color:"#111827",marginBottom:4}}>🎓 Mentoring</h2>
                <p style={{fontSize:13,color:"#6b7280"}}>Earn money by sharing your expertise with fellow investors</p>
              </div>
              <Toggle value={form.mentoring_enabled} onChange={v=>{f("mentoring_enabled")(v);}} label={form.mentoring_enabled?"Mentoring Active":"Mentoring Off"}/>
            </div>
            {!form.is_verified&&(
              <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:12,padding:"16px 18px",marginBottom:22}}>
                <p style={{fontSize:13,fontWeight:600,color:"#d97706",marginBottom:4}}>⚠️ Verification Required</p>
                <p style={{fontSize:13,color:"#92400e",lineHeight:1.6,marginBottom:10}}>You must be verified to offer mentoring services and appear on the leaderboard. Verification is quick and free.</p>
                <button onClick={()=>setTab("verify")} style={{padding:"8px 16px",borderRadius:8,border:"none",background:"#d97706",color:"white",fontSize:13,fontWeight:600,cursor:"pointer"}}>Get Verified →</button>
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:16,opacity:form.mentoring_enabled?1:0.5,pointerEvents:form.mentoring_enabled?"auto":"none"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                <Input label="Hourly rate ($)" type="number" value={form.hourly_rate||""} onChange={f("hourly_rate")} placeholder="e.g. 150" icon="💵" hint="What you charge per session hour"/>
                <Input label="Calendly link" value={form.calendly_link||""} onChange={f("calendly_link")} placeholder="https://calendly.com/yourname" icon="📅" hint="Clients book directly through Calendly"/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:5}}>Mentoring bio / specialties</label>
                <textarea value={form.mentoring_bio||""} onChange={e=>f("mentoring_bio")(e.target.value)} placeholder="What topics do you specialize in? What results have you achieved? What can clients expect from a session?" rows={5} style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:14,color:"#111827",outline:"none",resize:"vertical",fontFamily:"'DM Sans',sans-serif"}}/>
              </div>
              <div style={{background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:12,padding:"16px 18px"}}>
                <p style={{fontSize:13,fontWeight:600,color:"#059669",marginBottom:6}}>How DealSource Mentoring Works</p>
                <p style={{fontSize:13,color:"#374151",lineHeight:1.7}}>When enabled, your profile appears in the "Find a Mentor" section visible to all users. Clients book sessions through your Calendly link. DealSource charges a 10% platform fee, deducted when you withdraw earnings from your dashboard.</p>
              </div>
            </div>
            <div style={{marginTop:24,display:"flex",justifyContent:"flex-end"}}>
              <Btn variant="primary" loading={loading} onClick={handleSave}>Save Mentoring Settings</Btn>
            </div>
          </div>
        )}

        {/* Verification tab */}
        {tab==="verify"&&(
          <div style={{background:"white",borderRadius:20,border:"1.5px solid #e5e7eb",padding:"32px 36px"}}>
            <h2 style={{fontSize:17,fontWeight:700,color:"#111827",marginBottom:6}}>✅ Portfolio Verification</h2>
            <p style={{fontSize:14,color:"#6b7280",lineHeight:1.6,marginBottom:24}}>Verification is optional but unlocks your leaderboard spot, verified badge on all forum posts, and eligibility to offer mentoring services.</p>
            {form.is_verified?(
              <div style={{textAlign:"center",padding:"40px 24px"}}>
                <div style={{fontSize:52,marginBottom:16}}>✅</div>
                <h3 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"#059669",marginBottom:8}}>You're verified!</h3>
                <p style={{fontSize:14,color:"#6b7280"}}>Your portfolio has been verified. Your badge appears on all your posts and the leaderboard.</p>
              </div>
            ):form.verification_pending?(
              <div style={{textAlign:"center",padding:"40px 24px"}}>
                <div style={{fontSize:52,marginBottom:16}}>⏳</div>
                <h3 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"#d97706",marginBottom:8}}>Verification Pending</h3>
                <p style={{fontSize:14,color:"#6b7280"}}>We're reviewing your submission. You'll receive an email when it's approved — typically within 24–48 hours.</p>
              </div>
            ):(
              <>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:28}}>
                  {[["📋","Submit Document","Upload a mortgage statement, deed, or appraisal with your name + lender"],["🔍","We Review","Our team reviews within 24–48 hours. Sensitive info like account numbers can be redacted"],["✅","Get Verified","Receive your verified badge, leaderboard placement, and mentoring eligibility"]].map(([icon,t,d])=>(
                    <div key={t} style={{textAlign:"center",padding:"20px 16px",background:"#f9fafb",borderRadius:12,border:"1.5px solid #e5e7eb"}}>
                      <div style={{fontSize:28,marginBottom:10}}>{icon}</div>
                      <div style={{fontSize:13,fontWeight:700,color:"#111827",marginBottom:6}}>{t}</div>
                      <div style={{fontSize:12,color:"#6b7280",lineHeight:1.6}}>{d}</div>
                    </div>
                  ))}
                </div>
                <div style={{textAlign:"center"}}>
                  <Btn variant="primary" onClick={()=>setShowVerifModal(true)}>Submit for Verification →</Btn>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Save Deal Modal ───────────────────────────────────────────────────────────
function SaveDealModal({mode,onSave,onClose}) {
  const [name,setName]=useState("");
  const m=MODES.find(m=>m.key===mode);
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",backdropFilter:"blur(4px)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:"white",borderRadius:18,padding:36,maxWidth:400,width:"100%",boxShadow:"0 24px 60px rgba(0,0,0,0.15)",animation:"popIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both"}}>
        <div style={{fontSize:32,marginBottom:12}}>{m.icon}</div>
        <h3 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"#111827",marginBottom:6}}>Save this deal</h3>
        <p style={{fontSize:13,color:"#6b7280",marginBottom:22}}>Give it a name — a property address works great.</p>
        <input autoFocus type="text" placeholder="e.g. 123 Main St, Atlanta" value={name} onChange={e=>setName(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&name.trim())onSave(name.trim());}}
          style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:14,outline:"none",color:"#111827",fontFamily:"'DM Sans',sans-serif",marginBottom:14}}/>
        <div style={{display:"flex",gap:10}}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" fullWidth disabled={!name.trim()} onClick={()=>name.trim()&&onSave(name.trim())}>Save Deal →</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Deal Card ─────────────────────────────────────────────────────────────────
function SavedDealCard({deal,onLoad,onDelete}) {
  const m=MODES.find(m=>m.key===deal.mode);
  const [confirm,setConfirm]=useState(false);
  const date=new Date(deal.created_at||deal.savedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
  return (
    <div style={{background:"white",borderRadius:14,border:"1.5px solid #e5e7eb",overflow:"hidden",transition:"box-shadow 0.2s,transform 0.2s"}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 8px 28px rgba(0,0,0,0.08)";e.currentTarget.style.transform="translateY(-2px)";}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="translateY(0)";}}>
      <div style={{height:4,background:m.color,opacity:0.7}}/>
      <div style={{padding:"18px 20px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
          <span>{m.icon}</span>
          <span style={{fontSize:11,fontWeight:700,color:m.color,background:m.bg,padding:"2px 8px",borderRadius:100,border:`1px solid ${m.border}`}}>{m.label}</span>
        </div>
        <h4 style={{fontSize:15,fontWeight:700,color:"#111827",marginBottom:2}}>{deal.name}</h4>
        {deal.inputs?.address&&<p style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>📍 {deal.inputs.address}</p>}
        <p style={{fontSize:11,color:"#9ca3af",marginBottom:14}}>{date}</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          {[["label","primary"],["label2","secondary"]].map(([lbl,val])=>(
            <div key={lbl} style={{background:"#f9fafb",borderRadius:10,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#9ca3af",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{deal.metrics[lbl]}</div>
              <div style={{fontSize:18,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#111827"}}>{deal.metrics[val]}</div>
            </div>
          ))}
        </div>
        {confirm?(
          <div style={{display:"flex",gap:8}}>
            <Btn variant="ghost" small onClick={()=>setConfirm(false)}>Cancel</Btn>
            <Btn variant="danger" small fullWidth onClick={()=>onDelete(deal.id)}>Delete</Btn>
          </div>
        ):(
          <div style={{display:"flex",gap:8}}>
            <Btn variant="dark" fullWidth small onClick={()=>onLoad(deal)}>Load →</Btn>
            <button onClick={()=>setConfirm(true)} style={{padding:"7px 12px",borderRadius:7,border:"1.5px solid #fee2e2",background:"#fff5f5",color:"#dc2626",fontSize:12,cursor:"pointer"}}>✕</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Find a Mentor ─────────────────────────────────────────────────────────────
// ─── MENTORING MARKETPLACE ─────────────────────────────────────────────────────

// Tier system
function getMentorTier(sessions, rating) {
  const s=sessions||0, r=rating||0;
  if(s>=100&&r>=4.8) return{tier:4,label:"Elite",color:"#7c3aed",bg:"#f5f3ff",fee:5,badge:"💎",perks:"Homepage · Invite-only · 5% fee"};
  if(s>=20&&r>=4.7)  return{tier:3,label:"Featured",color:"#2563eb",bg:"#eff6ff",fee:7,badge:"⭐",perks:"Featured listing · Higher ranking · 7% fee"};
  if(s>=5&&r>=4.0)   return{tier:2,label:"Verified",color:"#059669",bg:"#f0fdf4",fee:10,badge:"✓",perks:"Verified badge · 10% fee"};
  return{tier:1,label:"New",color:"#6b7280",bg:"#f9fafb",fee:15,badge:"🌱",perks:"Building reputation · 15% fee"};
}

function StarRating({rating, count}) {
  const stars = Math.round(rating||0);
  return (
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      <div style={{display:"flex",gap:1}}>
        {[1,2,3,4,5].map(i=>(
          <span key={i} style={{fontSize:12,color:i<=stars?"#f59e0b":"#e5e7eb"}}>★</span>
        ))}
      </div>
      <span style={{fontSize:11,color:"#6b7280",fontWeight:600}}>{rating?(+rating).toFixed(1):"New"}{count>0?` (${count})`:""}</span>
    </div>
  );
}

// Booking modal
function BookingModal({mentor, user, profile, onClose, onBooked}) {
  const [step, setStep] = useState(1); // 1=select 2=confirm 3=done
  const [sessionType, setSessionType] = useState("single");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [goals, setGoals] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const sessionOptions = [
    {key:"single", label:"Single Session", duration:"60 min", price: mentor.hourly_rate||150, desc:"One-on-one deal review or strategy session"},
    {key:"bundle3", label:"3-Session Bundle", duration:"3 × 60 min", price: Math.round((mentor.hourly_rate||150)*3*0.85), desc:"Save 15% — ideal for accountability"},
    {key:"monthly", label:"Monthly Coaching", duration:"4 × 60 min/mo", price: Math.round((mentor.hourly_rate||150)*4*0.75), desc:"Ongoing support — save 25%"},
  ];
  const selected = sessionOptions.find(s=>s.key===sessionType);
  const platformFee = Math.round(selected.price * (getMentorTier(mentor.mentoring_sessions, mentor.avg_rating).fee/100));
  const mentorEarns = selected.price - platformFee;

  const availableTimes = ["9:00 AM","10:00 AM","11:00 AM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM"];

  const handleBook = async() => {
    setSubmitting(true);
    try {
      const booking = {
        mentor_id: mentor.id,
        client_id: user.id,
        client_name: profile?.full_name||"Anonymous",
        mentor_name: mentor.full_name,
        session_type: sessionType,
        session_date: selectedDate,
        session_time: selectedTime,
        goals: goals,
        amount: selected.price,
        platform_fee: platformFee,
        mentor_earns: mentorEarns,
        status: "pending",
        created_at: new Date().toISOString(),
      };
      await supabase._fetch("/rest/v1/bookings",{method:"POST",body:JSON.stringify(booking)}).catch(()=>{});
      setStep(3);
      onBooked&&onBooked(booking);
    } finally { setSubmitting(false); }
  };

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(4px)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:"white",borderRadius:22,padding:0,maxWidth:500,width:"100%",boxShadow:"0 32px 80px rgba(0,0,0,0.18)",overflow:"hidden",animation:"popIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both"}}>
        {/* Header */}
        <div style={{background:"linear-gradient(135deg,#064e3b,#065f46)",padding:"22px 28px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.6)",marginBottom:3}}>Booking session with</div>
            <div style={{fontSize:18,fontWeight:800,color:"white"}}>{mentor.full_name}</div>
            {mentor.title&&<div style={{fontSize:12,color:"rgba(255,255,255,0.6)"}}>{mentor.title}</div>}
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"white",width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:16}}>✕</button>
        </div>

        <div style={{padding:"24px 28px"}}>
          {step===1&&(<>
            <div style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:14}}>Choose session type</div>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
              {sessionOptions.map(opt=>(
                <button key={opt.key} onClick={()=>setSessionType(opt.key)} style={{padding:"14px 16px",borderRadius:12,border:`2px solid ${sessionType===opt.key?"#10b981":"#e5e7eb"}`,background:sessionType===opt.key?"#f0fdf4":"white",cursor:"pointer",textAlign:"left",transition:"all 0.15s",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:sessionType===opt.key?"#059669":"#374151"}}>{opt.label} <span style={{fontSize:11,color:"#9ca3af",fontWeight:400}}>({opt.duration})</span></div>
                    <div style={{fontSize:11,color:"#9ca3af"}}>{opt.desc}</div>
                  </div>
                  <div style={{fontSize:17,fontWeight:800,fontFamily:"'DM Mono',monospace",color:sessionType===opt.key?"#059669":"#111827",flexShrink:0,marginLeft:12}}>${opt.price}</div>
                </button>
              ))}
            </div>
            <Btn variant="primary" fullWidth onClick={()=>setStep(2)}>Continue →</Btn>
          </>)}

          {step===2&&(<>
            <div style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:14}}>Schedule & confirm</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:"#6b7280",textTransform:"uppercase",display:"block",marginBottom:5}}>Preferred Date</label>
                <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} min={new Date().toISOString().split("T")[0]}
                  style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:13,outline:"none",color:"#374151"}}/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:"#6b7280",textTransform:"uppercase",display:"block",marginBottom:5}}>Preferred Time</label>
                <select value={selectedTime} onChange={e=>setSelectedTime(e.target.value)} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:13,outline:"none",color:selectedTime?"#374151":"#9ca3af"}}>
                  <option value="">Select time...</option>
                  {availableTimes.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,fontWeight:600,color:"#6b7280",textTransform:"uppercase",display:"block",marginBottom:5}}>Your goals for this session</label>
              <textarea value={goals} onChange={e=>setGoals(e.target.value)} placeholder="e.g. I want to review a BRRRR deal and understand if the numbers work..." rows={3}
                style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:13,outline:"none",resize:"none",fontFamily:"'DM Sans',sans-serif",color:"#374151"}}/>
            </div>
            {/* Price breakdown */}
            <div style={{background:"#f9fafb",borderRadius:10,padding:"12px 14px",marginBottom:16,border:"1.5px solid #e5e7eb"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6b7280",textTransform:"uppercase",marginBottom:8}}>Booking Summary</div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:"#6b7280"}}>{selected.label}</span><span style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"#374151"}}>${selected.price}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:"#6b7280"}}>Platform fee ({getMentorTier(mentor.mentoring_sessions,mentor.avg_rating).fee}%)</span><span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:"#9ca3af"}}>Handled at checkout</span></div>
              <div style={{height:1,background:"#e5e7eb",margin:"8px 0"}}/>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,fontWeight:700,color:"#374151"}}>You pay</span><span style={{fontSize:16,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#059669"}}>${selected.price}</span></div>
              <div style={{fontSize:10,color:"#9ca3af",marginTop:4}}>Funds held in escrow · Released after session · Cancellation policy applies</div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn variant="ghost" onClick={()=>setStep(1)}>← Back</Btn>
              <Btn variant="primary" fullWidth loading={submitting} disabled={!selectedDate||!selectedTime} onClick={handleBook}>Confirm Booking →</Btn>
            </div>
          </>)}

          {step===3&&(
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:52,marginBottom:16}}>🎉</div>
              <h3 style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:800,color:"#111827",marginBottom:8}}>Session Requested!</h3>
              <p style={{fontSize:14,color:"#6b7280",lineHeight:1.6,marginBottom:20}}>Your booking request has been sent to <strong>{mentor.full_name}</strong>. They'll confirm within 24 hours. You'll receive a reminder before your session.</p>
              <div style={{background:"#f0fdf4",borderRadius:12,padding:"14px 16px",marginBottom:20,border:"1.5px solid #bbf7d0",textAlign:"left"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#059669",textTransform:"uppercase",marginBottom:8}}>Booking Details</div>
                <div style={{fontSize:13,color:"#374151"}}>{selected.label} · {selectedDate} at {selectedTime}</div>
                <div style={{fontSize:13,color:"#374151"}}>${selected.price} · Held in escrow until session completes</div>
              </div>
              <Btn variant="primary" fullWidth onClick={onClose}>Done</Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Review modal (shown after session)
function ReviewModal({booking, onClose, onSubmit}) {
  const [ratings, setRatings] = useState({knowledge:0,communication:0,value:0,recommend:0});
  const [comment, setComment] = useState("");
  const r=k=>v=>setRatings(p=>({...p,[k]:v}));
  const avg = Object.values(ratings).filter(v=>v>0).reduce((a,b,_,arr)=>a+b/arr.length,0);

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(4px)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:"white",borderRadius:20,padding:"28px",maxWidth:440,width:"100%",boxShadow:"0 24px 60px rgba(0,0,0,0.15)"}}>
        <h3 style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:800,color:"#111827",marginBottom:4}}>Rate Your Session</h3>
        <p style={{fontSize:12,color:"#9ca3af",marginBottom:20}}>with {booking?.mentor_name}</p>
        {[["knowledge","Knowledge & Expertise"],["communication","Communication"],["value","Value for Money"],["recommend","Would Recommend"]].map(([key,label])=>(
          <div key={key} style={{marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:6}}>{label}</div>
            <div style={{display:"flex",gap:6}}>
              {[1,2,3,4,5].map(star=>(
                <button key={star} onClick={()=>r(key)(star)} style={{fontSize:24,background:"none",border:"none",cursor:"pointer",color:star<=(ratings[key]||0)?"#f59e0b":"#e5e7eb",transition:"color 0.1s"}}>★</button>
              ))}
            </div>
          </div>
        ))}
        <textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Share your experience (optional)..." rows={3}
          style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:13,outline:"none",resize:"none",fontFamily:"'DM Sans',sans-serif",marginBottom:16,color:"#374151"}}/>
        <Btn variant="primary" fullWidth disabled={avg===0} onClick={()=>onSubmit({...ratings,avg,comment})}>Submit Review</Btn>
      </div>
    </div>
  );
}

function MentorDirectory({user, profile}) {
  const [mentors, setMentors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStrategy, setFilterStrategy] = useState("all");
  const [filterVerified, setFilterVerified] = useState(false);
  const [sortBy, setSortBy] = useState("rating");
  const [bookingMentor, setBookingMentor] = useState(null);
  const [reviewBooking, setReviewBooking] = useState(null);
  const [myBookings, setMyBookings] = useState([]);
  const [activeTab, setActiveTab] = useState("discover"); // discover | sessions

  useEffect(()=>{
    supabase._fetch("/rest/v1/profiles?is_verified=eq.true&mentoring_enabled=eq.true&select=*")
      .then(d=>{setMentors(Array.isArray(d)?d:[]);setLoading(false);})
      .catch(()=>setLoading(false));
    if(user?.id) {
      supabase._fetch(`/rest/v1/bookings?client_id=eq.${user.id}&order=created_at.desc&select=*`)
        .then(d=>setMyBookings(Array.isArray(d)?d:[]))
        .catch(()=>{});
    }
  },[user]);

  const filtered = useMemo(()=>{
    let list = [...mentors];
    if(filterStrategy!=="all") list=list.filter(m=>(m.investor_type||"").toLowerCase().includes(filterStrategy.toLowerCase())||(m.mentoring_bio||"").toLowerCase().includes(filterStrategy.toLowerCase()));
    if(filterVerified) list=list.filter(m=>m.is_verified);
    list.sort((a,b)=>{
      if(sortBy==="rating") return (b.avg_rating||0)-(a.avg_rating||0);
      if(sortBy==="sessions") return (b.mentoring_sessions||0)-(a.mentoring_sessions||0);
      if(sortBy==="price_low") return (a.hourly_rate||0)-(b.hourly_rate||0);
      if(sortBy==="price_high") return (b.hourly_rate||0)-(a.hourly_rate||0);
      return (b.portfolio_value||0)-(a.portfolio_value||0);
    });
    return list;
  },[mentors,filterStrategy,filterVerified,sortBy]);

  const submitReview = async(data) => {
    await supabase._fetch(`/rest/v1/bookings?id=eq.${reviewBooking.id}`,{method:"PATCH",body:JSON.stringify({rating:data.avg,review:data.comment,rated:true})}).catch(()=>{});
    setMyBookings(prev=>prev.map(b=>b.id===reviewBooking.id?{...b,rated:true}:b));
    setReviewBooking(null);
  };

  const strategies = ["all","BRRRR","Wholesale","Fix & Flip","Subject-To","Rental","Novation"];

  return (
    <div style={{maxWidth:1040,margin:"0 auto",padding:"28px"}}>
      {bookingMentor&&<BookingModal mentor={bookingMentor} user={user} profile={profile} onClose={()=>setBookingMentor(null)} onBooked={b=>setMyBookings(p=>[b,...p])}/>}
      {reviewBooking&&<ReviewModal booking={reviewBooking} onClose={()=>setReviewBooking(null)} onSubmit={submitReview}/>}

      {/* Header */}
      <div style={{marginBottom:24}}>
        <h2 style={{fontFamily:"'Fraunces',serif",fontSize:26,fontWeight:800,color:"#111827",marginBottom:4}}>🎓 Mentor Marketplace</h2>
        <p style={{fontSize:13,color:"#9ca3af"}}>Verified investors · Native booking · Escrow-protected payments</p>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",background:"#f3f4f6",borderRadius:10,padding:3,gap:2,marginBottom:22,maxWidth:360}}>
        {[["discover","🔍 Find a Mentor"],["sessions","📅 My Sessions"]].map(([key,label])=>(
          <button key={key} onClick={()=>setActiveTab(key)} style={{flex:1,padding:"8px 12px",borderRadius:8,border:"none",background:activeTab===key?"white":"transparent",color:activeTab===key?"#111827":"#6b7280",fontSize:13,fontWeight:activeTab===key?700:500,cursor:"pointer",boxShadow:activeTab===key?"0 1px 4px rgba(0,0,0,0.08)":"none",transition:"all 0.15s"}}>{label}</button>
        ))}
      </div>

      {/* ── DISCOVER TAB ── */}
      {activeTab==="discover"&&(<>
        {/* Filters */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20,alignItems:"center"}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {strategies.map(s=>(
              <button key={s} onClick={()=>setFilterStrategy(s)} style={{padding:"5px 13px",borderRadius:100,border:`1.5px solid ${filterStrategy===s?"#111827":"#e5e7eb"}`,background:filterStrategy===s?"#111827":"white",color:filterStrategy===s?"white":"#6b7280",fontSize:11,fontWeight:600,cursor:"pointer"}}>{s==="all"?"All Strategies":s}</button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
            <span style={{fontSize:11,color:"#6b7280",whiteSpace:"nowrap"}}>Sort by:</span>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:12,outline:"none",color:"#374151"}}>
              <option value="rating">⭐ Rating</option>
              <option value="sessions">🎓 Sessions</option>
              <option value="price_low">💲 Price: Low</option>
              <option value="price_high">💲 Price: High</option>
              <option value="portfolio">📈 Portfolio</option>
            </select>
          </div>
        </div>

        {loading?<div style={{textAlign:"center",padding:"60px",color:"#9ca3af"}}>Loading mentors...</div>
        :filtered.length===0?(
          <div style={{textAlign:"center",padding:"80px 24px"}}>
            <div style={{fontSize:52,marginBottom:16}}>🎓</div>
            <h3 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"#111827",marginBottom:8}}>No mentors found</h3>
            <p style={{fontSize:14,color:"#6b7280"}}>Try adjusting your filters, or check back soon.</p>
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:18}}>
            {filtered.map(m=>{
              const medal = getMedal(+(m.portfolio_value||0));
              const tier = getMentorTier(m.mentoring_sessions, m.avg_rating);
              return (
                <div key={m.id} style={{background:"white",borderRadius:18,border:"1.5px solid #e5e7eb",overflow:"hidden",transition:"all 0.2s",display:"flex",flexDirection:"column"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 12px 32px rgba(0,0,0,0.08)";}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}}>
                  {/* Tier color bar */}
                  <div style={{height:4,background:tier.color}}/>
                  <div style={{padding:"20px 22px",flex:1,display:"flex",flexDirection:"column"}}>
                    {/* Avatar + name */}
                    <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
                      <div style={{width:50,height:50,borderRadius:"50%",background:`linear-gradient(135deg,${tier.color},#059669)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,border:`2px solid ${tier.bg}`}}>
                        <span style={{fontSize:20,fontWeight:800,color:"white"}}>{(m.full_name||"?")[0].toUpperCase()}</span>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                          <span style={{fontSize:15,fontWeight:700,color:"#111827"}}>{m.full_name}</span>
                          <span style={{fontSize:14}}>{medal.icon}</span>
                        </div>
                        {m.title&&<p style={{fontSize:11,color:"#6b7280",marginBottom:3}}>{m.title}</p>}
                        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                          <span style={{fontSize:10,background:tier.bg,color:tier.color,borderRadius:100,padding:"1px 7px",fontWeight:700,border:`1px solid ${tier.color}30`}}>{tier.badge} {tier.label}</span>
                          {m.investor_type&&<span style={{fontSize:10,background:"#f3f4f6",color:"#6b7280",borderRadius:100,padding:"1px 7px"}}>{m.investor_type}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Rating */}
                    <div style={{marginBottom:12}}>
                      <StarRating rating={m.avg_rating} count={m.review_count||0}/>
                    </div>

                    {/* Stats */}
                    <div style={{display:"flex",gap:16,marginBottom:12}}>
                      {[["Sessions",m.mentoring_sessions||0],["Deals",m.deal_count||0],["Portfolio",m.portfolio_public?fmtM(+(m.portfolio_value||0)):"Private"]].map(([l,v])=>(
                        <div key={l}><div style={{fontSize:13,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#111827"}}>{v}</div><div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase"}}>{l}</div></div>
                      ))}
                    </div>

                    {m.mentoring_bio&&<p style={{fontSize:12,color:"#6b7280",lineHeight:1.6,marginBottom:12,flex:1}}>{m.mentoring_bio.slice(0,110)}{m.mentoring_bio.length>110?"...":""}</p>}

                    {/* Specialties from investor type */}
                    {m.investor_type&&(
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
                        {m.investor_type.split(",").slice(0,3).map(t=>(
                          <span key={t} style={{fontSize:10,background:"#f3f4f6",color:"#374151",borderRadius:100,padding:"2px 8px"}}>{t.trim()}</span>
                        ))}
                      </div>
                    )}

                    {/* Price + book */}
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:12,borderTop:"1px solid #f3f4f6",marginTop:"auto"}}>
                      <div>
                        {m.hourly_rate?(
                          <><span style={{fontSize:20,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#111827"}}>${m.hourly_rate}</span><span style={{fontSize:12,color:"#9ca3af"}}>/hr</span></>
                        ):<span style={{fontSize:12,color:"#9ca3af"}}>Rate TBD</span>}
                      </div>
                      <button onClick={()=>setBookingMentor(m)} style={{padding:"9px 18px",borderRadius:10,border:"none",background:"#111827",color:"white",fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.15s"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#059669"}
                        onMouseLeave={e=>e.currentTarget.style.background="#111827"}>Book Session</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>)}

      {/* ── MY SESSIONS TAB ── */}
      {activeTab==="sessions"&&(
        <div>
          {myBookings.length===0?(
            <div style={{textAlign:"center",padding:"80px 24px"}}>
              <div style={{fontSize:52,marginBottom:16}}>📅</div>
              <h3 style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:800,color:"#111827",marginBottom:8}}>No sessions yet</h3>
              <p style={{fontSize:14,color:"#6b7280",marginBottom:20}}>Book your first session with a verified mentor.</p>
              <Btn variant="primary" onClick={()=>setActiveTab("discover")}>Browse Mentors →</Btn>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {myBookings.map(booking=>{
                const statusColors={pending:{bg:"#fffbeb",color:"#d97706",border:"#fde68a",label:"⏳ Pending"},confirmed:{bg:"#eff6ff",color:"#2563eb",border:"#bfdbfe",label:"✅ Confirmed"},completed:{bg:"#f0fdf4",color:"#059669",border:"#bbf7d0",label:"🎓 Completed"},cancelled:{bg:"#fef2f2",color:"#dc2626",border:"#fecaca",label:"❌ Cancelled"}};
                const sc=statusColors[booking.status]||statusColors.pending;
                return (
                  <div key={booking.id} style={{background:"white",borderRadius:14,border:"1.5px solid #e5e7eb",padding:"18px 22px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:12}}>
                      <div>
                        <div style={{fontSize:15,fontWeight:700,color:"#111827",marginBottom:2}}>Session with {booking.mentor_name}</div>
                        <div style={{fontSize:12,color:"#9ca3af"}}>{booking.session_date} at {booking.session_time} · {booking.session_type==="single"?"Single Session":booking.session_type==="bundle3"?"3-Session Bundle":"Monthly Coaching"}</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:12,fontWeight:700,color:sc.color,background:sc.bg,border:`1px solid ${sc.border}`,borderRadius:100,padding:"3px 10px"}}>{sc.label}</span>
                        <span style={{fontSize:15,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#111827"}}>${booking.amount}</span>
                      </div>
                    </div>
                    {booking.goals&&<p style={{fontSize:13,color:"#6b7280",marginBottom:10}}><strong>Goals:</strong> {booking.goals}</p>}
                    {booking.status==="completed"&&!booking.rated&&(
                      <button onClick={()=>setReviewBooking(booking)} style={{padding:"7px 16px",borderRadius:8,border:"1.5px solid #fde68a",background:"#fffbeb",color:"#d97706",fontSize:12,fontWeight:700,cursor:"pointer"}}>⭐ Leave Review</button>
                    )}
                    {booking.rated&&<div style={{fontSize:12,color:"#059669",fontWeight:600}}>✅ Review submitted · Thank you!</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Demo Data ─────────────────────────────────────────────────────────────────
const DEMO={
  rental:{inputs:[["Purchase Price","$320,000"],["Down Payment","20%"],["Monthly Rent","$2,800"],["Expenses","$750"],["Mortgage","$1,420"]],highlights:[["Monthly Cash Flow","$630",true],["Cash-on-Cash ROI","8.4%",true],["Cap Rate","6.2%",false],["DSCR","1.34x",false]]},
  wholesale:{inputs:[["ARV","$240,000"],["Repairs","$28,000"],["Max Offer %","70%"],["Wholesale Fee","$9,000"]],highlights:[["Max Offer","$131,000",true],["Your Fee","$9,000",true],["ARV × 70%","$168,000",false],["Margin","6.4%",false]]},
  flip:{inputs:[["Purchase","$165,000"],["Rehab","$38,000"],["ARV","$275,000"],["Agent Fees","6%"]],highlights:[["Net Profit","$46,000",true],["ROI","21.4%",true],["Total Costs","$229,000",false],["Margin","16.7%",false]]},
  brrrr:{inputs:[["Purchase","$110,000"],["Rehab","$45,000"],["ARV","$210,000"],["Refi %","75%"]],highlights:[["Cash Out","$7,500",true],["Mo. Cash Flow","$970",true],["Annual ROI","7.6%",false],["Capital Recycled","96.8%",false]]},
  subto:{inputs:[["Loan Balance","$175,000"],["Mortgage","$1,050"],["Down to Seller","$8,000"],["Rent","$1,700"]],highlights:[["Mo. Cash Flow","$300",true],["ROI","17.1%",true],["Cash In","$10,500",false],["Annual CF","$3,600",false]]},
  novation:{inputs:[["Purchase","$155,000"],["Repairs","$22,000"],["ARV","$270,000"],["Seller Payout","$12,000"]],highlights:[["Net Profit","$54,700",true],["ROI","25.1%",true],["Total Costs","$215,300",false],["Margin","20.3%",false]]},
};

// ─── Landing Page ──────────────────────────────────────────────────────────────
function LandingPage({onGoSignIn,onGoSignUp}) {
  const [mode,setMode]=useState("rental");const [scrolled,setScrolled]=useState(false);
  const [mobileMenu,setMobileMenu]=useState(false);
  const active=MODES.find(m=>m.key===mode);const data=DEMO[mode];
  useEffect(()=>{const h=()=>setScrolled(window.scrollY>50);window.addEventListener("scroll",h);return()=>window.removeEventListener("scroll",h);},[]);
  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#fff",color:"#111827"}}>
      <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:200,transition:"all 0.25s",background:scrolled||mobileMenu?"rgba(255,255,255,0.97)":"transparent",backdropFilter:"blur(12px)",borderBottom:scrolled||mobileMenu?"1px solid #e5e7eb":"none"}}>
        <div style={{maxWidth:1140,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:60,padding:"0 20px"}}>
          <Logo/>
          {/* Desktop nav links */}
          <div style={{display:"flex",gap:24}} className="hide-mobile">
            {["Features","Community","Mentoring","Pricing"].map(l=>(
              <button key={l} onClick={()=>{const el=document.getElementById(l.toLowerCase());if(el)el.scrollIntoView({behavior:"smooth",block:"start"});}} style={{background:"none",border:"none",fontSize:14,color:"#6b7280",fontWeight:500,cursor:"pointer",padding:0}}>{l}</button>
            ))}
          </div>
          {/* Desktop CTA buttons */}
          <div style={{display:"flex",gap:10}} className="hide-mobile">
            <button onClick={onGoSignIn} style={{padding:"8px 18px",borderRadius:8,border:"1.5px solid #e5e7eb",background:"white",color:"#374151",fontSize:13,fontWeight:500,cursor:"pointer"}}>Sign In</button>
            <button onClick={onGoSignUp} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#111827",color:"white",fontSize:13,fontWeight:600,cursor:"pointer"}}>Start Free Trial</button>
          </div>
          {/* Mobile: Sign in + Hamburger */}
          <div style={{display:"none",gap:8,alignItems:"center"}} className="show-mobile">
            <button onClick={onGoSignIn} style={{padding:"7px 14px",borderRadius:8,border:"1.5px solid #e5e7eb",background:"white",color:"#374151",fontSize:12,fontWeight:500,cursor:"pointer"}}>Sign In</button>
            <button onClick={()=>setMobileMenu(m=>!m)} style={{width:38,height:38,borderRadius:8,border:"1.5px solid #e5e7eb",background:"white",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}>
              <span style={{width:16,height:2,background:"#374151",borderRadius:1,display:"block",transition:"all 0.2s",transform:mobileMenu?"rotate(45deg) translateY(6px)":"none"}}/>
              <span style={{width:16,height:2,background:"#374151",borderRadius:1,display:"block",opacity:mobileMenu?0:1,transition:"opacity 0.2s"}}/>
              <span style={{width:16,height:2,background:"#374151",borderRadius:1,display:"block",transition:"all 0.2s",transform:mobileMenu?"rotate(-45deg) translateY(-6px)":"none"}}/>
            </button>
          </div>
        </div>
        {/* Mobile dropdown menu */}
        {mobileMenu&&(
          <div style={{background:"white",borderTop:"1px solid #f3f4f6",padding:"16px 20px",display:"flex",flexDirection:"column",gap:4}}>
            {["Features","Community","Mentoring","Pricing"].map(l=>(
              <button key={l} onClick={()=>{setMobileMenu(false);const el=document.getElementById(l.toLowerCase());if(el)el.scrollIntoView({behavior:"smooth",block:"start"});}} style={{background:"none",border:"none",fontSize:15,color:"#374151",fontWeight:500,cursor:"pointer",padding:"10px 0",textAlign:"left",borderBottom:"1px solid #f9fafb"}}>{l}</button>
            ))}
            <button onClick={onGoSignUp} style={{marginTop:8,padding:"12px",borderRadius:10,border:"none",background:"#10b981",color:"white",fontSize:14,fontWeight:700,cursor:"pointer"}}>Start Free Trial →</button>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section style={{paddingTop:72,background:"linear-gradient(180deg,#f0fdf4 0%,#fafafa 55%,#fff 100%)"}}>
        <div style={{maxWidth:1140,margin:"0 auto",padding:"40px 20px 0"}}>
          <div style={{textAlign:"center",marginBottom:44}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:100,padding:"5px 16px",marginBottom:22}}>
              <span style={{width:7,height:7,borderRadius:"50%",background:"#10b981",display:"inline-block",boxShadow:"0 0 0 3px rgba(16,185,129,0.2)"}}/>
              <span style={{fontSize:12,color:"#059669",fontWeight:700}}>Free trial — no credit card required</span>
            </div>
            <h1 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(36px,5.5vw,64px)",fontWeight:900,color:"#111827",lineHeight:1.08,marginBottom:18}}>
              Analyze Any Real Estate Deal<br/><span style={{color:"#10b981",fontStyle:"italic"}}>in Seconds</span>
            </h1>
            <p style={{fontSize:"clamp(15px,1.8vw,19px)",color:"#6b7280",maxWidth:500,margin:"0 auto 32px",lineHeight:1.65}}>6 investment strategies. Community insights. Leaderboards. Mentoring. Built by investors, for investors.</p>
            <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={onGoSignUp} style={{padding:"14px 32px",borderRadius:11,border:"none",background:"#10b981",color:"white",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(16,185,129,0.35)"}}>Start Free Trial →</button>
              <button onClick={()=>{const el=document.getElementById("demo");if(el)el.scrollIntoView({behavior:"smooth",block:"start"});}} style={{padding:"14px 28px",borderRadius:11,border:"1.5px solid #e5e7eb",background:"white",color:"#374151",fontSize:15,fontWeight:500,cursor:"pointer",display:"inline-flex",alignItems:"center"}}>▶ See Demo</button>
            </div>
          </div>

          {/* Mode tabs */}
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginBottom:24}}>
            {MODES.map(m=>(
              <button key={m.key} onClick={()=>setMode(m.key)} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 18px",borderRadius:100,border:`2px solid ${mode===m.key?m.border:"#e5e7eb"}`,background:mode===m.key?m.bg:"white",cursor:"pointer",transition:"all 0.15s"}}>
                <span style={{fontSize:15}}>{m.icon}</span>
                <div style={{textAlign:"left",lineHeight:1.25}}>
                  <div style={{fontSize:13,fontWeight:700,color:mode===m.key?m.color:"#374151"}}>{m.label}</div>
                  <div style={{fontSize:10,color:mode===m.key?m.color:"#9ca3af",opacity:0.85}}>{m.sub}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Live calculator preview with signup overlay */}
          <div id="demo" style={{position:"relative",borderRadius:"20px 20px 0 0",overflow:"hidden",boxShadow:"0 -4px 40px rgba(0,0,0,0.06)"}}>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 24px",background:active.bg,border:`1.5px solid ${active.border}`,borderBottom:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:18}}>{active.icon}</span>
                <div><h3 style={{fontSize:14,fontWeight:700,color:active.color}}>{active.label} Calculator</h3><p style={{fontSize:10,color:active.color,opacity:0.7}}>{active.sub}</p></div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,background:"white",border:"1.5px solid #e5e7eb",borderRadius:100,padding:"4px 12px"}}>
                <span style={{fontSize:11}}>👀</span><span style={{fontSize:11,color:"#6b7280",fontWeight:500}}>Live preview</span>
              </div>
            </div>
            {/* Real calculator rendered underneath */}
            <div style={{background:"white",border:"1.5px solid #e5e7eb",borderTop:"none",padding:"24px",maxHeight:520,overflow:"hidden",pointerEvents:"none",userSelect:"none"}}>
              {mode==="rental"&&<RentalCalc saved={{pp:320000,down:20,rate:7.5,term:30,cc:8500,rehab:0,rent:2800,taxes:350,insurance:120,vacancy:140,repairs:100,capex:100,mgmt:224,utilities:0,hoa:0,appreciation:3,rentGrowth:2,expenseGrowth:2}} onCalcChange={()=>{}}/>}
              {mode==="wholesale"&&<WholesaleCalc saved={{arv:240000,repairs:28000,pct:70,fee:9000,holding:3500,closing:4000,profitTarget:25000,profitPct:10}} onCalcChange={()=>{}}/>}
              {mode==="flip"&&<FlipCalc saved={{pp:165000,rehab:38000,arv:275000,months:6,agent:6,closing:5000,taxesMo:200,insuranceMo:150,utilitiesMo:100,targetProfit:40000,targetPct:15,rate:12,points:2,downPct:20}} onCalcChange={()=>{}}/>}
              {mode==="brrrr"&&<BRRRRCalc saved={{pp:110000,rehab:45000,arv:210000,stabilizeMonths:4,holdingMo:600,refPct:75,refiRate:7.0,refiTerm:30,refiPoints:1,refiClosing:3500,rent:1750,taxes:200,insurance:100,vacancy:88,repairs:88,capex:88,mgmt:140}} onCalcChange={()=>{}}/>}
              {mode==="subto"&&<SubToCalc saved={{balance:175000,rate:3.5,yearsLeft:25,pmt:1050,dp:8000,cc:2500,marketValue:220000,rent:1700,taxes:180,insurance:90,maintenance:85,vacancy:85,mgmt:136,appreciation:3,exitYears:5}} onCalcChange={()=>{}}/>}
              {mode==="novation"&&<NovationCalc saved={{pp:155000,repairs:22000,arv:270000,months:4,agent:6,closing:4500,sellerPayout:12000,sellerPayoutType:"cash",taxesMo:180,insuranceMo:120,utilitiesMo:80,targetProfit:40000,targetPct:15}} onCalcChange={()=>{}}/>}
            </div>
            {/* Signup overlay — bottom gradient + CTA */}
            <div style={{position:"absolute",bottom:0,left:0,right:0,height:280,background:"linear-gradient(to top,rgba(255,255,255,1) 40%,rgba(255,255,255,0))",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",paddingBottom:28}}>
              <div style={{textAlign:"center",marginBottom:16}}>
                <div style={{fontSize:15,fontWeight:700,color:"#111827",marginBottom:6}}>🔒 Use your own numbers</div>
                <div style={{fontSize:13,color:"#6b7280"}}>Sign up free to unlock all 6 calculators</div>
              </div>
              <button onClick={onGoSignUp} style={{padding:"13px 32px",borderRadius:11,border:"none",background:"#10b981",color:"white",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(16,185,129,0.35)"}}>Start Free Trial →</button>
            </div>
          </div>
        </div>
      </section>
      <div style={{height:60,background:"#f9fafb",borderLeft:"1.5px solid #e5e7eb",borderRight:"1.5px solid #e5e7eb",maxWidth:1140,margin:"0 auto"}}/>

      {/* Video */}
      <section style={{padding:"88px 32px",background:"#f9fafb",borderTop:"1px solid #e5e7eb"}}>
        <div style={{maxWidth:900,margin:"0 auto",textAlign:"center"}}>
          <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.12em",color:"#10b981",textTransform:"uppercase",marginBottom:12}}>See it in action</p>
          <h2 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(26px,4vw,40px)",fontWeight:800,color:"#111827",marginBottom:14}}>Analyze a deal in under 30 seconds</h2>
          <p style={{fontSize:15,color:"#6b7280",maxWidth:480,margin:"0 auto 40px",lineHeight:1.7}}>Watch how investors use DealSource.ai to quickly evaluate deals across all 6 strategies.</p>
          <div style={{background:"linear-gradient(135deg,#064e3b,#065f46)",borderRadius:20,aspectRatio:"16/9",maxWidth:760,margin:"0 auto",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",cursor:"pointer",boxShadow:"0 24px 60px rgba(6,78,59,0.25)"}} onClick={onGoSignUp}>
            <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle at 30% 70%,rgba(16,185,129,0.2) 0%,transparent 60%)",pointerEvents:"none"}}/>
            <div style={{width:72,height:72,borderRadius:"50%",background:"rgba(255,255,255,0.15)",border:"2px solid rgba(255,255,255,0.3)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20,backdropFilter:"blur(8px)"}}>
              <span style={{fontSize:28,marginLeft:4}}>▶</span>
            </div>
            <p style={{fontSize:16,fontWeight:700,color:"white",marginBottom:6}}>Watch Demo</p>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.6)"}}>2 min walkthrough</p>
            <div style={{position:"absolute",bottom:20,right:20,background:"rgba(255,255,255,0.1)",borderRadius:8,padding:"6px 12px",fontSize:11,color:"rgba(255,255,255,0.7)",fontWeight:600}}>Coming Soon</div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section style={{padding:"28px 32px",background:"white",borderTop:"1px solid #e5e7eb",borderBottom:"1px solid #e5e7eb"}}>
        <div style={{maxWidth:1140,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center",gap:56,flexWrap:"wrap"}}>
          {[["6","Strategies"],["∞","Deals Analyzed"],["$0","To Start"],["🏆","Medal Rankings"],["🎓","Expert Mentors"],["✅","Verified Portfolios"]].map(([n,l])=>(
            <div key={l} style={{textAlign:"center"}}><div style={{fontFamily:"'Fraunces',serif",fontSize:28,fontWeight:900,color:"#111827"}}>{n}</div><div style={{fontSize:12,color:"#9ca3af",fontWeight:500}}>{l}</div></div>
          ))}
        </div>
      </section>

      {/* Community preview */}
      <section id="community" style={{padding:"88px 32px",background:"white"}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:52}}>
            <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.12em",color:"#10b981",textTransform:"uppercase",marginBottom:12}}>Community</p>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(26px,4vw,42px)",fontWeight:800,color:"#111827",marginBottom:14}}>Learn from fellow investors</h2>
            <p style={{fontSize:15,color:"#6b7280",maxWidth:480,margin:"0 auto"}}>Share deals, ask if the numbers work, and get real feedback.</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:20}}>
            {[
              {title:"Is this rental a good deal?",tag:"🏘️ Rental",preview:"Found a 3BR/2BA in Atlanta for $285K. After PITI and expenses showing $340/mo cash flow...",metrics:{"Cash Flow":"$340/mo","CoC ROI":"6.8%"},upvotes:24,medal:"🥇",verified:true},
              {title:"BRRRR in Cleveland — leaving money?",tag:"♻️ BRRRR",preview:"Picked this up for $75K, put $35K in. ARV at $160K but lender will only do 70%...",metrics:{"All-In":"$110K","Cash Out":"$2K"},upvotes:18,medal:"💎",verified:true},
              {title:"Sub-To — seller owes $210K at 3.2%",tag:"🤝 Subject-To",preview:"Seller behind 2 payments. Existing loan at 3.2% which is incredible in today's market...",metrics:{"Loan Rate":"3.2%","Mo. CF":"$520"},upvotes:31,medal:"💠",verified:true},
            ].map((p,idx)=>(
              <div key={idx} onClick={onGoSignUp} style={{background:"white",borderRadius:14,border:"1.5px solid #e5e7eb",padding:"22px",cursor:"pointer",transition:"all 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 12px 32px rgba(0,0,0,0.07)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <span style={{fontSize:11,fontWeight:700,color:"#059669",background:"#f0fdf4",display:"inline-block",padding:"2px 8px",borderRadius:100,border:"1px solid #bbf7d0"}}>{p.tag}</span>
                  <div style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:8,border:"1.5px solid #e5e7eb",background:"white"}}>
                    <span style={{fontSize:12}}>▲</span><span style={{fontSize:13,fontWeight:700,color:"#374151"}}>{p.upvotes}</span>
                  </div>
                </div>
                <h3 style={{fontSize:15,fontWeight:700,color:"#111827",marginBottom:6}}>{p.title}</h3>
                <p style={{fontSize:13,color:"#6b7280",lineHeight:1.6,marginBottom:12}}>{p.preview}</p>
                <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:12}}>
                  {Object.entries(p.metrics).map(([k,v])=>(
                    <div key={k} style={{background:"#f9fafb",borderRadius:8,padding:"6px 10px"}}>
                      <div style={{fontSize:9,color:"#9ca3af",fontWeight:600,textTransform:"uppercase"}}>{k}</div>
                      <div style={{fontSize:13,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#111827"}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#9ca3af"}}>
                  <span>{p.medal}</span>
                  {p.verified&&<span style={{fontSize:10,background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:100,padding:"1px 6px",fontWeight:700}}>✓ Verified</span>}
                </div>
              </div>
            ))}
          </div>
          <div style={{textAlign:"center",marginTop:36}}>
            <button onClick={onGoSignUp} style={{padding:"12px 28px",borderRadius:10,border:"1.5px solid #e5e7eb",background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>Join the Community →</button>
          </div>
        </div>
      </section>

      {/* Mentoring preview */}
      <section id="mentoring" style={{padding:"60px 20px",background:"#f9fafb",borderTop:"1px solid #e5e7eb"}}>
        <div className="mentoring-grid" style={{maxWidth:1100,margin:"0 auto",display:"grid",gridTemplateColumns:"1fr 1fr",gap:48,alignItems:"center"}}>
          <div>
            <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.12em",color:"#10b981",textTransform:"uppercase",marginBottom:12}}>Mentoring</p>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(26px,4vw,40px)",fontWeight:800,color:"#111827",lineHeight:1.15,marginBottom:16}}>Learn directly from verified top investors</h2>
            <p style={{fontSize:15,color:"#6b7280",lineHeight:1.75,marginBottom:24}}>Book 1-on-1 sessions with verified investors on the leaderboard. Get deal reviews, strategy coaching, and market insights from people who've actually done it.</p>
            {[["✓ Verified investors only","Every mentor has a verified portfolio"],["🏆 Leaderboard-ranked","See their portfolio value and deal history"],["📅 Book via Calendly","Direct scheduling, no middleman"],["💰 Transparent pricing","See rates before you book"]].map(([t,d])=>(
              <div key={t} style={{display:"flex",gap:12,marginBottom:14}}>
                <div style={{fontSize:14,marginTop:1,flexShrink:0}}>{t.split(" ")[0]}</div>
                <div><div style={{fontSize:14,fontWeight:600,color:"#111827"}}>{t.slice(t.indexOf(" ")+1)}</div><div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{d}</div></div>
              </div>
            ))}
            <button onClick={onGoSignUp} style={{marginTop:8,padding:"12px 28px",borderRadius:10,border:"none",background:"#111827",color:"white",fontSize:14,fontWeight:600,cursor:"pointer"}}>Find a Mentor →</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr",gap:14}}>
            {[["💠","Sarah K.","Diamond","$12.4M portfolio","Buy & Hold Investor","$200/hr",32],["🥇","Marcus T.","Gold","$3.1M portfolio","BRRRR Investor","$125/hr",18],["💎","Jennifer R.","Platinum","$6.8M portfolio","Creative Finance","$175/hr",45]].map(([medal,name,rank,port,type,rate,sessions])=>(
              <div key={name} style={{background:"white",borderRadius:14,border:"1.5px solid #e5e7eb",padding:"18px 20px",display:"flex",alignItems:"center",gap:16}}>
                <div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:16,fontWeight:800,color:"white"}}>{name[0]}</span>
                </div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                    <span style={{fontSize:14,fontWeight:700,color:"#111827"}}>{name}</span>
                    <span style={{fontSize:13}}>{medal}</span>
                    <span style={{fontSize:10,background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:100,padding:"1px 6px",fontWeight:700}}>✓ Verified</span>
                  </div>
                  <p style={{fontSize:12,color:"#9ca3af"}}>{port} · {type}</p>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:14,fontWeight:800,color:"#111827"}}>{rate}</div>
                  <div style={{fontSize:11,color:"#9ca3af"}}>{sessions} sessions</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Leaderboard teaser */}
      <section style={{padding:"88px 32px",background:"linear-gradient(135deg,#064e3b,#065f46)"}}>
        <div style={{maxWidth:800,margin:"0 auto",textAlign:"center"}}>
          <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.12em",color:"#6ee7b7",textTransform:"uppercase",marginBottom:12}}>Leaderboard</p>
          <h2 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(26px,4vw,42px)",fontWeight:800,color:"white",marginBottom:14}}>Earn your rank. Show it off.</h2>
          <p style={{fontSize:15,color:"rgba(255,255,255,0.65)",maxWidth:440,margin:"0 auto 40px",lineHeight:1.7}}>Verify your portfolio and earn medals from Bronze to Diamond. Only verified investors appear on the public leaderboard.</p>
          <div style={{display:"flex",justifyContent:"center",gap:16,marginBottom:40,flexWrap:"wrap"}}>
            {MEDALS.map(m=>(
              <div key={m.id} style={{background:"rgba(255,255,255,0.1)",borderRadius:14,padding:"18px 20px",border:"1px solid rgba(255,255,255,0.15)",textAlign:"center",minWidth:90}}>
                <div style={{fontSize:32,marginBottom:8}}>{m.icon}</div>
                <div style={{fontSize:12,fontWeight:700,color:"white"}}>{m.label}</div>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginTop:2}}>{fmtM(m.min)}+</div>
              </div>
            ))}
          </div>
          <button onClick={onGoSignUp} style={{padding:"14px 32px",borderRadius:11,border:"none",background:"#10b981",color:"white",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(16,185,129,0.35)"}}>Earn Your Medal →</button>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{padding:"88px 32px",background:"white"}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:52}}>
            <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.12em",color:"#10b981",textTransform:"uppercase",marginBottom:12}}>The full toolkit</p>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(26px,4vw,42px)",fontWeight:800,color:"#111827",marginBottom:14}}>Everything in one place</h2>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:20}}>
            {[["⚡","Instant Calculations","6 strategies, all updating in real time. No spreadsheets."],["💾","Save & Compare Deals","Cloud deal library. Compare side by side."],["📄","Auto-Generated Letters","Sub-To and Novation offer letters as Word docs."],["👥","Community Forum","Share deals, upvote posts, get investor feedback."],["🏆","Medal Rankings","Earn badges as your verified portfolio grows."],["📍","Address Tracking","Pin an address to every deal for easy reference."],["🎓","Expert Mentoring","Book sessions with verified top investors."],["🔮","Portfolio Projections","Model future acquisitions and growth over time."]].map(([icon,t,d])=>(
              <div key={t} style={{padding:26,borderRadius:16,border:"1.5px solid #e5e7eb",background:"white",transition:"all 0.2s"}}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 12px 32px rgba(0,0,0,0.07)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}}>
                <div style={{fontSize:28,marginBottom:14}}>{icon}</div>
                <h3 style={{fontSize:15,fontWeight:700,color:"#111827",marginBottom:7}}>{t}</h3>
                <p style={{fontSize:13,color:"#6b7280",lineHeight:1.7}}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{padding:"88px 32px",background:"#fafafa"}}>
        <div style={{maxWidth:720,margin:"0 auto",textAlign:"center"}}>
          <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.12em",color:"#10b981",textTransform:"uppercase",marginBottom:12}}>Pricing</p>
          <h2 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(26px,4vw,42px)",fontWeight:800,color:"#111827",marginBottom:12}}>Simple. No surprises.</h2>
          <p style={{fontSize:15,color:"#6b7280",marginBottom:52}}>Cancel anytime. No hidden fees.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            <div style={{padding:32,borderRadius:18,border:"1.5px solid #e5e7eb",background:"white",textAlign:"left"}}>
              <p style={{fontSize:12,fontWeight:600,color:"#9ca3af",marginBottom:10}}>Free</p>
              <div style={{fontFamily:"'Fraunces',serif",fontSize:40,fontWeight:900,color:"#111827",marginBottom:28}}>$0</div>
              {["All 6 calculators","Unlimited calculations","Community forum","Portfolio tracking","Medal ranking"].map(f=>(
                <div key={f} style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}><span style={{color:"#10b981",fontWeight:700}}>✓</span><span style={{fontSize:14,color:"#374151"}}>{f}</span></div>
              ))}
              {["Save deals","Export letters","Leaderboard eligibility","Mentoring"].map(f=>(
                <div key={f} style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}><span style={{color:"#d1d5db"}}>–</span><span style={{fontSize:14,color:"#9ca3af"}}>{f}</span></div>
              ))}
              <button onClick={onGoSignUp} style={{width:"100%",marginTop:24,padding:"12px 0",borderRadius:10,border:"1.5px solid #e5e7eb",background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>Get Started Free</button>
            </div>
            <div style={{padding:32,borderRadius:18,background:"#111827",textAlign:"left",position:"relative"}}>
              <div style={{position:"absolute",top:18,right:18,background:"#10b981",color:"white",fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:100}}>POPULAR</div>
              <p style={{fontSize:12,fontWeight:600,color:"#6b7280",marginBottom:10}}>Pro</p>
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:28}}>
                <span style={{fontFamily:"'Fraunces',serif",fontSize:40,fontWeight:900,color:"white"}}>$20</span>
                <span style={{fontSize:14,color:"#6b7280"}}>/month</span>
              </div>
              {["All 6 calculators","Unlimited calculations","Community forum","Portfolio analyzer + projections","Medal ranking + leaderboard","Save & compare deals","Auto-generated offer letters","Expert mentoring access","Priority support"].map(f=>(
                <div key={f} style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}><span style={{color:"#10b981",fontWeight:700}}>✓</span><span style={{fontSize:14,color:"#e5e7eb"}}>{f}</span></div>
              ))}
              <button onClick={onGoSignUp} style={{width:"100%",marginTop:24,padding:"12px 0",borderRadius:10,border:"none",background:"#10b981",color:"white",fontSize:14,fontWeight:700,cursor:"pointer"}}>Start Free Trial</button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{padding:"32px",borderTop:"1px solid #e5e7eb",background:"#fafafa"}}>
        <div style={{maxWidth:1100,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
          <Logo/>
          <p style={{fontSize:12,color:"#9ca3af"}}>© 2025 DealSource.ai · Built for real estate investors</p>
          <div style={{display:"flex",gap:20}}>{["Privacy","Terms","Support"].map(l=><a key={l} href="#" style={{fontSize:12,color:"#9ca3af",textDecoration:"none"}}>{l}</a>)}</div>
        </div>
      </footer>
    </div>
  );
}

// ─── Main Analyzer App ─────────────────────────────────────────────────────────
function AnalyzerApp({user,profile,onGoHome,onGoProfile,onSignOut}) {
  const [view,setView]=useState("calc");
  const [mode,setMode]=useState("rental");
  const [showSaveModal,setShowSaveModal]=useState(false);
  const [currentInputs,setCurrentInputs]=useState({});
  const [currentMetrics,setCurrentMetrics]=useState({});
  const [deals,setDeals]=useState([]);
  const [loadedDealId,setLoadedDealId]=useState(null);
  const [savedFlash,setSavedFlash]=useState(false);
  const [filterMode,setFilterMode]=useState("all");
  const [dealsLoading,setDealsLoading]=useState(true);
  const [isPro,setIsPro]=useState(profile?.is_pro||false);
  const [showUpgradeModal,setShowUpgradeModal]=useState(false);

  useEffect(()=>{setIsPro(profile?.is_pro||false);},[profile]);

  const handleCalcChange=useCallback((inputs,metrics)=>{setCurrentInputs(inputs);setCurrentMetrics(metrics);},[]);

  const handleSave=async(name)=>{
    const deal={user_id:user.id,name,mode,inputs:currentInputs,metrics:currentMetrics,created_at:new Date().toISOString()};
    try{const saved=await supabase.insertDeal(deal);const nd=Array.isArray(saved)?saved[0]:{...deal,id:Date.now().toString()};setDeals(p=>[nd,...p]);setLoadedDealId(nd.id);}
    catch{const ld={...deal,id:Date.now().toString()};setDeals(p=>[ld,...p]);setLoadedDealId(ld.id);}
    setShowSaveModal(false);setSavedFlash(true);setTimeout(()=>setSavedFlash(false),2500);
    // Increment deal count on profile
    try{await supabase.upsertProfile({id:user.id,deal_count:(profile?.deal_count||0)+1});}catch{}
  };

  const handleDelete=async(id)=>{try{await supabase.deleteDeal(id);}catch{}setDeals(p=>p.filter(d=>d.id!==id));if(loadedDealId===id)setLoadedDealId(null);};
  const handleLoad=(deal)=>{setMode(deal.mode);setLoadedDealId(deal.id);setView("calc");};

  const activeMode=MODES.find(m=>m.key===mode);
  const filteredDeals=filterMode==="all"?deals:deals.filter(d=>d.mode===filterMode);
  const initials=(profile?.full_name||user.email||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
  const medal=getMedal(+(profile?.portfolio_value||0));

  const CALC_MAP={rental:RentalCalc,wholesale:WholesaleCalc,flip:FlipCalc,brrrr:BRRRRCalc,subto:SubToCalc,novation:NovationCalc};
  const CalcComponent=CALC_MAP[mode];

  const TABS=[
    {key:"calc",label:"Calculator",icon:"⚡"},
    {key:"deals",label:`Saved (${deals.length})`,icon:"💾"},
    {key:"forum",label:"Community",icon:"👥"},
    {key:"leaderboard",label:"Leaderboard",icon:"🏆"},
    {key:"mentors",label:"Mentors",icon:"🎓"},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#f9fafb",fontFamily:"'DM Sans',sans-serif"}}>
      {showSaveModal&&<SaveDealModal mode={mode} onSave={handleSave} onClose={()=>setShowSaveModal(false)}/>}

      <header style={{background:"white",borderBottom:"1px solid #e5e7eb",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:1280,margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56}}>
          <Logo onClick={onGoHome}/>
          <div className="top-nav-tabs" style={{display:"flex",background:"#f3f4f6",borderRadius:10,padding:3,gap:2,overflowX:"auto"}}>
            {TABS.map(tab=>(
              <button key={tab.key} onClick={()=>setView(tab.key)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,border:"none",background:view===tab.key?"white":"transparent",color:view===tab.key?"#111827":"#6b7280",fontSize:12,fontWeight:view===tab.key?700:500,cursor:"pointer",boxShadow:view===tab.key?"0 1px 4px rgba(0,0,0,0.08)":"none",transition:"all 0.15s",whiteSpace:"nowrap"}}>
                <span>{tab.icon}</span>{tab.label}
              </button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {savedFlash&&<span className="header-save-flash" style={{fontSize:12,color:"#059669",fontWeight:600}}>✓ Saved!</span>}
            <button onClick={onGoProfile} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 12px 5px 5px",borderRadius:100,border:"1.5px solid #e5e7eb",background:"white",cursor:"pointer",transition:"border-color 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="#10b981"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="#e5e7eb"}>
              <div style={{width:26,height:26,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:10,fontWeight:800,color:"white"}}>{initials}</span>
              </div>
              <span className="header-profile-name" style={{fontSize:13,fontWeight:600,color:"#374151"}}>{profile?.full_name?.split(" ")[0]||"Profile"}</span>
              <span style={{fontSize:13}}>{medal.icon}</span>
              {profile?.is_verified&&<span style={{fontSize:9,background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:100,padding:"1px 5px",fontWeight:700}}>✓</span>}
            </button>
          </div>
        </div>
      </header>

      {view==="calc"&&(
        <div className="main-content" style={{maxWidth:1200,margin:"0 auto",padding:"24px"}}>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:22}}>
            {MODES.map(m=>(
              <button key={m.key} onClick={()=>{setMode(m.key);setLoadedDealId(null);}}
                style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",borderRadius:12,border:`2px solid ${mode===m.key?m.border:"#e5e7eb"}`,background:mode===m.key?m.bg:"white",cursor:"pointer",transition:"all 0.15s"}}>
                <span>{m.icon}</span>
                <div style={{lineHeight:1.2}}>
                  <div style={{fontSize:12,fontWeight:700,color:mode===m.key?m.color:"#374151"}}>{m.label}</div>
                  <div className="mode-pill-sub" style={{fontSize:9,color:mode===m.key?m.color:"#9ca3af",opacity:0.85}}>{m.sub}</div>
                </div>
              </button>
            ))}
          </div>
          <div style={{background:"white",borderRadius:18,border:"1.5px solid #e5e7eb",overflow:"hidden",boxShadow:"0 2px 16px rgba(0,0,0,0.04)",maxWidth:"100vw"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 22px",background:activeMode.bg,borderBottom:`1.5px solid ${activeMode.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:20}}>{activeMode.icon}</span>
                <div><h2 style={{fontSize:15,fontWeight:700,color:activeMode.color}}>{activeMode.label} Calculator</h2><p style={{fontSize:11,color:activeMode.color,opacity:0.7}}>{activeMode.sub}</p></div>
              </div>
              {loadedDealId&&<div style={{display:"flex",alignItems:"center",gap:7,background:"white",border:`1.5px solid ${activeMode.border}`,borderRadius:100,padding:"4px 12px"}}><span style={{fontSize:11}}>📂</span><span style={{fontSize:11,color:activeMode.color,fontWeight:600}}>Loaded from saved</span></div>}
            </div>
            <div className="calc-pad" style={{padding:"24px 18px",overflowX:"hidden"}}>
              <CalcComponent key={`${mode}-${loadedDealId}`} saved={loadedDealId?deals.find(d=>d.id===loadedDealId)?.inputs:null} onCalcChange={handleCalcChange} profile={{...profile,is_pro:isPro}} isPro={isPro} onActivatePro={()=>setIsPro(true)} allDeals={deals} currentDealId={loadedDealId}/>
            </div>
            <div style={{padding:"12px 16px",borderTop:"1px solid #f3f4f6",background:"#fafafa",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
              <p style={{fontSize:12,color:"#9ca3af"}}>Updates as you type · Saved to your account</p>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setView("deals")} style={{padding:"8px 16px",borderRadius:8,border:"1.5px solid #e5e7eb",background:"white",color:"#6b7280",fontSize:12,fontWeight:500,cursor:"pointer"}}>View Saved</button>
                <button onClick={()=>setShowSaveModal(true)} style={{padding:"8px 20px",borderRadius:8,border:"none",background:"#111827",color:"white",fontSize:12,fontWeight:700,cursor:"pointer"}}>💾 Save Deal</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {view==="deals"&&(
        <div className="main-content" style={{maxWidth:1200,margin:"0 auto",padding:"24px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22,flexWrap:"wrap",gap:14}}>
            <div><h2 style={{fontFamily:"'Fraunces',serif",fontSize:24,fontWeight:800,color:"#111827",marginBottom:2}}>Saved Deals</h2><p style={{fontSize:13,color:"#9ca3af"}}>{deals.length} deal{deals.length!==1?"s":""} synced</p></div>
            <Btn variant="primary" onClick={()=>setView("calc")}>⚡ New Analysis</Btn>
          </div>
          {deals.length>0&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
              <button onClick={()=>setFilterMode("all")} style={{padding:"5px 14px",borderRadius:100,border:`1.5px solid ${filterMode==="all"?"#111827":"#e5e7eb"}`,background:filterMode==="all"?"#111827":"white",color:filterMode==="all"?"white":"#6b7280",fontSize:12,fontWeight:600,cursor:"pointer"}}>All ({deals.length})</button>
              {MODES.filter(m=>deals.some(d=>d.mode===m.key)).map(m=>(
                <button key={m.key} onClick={()=>setFilterMode(m.key)} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:100,border:`1.5px solid ${filterMode===m.key?m.border:"#e5e7eb"}`,background:filterMode===m.key?m.bg:"white",color:filterMode===m.key?m.color:"#6b7280",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                  {m.icon} {m.label} ({deals.filter(d=>d.mode===m.key).length})
                </button>
              ))}
            </div>
          )}
          {dealsLoading?<div style={{textAlign:"center",padding:"60px",color:"#9ca3af"}}>Loading...</div>
          :deals.length===0?<div style={{textAlign:"center",padding:"80px 24px"}}><div style={{fontSize:52,marginBottom:16}}>🏠</div><h3 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"#111827",marginBottom:8}}>No saved deals yet</h3><p style={{fontSize:14,color:"#6b7280",maxWidth:340,margin:"0 auto 24px"}}>Run an analysis and hit "Save Deal" to build your library.</p><Btn variant="primary" onClick={()=>setView("calc")}>Go to Calculator →</Btn></div>
          :<div className="deal-cards-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>{filteredDeals.map(deal=><SavedDealCard key={deal.id} deal={deal} onLoad={handleLoad} onDelete={handleDelete}/>)}</div>}
        </div>
      )}

      {view==="forum"&&<ForumView user={user} profile={profile} savedDeals={deals||[]}/>}
      {view==="leaderboard"&&<LeaderboardView user={user} profile={profile} onGoProfile={onGoProfile}/>}
      {view==="mentors"&&<MentorDirectory user={user} profile={profile}/>}

      {/* Mobile Bottom Nav */}
      <nav className="bottom-nav">
        {TABS.map(tab=>(
          <button key={tab.key} onClick={()=>setView(tab.key)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,padding:"6px 4px",background:"none",border:"none",cursor:"pointer",color:view===tab.key?"#059669":"#9ca3af",transition:"color 0.15s"}}>
            <span style={{fontSize:20}}>{tab.icon}</span>
            <span style={{fontSize:9,fontWeight:view===tab.key?700:500,letterSpacing:"0.02em"}}>{tab.key==="deals"?"Saved":tab.label}</span>
          </button>
        ))}
        <button onClick={onGoProfile} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,padding:"6px 4px",background:"none",border:"none",cursor:"pointer",color:"#9ca3af"}}>
          <div style={{width:22,height:22,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:9,fontWeight:800,color:"white"}}>{initials}</span>
          </div>
          <span style={{fontSize:9,fontWeight:500}}>Profile</span>
        </button>
      </nav>
    </div>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────────
export default function Root() {
  const [page,setPage]=useState("loading");
  const [user,setUser]=useState(null);
  const [profile,setProfile]=useState(null);

  useEffect(()=>{
    if(supabase.auth.restoreSession()){
      supabase.auth.getUser().then(u=>{
        if(u){setUser(u);supabase._userId=u.id;supabase._userEmail=u.email;supabase.getProfile(u.id).then(p=>{setProfile(p);setPage("app");}).catch(()=>setPage("app"));}
        else{supabase._token=null;try{localStorage.removeItem("ds_token");}catch{}setPage("home");}
      }).catch(()=>setPage("home"));
    }else{setPage("home");}
  },[]);

  const handleSignIn=(u,p)=>{setUser(u);setProfile(p);supabase._userId=u?.id;supabase._userEmail=u?.email;setPage("app");};
  const handleSignOut=async()=>{await supabase.auth.signOut();setUser(null);setProfile(null);setPage("home");};
  const handleProfileUpdate=(p)=>setProfile(p);

  // Handle Stripe redirect back to app
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get("pro")==="success"&&user){
      // Refresh profile to pick up is_pro=true set by webhook
      supabase.getProfile(user.id).then(p=>{if(p)setProfile(p);});
      window.history.replaceState({},"",window.location.pathname);
    }
  },[user]);

  if(page==="loading") return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f9fafb"}}>
      <div style={{textAlign:"center"}}>
        <div style={{width:48,height:48,background:"linear-gradient(135deg,#10b981,#059669)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",animation:"pulse 1.5s ease-in-out infinite"}}><span style={{color:"white",fontSize:22,fontWeight:800}}>D</span></div>
        <p style={{color:"#9ca3af",fontSize:14}}>Loading...</p>
      </div>
    </div>
  );

  return(<>
    <GlobalStyles/>
    {page==="home"&&<LandingPage onGoSignIn={()=>setPage("signin")} onGoSignUp={()=>setPage("signup")}/>}
    {page==="signin"&&<SignInPage onSignIn={handleSignIn} onGoSignUp={()=>setPage("signup")} onGoHome={()=>setPage("home")}/>}
    {page==="signup"&&<SignUpPage onSignIn={handleSignIn} onGoSignIn={()=>setPage("signin")} onGoHome={()=>setPage("home")}/>}
    {page==="app"&&user&&<AnalyzerApp user={user} profile={profile} onGoHome={()=>setPage("home")} onGoProfile={()=>setPage("profile")} onSignOut={handleSignOut}/>}
    {page==="profile"&&user&&<ProfilePage user={user} profile={profile} onUpdate={handleProfileUpdate} onSignOut={handleSignOut} onBack={()=>setPage("app")}/>}
  </>);
}
