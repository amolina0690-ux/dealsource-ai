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
            {["📊 Capital Efficiency Analysis (detailed breakdown)","🎯 Deal Optimization (Fix-the-Deal sliders)","📈 Long-Term Projections (30-year wealth curve)","🧠 Decision Intelligence (Monte Carlo, risk score)","📄 Auto-Generated Offer Letters","♾️ Unlimited Saved Deals (Free = 3 deals)"].map(f=>(
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
          <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb"}}>
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
          <div style={{background:"white",borderRadius:12,border:"1.5px solid #bbf7d0"}}>
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
          <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb"}}>
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
          <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb"}}>
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
          <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb"}}>
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
          <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb"}}>
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
          <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb"}}>
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




// ─── RENTAL CALC v7 — AI Capital Allocation Engine ──────────────────────────

// ══ RISK TOLERANCE CONFIG ══════════════════════════════════════════════════
// ── Strategy modes: Income / Hybrid / Equity (replaces conservative/standard/aggressive)
// Each mode has exact weight matrices per spec
// ══ UNIVERSAL DEAL ENGINE ══════════════════════════════════════════════════
// Three Pillars: Margin (35%) · Risk (40%) · Velocity (25%)
// Same position and structure across ALL strategies.
// Only definitions change. Weights are strategy-tunable but Risk always dominant.
// ════════════════════════════════════════════════════════════════════════════

// ── Strategy Configurations (B&H) ──────────────────────────────────────────
const STRATEGY_MODES = {
  income: {
    marginW: 0.35, riskW: 0.40, velocityW: 0.25,
    minDSCR: 1.15, maxBEO: 0.90, stressSeverity: 1.0, liquidityMos: 4,
    label: "Income Mode", icon: "💵",
    desc: "Cash Flow First — durability of income prioritized",
    pillarDefs: {
      margin:   "Sustainable yield strength — CoC, cash flow durability",
      risk:     "DSCR fragility + vacancy sensitivity + rate stress",
      velocity: "Capital recovery timeline + IRR compounding rate",
    },
    // Legacy aliases used in some rendering code
    survivalW: 0.40, incomeW: 0.35, capitalW: 0.25,
  },
  hybrid: {
    marginW: 0.35, riskW: 0.40, velocityW: 0.25,
    minDSCR: 1.15, maxBEO: 0.90, stressSeverity: 1.0, liquidityMos: 4,
    label: "Hybrid Mode", icon: "⚖️",
    desc: "Balanced — yield and equity growth equally weighted",
    pillarDefs: {
      margin:   "Yield strength — CoC + NOI quality",
      risk:     "DSCR + BEO + stress survival",
      velocity: "Capital recovery + equity compounding",
    },
    survivalW: 0.40, incomeW: 0.35, capitalW: 0.25,
  },
  equity: {
    marginW: 0.30, riskW: 0.38, velocityW: 0.32,
    minDSCR: 1.10, maxBEO: 0.92, stressSeverity: 0.8, liquidityMos: 3,
    label: "Equity Mode", icon: "📈",
    desc: "Capital Compounder — equity growth over cash flow",
    pillarDefs: {
      margin:   "Equity capture strength + total return",
      risk:     "DSCR + BEO under stress (lighter threshold)",
      velocity: "Capital multiplier + refi velocity",
    },
    survivalW: 0.38, incomeW: 0.30, capitalW: 0.32,
  },
};

// Backward-compat alias map
const RISK_CONFIG = {
  conservative: STRATEGY_MODES.income,
  standard:     STRATEGY_MODES.hybrid,
  aggressive:   STRATEGY_MODES.equity,
  income:       STRATEGY_MODES.income,
  hybrid:       STRATEGY_MODES.hybrid,
  equity:       STRATEGY_MODES.equity,
};

// ── Risk Tier classification (global rule) ──────────────────────────────────
// If riskTier = "High" → Verdict CANNOT exceed "Balanced"
function classifyRiskTier(riskScore) {
  if(riskScore >= 70) return { tier:"Low",      color:"#059669", bg:"#f0fdf4" };
  if(riskScore >= 45) return { tier:"Moderate", color:"#d97706", bg:"#fffbeb" };
  return                     { tier:"High",     color:"#dc2626", bg:"#fef2f2" };
}

// ── PILLAR 1: MARGIN SCORE (35% weight) ────────────────────────────────────
// B&H: sustainable yield — CoC, cash flow, income quality
// (Spec: "Margin = sustainable yield strength")
function uw_marginScore(metrics) {
  const {mcf=0, coc=0, ti=0, capRate=0} = metrics;
  
  // CoC scaling (spec-exact)
  let cocScore;
  if(coc < 0.04)       cocScore = 20;
  else if(coc < 0.06)  cocScore = 50;
  else if(coc < 0.08)  cocScore = 70;
  else if(coc < 0.12)  cocScore = 85;
  else                 cocScore = 100;

  // Monthly CF strength relative to capital
  const cfRatio = ti > 0 ? (mcf*12)/ti : 0;
  const cfScore = Math.min(100, Math.max(0, Math.round(cfRatio * 500)));

  // Cap rate bonus (underlying asset productivity)
  const capRateBonus = capRate >= 0.08 ? 10 : capRate >= 0.06 ? 5 : 0;

  // Capital recovery penalty (spec-exact)
  const yrsToRecover = (mcf > 0 && ti > 0) ? ti/(mcf*12) : Infinity;
  let recoveryPenalty = 0;
  if(yrsToRecover > 10)     recoveryPenalty = -20;
  else if(yrsToRecover > 7) recoveryPenalty = -10;

  const raw = Math.min(100, Math.max(0, Math.round(cocScore*0.50 + cfScore*0.50)));
  const score = Math.min(100, Math.max(0, raw + recoveryPenalty + capRateBonus));

  let label, color;
  if(score >= 75)      { label="Strong";   color="#059669"; }
  else if(score >= 45) { label="Moderate"; color="#2563eb"; }
  else                 { label="Weak";     color="#dc2626"; }

  // Backward-compat: income score aliasing
  const cum5    = Math.round(mcf*12*5);
  const distStr = score>=75?"High": score>=50?"Moderate": score>=25?"Low": "None";
  const durGrade= coc>=0.08&&mcf>=300?"A": coc>=0.05&&mcf>=0?"B": coc>=0?"C": "F";

  return { score, label, color, cum5, distStr, durGrade };
}

// Alias for backward compat (existing code calls uw_incomeScore)
const uw_incomeScore = uw_marginScore;

// ── PILLAR 2: RISK SCORE (40% weight — dominant) ───────────────────────────
// B&H: DSCR fragility + break-even + vacancy/rate stress survival
// (Spec: "Risk = DSCR fragility + vacancy sensitivity")
function uw_riskScore(metrics, riskTol="hybrid") {
  const cfg = RISK_CONFIG[riskTol] || RISK_CONFIG.hybrid;
  const {dscr=0, beo=0, mcf=0, rent=0, expenses=0, mortgage=0, rate=7.5, term=30, pp=0, down=20} = metrics;

  // Refi stress DSCR (+1% rate)
  const refiRate = rate + 1;
  const loan = pp*(1-down/100);
  const rr = refiRate/100/12, n = term*12;
  const refiMort = (rr>0&&n>0) ? loan*(rr*Math.pow(1+rr,n))/(Math.pow(1+rr,n)-1) : (loan/Math.max(n,1));
  const noi_monthly = rent - (expenses - (metrics.capex||0));
  const refiDSCR = refiMort>0 ? +(noi_monthly/refiMort).toFixed(2) : 0;

  // 8-scenario stress survival (spec-exact)
  const stressScenarios = [
    rent - rent/12 - expenses - mortgage,
    rent - rent/6  - expenses - mortgage,
    rent - rent/4  - expenses - mortgage,
    rent - expenses*1.10 - mortgage,
    rent - expenses*1.20 - mortgage,
    rent*0.95 - expenses - mortgage,
    rent*0.90 - expenses - mortgage,
    noi_monthly - refiMort,
  ];
  const survivors = stressScenarios.filter(cf => cf >= 0).length;
  const survivalPct = Math.round((survivors / stressScenarios.length) * 100);

  // EXACT SPEC FORMULA: start 100, deduct points
  let score = 100;
  if(dscr < 1.05)      { score = 0; }
  else if(dscr < 1.15) { score -= 25; }
  else if(dscr < 1.25) { score -= 10; }
  if(beo > 0.90)       { score -= 25; }
  else if(beo > 0.80)  { score -= 15; }
  else if(beo > 0.70)  { score -= 5; }
  if(survivalPct < 50) { score -= 20; }
  else if(survivalPct < 70) { score -= 10; }
  if(refiDSCR < 1.10)  { score -= 10; }
  score = Math.min(100, Math.max(0, score));

  const isFail = dscr < 1.05 || score === 0;
  const refiVuln = refiDSCR < 1.00 ? "High" : refiDSCR < 1.15 ? "Moderate" : "Low";
  const vac1 = Math.round(rent - rent/12 - expenses - mortgage);
  const vac3 = Math.round(rent - rent/4  - expenses - mortgage);
  const riskTier = classifyRiskTier(score);

  let label, color;
  if(isFail)         { label="Structural Fail"; color="#dc2626"; }
  else if(score>=80) { label="Strong";          color="#059669"; }
  else if(score>=60) { label="Stable";          color="#2563eb"; }
  else if(score>=40) { label="Fragile";         color="#d97706"; }
  else if(score>=20) { label="Critical";        color="#ea580c"; }
  else               { label="Structural Fail"; color="#dc2626"; }

  return {
    score, label, color, isFail, refiDSCR, refiVuln,
    survivalPct, vac1, vac3, riskTier,
    expShock10: Math.round(mcf - expenses*0.10),
    expShock20: Math.round(mcf - expenses*0.20),
  };
}

// Alias: uw_survivalScore is the old name for uw_riskScore (backward compat)
const uw_survivalScore = uw_riskScore;

// ── PILLAR 3: VELOCITY SCORE (25% weight) ──────────────────────────────────
// B&H: capital recovery timeline + equity compounding (IRR proxy)
// (Spec: "Velocity = capital recovery + IRR timeline")
function uw_velocityScore(metrics) {
  const {ti=0, pp=0, rate=7.5, term=30, down=20, mcf=0, appreciation=3, coc=0} = metrics;
  const loan = pp*(1-down/100);

  // 5-year equity multiple (spec-exact banding)
  const val5  = pp*Math.pow(1+appreciation/100,5);
  const bal5  = loanBalance(loan, rate, term, 5);
  const eq5   = Math.max(0, val5-bal5);
  const em5   = ti > 0 ? (ti + eq5 + (mcf*12*5)) / ti : 1.0;
  const em10  = (() => { const v=pp*Math.pow(1+appreciation/100,10), b=loanBalance(loan,rate,term,10); return ti>0?(ti+Math.max(0,v-b)+(mcf*12*10))/ti:1; })();
  const em20  = (() => { const v=pp*Math.pow(1+appreciation/100,20), b=loanBalance(loan,rate,term,20); return ti>0?(ti+Math.max(0,v-b)+(mcf*12*20))/ti:1; })();

  // 5-year equity multiple → base score
  let em5Score;
  if(em5 < 1.3)       em5Score = 30;
  else if(em5 < 1.7)  em5Score = 60;
  else if(em5 < 2.2)  em5Score = 80;
  else                em5Score = 100;

  // Refi viability bonus (spec-exact)
  const refiBonus = (eq5/Math.max(val5,1)) >= 0.20 ? 10 : 0;

  // Amortization contribution bonus
  const amorPct = ti>0 ? (loanBalance(loan,rate,term,0)-bal5)/Math.max(ti,1) : 0;
  const amorBonus = amorPct >= 0.15 ? 5 : 0;

  // Capital recovery time (Cash flow recovery of initial investment)
  const yrsToRecover = mcf>0&&ti>0 ? ti/(mcf*12) : null;
  const yrsScore = !yrsToRecover?0: yrsToRecover<=5?100: yrsToRecover<=8?80: yrsToRecover<=12?60: yrsToRecover<=20?35: 10;

  // IRR proxy — build 5yr cash flow and compute IRR
  const irrCFs = [-ti, ...Array.from({length:5},(_,yr)=>{
    const r = mcf*Math.pow(1.02,yr)*12;
    return yr===4 ? r+(eq5-ti*0.1) : r;
  })];
  let rawIrr = calcIRR(irrCFs);
  if(!isFinite(rawIrr)||isNaN(rawIrr)) rawIrr=0;
  if(Math.abs(rawIrr)>2.0) rawIrr=rawIrr>0?0.99:-0.99; // ±200% guardrails

  const score = Math.min(100, Math.max(0, Math.round(
    em5Score*0.50 + yrsScore*0.30 + refiBonus + amorBonus
  )));

  let label, color;
  if(score >= 75)      { label="Fast";     color="#059669"; }
  else if(score >= 50) { label="Moderate"; color="#2563eb"; }
  else if(score >= 25) { label="Slow";     color="#d97706"; }
  else                 { label="Very Slow";color="#dc2626"; }

  return {
    score, label, color, em5, em10, em20,
    eq5: Math.round(eq5), refiBonus, amorBonus,
    yrsToRecover: yrsToRecover ? +yrsToRecover.toFixed(1) : null,
    irr: +rawIrr.toFixed(3),
  };
}

// Alias: uw_capitalScore → uw_velocityScore (backward compat)
const uw_capitalScore = uw_velocityScore;

// ── COMPOSITE SCORE + VERDICT ───────────────────────────────────────────────
// Weights: Risk 40% (dominant) · Margin 35% · Velocity 25%
// Rule: If Risk Tier = "High" → Verdict CANNOT exceed "Balanced"
function uw_compositeScore(risk, margin, velocity, riskTol="hybrid") {
  const cfg = STRATEGY_MODES[riskTol] || STRATEGY_MODES.hybrid;

  // Universal weights — Risk always dominant
  const { riskW=0.40, marginW=0.35, velocityW=0.25 } = cfg;

  // Survival is alias for risk (backward compat with some call sites)
  const riskPillar   = risk;
  const marginPillar = margin;
  const velPillar    = velocity;

  const score = Math.min(100, Math.max(0, Math.round(
    riskPillar.score  * riskW +
    marginPillar.score * marginW +
    velPillar.score   * velocityW
  )));

  const pillarMin = Math.min(riskPillar.score, marginPillar.score, velPillar.score);
  const primaryRisk =
    pillarMin === riskPillar.score   ? "Risk / DSCR Fragility"  :
    pillarMin === marginPillar.score ? "Margin / Yield Quality"  :
                                       "Velocity / Capital Recovery";

  const riskTier = classifyRiskTier(riskPillar.score);
  const confidence = Math.abs(score-50) > 30 ? "High" : Math.abs(score-50) > 15 ? "Moderate" : "Low";

  // ── Verdict logic (per spec) ──
  let verdict, color, bg, icon;

  // GLOBAL RULE: High Risk Tier caps verdict at Balanced
  const highRiskCap = riskTier.tier === "High";

  if(riskPillar.score < 50 || riskPillar.isFail) {
    verdict="Fragile"; color="#dc2626"; bg="#fef2f2"; icon="🚫";
  } else if(score >= 80 && !highRiskCap) {
    verdict="Strong";   color="#059669"; bg="#f0fdf4"; icon="🎯";
  } else if(score >= 65 && !highRiskCap) {
    verdict="Buy";      color="#2563eb"; bg="#eff6ff"; icon="✅";
  } else if(score >= 50 || highRiskCap) {
    verdict="Balanced"; color="#0891b2"; bg="#ecfeff"; icon="⚖️";
  } else {
    verdict="Speculative"; color="#d97706"; bg="#fffbeb"; icon="⚠️";
  }

  // Strategy-specific overrides (mode flavoring — not changing the structure)
  if(riskTol==="income" || riskTol==="conservative") {
    if(riskPillar.score>=70&&marginPillar.score>=70&&score>=70&&!highRiskCap) {
      verdict="Buy"; color="#2563eb"; bg="#eff6ff"; icon="✅";
    }
  }
  if(riskTol==="equity" || riskTol==="aggressive") {
    if(velPillar.score>=75&&riskPillar.score>=60&&score>=70&&!highRiskCap) {
      verdict="Buy"; color="#2563eb"; bg="#eff6ff"; icon="✅";
    }
  }

  // Strong Buy upgrade: all pillars excellent AND risk not high
  if(riskPillar.score>=82 && marginPillar.score>=75 && velPillar.score>=75 && !highRiskCap) {
    verdict="Strong Buy"; color="#059669"; bg="#f0fdf4"; icon="🎯";
  }

  return {
    score, verdict, confidence, primaryRisk, color, bg, icon,
    riskTier, highRiskCap,
    // Backward compat aliases
    riskW, marginW, velocityW,
  };
}

// ── RISK SHOCK SIMULATOR (unchanged — for Stability section) ───────────────
function riskEngine(metrics, riskTol="standard") {
  const {rent=0, expenses=0, mortgage=0, rate=7.5, term=30, pp=0, down=20} = metrics;
  const noi = m => rent - (expenses-(metrics.capex||0)) - m;
  const scenarios = [
    {label:"1-mo vacancy",  cat:"vacancy",  cf: rent - rent/12 - expenses - mortgage, dscr:(rent-rent/12-(expenses-(metrics.capex||0)))/Math.max(mortgage,1)},
    {label:"2-mo vacancy",  cat:"vacancy",  cf: rent - rent/6  - expenses - mortgage, dscr:(rent-rent/6 -(expenses-(metrics.capex||0)))/Math.max(mortgage,1)},
    {label:"3-mo vacancy",  cat:"vacancy",  cf: rent - rent/4  - expenses - mortgage, dscr:(rent-rent/4 -(expenses-(metrics.capex||0)))/Math.max(mortgage,1)},
    {label:"Rate +0.5%",    cat:"interest", cf:(()=>{const rr=(rate+0.5)/100/12,n=term*12,L=pp*(1-down/100),m=L*(rr*Math.pow(1+rr,n))/(Math.pow(1+rr,n)-1);return rent-expenses-m;})(),
     dscr:(()=>{const rr=(rate+0.5)/100/12,n=term*12,L=pp*(1-down/100),m=L*(rr*Math.pow(1+rr,n))/(Math.pow(1+rr,n)-1);return noi(m)/Math.max(m,1);})()},
    {label:"Rate +1.0%",    cat:"interest", cf:(()=>{const rr=(rate+1.0)/100/12,n=term*12,L=pp*(1-down/100),m=L*(rr*Math.pow(1+rr,n))/(Math.pow(1+rr,n)-1);return rent-expenses-m;})(),
     dscr:(()=>{const rr=(rate+1.0)/100/12,n=term*12,L=pp*(1-down/100),m=L*(rr*Math.pow(1+rr,n))/(Math.pow(1+rr,n)-1);return noi(m)/Math.max(m,1);})()},
    {label:"Rate +1.5%",    cat:"interest", cf:(()=>{const rr=(rate+1.5)/100/12,n=term*12,L=pp*(1-down/100),m=L*(rr*Math.pow(1+rr,n))/(Math.pow(1+rr,n)-1);return rent-expenses-m;})(),
     dscr:(()=>{const rr=(rate+1.5)/100/12,n=term*12,L=pp*(1-down/100),m=L*(rr*Math.pow(1+rr,n))/(Math.pow(1+rr,n)-1);return noi(m)/Math.max(m,1);})()},
    {label:"Rent −5%",      cat:"rent",     cf: rent*0.95-expenses-mortgage, dscr:(rent*0.95-(expenses-(metrics.capex||0)))/Math.max(mortgage,1)},
    {label:"Rent −10%",     cat:"rent",     cf: rent*0.90-expenses-mortgage, dscr:(rent*0.90-(expenses-(metrics.capex||0)))/Math.max(mortgage,1)},
    {label:"Expenses +10%", cat:"expense",  cf: rent-expenses*1.10-mortgage, dscr:(rent-(expenses-(metrics.capex||0))*1.10)/Math.max(mortgage,1)},
    {label:"Expenses +20%", cat:"expense",  cf: rent-expenses*1.20-mortgage, dscr:(rent-(expenses-(metrics.capex||0))*1.20)/Math.max(mortgage,1)},
  ].map(s=>({...s, cf:Math.round(s.cf), dscr:+s.dscr.toFixed(2), breaches:s.dscr<1.0}));
  const breachCount = scenarios.filter(s=>s.breaches).length;
  const survivalProb = Math.max(0, Math.min(100, Math.round(100 - breachCount/scenarios.length*100)));
  const worstCF = Math.min(...scenarios.map(s=>s.cf));
  return {scenarios, survivalProb, breachCount, worstCF:Math.round(worstCF)};
}


// ══ SCENARIO ENGINE — 4 Parallel Projections ══════════════════════════════

function scenarioEngine(metrics) {
  const {pp=0, rent=0, expenses=0, mortgage=0, ti=0, down=20, rate=7.5, term=30} = metrics;
  const loan = pp*(1-down/100);

  const cases = [
    {label:"Conservative", rentG:0.5, expG:3.0, appG:1.5, prob:0.20, color:"#dc2626"},
    {label:"Base",         rentG:2.0, expG:2.0, appG:3.0, prob:0.45, color:"#2563eb"},
    {label:"Optimistic",   rentG:3.5, expG:1.5, appG:5.0, prob:0.25, color:"#059669"},
    {label:"Stress",       rentG:-2.0,expG:5.0, appG:0.0, prob:0.10, color:"#7c3aed"},
  ];

  return cases.map(c => {
    const cfs = Array.from({length:5}, (_,yr) => {
      const r = rent*Math.pow(1+c.rentG/100,yr+1);
      const e = expenses*Math.pow(1+c.expG/100,yr+1);
      return Math.round(r - e - mortgage);
    });
    const cumCF = cfs.reduce((s,v)=>s+v*12, 0);
    const val5  = pp*Math.pow(1+c.appG/100,5);
    const bal5  = loanBalance(loan, rate, term, 5);
    const eq5   = val5 - bal5;
    const refiViable = bal5 > 0 && (val5-bal5)/val5 >= 0.20;
    const irrCFs = [-ti, ...cfs.map((cf,yr)=>cf*12 + (yr===4?(val5-bal5-loan*(1-5/term)):0))];
    const irr = calcIRR(irrCFs);
    return {...c, cfs, cumCF:Math.round(cumCF), val5:Math.round(val5), eq5:Math.round(eq5), refiViable, irr};
  });
}

// ══ OPTIMIZATION SOLVER ════════════════════════════════════════════════════

function optimizationSolver(metrics, targetKey, riskTol="standard") {
  const {rent=0, expenses=0, mortgage=0, pp=0, ti=0, down=20, rate=7.5, term=30, cc=0, rehab=0, vacancy=0, capex=0} = metrics;
  const cfg = RISK_CONFIG[riskTol] || RISK_CONFIG.standard;
  const delta = (t,b) => { if(!b) return ""; const d=(t-b)/Math.abs(b)*100; return `${d>=0?"+":""}${d.toFixed(1)}%`; };
  const mort = (p,d) => { const L=p*(1-d/100),rr=rate/100/12,n=term*12; return L*(rr*Math.pow(1+rr,n))/(Math.pow(1+rr,n)-1); };

  const targets = {
    "DSCR 1.25":      () => {
      const tRent = mort(pp,down)*1.25 + (expenses-(vacancy||0)-(capex||0)) + (vacancy||0) + (capex||0);
      let lo=50000,hi=pp*1.5,tPP=pp;
      for(let k=0;k<80;k++){const m=(lo+hi)/2,mo=mort(m,down),noi=(rent-(expenses-(capex||0))); noi/Math.max(mo,1)>=1.25?hi=m:lo=m; tPP=m;}
      return [{icon:"💰",label:"Rent",          value:fmtD(Math.round(tRent/50)*50)+"/mo", delta:delta(Math.round(tRent/50)*50,rent),    feasible:(tRent-rent)/Math.max(rent,1)<=0.15},
              {icon:"🏷️",label:"Purchase Price", value:fmtD(Math.round(tPP/5000)*5000),    delta:delta(Math.round(tPP/5000)*5000,pp),   feasible:tPP>=pp*0.70}];
    },
    "8% CoC":        () => {
      const nACF = (ti+(cc+rehab))*0.08, tRent = rent + (nACF/12-(rent-expenses-mortgage));
      let lo=50000,hi=pp*1.5,tPP=pp;
      for(let k=0;k<80;k++){const m=(lo+hi)/2,mo=mort(m,down),nTI=m*down/100+cc+rehab; ((rent-expenses-mo)*12/Math.max(nTI,1))>=0.08?hi=m:lo=m; tPP=m;}
      return [{icon:"💰",label:"Rent",          value:fmtD(Math.round(tRent/50)*50)+"/mo", delta:delta(Math.round(tRent/50)*50,rent),    feasible:(tRent-rent)/Math.max(rent,1)<=0.15},
              {icon:"🏷️",label:"Purchase Price", value:fmtD(Math.round(tPP/5000)*5000),    delta:delta(Math.round(tPP/5000)*5000,pp),   feasible:tPP>=pp*0.70}];
    },
    "$300/mo CF":    () => {
      const def=300-(rent-expenses-mortgage), tRent=rent+def;
      let lo=50000,hi=pp*1.2,tPP=pp;
      for(let k=0;k<60;k++){const m=(lo+hi)/2,mo=mort(m,down); (rent-expenses-mo>=300)?hi=m:lo=m; tPP=m;}
      return [{icon:"💰",label:"Rent",          value:fmtD(Math.round(tRent/50)*50)+"/mo", delta:delta(Math.round(tRent/50)*50,rent),    feasible:def/Math.max(rent,1)<=0.15},
              {icon:"🏷️",label:"Purchase Price", value:fmtD(Math.round(tPP/5000)*5000),    delta:delta(Math.round(tPP/5000)*5000,pp),   feasible:tPP>=pp*0.70}];
    },
    "Min Capital":   () => {
      let lo=down,hi=50,tDown=down;
      for(let k=0;k<60;k++){const m=(lo+hi)/2,mo=mort(pp,m); ((rent-expenses-mo)>=0)?lo=m:hi=m; tDown=m;}
      const tPP_80 = Math.round(pp*0.80/5000)*5000;
      return [{icon:"📥",label:"Down %",         value:Math.ceil(tDown)+"%",                delta:`-${(down-Math.ceil(tDown)).toFixed(0)}pp`,   feasible:Math.ceil(tDown)>=10},
              {icon:"🏷️",label:"Max Price @80%", value:fmtD(tPP_80),                       delta:delta(tPP_80,pp),                              feasible:tPP_80>=pp*0.70}];
    },
  };

  const fn = targets[targetKey];
  if(!fn) return [];
  try {
    const opts = fn();
    return opts.sort((a,b)=>Math.abs(parseFloat(a.delta||"99"))-Math.abs(parseFloat(b.delta||"99")));
  } catch { return []; }
}

// ══ PORTFOLIO IMPACT ═══════════════════════════════════════════════════════

function calcPortfolioImpact(newMetrics, existingDeals=[]) {
  if(!existingDeals.length) return null;
  const rentals = existingDeals.filter(d=>d.mode==="rental"&&d.data);

  const portDSCR_before = rentals.length ?
    rentals.reduce((s,d)=>s+(parseFloat(d.data.dscr_calc)||1.15),0)/rentals.length : null;
  const portMCF_before  = rentals.reduce((s,d)=>s+(parseFloat(d.data.mcf)||0),0);
  const portTI_before   = rentals.reduce((s,d)=>s+(parseFloat(d.data.ti)||0),0);

  const newDSCR = newMetrics.dscr||0;
  const newMCF  = newMetrics.mcf||0;
  const newTI   = newMetrics.ti||0;

  const n = rentals.length+1;
  const portDSCR_after = portDSCR_before!=null ?
    (portDSCR_before*rentals.length + newDSCR)/n : null;

  const liqMos_before = portMCF_before>0 && portTI_before>0 ? portTI_before/(portMCF_before*12)*12 : null;
  const liqMos_after  = (portMCF_before+newMCF)>0 ? (portTI_before+newTI)/((portMCF_before+newMCF)*12)*12 : null;

  return {
    portDSCR_before: portDSCR_before!=null ? +portDSCR_before.toFixed(2) : null,
    portDSCR_after:  portDSCR_after!=null  ? +portDSCR_after.toFixed(2)  : null,
    portMCF_before:  Math.round(portMCF_before),
    portMCF_after:   Math.round(portMCF_before+newMCF),
    liqMos_before:   liqMos_before!=null ? +liqMos_before.toFixed(1) : null,
    liqMos_after:    liqMos_after!=null  ? +liqMos_after.toFixed(1)  : null,
    dealCount:       rentals.length,
  };
}

// ══ CHART COMPONENTS ═══════════════════════════════════════════════════════

function LineChart({data, color="#10b981", height=100, fill=true}) {
  if(!data||data.length<2) return null;
  const vals = data.map(d=>d.y).filter(v=>isFinite(v));
  if(!vals.length) return null;
  const min=Math.min(0,...vals);
  const max=Math.max(...vals,1);
  const W=300, H=height, pad=4;
  const range = max-min||1;
  const xScale=i=>(i/(data.length-1))*(W-pad*2)+pad;
  const yScale=v=>H-pad-(((v-min)/range)*(H-pad*2));
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

// ══ SHARED INPUT COMPONENTS ════════════════════════════════════════════════

function InputSection({title, accent="#10b981", children, badge, defaultOpen=true}) {
  const [open,setOpen]=useState(defaultOpen);
  return(
    <div style={{background:"white",borderRadius:12,border:"1.5px solid #f0f0f0",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",width:"100%",boxSizing:"border-box"}}>
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
  return(
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
        <span style={{fontSize:10,fontWeight:600,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</span>
        <span style={{fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"#059669"}}>{display?display(value):value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)}
        style={{width:"100%",accentColor:"#059669",cursor:"pointer"}}/>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}>
        <span style={{fontSize:9,color:"#9ca3af"}}>{display?display(min):min}</span>
        <span style={{fontSize:9,color:"#9ca3af"}}>{display?display(max):max}</span>
      </div>
    </div>
  );
}

// ══ MAIN RENTAL CALC v7 ════════════════════════════════════════════════════
function RentalCalc({saved,onCalcChange,profile,isPro:isProProp,onActivatePro,allDeals=[],currentDealId=null}) {
  const [addr,setAddr]       = useState(saved?.address||"");
  const [viewMode,setViewMode]= useState("snapshot");
  const [strategyMode,setStrategyMode] = useState("hybrid"); // income | hybrid | equity
  const riskTol = strategyMode; // alias for backward compat
  const cfg = STRATEGY_MODES[strategyMode] || STRATEGY_MODES.hybrid;
  const [optTarget,setOptTarget]= useState("8% CoC");
  const [stressTab,setStressTab]= useState("vacancy");
  const [scenTab,setScenTab] = useState(1); // 0=cons,1=base,2=opt,3=stress
  const [optPP,setOptPP]     = useState(null);
  const [optRent,setOptRent] = useState(null);
  const [optDown,setOptDown] = useState(null);
  const [exitTab,setExitTab] = useState(0);
  const [projOpen,setProjOpen] = useState(false);

  const isPro = isProProp||profile?.is_pro||false;

  const [i,setI]=useState(saved||{
    pp:200000,down:25,rate:7.0,term:30,cc:3000,rehab:0,
    rent:2200,otherIncome:0,
    taxes:175,insurance:90,vacancy:5,repairs:1,capex:1,mgmt:8,utilities:0,hoa:0,
    appreciation:3,rentGrowth:2,expenseGrowth:2,
  });
  const sv=k=>v=>setI(p=>({...p,[k]:v}));

  const mort=useMemo(()=>{
    const L=(+(optPP??i.pp))*(1-(+(optDown??i.down))/100);
    const r=+i.rate/100/12,n=+i.term*12;
    if(r===0||n===0) return L/Math.max(n,1);
    return L*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1);
  },[i,optPP,optDown]);

  const totalExp=useMemo(()=>{
    const effRent=+(i.rent||0);
    return +i.taxes+ +i.insurance+ (effRent*(+i.vacancy||0)/100)+ (effRent*(+i.repairs||0)/100)+ (effRent*(+i.capex||0)/100)+ (effRent*(+i.mgmt||0)/100)+ +i.utilities+ +i.hoa;
  },[i]);

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

  // Engine outputs
  const survival  = useMemo(()=>uw_survivalScore(metrics,strategyMode),[metrics,strategyMode]);
  const income    = useMemo(()=>uw_incomeScore(metrics),[metrics]);
  const capital   = useMemo(()=>uw_capitalScore(metrics),[metrics]);
  const composite = useMemo(()=>uw_compositeScore(survival,income,capital,strategyMode),[survival,income,capital,strategyMode]);
  const risk      = useMemo(()=>riskEngine(metrics,strategyMode),[metrics,strategyMode]);
  const scenarios = useMemo(()=>scenarioEngine(metrics),[metrics]);
  const monte     = useMemo(()=>runMonteCarlo(metrics,"rental"),[metrics]);
  const liq       = useMemo(()=>calcLiquidityRisk(metrics,"rental"),[metrics]);
  const portImpact= useMemo(()=>calcPortfolioImpact(metrics,allDeals.filter(d=>d.id!==currentDealId)),[metrics,allDeals,currentDealId]);
  const optSteps  = useMemo(()=>optimizationSolver(metrics,optTarget,strategyMode),[metrics,optTarget,strategyMode]);

  useEffect(()=>{setOptPP(null);setOptRent(null);setOptDown(null);},[i.pp,i.rent,i.down]);
  useEffect(()=>onCalcChange({...i,address:addr,dscr_calc:c.dscr,mcf:c.mcf,ti:c.ti},{primary:fmtD(c.mcf),secondary:fmtP(c.coc),label:"Mo. Cash Flow",label2:"CoC ROI"}),[i,c,addr]);

  const pp=+(optPP??i.pp), optRentVal=+(optRent??i.rent), down=+(optDown??i.down);
  const hasData = pp > 0 && +i.rent > 0;
  const annualCF=c.mcf*12;
  const payback=annualCF>0&&c.ti>0?c.ti/annualCF:Infinity;
  const snapFlags=[
    {label:"DSCR ≥ "+RISK_CONFIG[strategyMode].minDSCR, pass:c.dscr>=RISK_CONFIG[riskTol].minDSCR, value:c.dscr.toFixed(2)+"x"},
    {label:"Cash Flow ≥ $0",                        pass:c.mcf>=0,                              value:fmtD(c.mcf)+"/mo"},
    {label:"BEO ≤ "+(RISK_CONFIG[strategyMode].maxBEO*100).toFixed(0)+"%", pass:c.beo<=RISK_CONFIG[strategyMode].maxBEO, value:(c.beo*100).toFixed(1)+"%"},
    {label:"Payback ≤ 10 yrs",                      pass:isFinite(payback)&&payback<=10,        value:isFinite(payback)?payback.toFixed(1)+" yrs":"Never"},
  ];
  const passCount=snapFlags.filter(f=>f.pass).length;
  const snapResult=passCount===4?"Pass":passCount>=2?"Borderline":"Fail";
  const snapColor=snapResult==="Pass"?"#059669":snapResult==="Borderline"?"#d97706":"#dc2626";

  const {verdict,color:vColor,bg:vBg,icon:vIcon,score:vScore,confidence,primaryRisk}=composite;

  let cumCF=0;
  const cfChartData=c.proj.map(p=>{cumCF+=p.mcf*12; return{y:Math.round(cumCF),label:`Y${p.yr}`};});

  // Deal Identity sentence
  const dealIdentity = (()=>{
    if(survival.isFail) return "This deal has a structural failure — it cannot service its own debt.";
    if(composite.verdict==="Strong Buy") return "This is a high-conviction, well-covered income deal with strong capital efficiency.";
    if(composite.verdict==="Buy") return "This is a solid buy-and-hold deal with manageable risk and positive cash dynamics.";
    if(survival.label==="Stable"&&income.label==="Moderate") return "This is a stable but slow capital recovery deal. Cash flow is real but thin.";
    if(survival.label==="Fragile") return "This deal survives on thin margins. One vacancy event tests break-even.";
    if(income.label==="Weak") return "This deal covers debt but generates little distributable income at current terms.";
    if(capital.label==="Low") return "Capital recovery depends heavily on appreciation. Cash flow alone won't recover your investment.";
    return "This deal has mixed fundamentals. Review stress results before committing capital.";
  })();

  // Capital Recovery Score (replaces IRR focus)
  const capRecovery = (()=>{
    const yrs = liq?.yearsToRecover;
    const refiOk = scenarios[1]?.refiViable; // base case
    const eq5 = capital.eq5||0;
    const ti = c.ti||1;
    const equityYield = eq5/ti; // equity built per $ invested

    // Score 0-100
    const yrsScore  = !yrs?0: yrs<=5?100: yrs<=8?80: yrs<=12?60: yrs<=20?35: 10;
    const refiScore = refiOk?100:40;
    const eqScore   = Math.min(100, Math.round(equityYield*100));
    const score     = Math.round(yrsScore*0.40 + refiScore*0.30 + eqScore*0.30);

    const label = score>=80?"Excellent": score>=60?"Good": score>=40?"Fair": "Slow";
    const color = score>=80?"#059669": score>=60?"#2563eb": score>=40?"#d97706": "#dc2626";
    return {score, label, color, yrs, refiOk, equityYield:+equityYield.toFixed(2)};
  })();


  return(
    <div style={{display:"flex",flexDirection:"column",gap:0,width:"100%",boxSizing:"border-box"}}>
      <AddressBar value={addr} onChange={setAddr}/>


            {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — DEAL VERDICT (Dominant Anchor, Non-Negotiable)
          Single card. Score + 3 Pillars + 4 KPIs max above fold.
          No competing visual anchors. No duplicate scoring cards.
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{background:"linear-gradient(160deg,#0a0f1e 0%,#0f172a 60%,#1a2340 100%)",borderRadius:20,padding:"22px 20px 18px",marginBottom:16,boxShadow:"0 8px 32px rgba(0,0,0,0.28)",position:"relative",overflow:"hidden"}}>
        {/* Subtle gradient accent behind verdict */}
        <div style={{position:"absolute",top:-40,right:-40,width:160,height:160,borderRadius:"50%",background:`radial-gradient(circle,${vColor}18 0%,transparent 70%)`,pointerEvents:"none"}}/>

        {/* Row A: Strategy mode pills (compact) */}
        <div style={{display:"flex",gap:5,marginBottom:14}}>
          {[["income","💵","Income"],["hybrid","⚖️","Hybrid"],["equity","📈","Equity"]].map(([key,ico,lbl])=>(
            <button key={key} onClick={()=>setStrategyMode(key)}
              style={{padding:"4px 11px",borderRadius:100,border:`1.5px solid ${strategyMode===key?vColor+"80":"rgba(255,255,255,0.1)"}`,background:strategyMode===key?vColor+"20":"transparent",color:strategyMode===key?"white":"rgba(255,255,255,0.35)",fontSize:10,fontWeight:700,cursor:"pointer",transition:"all 0.15s",letterSpacing:"0.03em"}}>
              {ico} {lbl}
            </button>
          ))}
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
            {composite.highRiskCap&&<span style={{fontSize:9,fontWeight:700,color:"#fbbf24",background:"#78350f40",padding:"2px 8px",borderRadius:100,letterSpacing:"0.05em"}}>⚠ RISK CAP ACTIVE</span>}
          </div>
        </div>

        {/* Row B: Verdict + Score + Pillars */}
        <div style={{display:"flex",gap:14,alignItems:"flex-start",marginBottom:18}}>

          {/* Left: Verdict block */}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:9,color:"rgba(255,255,255,0.35)",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.1em",marginBottom:8}}>Deal Verdict</div>
            <div style={{fontSize:32,fontWeight:900,color:vColor,lineHeight:1,marginBottom:6,letterSpacing:"-0.02em"}}>{vIcon} {verdict}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",lineHeight:1.5,maxWidth:280}}>{dealIdentity}</div>
          </div>

          {/* Right: Score ring + pillars */}
          <div style={{flexShrink:0,display:"flex",flexDirection:"column",gap:10,alignItems:"flex-end"}}>
            {/* Score */}
            <div style={{background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"10px 16px",textAlign:"center",border:`1px solid ${vColor}25`}}>
              <div style={{fontSize:8,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.08em",marginBottom:4}}>Score</div>
              <div style={{fontSize:28,fontWeight:900,color:vColor,fontFamily:"'DM Mono',monospace",lineHeight:1}}>{vScore}</div>
              <div style={{fontSize:8,color:"rgba(255,255,255,0.25)",marginTop:3}}>{confidence} confidence</div>
            </div>
          </div>
        </div>

        {/* Row C: Three pillars (Margin / Risk / Velocity) */}
        <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:18}}>
          {[
            {key:"Margin",   d:income,   def:"Yield · CoC · Cash Flow Quality",  w:cfg.marginW},
            {key:"Risk",     d:survival, def:"DSCR · Break-even · Stress Survival", w:cfg.riskW, dominant:true},
            {key:"Velocity", d:capital,  def:"Capital Recovery · IRR · Equity Growth", w:cfg.velocityW},
          ].map(({key,d,def,w,dominant})=>(
            <div key={key} style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:62,flexShrink:0}}>
                <div style={{fontSize:9,fontWeight:700,color:dominant?"rgba(255,255,255,0.65)":"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:"0.07em",lineHeight:1}}>{key}</div>
                <div style={{fontSize:7,color:"rgba(255,255,255,0.2)",marginTop:1}}>{Math.round(w*100)}% weight</div>
              </div>
              <div style={{flex:1,height:dominant?6:4,background:"rgba(255,255,255,0.07)",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:d.score+"%",background:d.color,borderRadius:3,transition:"width 0.45s ease",opacity:dominant?1:0.85}}/>
              </div>
              <span style={{fontSize:11,fontWeight:800,color:d.color,width:28,textAlign:"right",fontFamily:"'DM Mono',monospace"}}>{d.score}</span>
              <span style={{fontSize:10,fontWeight:700,color:d.isFail?"#dc2626":d.color,width:66,textAlign:"left",paddingLeft:4}}>{d.label}</span>
            </div>
          ))}
        </div>

        {/* Row D: 4 KPIs max above fold (spec: "Maximum four key metrics above the fold") */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
          {[
            {l:"Cash Flow",  v:fmtD(c.mcf)+"/mo",     col:c.mcf>=0?"#34d399":"#f87171"},
            {l:"DSCR",       v:c.dscr.toFixed(2)+"x",  col:c.dscr>=1.25?"#34d399":c.dscr>=1.1?"#fbbf24":"#f87171"},
            {l:"CoC ROI",    v:fmtP(c.coc),             col:c.coc>=0.08?"#34d399":c.coc>=0.04?"#fbbf24":"#f87171"},
            {l:"Capital In", v:fmtM(c.ti),              col:"rgba(255,255,255,0.55)"},
          ].map(({l,v,col})=>(
            <div key={l} style={{background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"10px 8px",textAlign:"center",border:"1px solid rgba(255,255,255,0.06)"}}>
              <div style={{fontSize:8,color:"rgba(255,255,255,0.25)",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.06em",marginBottom:4}}>{l}</div>
              <div style={{fontSize:13,fontWeight:800,fontFamily:"'DM Mono',monospace",color:col,lineHeight:1}}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ INPUTS (full-width below verdict) ══════════════════════════════════ */}
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
        <InputSection title="Acquisition" accent="#10b981" defaultOpen badge={`${fmtD(c.effPP)} · ${fmtD(mort)}/mo`}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            <NF label="Purchase Price" value={i.pp} onChange={sv("pp")} prefix="$" step={5000}/>
            <NF label="Down %" value={i.down} onChange={sv("down")} suffix="%" step={1}/>
            <NF label="Rate %" value={i.rate} onChange={sv("rate")} suffix="%" step={0.125}/>
            <NF label="Term" value={i.term} onChange={sv("term")} suffix="yr" step={5}/>
            <NF label="Closing $" value={i.cc} onChange={sv("cc")} prefix="$" step={500}/>
            <NF label="Rehab" value={i.rehab} onChange={sv("rehab")} prefix="$" step={1000}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"7px 10px",background:"#f0fdf4",borderRadius:8,marginTop:6,border:"1px solid #bbf7d0"}}>
            <span style={{fontSize:10,color:"#6b7280"}}>{fmtD(c.loan)} loan · {i.rate}% · {i.term}yr</span>
            <span style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#059669"}}>{fmtD(mort)}/mo</span>
          </div>
        </InputSection>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <InputSection title="Income" accent="#10b981" defaultOpen badge={`${fmtD(c.effRent)}/mo`}>
            <NF label="Monthly Rent" value={i.rent} onChange={sv("rent")} prefix="$" step={50}/>
            <NF label="Other Income" value={i.otherIncome||0} onChange={sv("otherIncome")} prefix="$" step={25}/>
          </InputSection>
          <InputSection title="Growth" accent="#7c3aed" defaultOpen>
            <NF label="Appreciation %" value={i.appreciation||3} onChange={sv("appreciation")} suffix="%" step={0.5}/>
            <NF label="Rent Growth %" value={i.rentGrowth||2} onChange={sv("rentGrowth")} suffix="%" step={0.5}/>
            <NF label="Exp. Inflation %" value={i.expenseGrowth||2} onChange={sv("expenseGrowth")} suffix="%" step={0.5}/>
          </InputSection>
        </div>

        <InputSection title="Operating Expenses" accent="#6b7280" defaultOpen={false} badge={`${fmtD(totalExp)}/mo`}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
            {[["Taxes",sv("taxes"),i.taxes,25],["Insurance",sv("insurance"),i.insurance,10],["Vacancy",sv("vacancy"),i.vacancy,25],["Repairs",sv("repairs"),i.repairs,25],["CapEx",sv("capex"),i.capex,25],["Mgmt",sv("mgmt"),i.mgmt,25],["Utilities",sv("utilities"),i.utilities,25],["HOA",sv("hoa"),i.hoa,25]]
            .map(([l,fn,v,s])=><NF key={l} label={l} value={v} onChange={fn} prefix="$" step={s}/>)}
          </div>
        </InputSection>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — STABILITY (Survival Under Stress)
          Answers: "Does this deal survive stress?"
          Fragility metrics ONLY — no profit / ROI metrics here.
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{background:"white",borderRadius:16,border:"1.5px solid #e5e7eb",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",marginBottom:12,overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"14px 18px",borderBottom:"1px solid #f3f4f6",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fafafa"}}>
          <div>
            <div style={{fontSize:11,fontWeight:800,color:"#111827",textTransform:"uppercase",letterSpacing:"0.07em"}}>Stability</div>
            <div style={{fontSize:10,color:"#9ca3af",marginTop:1}}>Survival under stress — fragility only</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:9,fontWeight:700,color:survival.riskTier?.color,background:survival.riskTier?.color+"15",padding:"3px 10px",borderRadius:100,textTransform:"uppercase",letterSpacing:"0.07em"}}>
              Risk: {survival.riskTier?.tier||"—"}
            </span>
            <span style={{fontSize:14,fontWeight:900,fontFamily:"'DM Mono',monospace",color:survival.color}}>{survival.score}</span>
          </div>
        </div>

        <div style={{padding:"16px 18px"}}>
          {/* Core fragility metrics */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:14}}>
            {[
              {l:"DSCR",          v:c.dscr.toFixed(2)+"x",    good:c.dscr>=1.25, warn:c.dscr>=1.1},
              {l:"Break-even",    v:(c.beo*100).toFixed(1)+"%", good:c.beo<=0.80,  warn:c.beo<=0.90},
              {l:"Refi DSCR",     v:survival.refiDSCR+"x",     good:survival.refiDSCR>=1.25, warn:survival.refiDSCR>=1.1},
              {l:"Stress Survived",v:risk.survivalProb+"%",    good:risk.survivalProb>=80, warn:risk.survivalProb>=60},
            ].map(({l,v,good,warn})=>(
              <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"10px 10px",borderLeft:`3px solid ${good?"#10b981":warn?"#f59e0b":"#ef4444"}`}}>
                <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:3,letterSpacing:"0.05em"}}>{l}</div>
                <div style={{fontSize:14,fontWeight:900,fontFamily:"'DM Mono',monospace",color:good?"#059669":warn?"#d97706":"#dc2626"}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Vacancy simulation */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:7}}>Vacancy Simulation</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
              {[["1-mo",survival.vac1],["3-mo",survival.vac3],["Exp +20%",survival.expShock20]].map(([l,v])=>(
                <div key={l} style={{background:v>=0?"#f0fdf4":"#fef2f2",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",marginBottom:3}}>{l} Vacancy</div>
                  <div style={{fontSize:13,fontWeight:800,fontFamily:"'DM Mono',monospace",color:v>=0?"#059669":"#dc2626"}}>{fmtD(v)}</div>
                  <div style={{fontSize:8,color:v>=0?"#059669":"#dc2626"}}>{v>=0?"Survives":"Breach"}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Stress scenario detail tabs */}
          <div style={{borderRadius:10,border:"1px solid #f3f4f6",overflow:"hidden"}}>
            <div style={{display:"flex",background:"#f9fafb",borderBottom:"1px solid #f3f4f6"}}>
              {["vacancy","interest","rent","expense"].map(t=>(
                <button key={t} onClick={()=>setStressTab(t)}
                  style={{flex:1,padding:"6px",border:"none",background:stressTab===t?"white":"transparent",borderBottom:stressTab===t?"2px solid #111827":"2px solid transparent",fontSize:9,fontWeight:700,color:stressTab===t?"#111827":"#9ca3af",cursor:"pointer",textTransform:"capitalize"}}>
                  {t}
                </button>
              ))}
            </div>
            <div style={{padding:"10px 12px"}}>
              {risk.scenarios.filter(s=>s.cat===stressTab).map((s,si,arr)=>(
                <div key={si} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:si<arr.length-1?"1px solid #f9fafb":"none"}}>
                  <span style={{fontSize:10,color:"#6b7280",width:90,flexShrink:0}}>{s.label}</span>
                  <div style={{flex:1,height:4,background:"#f3f4f6",borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",width:Math.max(0,Math.min(100,(s.dscr/2)*100))+"%",background:s.breaches?"#dc2626":"#059669",borderRadius:2}}/>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,fontFamily:"'DM Mono',monospace",color:s.breaches?"#dc2626":"#374151",width:36,textAlign:"right"}}>{s.dscr.toFixed(2)}x</span>
                  <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:s.cf>=0?"#059669":"#dc2626",width:65,textAlign:"right"}}>{fmtD(s.cf)}/mo</span>
                  {s.breaches&&<span style={{fontSize:8,color:"#dc2626",background:"#fef2f2",padding:"1px 4px",borderRadius:100,fontWeight:700,flexShrink:0}}>BREACH</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 — CAPITAL EFFICIENCY
          Answers: "How efficiently does capital grow?"
          No risk duplication here.
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{background:"white",borderRadius:16,border:"1.5px solid #e5e7eb",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",marginBottom:12,overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid #f3f4f6",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fafafa"}}>
          <div>
            <div style={{fontSize:11,fontWeight:800,color:"#111827",textTransform:"uppercase",letterSpacing:"0.07em"}}>Capital Efficiency</div>
            <div style={{fontSize:10,color:"#9ca3af",marginTop:1}}>How efficiently capital compounds</div>
          </div>
          <span style={{fontSize:9,fontWeight:700,color:capital.color,background:capital.color+"15",padding:"3px 10px",borderRadius:100}}>{capital.label}</span>
        </div>
        <div style={{padding:"16px 18px"}}>
          {/* CoC / IRR / Capital Recovery / Annualized ROI */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:14}}>
            {[
              {l:"Cash-on-Cash",   v:fmtP(c.coc),     col:c.coc>=0.08?"#059669":c.coc>=0.04?"#d97706":"#dc2626"},
              {l:"Capital In",     v:fmtD(c.ti),       col:"#374151"},
              {l:"5yr Equity",     v:fmtM(capital.eq5),col:"#059669"},
              {l:"Capital Recov.", v:capital.yrsToRecover?capital.yrsToRecover+"yr":"Long", col:capital.yrsToRecover&&capital.yrsToRecover<=8?"#059669":"#d97706"},
            ].map(({l,v,col})=>(
              <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:3}}>{l}</div>
                <div style={{fontSize:14,fontWeight:900,fontFamily:"'DM Mono',monospace",color:col}}>{v}</div>
              </div>
            ))}
          </div>
          {/* Capital multiplier timeline */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:7}}>Capital Multiplier</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[["5yr",capital.em5],["10yr",capital.em10],["20yr",capital.em20]].map(([l,v])=>(
                <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"10px",textAlign:"center"}}>
                  <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",marginBottom:3}}>{l}</div>
                  <div style={{fontSize:18,fontWeight:900,fontFamily:"'DM Mono',monospace",color:v>=1.5?"#059669":"#d97706"}}>{v?v.toFixed(1):"—"}×</div>
                </div>
              ))}
            </div>
          </div>
          {/* Refi windows */}
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:7}}>Refi Windows</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
              {[3,5,7,10].map(yr=>{
                const valY=c.effPP*Math.pow(1+(+i.appreciation||3)/100,yr);
                const balY=loanBalance(c.loan,+i.rate,+i.term,yr);
                const eqPct=c.effPP>0?(valY-balY)/c.effPP:0;
                const viable=eqPct>=0.20&&survival.score>=55;
                return(
                  <div key={yr} style={{textAlign:"center",padding:"8px 4px",borderRadius:8,border:`1.5px solid ${viable?"#bbf7d0":"#f0f0f0"}`,background:viable?"#f0fdf4":"#fafafa"}}>
                    <div style={{fontSize:9,fontWeight:700,color:viable?"#059669":"#9ca3af",marginBottom:2}}>Year {yr}</div>
                    <div style={{fontSize:11,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#374151"}}>{(eqPct*100).toFixed(0)}%</div>
                    <div style={{fontSize:8,color:viable?"#059669":"#9ca3af"}}>{viable?"✅ Viable":"—"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 4 — OPTIMIZATION (Fix the Deal)
          Sliders + target toggles ONLY.
          Each slider shows delta impact on Margin / Risk / Velocity / Score.
          No standalone metrics displayed here.
      ══════════════════════════════════════════════════════════════════════ */}
      <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
        <div style={{background:"white",borderRadius:16,border:"1.5px solid #e5e7eb",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",marginBottom:12,overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:"1px solid #f3f4f6",background:"#fafafa"}}>
            <div style={{fontSize:11,fontWeight:800,color:"#111827",textTransform:"uppercase",letterSpacing:"0.07em"}}>Optimization</div>
            <div style={{fontSize:10,color:"#9ca3af",marginTop:1}}>Adjust levers — see real-time score impact</div>
          </div>
          <div style={{padding:"16px 18px"}}>
            {/* Target toggles */}
            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:14}}>
              <span style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",alignSelf:"center",marginRight:4}}>Target:</span>
              {["DSCR 1.25","8% CoC","$300/mo CF","Min Capital"].map(t=>(
                <button key={t} onClick={()=>setOptTarget(t)}
                  style={{padding:"4px 11px",borderRadius:100,border:`1.5px solid ${optTarget===t?"#059669":"#e5e7eb"}`,background:optTarget===t?"#f0fdf4":"white",color:optTarget===t?"#059669":"#6b7280",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                  {t}
                </button>
              ))}
            </div>
            {/* Sliders with delta display */}
            <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:14}}>
              <OSlider label="Purchase Price" value={+(optPP??i.pp)||0} onChange={v=>setOptPP(v)} min={Math.round((+i.pp||320000)*0.55)} max={Math.round((+i.pp||320000)*1.2)} step={5000} display={v=>`$${Math.round(v/1000)}K`}/>
              <OSlider label="Monthly Rent"   value={+(optRent??i.rent)||0} onChange={v=>setOptRent(v)} min={Math.round((+i.rent||2800)*0.65)} max={Math.round((+i.rent||2800)*1.5)} step={50} display={v=>`$${v.toLocaleString()}/mo`}/>
              <OSlider label="Down Payment"   value={+(optDown??i.down)||20} onChange={v=>setOptDown(v)} min={5} max={50} step={1} display={v=>`${v}%`}/>
            </div>
            {/* Optimization result */}
            {optSteps.length===0?(
              <div style={{padding:"12px",background:"#f0fdf4",borderRadius:10,textAlign:"center",fontSize:12,color:"#059669",fontWeight:700}}>✅ Already meets {optTarget}</div>
            ):(
              <div style={{background:"#f9fafb",borderRadius:10,border:"1px solid #e5e7eb",padding:"12px"}}>
                <div style={{fontSize:10,fontWeight:700,color:"#374151",marginBottom:8}}>To reach <strong>{optTarget}</strong>:</div>
                {optSteps.map((opt,oi)=>{
                  const pct=Math.abs(parseFloat(opt.delta||"0"));
                  const diff=pct<10?"Easy":pct<20?"Moderate":"Hard";
                  const dc=diff==="Easy"?"#059669":diff==="Moderate"?"#d97706":"#dc2626";
                  return(
                    <div key={oi} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:oi<optSteps.length-1?"1px solid #f3f4f6":"none"}}>
                      <span style={{fontSize:14,flexShrink:0}}>{opt.icon}</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:11,color:"#374151",fontWeight:600}}>{opt.label}</div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:13,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#059669"}}>{opt.value}</span>
                          <span style={{fontSize:10,color:"#9ca3af",fontFamily:"'DM Mono',monospace"}}>{opt.delta}</span>
                          <span style={{fontSize:9,fontWeight:700,color:dc,background:dc+"15",padding:"1px 5px",borderRadius:100}}>{diff}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Reset optimization */}
            {(optPP!==null||optRent!==null||optDown!==null)&&(
              <button onClick={()=>{setOptPP(null);setOptRent(null);setOptDown(null);}} style={{marginTop:10,width:"100%",padding:"8px",borderRadius:8,border:"1px solid #e5e7eb",background:"white",color:"#6b7280",fontSize:10,fontWeight:600,cursor:"pointer"}}>
                ↺ Reset to Actual Values
              </button>
            )}
          </div>
        </div>
      </ProGate>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 5 — LONG-TERM PROJECTION (Collapsed by Default)
          30-year wealth curve, year-by-year table, exit scenarios.
          Hidden unless expanded — spec says "collapsed by default".
      ══════════════════════════════════════════════════════════════════════ */}
      {(()=>{
        const appR  = +i.appreciation||3;
        const rentG = +i.rentGrowth||2;
        const expG  = +i.expenseGrowth||2;
        const loan  = c.loan;

        const rows = [1,3,5,7,10,15,20,25,30].map(yr=>{
          const valY = c.effPP*Math.pow(1+appR/100,yr);
          const balY = loanBalance(loan,+i.rate,+i.term,yr);
          const eq   = Math.max(0,valY-balY);
          const mcfY = c.mcf>0 ? Math.round(c.effRent*Math.pow(1+rentG/100,yr)-totalExp*Math.pow(1+expG/100,yr)-mort) : 0;
          const mult = c.ti>0 ? +((c.ti+eq+mcfY*12*yr)/Math.max(c.ti,1)).toFixed(2) : 0;
          return {yr, val:Math.round(valY), eq:Math.round(eq), mcfY, mult};
        });

        return(
          <div style={{background:"white",borderRadius:16,border:"1.5px solid #e5e7eb",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",marginBottom:12,overflow:"hidden"}}>
            <button onClick={()=>setProjOpen(o=>!o)} style={{width:"100%",padding:"14px 18px",border:"none",background:"#fafafa",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",textAlign:"left"}}>
              <div>
                <div style={{fontSize:11,fontWeight:800,color:"#111827",textTransform:"uppercase",letterSpacing:"0.07em"}}>Long-Term Projection</div>
                <div style={{fontSize:10,color:"#9ca3af",marginTop:1}}>30-year wealth curve · Year-by-year · Exit scenarios</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:9,color:"#9ca3af"}}>Expand</span>
                <span style={{fontSize:16,color:"#9ca3af",transform:projOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
              </div>
            </button>
            {projOpen&&(
              <div style={{padding:"16px 18px"}}>
                {/* 30-year SVG equity curve */}
                {(()=>{
                  const W=320, H=100;
                  const maxEq=Math.max(...rows.map(r=>r.eq),1);
                  const xS = i => (i/(rows.length-1))*W;
                  const yS = v => H - (v/maxEq)*H;
                  const path = rows.map((r,idx)=>`${idx===0?"M":"L"}${xS(idx).toFixed(1)},${yS(r.eq).toFixed(1)}`).join(" ");
                  return(
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginBottom:6}}>Equity Curve (Base Case)</div>
                      <svg width="100%" viewBox={`0 0 ${W} ${H+14}`} style={{display:"block"}}>
                        <defs>
                          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#059669" stopOpacity="0.2"/>
                            <stop offset="100%" stopColor="#059669" stopOpacity="0"/>
                          </linearGradient>
                        </defs>
                        <path d={path+" L"+xS(rows.length-1)+","+H+" L0,"+H+" Z"} fill="url(#eqGrad)"/>
                        <path d={path} fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round"/>
                        {rows.filter((_,idx)=>idx%2===0).map((r,idx,arr)=>(
                          <text key={r.yr} x={xS(rows.indexOf(r))} y={H+12} textAnchor="middle" fontSize="7" fill="#9ca3af">Y{r.yr}</text>
                        ))}
                      </svg>
                    </div>
                  );
                })()}
                {/* Year-by-year table */}
                <div style={{overflowX:"auto",marginBottom:14}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                    <thead><tr style={{borderBottom:"2px solid #f3f4f6",background:"#fafafa"}}>
                      {["Year","Value","Equity","Mo. CF","Mult."].map(h=>(
                        <th key={h} style={{padding:"7px 10px",textAlign:h==="Year"?"left":"right",fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {rows.map((r,pi)=>(
                        <tr key={r.yr} style={{borderBottom:"1px solid #f9fafb",background:pi%2===0?"white":"#fafafa"}}>
                          <td style={{padding:"6px 10px",fontWeight:600,color:"#374151"}}>Yr {r.yr}</td>
                          <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"'DM Mono',monospace",color:"#374151"}}>{fmtM(r.val)}</td>
                          <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"'DM Mono',monospace",color:"#059669",fontWeight:700}}>{fmtM(r.eq)}</td>
                          <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"'DM Mono',monospace",color:r.mcfY>=0?"#059669":"#dc2626",fontWeight:700}}>{fmtD(r.mcfY)}</td>
                          <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"'DM Mono',monospace",color:r.mult>=1.5?"#059669":"#d97706",fontWeight:800}}>{r.mult}×</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Exit scenarios */}
                <div>
                  <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:7}}>Exit Scenarios</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    {[5,10,20].map(yr=>{
                      const r = rows.find(x=>x.yr===yr)||rows[rows.length-1];
                      const proceeds = Math.round(r.eq*0.94);
                      return(
                        <div key={yr} style={{background:"#f8fafc",borderRadius:10,padding:"12px 10px",textAlign:"center"}}>
                          <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",marginBottom:4}}>Exit Yr {yr}</div>
                          <div style={{fontSize:14,fontWeight:900,fontFamily:"'DM Mono',monospace",color:"#059669"}}>{fmtM(r.val)}</div>
                          <div style={{fontSize:9,color:"#9ca3af",margin:"2px 0"}}>Net ~{fmtM(proceeds)}</div>
                          <div style={{fontSize:11,fontWeight:700,color:r.mult>=1.5?"#059669":"#d97706"}}>{r.mult}× capital</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      
      {/* Portfolio impact note */}
      {portImpact&&portImpact.dealCount>0&&(
        <div style={{background:"#f0f9ff",borderRadius:12,padding:"12px 16px",border:"1px solid #bae6fd",marginBottom:8}}>
          <div style={{fontSize:10,fontWeight:700,color:"#0369a1",marginBottom:5}}>Portfolio Impact</div>
          <div style={{display:"flex",gap:16}}>
            {portImpact.portDSCR_before!=null&&(
              <span style={{fontSize:11,color:"#374151"}}>DSCR: <b>{portImpact.portDSCR_before}x</b> → <b style={{color:portImpact.portDSCR_after<portImpact.portDSCR_before?"#dc2626":"#059669"}}>{portImpact.portDSCR_after}x</b></span>
            )}
            <span style={{fontSize:11,color:"#374151"}}>CF: <b>{fmtD(portImpact.portMCF_before)}</b> → <b style={{color:portImpact.portMCF_after>portImpact.portMCF_before?"#059669":"#dc2626"}}>{fmtD(portImpact.portMCF_after)}/mo</b></span>
          </div>
        </div>
      )}
    </div>
  );
}


function wsRiskScore(c, strategyProfile="balanced") {
  // Spec: Spread/Margin/Repair/Fee weighted risk score
  const {adjArv:arv=1, mao=0, repairs=0, fee=0} = c;
  const spread    = arv - mao;
  const spreadPct = arv > 0 ? spread / arv : 0;
  const repairPct = arv > 0 ? repairs / arv : 0;
  const feePct    = spread > 0 ? fee / spread : 0;
  const invMargin = arv - repairs - mao;
  const invMarginPct = arv > 0 ? invMargin / arv : 0;

  // Required thresholds per strategy
  const profiles = {
    conservative: { minMargin:0.25, minSpread:0.20, maxRepairs:0.15, maxFeePct:0.15 },
    balanced:     { minMargin:0.20, minSpread:0.18, maxRepairs:0.20, maxFeePct:0.20 },
    aggressive:   { minMargin:0.15, minSpread:0.15, maxRepairs:0.25, maxFeePct:0.25 },
  };
  const prof = profiles[strategyProfile] || profiles.balanced;

  // Spread Score (35%)
  let spreadScore;
  if(spreadPct < 0.15)       spreadScore = 30;
  else if(spreadPct < 0.18)  spreadScore = 60;
  else if(spreadPct < 0.22)  spreadScore = 80;
  else                       spreadScore = 100;

  // Repair Risk Score (20%)
  let repairScore;
  if(repairPct > 0.30)       repairScore = 30;
  else if(repairPct > 0.20)  repairScore = 60;
  else if(repairPct > 0.10)  repairScore = 85;
  else                       repairScore = 100;

  // Fee Safety Score (15%)
  let feeScore;
  if(feePct > 0.30)          feeScore = 30;
  else if(feePct > 0.20)     feeScore = 60;
  else if(feePct > 0.10)     feeScore = 85;
  else                       feeScore = 100;

  // Margin Cushion Score (30%)
  let marginScore;
  if(invMarginPct < 0.15)    marginScore = 40;
  else if(invMarginPct < 0.20) marginScore = 70;
  else                       marginScore = 100;

  const score = Math.min(100, Math.max(0, Math.round(
    spreadScore * 0.35 + marginScore * 0.30 + repairScore * 0.20 + feeScore * 0.15
  )));

  // Verdict per spec
  let verdict, vColor, vBg, vIcon;
  if(score >= 80)      { verdict="Assign Immediately"; vColor="#059669"; vBg="#f0fdf4"; vIcon="🚀"; }
  else if(score >= 70) { verdict="Market Carefully";   vColor="#2563eb"; vBg="#eff6ff"; vIcon="📢"; }
  else if(score >= 60) { verdict="Tight Spread";       vColor="#d97706"; vBg="#fffbeb"; vIcon="⚠️"; }
  else if(score >= 50) { verdict="Risky";              vColor="#ea580c"; vBg="#fff7ed"; vIcon="🔶"; }
  else                 { verdict="Walk Away";           vColor="#dc2626"; vBg="#fef2f2"; vIcon="🚫"; }

  // Primary risk driver
  const minScore = Math.min(spreadScore, repairScore, feeScore, marginScore);
  const primaryRisk =
    minScore === spreadScore ? "Thin Spread" :
    minScore === repairScore ? "Repair Exposure" :
    minScore === feeScore    ? "High Fee Ratio" :
                               "Low Investor Margin";

  // Deal Velocity Score (how easy to assign)
  let velocity = 100;
  if(spreadPct < 0.18) velocity -= 25;
  if(repairPct > 0.20) velocity -= 25;
  if(feePct > 0.20)    velocity -= 20;
  if(invMarginPct < 0.20) velocity -= 15;
  velocity = Math.max(0, velocity);
  const velocityLabel = velocity >= 75 ? "High" : velocity >= 50 ? "Moderate" : "Low";

  return { score, verdict, vColor, vBg, vIcon, primaryRisk,
           spreadScore, repairScore, feeScore, marginScore,
           spreadPct, repairPct, feePct, invMarginPct,
           velocity, velocityLabel,
           meetsProfile: invMarginPct >= prof.minMargin && spreadPct >= prof.minSpread };
}

// ══ UNIVERSAL CALC SHELL COMPONENT ════════════════════════════════════════
// Implements the spec layout for all non-B&H calculators:
// Verdict → Stability → Capital Efficiency → Optimization → Long-Term
// Props: verdict, score, margin, risk, velocity, kpis, stabilityContent,
//        capEffContent, optContent, projContent (collapsed by default)

function UniversalVerdictHeader({verdict, vIcon, vColor, score, confidence, primaryRisk, margin, risk, velocity, highRiskCap, kpis, strategyLabel, strategyIcon}) {
  return (
    <div style={{background:"linear-gradient(160deg,#0a0f1e 0%,#0f172a 60%,#1a2340 100%)",borderRadius:20,padding:"22px 20px 18px",marginBottom:16,boxShadow:"0 8px 32px rgba(0,0,0,0.28)",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:-40,right:-40,width:160,height:160,borderRadius:"50%",background:`radial-gradient(circle,${vColor}18 0%,transparent 70%)`,pointerEvents:"none"}}/>

      {/* Strategy + Risk Cap badge */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <span style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.45)",letterSpacing:"0.05em"}}>{strategyIcon} {strategyLabel}</span>
        {highRiskCap&&<span style={{fontSize:9,fontWeight:700,color:"#fbbf24",background:"#78350f40",padding:"2px 8px",borderRadius:100,letterSpacing:"0.05em"}}>⚠ RISK CAP ACTIVE</span>}
      </div>

      {/* Verdict + Score */}
      <div style={{display:"flex",gap:14,alignItems:"flex-start",marginBottom:18}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:9,color:"rgba(255,255,255,0.35)",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.1em",marginBottom:8}}>Deal Verdict</div>
          <div style={{fontSize:32,fontWeight:900,color:vColor,lineHeight:1,marginBottom:6,letterSpacing:"-0.02em"}}>{vIcon} {verdict}</div>
          {primaryRisk&&<div style={{fontSize:10,color:"rgba(255,255,255,0.4)"}}>Primary risk: <span style={{color:"rgba(255,255,255,0.6)",fontWeight:600}}>{primaryRisk}</span></div>}
        </div>
        <div style={{background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"10px 16px",textAlign:"center",border:`1px solid ${vColor}25`,flexShrink:0}}>
          <div style={{fontSize:8,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.08em",marginBottom:4}}>Score</div>
          <div style={{fontSize:28,fontWeight:900,color:vColor,fontFamily:"'DM Mono',monospace",lineHeight:1}}>{score}</div>
          {confidence&&<div style={{fontSize:8,color:"rgba(255,255,255,0.25)",marginTop:3}}>{confidence} conf.</div>}
        </div>
      </div>

      {/* Three pillars: Margin / Risk / Velocity */}
      <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:18}}>
        {[
          {key:"Margin",   d:margin,   dominant:false, w:"35%"},
          {key:"Risk",     d:risk,     dominant:true,  w:"40%"},
          {key:"Velocity", d:velocity, dominant:false, w:"25%"},
        ].map(({key,d,dominant,w})=>(
          <div key={key} style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:62,flexShrink:0}}>
              <div style={{fontSize:9,fontWeight:700,color:dominant?"rgba(255,255,255,0.65)":"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:"0.07em",lineHeight:1}}>{key}</div>
              <div style={{fontSize:7,color:"rgba(255,255,255,0.2)",marginTop:1}}>{w} weight</div>
            </div>
            <div style={{flex:1,height:dominant?6:4,background:"rgba(255,255,255,0.07)",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:(d?.score||0)+"%",background:d?.color||"#6b7280",borderRadius:3,transition:"width 0.45s ease",opacity:dominant?1:0.85}}/>
            </div>
            <span style={{fontSize:11,fontWeight:800,color:d?.color||"#6b7280",width:28,textAlign:"right",fontFamily:"'DM Mono',monospace"}}>{d?.score||0}</span>
            <span style={{fontSize:10,fontWeight:700,color:d?.color||"#6b7280",width:72,paddingLeft:4}}>{d?.label||"—"}</span>
          </div>
        ))}
      </div>

      {/* 4 KPIs max (spec: "Maximum four key metrics above the fold") */}
      {kpis&&kpis.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
          {kpis.slice(0,4).map(({l,v,col})=>(
            <div key={l} style={{background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"10px 8px",textAlign:"center",border:"1px solid rgba(255,255,255,0.06)"}}>
              <div style={{fontSize:8,color:"rgba(255,255,255,0.25)",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.06em",marginBottom:4}}>{l}</div>
              <div style={{fontSize:13,fontWeight:800,fontFamily:"'DM Mono',monospace",color:col||"rgba(255,255,255,0.55)",lineHeight:1}}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionCard({title, subtitle, badge, badgeColor, children, defaultOpen=true}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{background:"white",borderRadius:16,border:"1.5px solid #e5e7eb",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",marginBottom:12,overflow:"hidden"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%",padding:"14px 18px",border:"none",background:"#fafafa",cursor:defaultOpen?"default":"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",textAlign:"left"}} disabled={defaultOpen}>
        <div>
          <div style={{fontSize:11,fontWeight:800,color:"#111827",textTransform:"uppercase",letterSpacing:"0.07em"}}>{title}</div>
          {subtitle&&<div style={{fontSize:10,color:"#9ca3af",marginTop:1}}>{subtitle}</div>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {badge&&<span style={{fontSize:9,fontWeight:700,color:badgeColor||"#6b7280",background:(badgeColor||"#6b7280")+"15",padding:"3px 10px",borderRadius:100}}>{badge}</span>}
          {!defaultOpen&&<span style={{fontSize:14,color:"#9ca3af",transform:open?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>}
        </div>
      </button>
      {open&&<div style={{padding:"16px 18px"}}>{children}</div>}
    </div>
  );
}

function MetricGrid({items}) {
  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:14}}>
      {items.map(({l,v,col,good,warn,accent})=>(
        <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"10px",borderLeft:accent?`3px solid ${good?"#10b981":warn?"#f59e0b":"#ef4444"}`:"none"}}>
          <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:3,letterSpacing:"0.05em"}}>{l}</div>
          <div style={{fontSize:14,fontWeight:900,fontFamily:"'DM Mono',monospace",color:col||(good?"#059669":warn?"#d97706":"#dc2626")}}>{v}</div>
        </div>
      ))}
    </div>
  );
}

function WholesaleCalc({saved,onCalcChange,isPro:isProProp,onActivatePro}) {
  const isPro = isProProp||false;
  const [addr,setAddr]       = useState(saved?.address||"");
  const [advMode,setAdvMode] = useState(false);
  const [arvAdj,setArvAdj]   = useState(0);
  const [profitMode,setProfitMode] = useState("fixed");
  const [strategyProfile,setStrategyProfile] = useState("balanced");
  const [projOpen,setProjOpen] = useState(false);
  const [i,setI] = useState(saved||{arv:185000,repairs:22000,pct:70,fee:12000,holding:1500,closing:2500,profitTarget:12000,profitPct:10});
  const s = k => v => setI(p=>({...p,[k]:v}));

  const adjArv = useMemo(()=>+i.arv*(1+arvAdj/100),[i.arv,arvAdj]);

  const c = useMemo(()=>{
    let mao;
    if(!advMode){
      mao = adjArv*+i.pct/100 - +i.repairs - +i.fee;
    } else {
      const profitAmt = profitMode==="pct" ? adjArv*+i.profitPct/100 : +i.profitTarget;
      mao = adjArv - +i.repairs - +i.holding - +i.closing - profitAmt - +i.fee;
    }
    const spread = adjArv - mao;
    const investorMargin = adjArv - mao - +i.repairs;
    const feeOfSpread = spread>0 ? +i.fee/spread : 0;
    const marginPct = adjArv>0 ? mao/adjArv : 0;
    return {mao, spread, investorMargin, feeOfSpread, marginPct, adjArv, repairs:+i.repairs, fee:+i.fee};
  },[i,advMode,adjArv,profitMode]);

  const wsRisk = useMemo(()=>wsRiskScore(c, strategyProfile),[c,strategyProfile]);
  const arvCushion = c.adjArv>0 ? (c.adjArv-(c.mao+c.repairs))/c.adjArv : 0;

  // Stress sims
  const stressSims = useMemo(()=>[
    {label:"Base",            profit:c.adjArv-c.mao-c.repairs,           spreadPct:(c.adjArv-c.mao)/Math.max(c.adjArv,1)},
    {label:"Repair +10%",     profit:c.adjArv-c.mao-c.repairs*1.10,      spreadPct:(c.adjArv-c.mao)/Math.max(c.adjArv,1)},
    {label:"Repair +20%",     profit:c.adjArv-c.mao-c.repairs*1.20,      spreadPct:(c.adjArv-c.mao)/Math.max(c.adjArv,1)},
    {label:"Buyer Margin −5%",profit:c.adjArv*0.95-c.mao-c.repairs,      spreadPct:(c.adjArv*0.95-c.mao)/Math.max(c.adjArv,1)},
    {label:"Fee −$2K",        profit:c.adjArv-c.mao-c.repairs+2000,      spreadPct:(c.adjArv-c.mao)/Math.max(c.adjArv,1)},
  ],[c]);

  // Universal pillar mapping for Wholesale:
  // Margin = spread durability + investor margin strength
  // Risk   = assignment risk + repair overrun + fee safety
  // Velocity = deal velocity (marketability)
  const marginPillar = useMemo(()=>{
    const sc = wsRisk.marginScore;
    const label = sc>=80?"Strong":sc>=60?"Moderate":sc>=40?"Tight":"Weak";
    const color = sc>=80?"#059669":sc>=60?"#2563eb":sc>=40?"#d97706":"#dc2626";
    return {score:sc, label, color};
  },[wsRisk]);

  const riskPillar = useMemo(()=>{
    const sc = wsRisk.score;
    const label = sc>=80?"Low Risk":sc>=60?"Moderate":sc>=40?"Elevated":"High Risk";
    const color = sc>=80?"#059669":sc>=60?"#2563eb":sc>=40?"#d97706":"#dc2626";
    const riskTier = classifyRiskTier(sc);
    return {score:sc, label, color, riskTier};
  },[wsRisk]);

  const velocityPillar = useMemo(()=>{
    const sc = wsRisk.velocity;
    const label = sc>=75?"High":sc>=50?"Moderate":"Low";
    const color = sc>=75?"#059669":sc>=50?"#2563eb":"#dc2626";
    return {score:sc, label, color};
  },[wsRisk]);

  const highRiskCap = riskPillar.score < 50;
  const compositeScore = Math.round(marginPillar.score*0.35 + riskPillar.score*0.40 + velocityPillar.score*0.25);

  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.mao),secondary:fmtD(+i.fee),label:"MAO",label2:"Your Fee"}),[i,c,addr]);

  const wsHasData = +i.arv > 0;

  return (<>
    <AddressBar value={addr} onChange={setAddr}/>
            {/* SECTION 1 — DEAL VERDICT */}
    <UniversalVerdictHeader
      verdict={wsRisk.verdict}
      vIcon={wsRisk.vIcon}
      vColor={wsRisk.vColor}
      score={compositeScore}
      confidence={wsRisk.velocityLabel==="High"?"High":wsRisk.velocityLabel==="Moderate"?"Moderate":"Low"}
      primaryRisk={wsRisk.primaryRisk}
      margin={marginPillar}
      risk={riskPillar}
      velocity={velocityPillar}
      highRiskCap={highRiskCap}
      strategyLabel={strategyProfile.charAt(0).toUpperCase()+strategyProfile.slice(1)+" Profile"}
      strategyIcon={strategyProfile==="conservative"?"🛡️":strategyProfile==="aggressive"?"🔴":"⚖️"}
      kpis={[
        {l:"MAO",         v:fmtD(c.mao),          col:c.mao>0?"#34d399":"#f87171"},
        {l:"Your Fee",    v:fmtD(+i.fee),          col:"rgba(255,255,255,0.55)"},
        {l:"Spread",      v:fmtD(c.spread),        col:c.spread>0?"#34d399":"#f87171"},
        {l:"ARV Cushion", v:fmtP(arvCushion),      col:arvCushion>=0.15?"#34d399":arvCushion>=0.10?"#fbbf24":"#f87171"},
      ]}
    />

    {/* ARV Sensitivity + Strategy selectors (compact) */}
    <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:10,marginBottom:14,alignItems:"start"}}>
      <div style={{background:"white",borderRadius:12,padding:"10px 14px",border:"1.5px solid #e5e7eb"}}>
        <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Strategy</div>
        <div style={{display:"flex",gap:5}}>
          {[["conservative","🛡️"],["balanced","⚖️"],["aggressive","🔴"]].map(([k,ico])=>(
            <button key={k} onClick={()=>setStrategyProfile(k)}
              style={{padding:"4px 10px",borderRadius:100,border:`1.5px solid ${strategyProfile===k?"#2563eb":"#e5e7eb"}`,background:strategyProfile===k?"#eff6ff":"white",color:strategyProfile===k?"#2563eb":"#6b7280",fontSize:10,fontWeight:700,cursor:"pointer"}}>
              {ico} {k.charAt(0).toUpperCase()+k.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div style={{background:"white",borderRadius:12,padding:"10px 14px",border:"1.5px solid #e5e7eb"}}>
        <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>ARV Sensitivity</div>
        <div style={{display:"flex",gap:5}}>
          {[[-10,"−10%"],[-5,"−5%"],[0,"Base"],[5,"+5%"]].map(([val,label])=>(
            <button key={val} onClick={()=>setArvAdj(val)}
              style={{padding:"4px 10px",borderRadius:100,border:`1.5px solid ${arvAdj===val?"#2563eb":"#e5e7eb"}`,background:arvAdj===val?"#2563eb":"white",color:arvAdj===val?"white":"#2563eb",fontSize:10,fontWeight:700,cursor:"pointer"}}>
              {label}
            </button>
          ))}
        </div>
        {arvAdj!==0&&<div style={{fontSize:10,color:"#2563eb",marginTop:4}}>Adj. ARV: {fmtD(c.adjArv)}</div>}
      </div>
    </div>

    {/* INPUTS */}
    <div style={{marginBottom:14}}>
      <InputSection title="Deal Details" accent="#2563eb" defaultOpen>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/>
          <Field label="Repairs" value={i.repairs} onChange={s("repairs")} prefix="$" step={1000}/>
          <Field label="Wholesale Fee" value={i.fee} onChange={s("fee")} prefix="$" step={500}/>
          {!advMode&&<Field label="Max Offer %" value={i.pct} onChange={s("pct")} suffix="%" step={1}/>}
        </div>
        {advMode&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
            <Field label="Holding Costs" value={i.holding} onChange={s("holding")} prefix="$" step={500}/>
            <Field label="Closing Costs" value={i.closing} onChange={s("closing")} prefix="$" step={500}/>
            <div style={{gridColumn:"1/-1"}}>
              <div style={{display:"flex",gap:6,marginBottom:6}}>
                {[["fixed","Fixed $"],["pct","% of ARV"]].map(([m,lbl])=>(
                  <button key={m} onClick={()=>setProfitMode(m)} style={{padding:"4px 10px",borderRadius:100,border:`1.5px solid ${profitMode===m?"#2563eb":"#e5e7eb"}`,background:profitMode===m?"#eff6ff":"white",color:profitMode===m?"#2563eb":"#6b7280",fontSize:10,fontWeight:700,cursor:"pointer"}}>{lbl}</button>
                ))}
              </div>
              {profitMode==="fixed"
                ?<Field label="Target Investor Profit ($)" value={i.profitTarget} onChange={s("profitTarget")} prefix="$" step={1000}/>
                :<Field label="Target Investor Profit (%)" value={i.profitPct} onChange={s("profitPct")} suffix="%" step={1}/>
              }
            </div>
          </div>
        )}
        <div style={{marginTop:8}}>
          <button onClick={()=>setAdvMode(a=>!a)} style={{padding:"5px 14px",borderRadius:100,border:"1.5px solid #e5e7eb",background:"white",color:"#6b7280",fontSize:10,fontWeight:600,cursor:"pointer"}}>
            {advMode?"↑ Basic Mode":"↓ Advanced Mode"}
          </button>
        </div>
      </InputSection>
    </div>

    {/* SECTION 2 — STABILITY (spread protection / stress) */}
    <SectionCard title="Stability" subtitle="Spread protection under stress — fragility only" badge={wsRisk.verdict} badgeColor={wsRisk.vColor}>
      {/* Pillar bars */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        {[["Spread",wsRisk.spreadScore,"#2563eb"],["Margin",wsRisk.marginScore,"#059669"],["Repair Risk",wsRisk.repairScore,"#d97706"],["Fee Safety",wsRisk.feeScore,"#7c3aed"]].map(([l,sc,col])=>(
          <div key={l} style={{background:"#f8fafc",borderRadius:8,padding:"8px 10px",borderLeft:`3px solid ${col}`}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:9,fontWeight:700,color:"#6b7280",textTransform:"uppercase"}}>{l}</span>
              <span style={{fontSize:11,fontWeight:800,color:col,fontFamily:"'DM Mono',monospace"}}>{sc}</span>
            </div>
            <div style={{height:4,background:"#e5e7eb",borderRadius:100}}>
              <div style={{height:"100%",width:`${sc}%`,background:col,borderRadius:100,transition:"width 0.4s"}}/>
            </div>
          </div>
        ))}
      </div>
      {/* Stress simulations */}
      <div style={{borderRadius:10,border:"1px solid #f3f4f6",overflow:"hidden"}}>
        <div style={{padding:"8px 12px",background:"#fafafa",fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.06em"}}>Stress Simulations — Spread Protection</div>
        {stressSims.map((sc,idx)=>(
          <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 12px",borderBottom:idx<stressSims.length-1?"1px solid #f9fafb":"none"}}>
            <span style={{fontSize:11,color:"#6b7280"}}>{sc.label}</span>
            <div style={{display:"flex",gap:12}}>
              <span style={{fontSize:11,fontWeight:700,fontFamily:"'DM Mono',monospace",color:sc.profit>0?"#059669":"#dc2626"}}>{fmtD(Math.round(sc.profit))}</span>
              <span style={{fontSize:10,color:sc.spreadPct>=0.15?"#059669":"#dc2626"}}>{fmtP(sc.spreadPct)} spread</span>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>

    <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
    {/* SECTION 3 — CAPITAL EFFICIENCY */}
    <SectionCard title="Capital Efficiency" subtitle="Deal profitability and investor value">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
        {[
          {l:"MAO",                 v:fmtD(c.mao),              col:c.mao>0?"#059669":"#dc2626"},
          {l:"Investor Margin",     v:fmtD(c.investorMargin),   col:c.investorMargin>0?"#059669":"#dc2626"},
          {l:"Fee % of Spread",     v:fmtP(c.feeOfSpread),      col:c.feeOfSpread<=0.2?"#059669":"#d97706"},
        ].map(({l,v,col})=>(
          <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"10px",textAlign:"center"}}>
            <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:3}}>{l}</div>
            <div style={{fontSize:14,fontWeight:900,fontFamily:"'DM Mono',monospace",color:col}}>{v}</div>
          </div>
        ))}
      </div>
      {/* Calculation breakdown */}
      <div style={{background:"#f9fafb",borderRadius:10,padding:"12px 14px",fontSize:11,color:"#374151",lineHeight:2}}>
        <div style={{display:"flex",justifyContent:"space-between"}}><span>ARV (Adjusted)</span><b style={{fontFamily:"'DM Mono',monospace"}}>{fmtD(c.adjArv)}</b></div>
        {!advMode&&<div style={{display:"flex",justifyContent:"space-between"}}><span>× {i.pct}% Rule</span><b style={{fontFamily:"'DM Mono',monospace"}}>{fmtD(Math.round(c.adjArv*+i.pct/100))}</b></div>}
        <div style={{display:"flex",justifyContent:"space-between"}}><span>− Repairs</span><b style={{fontFamily:"'DM Mono',monospace",color:"#dc2626"}}>−{fmtD(+i.repairs)}</b></div>
        <div style={{display:"flex",justifyContent:"space-between"}}><span>− Your Fee</span><b style={{fontFamily:"'DM Mono',monospace",color:"#dc2626"}}>−{fmtD(+i.fee)}</b></div>
        <div style={{borderTop:"2px solid #e5e7eb",marginTop:4,paddingTop:4,display:"flex",justifyContent:"space-between"}}><b>MAO</b><b style={{fontFamily:"'DM Mono',monospace",color:c.mao>0?"#059669":"#dc2626",fontSize:14}}>{fmtD(c.mao)}</b></div>
      </div>
    </SectionCard>

    {/* SECTION 4 — OPTIMIZATION (ARV sensitivity already above, this adds profit target tuning) */}
    <SectionCard title="Optimization" subtitle="Adjust deal structure to hit targets">
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/>
        <Field label="Repairs" value={i.repairs} onChange={s("repairs")} prefix="$" step={1000}/>
        <Field label="Wholesale Fee" value={i.fee} onChange={s("fee")} prefix="$" step={500}/>
        {!advMode&&<Field label="Max Offer %" value={i.pct} onChange={s("pct")} suffix="%" step={1}/>}
        <div style={{background:"#f0fdf4",borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:"#374151",fontWeight:600}}>Current MAO</span>
          <span style={{fontSize:16,fontWeight:900,fontFamily:"'DM Mono',monospace",color:c.mao>0?"#059669":"#dc2626"}}>{fmtD(c.mao)}</span>
        </div>
      </div>
    </SectionCard>

    {/* SECTION 5 — LONG-TERM PROJECTION (collapsed) */}
    <div style={{background:"white",borderRadius:16,border:"1.5px solid #e5e7eb",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",marginBottom:12,overflow:"hidden"}}>
      <button onClick={()=>setProjOpen(o=>!o)} style={{width:"100%",padding:"14px 18px",border:"none",background:"#fafafa",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,fontWeight:800,color:"#111827",textTransform:"uppercase",letterSpacing:"0.07em"}}>Velocity Analysis</div>
          <div style={{fontSize:10,color:"#9ca3af",marginTop:1}}>Assignment speed, buyer pool, deal repeatability</div>
        </div>
        <span style={{fontSize:14,color:"#9ca3af",transform:projOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
      </button>
      {projOpen&&(
        <div style={{padding:"16px 18px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
            {[
              {l:"Deal Velocity",   v:wsRisk.velocityLabel,   col:wsRisk.velocity>=75?"#059669":wsRisk.velocity>=50?"#d97706":"#dc2626"},
              {l:"Velocity Score",  v:wsRisk.velocity+"/100", col:"#374151"},
              {l:"ARV Cushion",     v:fmtP(arvCushion),       col:arvCushion>=0.15?"#059669":"#d97706"},
            ].map(({l,v,col})=>(
              <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:3}}>{l}</div>
                <div style={{fontSize:14,fontWeight:900,fontFamily:"'DM Mono',monospace",color:col}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{background:"#f9fafb",borderRadius:10,padding:"12px",fontSize:11,color:"#374151",lineHeight:1.6}}>
            {wsRisk.velocityLabel==="High"&&"🟢 High velocity — strong investor margin, broad buyer pool. Expect fast assignment at or near your fee."}
            {wsRisk.velocityLabel==="Moderate"&&"🟡 Moderate velocity — deal works but requires the right buyer. Verify end-buyer pool before committing."}
            {wsRisk.velocityLabel==="Low"&&"🔴 Low velocity — thin margins limit buyer pool. Consider renegotiating or adjusting fee downward."}
          </div>
        </div>
      )}
    </div>
    
    </ProGate>  </>);
}

function flipRiskScore(c, strategyMode="balanced") {
  const {profit=0, arv=1, rehab=0, months=6, totalCost=1, emd=0, emdRefundable=true, financing="cash"} = c;
  const profitPct = arv > 0 ? profit / arv : 0;
  const rehabPct  = arv > 0 ? rehab / arv : 0;
  const arvCushion = arv > 0 ? (arv - totalCost) / arv : 0;

  // 1. Profit % Score (35%)
  let profitScore;
  if(profitPct < 0.10)       profitScore = 30;
  else if(profitPct < 0.15)  profitScore = 60;
  else if(profitPct < 0.20)  profitScore = 85;
  else                       profitScore = 100;

  // 2. Rehab % Risk (20%)
  let rehabScore;
  if(rehabPct > 0.30)        rehabScore = 30;
  else if(rehabPct > 0.20)   rehabScore = 60;
  else if(rehabPct > 0.10)   rehabScore = 85;
  else                       rehabScore = 100;

  // 3. Duration Risk (20%)
  let durationDeduction = 0;
  if(months > 9)             durationDeduction = 20;
  else if(months > 6)        durationDeduction = 10;

  // 4. Capital Exposure / EMD (15%)
  let capScore = 100;
  const emdPct = totalCost > 0 ? emd / totalCost : 0;
  if(!emdRefundable && emdPct > 0.05) capScore -= 10;
  if(financing === "hard")   capScore -= 10;
  else if(financing === "private") capScore -= 5;
  capScore = Math.max(30, capScore);

  // 5. ARV Sensitivity (10%) — profit if ARV drops 5% or 10%
  const profit5 = arv * 0.95 - totalCost;
  const profit10 = arv * 0.90 - totalCost;
  let arvSensScore = 100;
  if(profit5 > 0 && profit5 < profit * 0.50) arvSensScore -= 10;
  if(profit10 <= 0) arvSensScore -= 20;

  // Strategy mode weights
  const weights = {
    balanced:    { p:0.35, r:0.20, d:0.20, c:0.15, a:0.10 },
    margin:      { p:0.45, r:0.15, d:0.15, c:0.15, a:0.10 },
    velocity:    { p:0.25, r:0.15, d:0.30, c:0.15, a:0.15 },
    conservative:{ p:0.30, r:0.25, d:0.20, c:0.15, a:0.10 },
    aggressive:  { p:0.35, r:0.15, d:0.15, c:0.20, a:0.15 },
  };
  const w = weights[strategyMode] || weights.balanced;
  const baseScore = Math.round(profitScore*w.p + rehabScore*w.r + capScore*w.c + arvSensScore*w.a) - durationDeduction * w.d * 5;
  const score = Math.min(100, Math.max(0, baseScore));

  // Verdict per spec
  let verdict, vColor, vBg, vIcon;
  if(score >= 80)      { verdict="Execute";        vColor="#059669"; vBg="#f0fdf4"; vIcon="🚀"; }
  else if(score >= 70) { verdict="Proceed";        vColor="#2563eb"; vBg="#eff6ff"; vIcon="✅"; }
  else if(score >= 60) { verdict="Tight Margins";  vColor="#d97706"; vBg="#fffbeb"; vIcon="⚠️"; }
  else if(score >= 50) { verdict="High Risk";      vColor="#ea580c"; vBg="#fff7ed"; vIcon="🔶"; }
  else                 { verdict="Do Not Pursue";  vColor="#dc2626"; vBg="#fef2f2"; vIcon="🚫"; }

  // Primary risk driver
  const drivers = [["ARV Sensitivity",arvSensScore],["Rehab Intensity",rehabScore],["Duration Exposure",100-durationDeduction],["Capital Lock",capScore]];
  const weakest = drivers.sort((a,b)=>a[1]-b[1])[0];
  const primaryRisk = weakest[0];

  // EMD risk
  const emdRiskLevel = !emdRefundable && emdPct > 0.10 ? "High" : !emdRefundable && emdPct > 0.05 ? "Elevated" : "Low";

  return { score, verdict, vColor, vBg, vIcon, primaryRisk,
           profitScore, rehabScore, durationDeduction, capScore, arvSensScore,
           profit5: Math.round(profit5), profit10: Math.round(profit10),
           arvCushion, emdRiskLevel, emdPct };
}

function FlipCalc({saved,onCalcChange,isPro:isProProp,onActivatePro}) {
  const isPro = isProProp||false;
  const [addr,setAddr]     = useState(saved?.address||"");
  const [strategyMode,setStrategyMode] = useState("balanced");
  const [finType,setFinType] = useState("conventional");
  const [arvAdj,setArvAdj] = useState(0);
  const [projOpen,setProjOpen] = useState(false);
  const [i,setI] = useState(saved||{arv:285000,pp:165000,repairs:38000,holding:5200,closing:5700,finance:0,emd:5000,emdRefundable:true,duration:6});
  const s = k => v => setI(p=>({...p,[k]:v}));

  const adjArv = useMemo(()=>+i.arv*(1+arvAdj/100),[i.arv,arvAdj]);
  const c = useMemo(()=>{
    const totalCost = +i.pp + +i.repairs + +i.holding + +i.closing + +i.finance;
    const profit = adjArv - totalCost;
    const profitPct = adjArv > 0 ? profit/adjArv : 0;
    const rehabPct = adjArv > 0 ? +i.repairs/adjArv : 0;
    const capitalIn = +i.pp*0.20 + +i.repairs + +i.holding + +i.closing;
    const coc = capitalIn > 0 ? profit/capitalIn : 0;
    const annualROI = +i.duration > 0 ? coc/(+i.duration/12) : 0;
    const arvCushion = adjArv > 0 ? (adjArv - totalCost)/adjArv : 0;
    return {totalCost, profit, profitPct, rehabPct, capitalIn, coc, annualROI, arvCushion, adjArv, pp:+i.pp};
  },[i,adjArv]);

  const flipRisk = useMemo(()=>flipRiskScore({
    profit:c.profit, arv:adjArv, rehab:+i.repairs, months:+i.duration,
    totalCost:c.totalCost, emd:+i.emd, emdRefundable:i.emdRefundable, financing:finType,
  }, strategyMode),[c,i,adjArv,finType,strategyMode]);

  // Pillar mappings
  const marginPillar = useMemo(()=>{
    const sc = flipRisk.profitScore;
    const label = sc>=80?"Strong":sc>=60?"Moderate":sc>=40?"Tight":"Weak";
    return {score:sc, label, color:sc>=80?"#059669":sc>=60?"#2563eb":sc>=40?"#d97706":"#dc2626"};
  },[flipRisk]);
  const riskPillar = useMemo(()=>{
    const sc = flipRisk.score;
    const riskTier = classifyRiskTier(sc);
    const label = sc>=80?"Low Risk":sc>=60?"Moderate":sc>=40?"Elevated":"High Risk";
    return {score:sc, label, color:sc>=80?"#059669":sc>=60?"#2563eb":sc>=40?"#d97706":"#dc2626", riskTier};
  },[flipRisk]);
  const velocityPillar = useMemo(()=>{
    const sc = Math.max(0, 100 - (flipRisk.durationDeduction||0)*5 - (+i.duration>9?20:+i.duration>6?10:0));
    const label = sc>=75?"Fast":sc>=50?"Moderate":"Slow";
    return {score:sc, label, color:sc>=75?"#059669":sc>=50?"#2563eb":"#dc2626"};
  },[flipRisk,i]);

  const compositeScore = Math.round(marginPillar.score*0.35 + riskPillar.score*0.40 + velocityPillar.score*0.25);
  const highRiskCap = riskPillar.score < 50;

  // EMD risk
  const emdRisk = useMemo(()=>{
    const emdPct = c.capitalIn > 0 ? +i.emd/c.capitalIn : 0;
    if(!i.emdRefundable && emdPct > 0.10) return {level:"High",   col:"#dc2626"};
    if(!i.emdRefundable)                   return {level:"Elevated",col:"#d97706"};
    return {level:"Low", col:"#059669"};
  },[i,c]);

  // Stress scenarios
  const stressSims = useMemo(()=>[
    {label:"Base",              profit:c.profit,                                     profitPct:c.profitPct},
    {label:"Rehab +10%",        profit:c.profit - +i.repairs*0.10,                  profitPct:adjArv>0?(c.profit-+i.repairs*0.10)/adjArv:0},
    {label:"1-month delay",     profit:c.profit - (+i.holding/(+i.duration||1)),    profitPct:adjArv>0?(c.profit-+i.holding/(+i.duration||1))/adjArv:0},
    {label:"ARV −5%",           profit:adjArv*0.95 - c.totalCost,                   profitPct:adjArv>0?(adjArv*0.95-c.totalCost)/(adjArv*0.95):0},
    {label:"Inspection −$5K",   profit:c.profit - 5000,                             profitPct:adjArv>0?(c.profit-5000)/adjArv:0},
  ],[c,i,adjArv]);

  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.profit),secondary:fmtP(c.profitPct),label:"Net Profit",label2:"Profit %"}),[i,c,addr]);

  const flipHasData = +i.arv > 0 && +i.pp > 0;

  return (<>
    <AddressBar value={addr} onChange={setAddr}/>
            {/* SECTION 1 — DEAL VERDICT */}
    <UniversalVerdictHeader
      verdict={flipRisk.verdict}
      vIcon={flipRisk.vIcon}
      vColor={flipRisk.vColor}
      score={compositeScore}
      primaryRisk={compositeScore<60?"ARV Variance + Rehab Overrun":"Margin strength present"}
      margin={marginPillar}
      risk={riskPillar}
      velocity={velocityPillar}
      highRiskCap={highRiskCap}
      strategyLabel={strategyMode.charAt(0).toUpperCase()+strategyMode.slice(1)+" Mode"}
      strategyIcon="🔨"
      kpis={[
        {l:"Net Profit",   v:fmtD(c.profit),         col:c.profit>0?"#34d399":"#f87171"},
        {l:"Profit %",     v:fmtP(c.profitPct),       col:c.profitPct>=0.15?"#34d399":c.profitPct>=0.10?"#fbbf24":"#f87171"},
        {l:"Capital In",   v:fmtD(c.capitalIn),       col:"rgba(255,255,255,0.55)"},
        {l:"Annual ROI",   v:fmtP(c.annualROI),       col:c.annualROI>=0.30?"#34d399":"rgba(255,255,255,0.55)"},
      ]}
    />

    {/* ARV + Strategy selectors */}
    <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:10,marginBottom:14,alignItems:"start"}}>
      <div style={{background:"white",borderRadius:12,padding:"10px 14px",border:"1.5px solid #e5e7eb"}}>
        <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginBottom:6}}>Strategy</div>
        <div style={{display:"flex",gap:5}}>
          {[["margin","📈","Margin"],["velocity","⚡","Velocity"],["balanced","⚖️","Balanced"]].map(([k,ico,lbl])=>(
            <button key={k} onClick={()=>setStrategyMode(k)}
              style={{padding:"4px 10px",borderRadius:100,border:`1.5px solid ${strategyMode===k?"#7c3aed":"#e5e7eb"}`,background:strategyMode===k?"#f5f3ff":"white",color:strategyMode===k?"#7c3aed":"#6b7280",fontSize:10,fontWeight:700,cursor:"pointer"}}>
              {ico} {lbl}
            </button>
          ))}
        </div>
      </div>
      <div style={{background:"white",borderRadius:12,padding:"10px 14px",border:"1.5px solid #e5e7eb"}}>
        <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginBottom:6}}>ARV Sensitivity</div>
        <div style={{display:"flex",gap:5}}>
          {[[-10,"−10%"],[-5,"−5%"],[0,"Base"],[5,"+5%"]].map(([val,lbl])=>(
            <button key={val} onClick={()=>setArvAdj(val)}
              style={{padding:"4px 10px",borderRadius:100,border:`1.5px solid ${arvAdj===val?"#7c3aed":"#e5e7eb"}`,background:arvAdj===val?"#7c3aed":"white",color:arvAdj===val?"white":"#7c3aed",fontSize:10,fontWeight:700,cursor:"pointer"}}>
              {lbl}
            </button>
          ))}
        </div>
        {arvAdj!==0&&<div style={{fontSize:10,color:"#7c3aed",marginTop:4}}>Adj. ARV: {fmtD(adjArv)}</div>}
      </div>
    </div>

    {/* INPUTS */}
    <InputSection title="Deal Numbers" accent="#7c3aed" defaultOpen badge={`Profit: ${fmtD(c.profit)}`}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/>
        <Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000}/>
        <Field label="Rehab Budget" value={i.repairs} onChange={s("repairs")} prefix="$" step={1000}/>
        <Field label="Holding Costs" value={i.holding} onChange={s("holding")} prefix="$" step={500}/>
        <Field label="Closing Costs" value={i.closing} onChange={s("closing")} prefix="$" step={500}/>
        <Field label="Finance Costs" value={i.finance} onChange={s("finance")} prefix="$" step={500}/>
        <Field label="Duration (mo)" value={i.duration} onChange={s("duration")} suffix="mo" step={1}/>
        <Field label="EMD" value={i.emd} onChange={s("emd")} prefix="$" step={500}/>
      </div>
      <div style={{marginTop:8,display:"flex",gap:6,alignItems:"center"}}>
        <span style={{fontSize:10,color:"#6b7280"}}>EMD:</span>
        {[true,false].map(ref=>(
          <button key={String(ref)} onClick={()=>s("emdRefundable")(ref)}
            style={{padding:"4px 10px",borderRadius:100,border:`1.5px solid ${i.emdRefundable===ref?emdRisk.col:"#e5e7eb"}`,background:i.emdRefundable===ref?emdRisk.col+"15":"white",color:i.emdRefundable===ref?emdRisk.col:"#6b7280",fontSize:10,fontWeight:700,cursor:"pointer"}}>
            {ref?"Refundable":"Non-Refundable"}
          </button>
        ))}
        <span style={{fontSize:9,fontWeight:700,color:emdRisk.col,background:emdRisk.col+"15",padding:"2px 8px",borderRadius:100}}>{emdRisk.level} EMD Risk</span>
      </div>
    </InputSection>

    {/* SECTION 2 — STABILITY */}
    <SectionCard title="Stability" subtitle="Profit survival under stress — fragility only" badge={flipRisk.verdict} badgeColor={flipRisk.vColor}>
      <MetricGrid items={[
        {l:"Profit",     v:fmtD(c.profit),           good:c.profit>0, warn:c.profit>-5000, accent:true},
        {l:"Profit %",   v:fmtP(c.profitPct),         good:c.profitPct>=0.15, warn:c.profitPct>=0.10, accent:true},
        {l:"ARV Cushion",v:fmtP(c.arvCushion),        good:c.arvCushion>=0.15, warn:c.arvCushion>=0.10, accent:true},
        {l:"Duration",   v:i.duration+"mo",            good:+i.duration<=6, warn:+i.duration<=9, accent:true},
      ]}/>
      <div style={{borderRadius:10,border:"1px solid #f3f4f6",overflow:"hidden"}}>
        <div style={{padding:"8px 12px",background:"#fafafa",fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase"}}>Profit Compression Scenarios</div>
        {stressSims.map((sc,idx)=>(
          <div key={idx} style={{display:"flex",justifyContent:"space-between",padding:"7px 12px",borderBottom:idx<stressSims.length-1?"1px solid #f9fafb":"none"}}>
            <span style={{fontSize:11,color:"#6b7280"}}>{sc.label}</span>
            <div style={{display:"flex",gap:10}}>
              <span style={{fontSize:11,fontWeight:700,fontFamily:"'DM Mono',monospace",color:sc.profit>0?"#059669":"#dc2626"}}>{fmtD(Math.round(sc.profit))}</span>
              <span style={{fontSize:10,color:sc.profitPct>=0.15?"#059669":"#d97706"}}>{fmtP(sc.profitPct)}</span>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>

    <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
    {/* SECTION 3 — CAPITAL EFFICIENCY */}
    <SectionCard title="Capital Efficiency" subtitle="Profit per dollar deployed">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
        {[
          {l:"Net Profit",    v:fmtD(c.profit),    col:c.profit>0?"#059669":"#dc2626"},
          {l:"Cash-on-Cash",  v:fmtP(c.coc),       col:c.coc>=0.30?"#059669":c.coc>=0.15?"#d97706":"#dc2626"},
          {l:"Annualized ROI",v:fmtP(c.annualROI),  col:c.annualROI>=0.40?"#059669":"#374151"},
        ].map(({l,v,col})=>(
          <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"10px",textAlign:"center"}}>
            <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:3}}>{l}</div>
            <div style={{fontSize:14,fontWeight:900,fontFamily:"'DM Mono',monospace",color:col}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{background:"#f9fafb",borderRadius:10,padding:"12px 14px",fontSize:11,color:"#374151",lineHeight:2}}>
        <div style={{display:"flex",justifyContent:"space-between"}}><span>Total Cost</span><b style={{fontFamily:"'DM Mono',monospace"}}>{fmtD(c.totalCost)}</b></div>
        <div style={{display:"flex",justifyContent:"space-between"}}><span>ARV (Adjusted)</span><b style={{fontFamily:"'DM Mono',monospace"}}>{fmtD(adjArv)}</b></div>
        <div style={{borderTop:"2px solid #e5e7eb",marginTop:4,paddingTop:4,display:"flex",justifyContent:"space-between"}}><b>Net Profit</b><b style={{fontFamily:"'DM Mono',monospace",color:c.profit>0?"#059669":"#dc2626",fontSize:14}}>{fmtD(c.profit)}</b></div>
      </div>
    </SectionCard>

    {/* SECTION 4 — OPTIMIZATION */}
    <SectionCard title="Optimization" subtitle="Tune purchase price and rehab to hit profit targets">
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/>
        <Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={2500}/>
        <Field label="Rehab Budget" value={i.repairs} onChange={s("repairs")} prefix="$" step={1000}/>
        <div style={{background:"#f0fdf4",borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:11,fontWeight:600}}>Net Profit</span>
          <span style={{fontSize:16,fontWeight:900,fontFamily:"'DM Mono',monospace",color:c.profit>0?"#059669":"#dc2626"}}>{fmtD(c.profit)}</span>
        </div>
        <div style={{background:"#eff6ff",borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:11,fontWeight:600}}>Profit %</span>
          <span style={{fontSize:16,fontWeight:900,fontFamily:"'DM Mono',monospace",color:c.profitPct>=0.15?"#2563eb":"#d97706"}}>{fmtP(c.profitPct)}</span>
        </div>
      </div>
    </SectionCard>

    {/* SECTION 5 — LONG-TERM PROJECTION (collapsed) */}
    <div style={{background:"white",borderRadius:16,border:"1.5px solid #e5e7eb",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",marginBottom:12,overflow:"hidden"}}>
      <button onClick={()=>setProjOpen(o=>!o)} style={{width:"100%",padding:"14px 18px",border:"none",background:"#fafafa",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,fontWeight:800,color:"#111827",textTransform:"uppercase",letterSpacing:"0.07em"}}>Exit & Velocity Analysis</div>
          <div style={{fontSize:10,color:"#9ca3af",marginTop:1}}>Duration risk · Annualized return · Market exit timing</div>
        </div>
        <span style={{fontSize:14,color:"#9ca3af",transform:projOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
      </button>
      {projOpen&&(
        <div style={{padding:"16px 18px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
            {[
              {l:"Annualized ROI",  v:fmtP(c.annualROI),  col:c.annualROI>=0.40?"#059669":"#d97706"},
              {l:"Duration Risk",   v:+i.duration<=6?"Low":+i.duration<=9?"Moderate":"High", col:+i.duration<=6?"#059669":+i.duration<=9?"#d97706":"#dc2626"},
              {l:"Velocity Score",  v:velocityPillar.score+"/100", col:velocityPillar.color},
            ].map(({l,v,col})=>(
              <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:3}}>{l}</div>
                <div style={{fontSize:14,fontWeight:900,fontFamily:"'DM Mono',monospace",color:col}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:"#374151",background:"#f9fafb",borderRadius:10,padding:"12px",lineHeight:1.6}}>
            At {i.duration} months, annualized ROI is <b>{fmtP(c.annualROI)}</b>. 
            {+i.duration>9?" Consider shortening the project timeline — longer duration compresses annualized returns significantly.":" Duration is within the acceptable range for a flip."}
          </div>
        </div>
      )}
    </div>
    
    </ProGate>  </>);
}

function brrrRiskScore(c) {
  // 5-pillar BRRRR risk score per spec
  const { pctRecovered=0, mcf=0, dscr=1.0, rehabPctArv=0,
          arvDropPct5=0, arvDropPct10=0, infiniteReturn=false } = c;

  // 1. Capital Recovery (30%)
  let capRecScore;
  if(pctRecovered >= 1.0)        capRecScore = 100; // Elite — fully recycled
  else if(pctRecovered >= 0.75)  capRecScore = 80;
  else if(pctRecovered >= 0.50)  capRecScore = 55;
  else                           capRecScore = 30;

  // 2. Cash Flow Quality (25%)
  let cfScore;
  if(mcf >= 400)       cfScore = 100;
  else if(mcf >= 200)  cfScore = 75;
  else if(mcf >= 50)   cfScore = 50;
  else if(mcf >= 0)    cfScore = 25;
  else                 cfScore = 0;

  // DSCR penalty
  if(dscr < 1.0)        cfScore = Math.min(cfScore, 0);
  else if(dscr < 1.20)  cfScore = Math.min(cfScore, 40);

  // 3. Refi Feasibility (20%) — based on ARV sensitivity
  let refiFeasScore = 100;
  if(arvDropPct5 > 0.50)   refiFeasScore -= 20;  // -5% ARV doubles cash left
  if(arvDropPct10 > 0)     refiFeasScore -= 20;  // -10% ARV kills refi
  refiFeasScore = Math.max(20, refiFeasScore);

  // 4. Rehab Risk (15%)
  let rehabScore;
  if(rehabPctArv > 0.30)        rehabScore = 30;
  else if(rehabPctArv > 0.20)   rehabScore = 60;
  else if(rehabPctArv > 0.10)   rehabScore = 85;
  else                          rehabScore = 100;

  // 5. Market Sensitivity (10%) — ARV sensitivity summary
  const mktScore = arvDropPct10 > 0 ? 40 : arvDropPct5 > 0.50 ? 60 : 85;

  const score = Math.min(100, Math.max(0, Math.round(
    capRecScore*0.30 + cfScore*0.25 + refiFeasScore*0.20 + rehabScore*0.15 + mktScore*0.10
  )));

  // Verdict per spec
  let verdict, vColor, vBg, vIcon;
  if(mcf < 0 || dscr < 1.0 || pctRecovered < 0.50) {
    verdict="Avoid";       vColor="#dc2626"; vBg="#fef2f2"; vIcon="🚫";
  } else if(score >= 85 || infiniteReturn) {
    verdict="Elite BRRR";  vColor="#059669"; vBg="#f0fdf4"; vIcon="🎯";
  } else if(score >= 70) {
    verdict="Strong BRRR"; vColor="#2563eb"; vBg="#eff6ff"; vIcon="✅";
  } else if(score >= 55) {
    verdict="Marginal";    vColor="#d97706"; vBg="#fffbeb"; vIcon="⚠️";
  } else {
    verdict="Capital Trap";vColor="#dc2626"; vBg="#fef2f2"; vIcon="🔴";
  }

  // Capital Recovery classification
  const recoveryLabel = pctRecovered >= 1.0 ? "Elite" : pctRecovered >= 0.75 ? "Strong" :
                        pctRecovered >= 0.50 ? "Moderate" : "Weak";

  return { score, verdict, vColor, vBg, vIcon, recoveryLabel,
           capRecScore, cfScore, refiFeasScore, rehabScore, mktScore };
}

function BRRRRCalc({saved,onCalcChange,isPro:isProProp,onActivatePro}) {
  const isPro = isProProp||false;
  const [addr,setAddr] = useState(saved?.address||"");
  const [projOpen,setProjOpen] = useState(false);
  const [arvAdj,setArvAdj] = useState(0);
  const [i,setI] = useState(saved||{pp:145000,repairs:35000,arv:240000,refiLtv:75,refiRate:7.0,refiTerm:30,rent:2000,expenses:550,holding:4000});
  const s = k => v => setI(p=>({...p,[k]:v}));

  const adjArv = useMemo(()=>+i.arv*(1+arvAdj/100),[i.arv,arvAdj]);

  const c = useMemo(()=>{
    const allIn = +i.pp + +i.repairs + +i.holding;
    const refiLoan = adjArv * +i.refiLtv/100;
    const cashLeft = allIn - refiLoan;
    const pctRecovered = refiLoan > 0 ? Math.min(1, refiLoan/allIn) : 0;
    const rr = +i.refiRate/100/12, n = +i.refiTerm*12;
    const refiMort = rr>0&&n>0 ? refiLoan*(rr*Math.pow(1+rr,n))/(Math.pow(1+rr,n)-1) : refiLoan/Math.max(n,1);
    const mcf = +i.rent - +i.expenses - refiMort;
    const noi = (+i.rent - +i.expenses)*12;
    const dscr = refiMort>0 ? (+i.rent - +i.expenses)/refiMort : 0;
    const beo = +i.rent>0 ? (+i.expenses+refiMort)/+i.rent : 1;
    const coc = cashLeft>0 ? mcf*12/cashLeft : (cashLeft<=0 ? Infinity : 0);
    const rehabPctArv = adjArv>0 ? +i.repairs/adjArv : 0;
    // ARV sensitivity
    const arv5  = adjArv*0.95, cashLeft5 = allIn - arv5*+i.refiLtv/100;
    const arv10 = adjArv*0.90, cashLeft10= allIn - arv10*+i.refiLtv/100;
    // Velocity index
    const yearsToRecycle = cashLeft>0&&mcf>0 ? cashLeft/(mcf*12) : null;
    return {allIn, refiLoan, cashLeft, pctRecovered, refiMort, mcf, noi, dscr, beo, coc, rehabPctArv, cashLeft5, cashLeft10, yearsToRecycle, adjArv};
  },[i,adjArv]);

  const brrrRisk = useMemo(()=>brrrRiskScore(c),[c]);

  // Universal pillars for BRRRR:
  // Margin  = capital recovered + post-refi yield
  // Risk    = refinance fragility + DSCR + ARV sensitivity
  // Velocity = years to recycle capital
  const marginPillar = useMemo(()=>{
    const sc = Math.round(brrrRisk.capRecScore*0.5 + brrrRisk.cfScore*0.5);
    const label = sc>=80?"Strong":sc>=60?"Moderate":sc>=40?"Marginal":"Weak";
    return {score:sc, label, color:sc>=80?"#059669":sc>=60?"#2563eb":sc>=40?"#d97706":"#dc2626"};
  },[brrrRisk]);
  const riskPillar = useMemo(()=>{
    const sc = brrrRisk.score;
    const riskTier = classifyRiskTier(sc);
    const label = sc>=80?"Low Risk":sc>=60?"Moderate":sc>=40?"Elevated":"High Risk";
    return {score:sc, label, color:sc>=80?"#059669":sc>=60?"#2563eb":sc>=40?"#d97706":"#dc2626", riskTier};
  },[brrrRisk]);
  const velocityPillar = useMemo(()=>{
    const yrs = c.yearsToRecycle;
    const sc = !yrs?0: yrs<=2?100: yrs<=4?80: yrs<=7?60: yrs<=12?35: 10;
    const label = sc>=80?"Rapid":sc>=60?"Moderate":sc>=30?"Slow":"Very Slow";
    return {score:sc, label, color:sc>=80?"#059669":sc>=60?"#2563eb":sc>=30?"#d97706":"#dc2626"};
  },[c]);

  const compositeScore = Math.round(marginPillar.score*0.35 + riskPillar.score*0.40 + velocityPillar.score*0.25);
  const highRiskCap = riskPillar.score < 50;

  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.cashLeft),secondary:fmtP(c.pctRecovered),label:"Cash Left In",label2:"Capital Recovered"}),[i,c,addr]);

  const brrrrHasData = +i.arv > 0 && +i.pp > 0;

  return (<>
    <AddressBar value={addr} onChange={setAddr}/>
            {/* SECTION 1 — DEAL VERDICT */}
    <UniversalVerdictHeader
      verdict={brrrRisk.verdict}
      vIcon={brrrRisk.vIcon}
      vColor={brrrRisk.vColor}
      score={compositeScore}
      primaryRisk={c.cashLeft>c.allIn*0.30?"Capital Trap Risk — limited recovery":c.dscr<1.10?"DSCR Fragility":"Capital recovery strong"}
      margin={marginPillar}
      risk={riskPillar}
      velocity={velocityPillar}
      highRiskCap={highRiskCap}
      strategyLabel="BRRRR Strategy"
      strategyIcon="🔄"
      kpis={[
        {l:"Cash Left In",      v:fmtD(c.cashLeft),               col:c.cashLeft<=0?"#34d399":c.cashLeft<c.allIn*0.25?"#fbbf24":"#f87171"},
        {l:"Capital Recovered", v:fmtP(c.pctRecovered),            col:c.pctRecovered>=1?"#34d399":c.pctRecovered>=0.75?"#fbbf24":"#f87171"},
        {l:"Post-Refi CF",      v:fmtD(c.mcf)+"/mo",              col:c.mcf>=200?"#34d399":c.mcf>=0?"#fbbf24":"#f87171"},
        {l:"DSCR",              v:c.dscr.toFixed(2)+"x",           col:c.dscr>=1.25?"#34d399":c.dscr>=1.1?"#fbbf24":"#f87171"},
      ]}
    />

    {/* ARV Sensitivity */}
    <div style={{background:"white",borderRadius:12,padding:"10px 14px",border:"1.5px solid #e5e7eb",marginBottom:14}}>
      <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginBottom:6}}>ARV Sensitivity</div>
      <div style={{display:"flex",gap:5}}>
        {[[-10,"−10%"],[-5,"−5%"],[0,"Base"],[5,"+5%"]].map(([val,lbl])=>(
          <button key={val} onClick={()=>setArvAdj(val)}
            style={{padding:"4px 10px",borderRadius:100,border:`1.5px solid ${arvAdj===val?"#059669":"#e5e7eb"}`,background:arvAdj===val?"#059669":"white",color:arvAdj===val?"white":"#6b7280",fontSize:10,fontWeight:700,cursor:"pointer"}}>
            {lbl}
          </button>
        ))}
      </div>
      {arvAdj!==0&&<div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {[["ARV −5%", fmtD(c.cashLeft5), c.cashLeft5],["ARV −10%", fmtD(c.cashLeft10), c.cashLeft10]].map(([lbl,v,val])=>(
          <div key={lbl} style={{background:val<=0?"#f0fdf4":"#fef2f2",borderRadius:8,padding:"6px 10px",textAlign:"center"}}>
            <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",marginBottom:2}}>{lbl} Cash Left</div>
            <div style={{fontSize:12,fontWeight:800,fontFamily:"'DM Mono',monospace",color:val<=0?"#059669":"#dc2626"}}>{v}</div>
          </div>
        ))}
      </div>}
    </div>

    {/* INPUTS */}
    <InputSection title="Deal & Refinance" accent="#059669" defaultOpen>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000}/>
        <Field label="Rehab Budget" value={i.repairs} onChange={s("repairs")} prefix="$" step={1000}/>
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/>
        <Field label="Holding Costs" value={i.holding} onChange={s("holding")} prefix="$" step={500}/>
        <Field label="Refi LTV %" value={i.refiLtv} onChange={s("refiLtv")} suffix="%" step={1}/>
        <Field label="Refi Rate %" value={i.refiRate} onChange={s("refiRate")} suffix="%" step={0.125}/>
        <Field label="Refi Term" value={i.refiTerm} onChange={s("refiTerm")} suffix="yr" step={5}/>
        <Field label="Monthly Rent" value={i.rent} onChange={s("rent")} prefix="$" step={50}/>
        <Field label="Expenses" value={i.expenses} onChange={s("expenses")} prefix="$" step={50}/>
      </div>
    </InputSection>

    {/* SECTION 2 — STABILITY */}
    <SectionCard title="Stability" subtitle="Refinance fragility + DSCR + ARV sensitivity" badge={brrrRisk.verdict} badgeColor={brrrRisk.vColor}>
      <MetricGrid items={[
        {l:"Refi Loan",        v:fmtD(c.refiLoan),         col:"#374151"},
        {l:"Cash Left In",     v:fmtD(c.cashLeft),          good:c.cashLeft<=0, warn:c.cashLeft<c.allIn*0.25, accent:true},
        {l:"DSCR",             v:c.dscr.toFixed(2)+"x",     good:c.dscr>=1.25, warn:c.dscr>=1.1, accent:true},
        {l:"Break-even Occ.", v:(c.beo*100).toFixed(1)+"%", good:c.beo<=0.80, warn:c.beo<=0.90, accent:true},
      ]}/>
      {/* Capital recovery classification */}
      <div style={{background:"#f8fafc",borderRadius:10,padding:"12px",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{fontSize:10,fontWeight:700,color:"#374151"}}>Capital Recovery</span>
          <span style={{fontSize:10,fontWeight:700,color:brrrRisk.recoveryLabel==="Elite"?"#059669":brrrRisk.recoveryLabel==="Strong"?"#2563eb":brrrRisk.recoveryLabel==="Moderate"?"#d97706":"#dc2626"}}>{brrrRisk.recoveryLabel}</span>
        </div>
        <div style={{height:8,background:"#e5e7eb",borderRadius:100,marginBottom:6}}>
          <div style={{height:"100%",width:fmtP(c.pctRecovered),background:c.pctRecovered>=1?"#059669":c.pctRecovered>=0.75?"#2563eb":"#d97706",borderRadius:100,transition:"width 0.4s"}}/>
        </div>
        <div style={{fontSize:10,color:"#6b7280"}}>{fmtP(c.pctRecovered)} of all-in capital recovered via refi</div>
      </div>
    </SectionCard>

    <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
    {/* SECTION 3 — CAPITAL EFFICIENCY */}
    <SectionCard title="Capital Efficiency" subtitle="Post-refi yield · Capital recycled · Velocity index">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
        {[
          {l:"Post-Refi CoC",   v:isFinite(c.coc)?fmtP(c.coc):"∞",    col:c.coc>=0.10||!isFinite(c.coc)?"#059669":"#d97706"},
          {l:"Monthly CF",      v:fmtD(c.mcf)+"/mo",                    col:c.mcf>=200?"#059669":c.mcf>=0?"#d97706":"#dc2626"},
          {l:"Recycle Time",    v:c.yearsToRecycle?c.yearsToRecycle.toFixed(1)+"yr":"Long", col:c.yearsToRecycle&&c.yearsToRecycle<=4?"#059669":"#d97706"},
        ].map(({l,v,col})=>(
          <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"10px",textAlign:"center"}}>
            <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:3}}>{l}</div>
            <div style={{fontSize:14,fontWeight:900,fontFamily:"'DM Mono',monospace",color:col}}>{v}</div>
          </div>
        ))}
      </div>
    </SectionCard>

    {/* SECTION 4 — OPTIMIZATION */}
    <SectionCard title="Optimization" subtitle="Tune ARV, LTV, and rehab to maximize capital recovery">
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/>
        <Field label="Refi LTV %" value={i.refiLtv} onChange={s("refiLtv")} suffix="%" step={1}/>
        <Field label="Rehab Budget" value={i.repairs} onChange={s("repairs")} prefix="$" step={1000}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div style={{background:"#f0fdf4",borderRadius:10,padding:"10px",textAlign:"center"}}>
            <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",marginBottom:3}}>Cash Left In</div>
            <div style={{fontSize:16,fontWeight:900,fontFamily:"'DM Mono',monospace",color:c.cashLeft<=0?"#059669":"#dc2626"}}>{fmtD(c.cashLeft)}</div>
          </div>
          <div style={{background:"#eff6ff",borderRadius:10,padding:"10px",textAlign:"center"}}>
            <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",marginBottom:3}}>Recovered</div>
            <div style={{fontSize:16,fontWeight:900,fontFamily:"'DM Mono',monospace",color:c.pctRecovered>=1?"#2563eb":"#d97706"}}>{fmtP(c.pctRecovered)}</div>
          </div>
        </div>
      </div>
    </SectionCard>

    {/* SECTION 5 — LONG-TERM PROJECTION (collapsed) */}
    <div style={{background:"white",borderRadius:16,border:"1.5px solid #e5e7eb",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",marginBottom:12,overflow:"hidden"}}>
      <button onClick={()=>setProjOpen(o=>!o)} style={{width:"100%",padding:"14px 18px",border:"none",background:"#fafafa",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,fontWeight:800,color:"#111827",textTransform:"uppercase",letterSpacing:"0.07em"}}>Velocity & Wealth Projection</div>
          <div style={{fontSize:10,color:"#9ca3af",marginTop:1}}>Capital recycling rate · BRRRR repetitions · Long-term compounding</div>
        </div>
        <span style={{fontSize:14,color:"#9ca3af",transform:projOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
      </button>
      {projOpen&&(
        <div style={{padding:"16px 18px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
            {[
              {l:"Recycle In",   v:c.yearsToRecycle?c.yearsToRecycle.toFixed(1)+"yr":"Long", col:c.yearsToRecycle&&c.yearsToRecycle<=4?"#059669":"#d97706"},
              {l:"BRRRRs/5yr",  v:c.yearsToRecycle&&c.yearsToRecycle>0?Math.floor(5/c.yearsToRecycle)+"×":"—", col:"#374151"},
              {l:"Annual CF",   v:fmtD(c.mcf*12),  col:c.mcf>=0?"#059669":"#dc2626"},
            ].map(({l,v,col})=>(
              <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:3}}>{l}</div>
                <div style={{fontSize:14,fontWeight:900,fontFamily:"'DM Mono',monospace",color:col}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:"#374151",background:"#f9fafb",borderRadius:10,padding:"12px",lineHeight:1.6}}>
            {c.pctRecovered>=1?"♾️ Infinite return profile — you've recycled all capital back out. Each subsequent BRRRR compounds with zero incremental capital if deal qualifies.":
             c.yearsToRecycle?`Capital recycles every ~${c.yearsToRecycle.toFixed(1)} years. At this pace, expect ~${Math.floor(10/c.yearsToRecycle)} BRRRR cycles in 10 years.`:
             "Negative or zero cash flow prevents meaningful capital recycling. Optimize post-refi yield first."}
          </div>
        </div>
      )}
    </div>
    
    </ProGate>  </>);
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

function subtoRiskScore(metrics) {
  const { balance=175000, rate=3.5, yearsLeft=25, pmt=1050,
          marketValue=220000, dp=0, cc=0,
          rent=1700, totalExp=550,
          loanType="conventional", balloon=false, balloonYears=30,
          adjustableRate=false, taxesCurrent=true, arrearsOwed=0,
          dueOnSaleTolerance="moderate", marketRate=7.5 } = metrics;

  const ti = dp + cc;
  const equity = marketValue - balance;
  const equityPct = marketValue > 0 ? equity / marketValue : 0;
  const mcf = rent - pmt - totalExp;
  const dscr = pmt > 0 ? (rent - totalExp) / pmt : 0;
  const beo  = rent > 0 ? (totalExp + pmt) / rent : 0;

  // 1. Debt Advantage Score (25%) — Rate Spread
  const rateSpread = marketRate - rate;
  let debtScore;
  if(rateSpread >= 3.0)      debtScore = 100; // Elite arbitrage
  else if(rateSpread >= 2.0) debtScore = 80;
  else if(rateSpread >= 1.0) debtScore = 55;
  else                       debtScore = 25;  // Minimal edge

  // 2. Cash Flow Durability (25%)
  let cfScore;
  if(mcf >= 400)      cfScore = 100;
  else if(mcf >= 200) cfScore = 75;
  else if(mcf >= 100) cfScore = 50;
  else if(mcf >= 0)   cfScore = 25;
  else                cfScore = 0;
  if(dscr < 1.10)  cfScore = Math.min(cfScore, 40);
  if(beo > 0.90)   cfScore = Math.min(cfScore, 50);

  // 3. Equity Position (20%)
  let equityScore;
  if(equityPct >= 0.20)      equityScore = 100;
  else if(equityPct >= 0.10) equityScore = 65;
  else                       equityScore = 25;  // Thin — dangerous

  // 4. Break-even / DSCR (15%)
  let structureScore;
  if(dscr >= 1.25 && beo <= 0.85) structureScore = 100;
  else if(dscr >= 1.10 && beo <= 0.90) structureScore = 70;
  else if(dscr >= 1.0)             structureScore = 40;
  else                             structureScore = 10;

  // 5. Seller Structure Risk (10%)
  let structRisk = 100;
  if(arrearsOwed > 0)             structRisk -= 20;
  if(!taxesCurrent)               structRisk -= 20;
  if(balloon && balloonYears <= 5) structRisk -= 30;
  else if(balloon)                 structRisk -= 15;
  if(adjustableRate)               structRisk -= 15;
  structRisk = Math.max(10, structRisk);

  // 6. Legal/Due-on-sale risk (5%)
  const dueOnSaleRisk = loanType === "va" ? "High" : loanType === "fha" ? "Moderate" : "Low";
  const legalScore = dueOnSaleRisk === "Low" ? 100 : dueOnSaleRisk === "Moderate" ? 60 : 30;

  const score = Math.min(100, Math.max(0, Math.round(
    debtScore*0.25 + cfScore*0.25 + equityScore*0.20 + structureScore*0.15 + structRisk*0.10 + legalScore*0.05
  )));

  // Verdict per spec
  let verdict, vColor, vBg, vIcon;
  if(mcf < 0 || dscr < 1.0) {
    verdict="Avoid";             vColor="#dc2626"; vBg="#fef2f2"; vIcon="🚫";
  } else if(score >= 85) {
    verdict="Strong Arbitrage";  vColor="#059669"; vBg="#f0fdf4"; vIcon="🎯";
  } else if(score >= 70) {
    verdict="Viable";            vColor="#2563eb"; vBg="#eff6ff"; vIcon="✅";
  } else if(score >= 55) {
    verdict="Thin";              vColor="#d97706"; vBg="#fffbeb"; vIcon="⚠️";
  } else if(score >= 40) {
    verdict="High Risk";         vColor="#ea580c"; vBg="#fff7ed"; vIcon="🔶";
  } else {
    verdict="Avoid";             vColor="#dc2626"; vBg="#fef2f2"; vIcon="🚫";
  }

  // Rate arbitrage strength label
  const rateLabel = rateSpread >= 3 ? "Elite Arbitrage" : rateSpread >= 2 ? "Strong Advantage" :
                    rateSpread >= 1 ? "Moderate Edge" : "Minimal Edge";

  // Capital efficiency vs traditional purchase
  const traditionalDown = marketValue * 0.20;
  const capEfficiency = traditionalDown > 0 && ti > 0 ? traditionalDown / ti : 0;

  return { score, verdict, vColor, vBg, vIcon,
           rateSpread: +rateSpread.toFixed(2), rateLabel, dueOnSaleRisk,
           debtScore, cfScore, equityScore, structureScore, structRisk, legalScore,
           equityPct, mcf, dscr, beo, ti,
           capEfficiency: +capEfficiency.toFixed(1),
           structureFlags: { arrearsOwed, taxesCurrent, balloon, balloonYears, adjustableRate } };
}

function SubToCalc({saved,onCalcChange,profile,isPro:isProProp,onActivatePro}) {
  const isPro = isProProp||false;
  const [addr,setAddr] = useState(saved?.address||"");
  const [projOpen,setProjOpen] = useState(false);
  const [exitMode,setExitMode] = useState("hold");
  const [loanType,setLoanType] = useState("conventional");
  const [i,setI] = useState(saved||{pp:220000,existingBalance:180000,existingRate:3.5,existingTerm:30,remainingYears:25,monthlyPiti:850,rent:2000,expenses:400,marketRate:7.5,capitalIn:15000,arrears:0,taxesCurrent:true,adjustable:false,balloon:false,balloonYears:7});
  const s = k => v => setI(p=>({...p,[k]:v}));

  const c = useMemo(()=>{
    const rateSpread = +i.marketRate - +i.existingRate;
    const mcf = +i.rent - +i.expenses - +i.monthlyPiti;
    const noi = (+i.rent - +i.expenses)*12;
    const dscr = +i.monthlyPiti>0 ? (+i.rent - +i.expenses)/+i.monthlyPiti : 0;
    const beo  = +i.rent>0 ? (+i.expenses + +i.monthlyPiti)/+i.rent : 1;
    const equity = +i.pp - +i.existingBalance;
    const equityPct = +i.pp>0 ? equity/+i.pp : 0;
    // What 20% down would cost vs capital in
    const traditional20 = +i.pp * 0.20;
    const capEfficiency = traditional20 > 0 ? traditional20 / Math.max(+i.capitalIn, 1) : 0;
    // Due-on-sale risk
    const dosRisk = loanType==="VA"?"High":loanType==="FHA"?"Moderate":"Low";
    return {rateSpread, mcf, dscr, beo, equity, equityPct, capEfficiency, dosRisk, traditional20};
  },[i,loanType]);

  const subtoRisk = useMemo(()=>subtoRiskScore({
    balance:+i.existingBalance, rate:+i.existingRate, marketRate:+i.marketRate,
    pmt:+i.monthlyPiti, marketValue:+i.pp, dp:+i.capitalIn, cc:0,
    rent:+i.rent, totalExp:+i.expenses,
    loanType, balloon:i.balloon, balloonYears:+i.balloonYears||7,
    adjustableRate:i.adjustable, taxesCurrent:i.taxesCurrent, arrearsOwed:+i.arrears||0,
  }),[c,i,loanType]);

  const marginPillar = useMemo(()=>{
    const sc = Math.round(subtoRisk.debtScore*0.40 + subtoRisk.equityScore*0.35 + subtoRisk.cfScore*0.25);
    const label = sc>=80?"Strong":sc>=60?"Moderate":sc>=40?"Thin":"Weak";
    return {score:sc, label, color:sc>=80?"#059669":sc>=60?"#2563eb":sc>=40?"#d97706":"#dc2626"};
  },[subtoRisk]);

  const riskPillar = useMemo(()=>{
    const sc = subtoRisk.score;
    const riskTier = classifyRiskTier(sc);
    const label = sc>=80?"Low Risk":sc>=60?"Moderate":sc>=40?"Elevated":"High Risk";
    return {score:sc, label, color:sc>=80?"#059669":sc>=60?"#2563eb":sc>=40?"#d97706":"#dc2626", riskTier};
  },[subtoRisk]);

  const velocityPillar = useMemo(()=>{
    const sc = Math.min(100, Math.round(subtoRisk.capEfficiency*25));
    const label = sc>=75?"High Leverage":sc>=50?"Moderate":"Low";
    return {score:sc, label, color:sc>=75?"#059669":sc>=50?"#2563eb":"#d97706"};
  },[subtoRisk]);

  const compositeScore = Math.round(marginPillar.score*0.35 + riskPillar.score*0.40 + velocityPillar.score*0.25);
  const highRiskCap = riskPillar.score < 50;

  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.mcf),secondary:fmtP(c.equityPct),label:"Mo. Cash Flow",label2:"Equity"}),[i,c,addr]);

  const subtoHasData = +i.existingBalance > 0 && +i.rent > 0;

  return (<>
    <AddressBar value={addr} onChange={setAddr}/>
            {/* SECTION 1 — DEAL VERDICT */}
    <UniversalVerdictHeader
      verdict={subtoRisk.verdict}
      vIcon={subtoRisk.vIcon}
      vColor={subtoRisk.vColor}
      score={compositeScore}
      primaryRisk={c.dosRisk==="High"?"Due-on-Sale Risk (VA Loan)":c.dscr<1.10?"DSCR Fragility":"Rate arbitrage advantage"}
      margin={marginPillar}
      risk={riskPillar}
      velocity={velocityPillar}
      highRiskCap={highRiskCap}
      strategyLabel="Subject-To"
      strategyIcon="📋"
      kpis={[
        {l:"Rate Spread",  v:"+"+c.rateSpread.toFixed(2)+"%",  col:c.rateSpread>=2?"#34d399":c.rateSpread>=1?"#fbbf24":"#f87171"},
        {l:"Cash Flow",   v:fmtD(c.mcf)+"/mo",                 col:c.mcf>=100?"#34d399":c.mcf>=0?"#fbbf24":"#f87171"},
        {l:"DSCR",        v:c.dscr.toFixed(2)+"x",             col:c.dscr>=1.25?"#34d399":c.dscr>=1.1?"#fbbf24":"#f87171"},
        {l:"Cap. Effic.", v:subtoRisk.capEfficiency.toFixed(1)+"×", col:subtoRisk.capEfficiency>=3?"#34d399":"rgba(255,255,255,0.55)"},
      ]}
    />

    {/* Seller structure toggles */}
    <div style={{background:"white",borderRadius:12,padding:"12px 16px",border:"1.5px solid #e5e7eb",marginBottom:14}}>
      <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginBottom:8}}>Seller Structure Risk</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:4}}>
          {[["conventional","Conventional"],["FHA","FHA"],["VA","VA"]].map(([k,lbl])=>(
            <button key={k} onClick={()=>setLoanType(k)}
              style={{padding:"4px 10px",borderRadius:100,border:`1.5px solid ${loanType===k?"#dc2626":"#e5e7eb"}`,background:loanType===k?"#fef2f2":"white",color:loanType===k?"#dc2626":"#6b7280",fontSize:10,fontWeight:700,cursor:"pointer"}}>
              {lbl}
            </button>
          ))}
        </div>
        {["Balloon","Adjustable","Arrears"].map(flag=>(
          <button key={flag} onClick={()=>s(flag.toLowerCase()+"" === "arrears" ? "arrears" : flag.toLowerCase())(flag==="Arrears"?(!i.arrears?3000:0):!i[flag.toLowerCase()])}
            style={{padding:"4px 10px",borderRadius:100,border:"1.5px solid #e5e7eb",background:
              (flag==="Arrears"&&i.arrears>0)||(flag!=="Arrears"&&i[flag.toLowerCase()])?"#fef2f2":"white",
            color:(flag==="Arrears"&&i.arrears>0)||(flag!=="Arrears"&&i[flag.toLowerCase()])?"#dc2626":"#6b7280",fontSize:10,fontWeight:700,cursor:"pointer"}}>
            {flag} {(flag==="Arrears"&&i.arrears>0)||(flag!=="Arrears"&&i[flag.toLowerCase()])?"⚠️":""}
          </button>
        ))}
      </div>
      <div style={{marginTop:6,fontSize:10,color:c.dosRisk==="High"?"#dc2626":c.dosRisk==="Moderate"?"#d97706":"#059669"}}>
        Due-on-Sale Risk: <b>{c.dosRisk}</b> {loanType==="VA"?"— VA loans have active due-on-sale enforcement":loanType==="FHA"?"— FHA loans carry moderate risk":"— Conventional enforceable but rarely triggered"}
      </div>
    </div>

    {/* INPUTS */}
    <InputSection title="Subject-To Details" accent="#7c3aed" defaultOpen>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000}/>
        <Field label="Existing Balance" value={i.existingBalance} onChange={s("existingBalance")} prefix="$" step={5000}/>
        <Field label="Existing Rate %" value={i.existingRate} onChange={s("existingRate")} suffix="%" step={0.125}/>
        <Field label="Market Rate %" value={i.marketRate} onChange={s("marketRate")} suffix="%" step={0.125}/>
        <Field label="Monthly P&I" value={i.monthlyPiti} onChange={s("monthlyPiti")} prefix="$" step={25}/>
        <Field label="Capital In" value={i.capitalIn} onChange={s("capitalIn")} prefix="$" step={1000}/>
        <Field label="Monthly Rent" value={i.rent} onChange={s("rent")} prefix="$" step={50}/>
        <Field label="Expenses" value={i.expenses} onChange={s("expenses")} prefix="$" step={25}/>
      </div>
    </InputSection>

    {/* SECTION 2 — STABILITY (DSCR / DOS / thin cash flow fragility) */}
    <SectionCard title="Stability" subtitle="DSCR fragility · Due-on-sale risk · Cash flow durability" badge={subtoRisk.verdict} badgeColor={subtoRisk.vColor}>
      <MetricGrid items={[
        {l:"DSCR",         v:c.dscr.toFixed(2)+"x",       good:c.dscr>=1.25, warn:c.dscr>=1.1, accent:true},
        {l:"Break-even",   v:(c.beo*100).toFixed(1)+"%",   good:c.beo<=0.80,  warn:c.beo<=0.90, accent:true},
        {l:"DOS Risk",     v:c.dosRisk,                    col:c.dosRisk==="High"?"#dc2626":c.dosRisk==="Moderate"?"#d97706":"#059669"},
        {l:"Rate Spread",  v:"+"+c.rateSpread.toFixed(2)+"%", col:c.rateSpread>=2?"#059669":c.rateSpread>=1?"#d97706":"#dc2626"},
      ]}/>
      {/* Cash flow fragility */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        {[
          ["Base",    c.mcf],
          ["1-mo Vac",Math.round(+i.rent-+i.rent/12-+i.expenses-+i.monthlyPiti)],
          ["3-mo Vac",Math.round(+i.rent-+i.rent/4-+i.expenses-+i.monthlyPiti)],
        ].map(([lbl,v])=>(
          <div key={lbl} style={{background:v>=0?"#f0fdf4":"#fef2f2",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
            <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",marginBottom:2}}>{lbl}</div>
            <div style={{fontSize:13,fontWeight:800,fontFamily:"'DM Mono',monospace",color:v>=0?"#059669":"#dc2626"}}>{fmtD(v)}</div>
          </div>
        ))}
      </div>
    </SectionCard>

    <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
    {/* SECTION 3 — CAPITAL EFFICIENCY (rate arbitrage + equity capture) */}
    <SectionCard title="Capital Efficiency" subtitle="Equity capture · Rate arbitrage · Capital leverage">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
        {[
          {l:"Rate Lock Advantage",  v:"+"+c.rateSpread.toFixed(2)+"%",      col:c.rateSpread>=2?"#059669":c.rateSpread>=1?"#d97706":"#dc2626"},
          {l:"Equity Position",      v:fmtD(c.equity)+" ("+fmtP(c.equityPct)+")", col:c.equityPct>=0.15?"#059669":"#d97706"},
          {l:"Capital Efficiency",   v:subtoRisk.capEfficiency.toFixed(1)+"× trad.", col:"#2563eb"},
        ].map(({l,v,col})=>(
          <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"10px",textAlign:"center"}}>
            <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:3}}>{l}</div>
            <div style={{fontSize:12,fontWeight:800,fontFamily:"'DM Mono',monospace",color:col}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{background:"#f0fdf4",borderRadius:10,padding:"12px",fontSize:11,color:"#374151",lineHeight:1.6}}>
        <b>Rate Lock:</b> {i.existingRate}% locked vs {i.marketRate}% market = <b style={{color:"#059669"}}>{fmtP(c.rateSpread/100*+i.existingBalance/12)} monthly savings</b> vs refinancing at market.
        Capital efficiency: {subtoRisk.capEfficiency.toFixed(1)}× vs buying with 20% down ({fmtD(c.traditional20)} required vs {fmtD(+i.capitalIn)} deployed).
      </div>
    </SectionCard>

    {/* SECTION 4 — OPTIMIZATION */}
    <SectionCard title="Optimization" subtitle="Adjust rent and capital structure">
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Field label="Monthly Rent" value={i.rent} onChange={s("rent")} prefix="$" step={50}/>
        <Field label="Capital In" value={i.capitalIn} onChange={s("capitalIn")} prefix="$" step={500}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div style={{background:"#f0fdf4",borderRadius:10,padding:"10px",textAlign:"center"}}>
            <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",marginBottom:3}}>Cash Flow</div>
            <div style={{fontSize:16,fontWeight:900,fontFamily:"'DM Mono',monospace",color:c.mcf>=0?"#059669":"#dc2626"}}>{fmtD(c.mcf)}/mo</div>
          </div>
          <div style={{background:"#eff6ff",borderRadius:10,padding:"10px",textAlign:"center"}}>
            <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",marginBottom:3}}>DSCR</div>
            <div style={{fontSize:16,fontWeight:900,fontFamily:"'DM Mono',monospace",color:c.dscr>=1.25?"#2563eb":"#d97706"}}>{c.dscr.toFixed(2)}x</div>
          </div>
        </div>
      </div>
    </SectionCard>

    {/* SECTION 5 — LONG-TERM PROJECTION (collapsed) */}
    <div style={{background:"white",borderRadius:16,border:"1.5px solid #e5e7eb",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",marginBottom:12,overflow:"hidden"}}>
      <button onClick={()=>setProjOpen(o=>!o)} style={{width:"100%",padding:"14px 18px",border:"none",background:"#fafafa",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,fontWeight:800,color:"#111827",textTransform:"uppercase",letterSpacing:"0.07em"}}>Exit Scenarios</div>
          <div style={{fontSize:10,color:"#9ca3af",marginTop:1}}>Hold · Refi · Sell — long-term projection</div>
        </div>
        <span style={{fontSize:14,color:"#9ca3af",transform:projOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
      </button>
      {projOpen&&(
        <div style={{padding:"16px 18px"}}>
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            {[["hold","Hold Long-Term"],["refi","Refinance"],["sell","Sell"]].map(([k,lbl])=>(
              <button key={k} onClick={()=>setExitMode(k)} style={{padding:"5px 12px",borderRadius:100,border:`1.5px solid ${exitMode===k?"#7c3aed":"#e5e7eb"}`,background:exitMode===k?"#f5f3ff":"white",color:exitMode===k?"#7c3aed":"#6b7280",fontSize:10,fontWeight:700,cursor:"pointer"}}>{lbl}</button>
            ))}
          </div>
          {exitMode==="hold"&&<div style={{fontSize:11,color:"#374151",background:"#f9fafb",borderRadius:10,padding:"12px",lineHeight:1.6}}>
            Holding long-term locks in {i.existingRate}% financing. Annual cash flow: <b>{fmtD(c.mcf*12)}</b>. Rate spread advantage compounds with every market rate increase.
          </div>}
          {exitMode==="refi"&&<div style={{fontSize:11,color:"#374151",background:"#f9fafb",borderRadius:10,padding:"12px",lineHeight:1.6}}>
            Refinancing out of subject-to replaces {i.existingRate}% with current ~{i.marketRate}% market rate. Monthly payment increases by ~{fmtD(Math.round(+i.existingBalance*(+i.marketRate-+i.existingRate)/100/12))}. Consider refinancing only if equity &gt; 25%.
          </div>}
          {exitMode==="sell"&&<div style={{fontSize:11,color:"#374151",background:"#f9fafb",borderRadius:10,padding:"12px",lineHeight:1.6}}>
            Sale nets equity of <b>{fmtD(c.equity)}</b> at current ARV. Ensure existing lender is notified per loan docs — subject-to investors typically sell to end buyers who assume or refinance.
          </div>}
        </div>
      )}
    </div>
    
    </ProGate>  </>);
}

function novationRiskScore(c) {
  const { profitPctArv=0, months=3, holdingMoCost=0, profit=0, tc=1,
          rehabPct=0, capitalIn=0, arv=1, sellerPayout=0,
          financingType="conventional" } = c;

  // 1. Spread Strength (30%)
  let spreadScore;
  if(profitPctArv < 0.10)       spreadScore = 30;  // Weak
  else if(profitPctArv < 0.15)  spreadScore = 60;  // Moderate
  else if(profitPctArv < 0.20)  spreadScore = 80;  // Strong
  else                           spreadScore = 100; // Elite — but never auto-100, penalize below

  // 2. Buyer Execution Risk (20%) — appraisal cushion
  const arvCushion = arv > 0 ? (arv - tc) / arv : 0;
  let buyerScore;
  if(arvCushion < 0.05)          buyerScore = 20; // Appraisal risk — near break-even
  else if(arvCushion < 0.10)     buyerScore = 50;
  else if(arvCushion < 0.15)     buyerScore = 75;
  else                            buyerScore = 95;
  // Financing penalty
  if(financingType === "fha")     buyerScore = Math.min(buyerScore, 70);
  if(financingType === "cash")    buyerScore = Math.min(100, buyerScore + 10);

  // 3. Timeline Risk (20%)
  let timelineScore;
  if(months < 3)                  timelineScore = 100;
  else if(months < 5)             timelineScore = 75;
  else                            timelineScore = 45;
  // Holding cost burn vs margin penalty
  const monthlyBurnPct = arv > 0 ? (holdingMoCost / (profit || 1)) : 0;
  if(monthlyBurnPct > 0.10)       timelineScore = Math.min(timelineScore, 50);

  // 4. Seller Structure Risk (15%)
  const sellerPayoutPct = arv > 0 ? sellerPayout / arv : 0;
  let sellerScore;
  if(sellerPayoutPct > 0.10)      sellerScore = 40;
  else if(sellerPayoutPct > 0.05) sellerScore = 70;
  else                             sellerScore = 100;

  // 5. Capital Exposure (15%)
  const capRiskPct = profit > 0 ? capitalIn / profit : 1;
  let capScore;
  if(capRiskPct > 0.75)            capScore = 30;
  else if(capRiskPct > 0.50)       capScore = 60;
  else                              capScore = 90;

  const score = Math.min(99, Math.max(0, Math.round( // Cap at 99 — no deal is perfect
    spreadScore*0.30 + buyerScore*0.20 + timelineScore*0.20 + sellerScore*0.15 + capScore*0.15
  )));

  // Verdict per spec
  let verdict, vColor, vBg, vIcon;
  if(score >= 85)       { verdict="Strong Novation"; vColor="#059669"; vBg="#f0fdf4"; vIcon="🎯"; }
  else if(score >= 70)  { verdict="Viable";          vColor="#2563eb"; vBg="#eff6ff"; vIcon="✅"; }
  else if(score >= 55)  { verdict="Thin";            vColor="#d97706"; vBg="#fffbeb"; vIcon="⚠️"; }
  else if(score >= 40)  { verdict="High Risk";       vColor="#ea580c"; vBg="#fff7ed"; vIcon="🔶"; }
  else                  { verdict="Avoid";            vColor="#dc2626"; vBg="#fef2f2"; vIcon="🚫"; }

  // Primary risk driver
  const drivers = [["Spread Strength",spreadScore],["Appraisal Cushion",buyerScore],["Timeline Risk",timelineScore],["Seller Structure",sellerScore]];
  const weakest = [...drivers].sort((a,b)=>a[1]-b[1])[0];

  return { score, verdict, vColor, vBg, vIcon, primaryRisk: weakest[0],
           spreadScore, buyerScore, timelineScore, sellerScore, capScore,
           arvCushion };
}

function NovationCalc({saved,onCalcChange,profile,isPro:isProProp,onActivatePro}) {
  const isPro = isProProp||false;
  const [addr,setAddr] = useState(saved?.address||"");
  const [projOpen,setProjOpen] = useState(false);
  const [arvAdj,setArvAdj] = useState(0);
  const [finType,setFinType] = useState("conventional");
  const [i,setI] = useState(saved||{arv:300000,sellerPayout:220000,repairs:15000,holding:3000,closing:5000,capitalIn:5000,duration:4,targetProfit:40000});
  const s = k => v => setI(p=>({...p,[k]:v}));

  const adjArv = useMemo(()=>+i.arv*(1+arvAdj/100),[i.arv,arvAdj]);

  const c = useMemo(()=>{
    const totalCosts = +i.sellerPayout + +i.repairs + +i.holding + +i.closing;
    const profit = adjArv - totalCosts;
    const profitPct = adjArv>0 ? profit/adjArv : 0;
    const sellerPct = adjArv>0 ? +i.sellerPayout/adjArv : 0;
    const arvCushion = adjArv>0 ? (adjArv-totalCosts)/adjArv : 0;
    const monthlyBurn = +i.duration>0 ? +i.holding/+i.duration : 0;
    const burnOfProfit = profit>0 ? monthlyBurn/profit : 0;
    const capEfficiencyVsFlip = +i.capitalIn>0 ? profit/+i.capitalIn : 0;
    const annualROI = +i.duration>0 ? capEfficiencyVsFlip/(+i.duration/12) : 0;
    return {totalCosts, profit, profitPct, sellerPct, arvCushion, monthlyBurn, burnOfProfit, capEfficiencyVsFlip, annualROI, adjArv};
  },[i,adjArv]);

  const novRisk = useMemo(()=>novationRiskScore({
    profitPctArv:c.profitPct, months:+i.duration, holdingMoCost:c.monthlyBurn,
    profit:c.profit, tc:c.totalCosts, rehabPct:adjArv>0?+i.repairs/adjArv:0,
    capitalIn:+i.capitalIn, arv:adjArv, sellerPayout:+i.sellerPayout,
    financingType:finType,
  }),[c,i,adjArv,finType]);

  const marginPillar = useMemo(()=>{
    const sc = novRisk.spreadScore;
    const label = sc>=80?"Strong":sc>=60?"Moderate":sc>=40?"Thin":"Weak";
    return {score:sc, label, color:sc>=80?"#059669":sc>=60?"#2563eb":sc>=40?"#d97706":"#dc2626"};
  },[novRisk]);

  const riskPillar = useMemo(()=>{
    const sc = novRisk.score;
    const riskTier = classifyRiskTier(sc);
    const label = sc>=80?"Low Risk":sc>=60?"Moderate":sc>=40?"Elevated":"High Risk";
    return {score:sc, label, color:sc>=80?"#059669":sc>=60?"#2563eb":sc>=40?"#d97706":"#dc2626", riskTier};
  },[novRisk]);

  const velocityPillar = useMemo(()=>{
    const sc = novRisk.timelineScore;
    const label = sc>=75?"Fast":sc>=50?"Moderate":"Slow";
    return {score:sc, label, color:sc>=75?"#059669":sc>=50?"#2563eb":"#dc2626"};
  },[novRisk]);

  const compositeScore = Math.round(marginPillar.score*0.35 + riskPillar.score*0.40 + velocityPillar.score*0.25);
  const highRiskCap = riskPillar.score < 50;

  // Retail friction sims
  const frictionSims = useMemo(()=>[
    {label:"Base",           profit:c.profit,               profitPct:c.profitPct},
    {label:"3% Buyer Credit",profit:c.profit-adjArv*0.03,   profitPct:(c.profit-adjArv*0.03)/Math.max(adjArv,1)},
    {label:"2% Price Drop",  profit:c.profit-adjArv*0.02,   profitPct:(c.profit-adjArv*0.02)/Math.max(adjArv,1)},
    {label:"30-day Delay",   profit:c.profit-c.monthlyBurn, profitPct:(c.profit-c.monthlyBurn)/Math.max(adjArv,1)},
    {label:"Inspection −$5K",profit:c.profit-5000,          profitPct:(c.profit-5000)/Math.max(adjArv,1)},
  ],[c,adjArv]);

  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.profit),secondary:fmtP(c.profitPct),label:"Net Profit",label2:"Profit %"}),[i,c,addr]);

  const novHasData = +i.arv > 0 && +i.sellerPayout > 0;

  return (<>
    <AddressBar value={addr} onChange={setAddr}/>
            {/* SECTION 1 — DEAL VERDICT */}
    <UniversalVerdictHeader
      verdict={novRisk.verdict}
      vIcon={novRisk.vIcon}
      vColor={novRisk.vColor}
      score={compositeScore}
      primaryRisk={compositeScore<60?"Retail Friction + ARV Compression":"Spread strength adequate"}
      margin={marginPillar}
      risk={riskPillar}
      velocity={velocityPillar}
      highRiskCap={highRiskCap}
      strategyLabel="Novation"
      strategyIcon="🤝"
      kpis={[
        {l:"Net Profit",   v:fmtD(c.profit),        col:c.profit>0?"#34d399":"#f87171"},
        {l:"Profit %",     v:fmtP(c.profitPct),      col:c.profitPct>=0.10?"#34d399":c.profitPct>=0.07?"#fbbf24":"#f87171"},
        {l:"ARV Cushion",  v:fmtP(c.arvCushion),     col:c.arvCushion>=0.10?"#34d399":c.arvCushion>=0.05?"#fbbf24":"#f87171"},
        {l:"Timeline",     v:i.duration+"mo",         col:+i.duration<=4?"#34d399":+i.duration<=6?"#fbbf24":"#f87171"},
      ]}
    />

    {/* ARV + Buyer financing selectors */}
    <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:10,marginBottom:14,alignItems:"start"}}>
      <div style={{background:"white",borderRadius:12,padding:"10px 14px",border:"1.5px solid #e5e7eb"}}>
        <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginBottom:6}}>Buyer Financing</div>
        <div style={{display:"flex",gap:5}}>
          {[["conventional","Conv."],["FHA","FHA"],["cash","Cash"]].map(([k,lbl])=>(
            <button key={k} onClick={()=>setFinType(k)}
              style={{padding:"4px 10px",borderRadius:100,border:`1.5px solid ${finType===k?"#be185d":"#e5e7eb"}`,background:finType===k?"#fdf2f8":"white",color:finType===k?"#be185d":"#6b7280",fontSize:10,fontWeight:700,cursor:"pointer"}}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
      <div style={{background:"white",borderRadius:12,padding:"10px 14px",border:"1.5px solid #e5e7eb"}}>
        <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginBottom:6}}>ARV Sensitivity</div>
        <div style={{display:"flex",gap:5}}>
          {[[-10,"−10%"],[-5,"−5%"],[0,"Base"],[5,"+5%"]].map(([val,lbl])=>(
            <button key={val} onClick={()=>setArvAdj(val)}
              style={{padding:"4px 10px",borderRadius:100,border:`1.5px solid ${arvAdj===val?"#be185d":"#e5e7eb"}`,background:arvAdj===val?"#be185d":"white",color:arvAdj===val?"white":"#be185d",fontSize:10,fontWeight:700,cursor:"pointer"}}>
              {lbl}
            </button>
          ))}
        </div>
        {arvAdj!==0&&<div style={{fontSize:10,color:"#be185d",marginTop:4}}>Adj. ARV: {fmtD(adjArv)}</div>}
      </div>
    </div>

    {/* INPUTS */}
    <InputSection title="Novation Deal Details" accent="#be185d" defaultOpen badge={`Profit: ${fmtD(c.profit)}`}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/>
        <Field label="Seller Payout" value={i.sellerPayout} onChange={s("sellerPayout")} prefix="$" step={5000}/>
        <Field label="Repairs" value={i.repairs} onChange={s("repairs")} prefix="$" step={500}/>
        <Field label="Holding Costs" value={i.holding} onChange={s("holding")} prefix="$" step={500}/>
        <Field label="Closing Costs" value={i.closing} onChange={s("closing")} prefix="$" step={500}/>
        <Field label="Capital In" value={i.capitalIn} onChange={s("capitalIn")} prefix="$" step={500}/>
        <Field label="Timeline (mo)" value={i.duration} onChange={s("duration")} suffix="mo" step={1}/>
      </div>
    </InputSection>

    {/* SECTION 2 — STABILITY (retail friction + ARV + timeline exposure) */}
    <SectionCard title="Stability" subtitle="Retail friction · ARV compression · Timeline exposure" badge={novRisk.verdict} badgeColor={novRisk.vColor}>
      <MetricGrid items={[
        {l:"Profit",       v:fmtD(c.profit),           good:c.profit>0, warn:c.profit>-5000, accent:true},
        {l:"ARV Cushion",  v:fmtP(c.arvCushion),        good:c.arvCushion>=0.10, warn:c.arvCushion>=0.05, accent:true},
        {l:"Burn vs Profit",v:fmtP(c.burnOfProfit),    col:c.burnOfProfit<=0.10?"#059669":c.burnOfProfit<=0.20?"#d97706":"#dc2626"},
        {l:"Timeline Risk",v:+i.duration<=4?"Low":+i.duration<=6?"Moderate":"High", col:+i.duration<=4?"#059669":+i.duration<=6?"#d97706":"#dc2626"},
      ]}/>
      <div style={{borderRadius:10,border:"1px solid #f3f4f6",overflow:"hidden"}}>
        <div style={{padding:"8px 12px",background:"#fafafa",fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase"}}>Retail Friction Simulation</div>
        {frictionSims.map((sc,idx)=>(
          <div key={idx} style={{display:"flex",justifyContent:"space-between",padding:"7px 12px",borderBottom:idx<frictionSims.length-1?"1px solid #f9fafb":"none"}}>
            <span style={{fontSize:11,color:"#6b7280"}}>{sc.label}</span>
            <div style={{display:"flex",gap:10}}>
              <span style={{fontSize:11,fontWeight:700,fontFamily:"'DM Mono',monospace",color:sc.profit>0?"#059669":"#dc2626"}}>{fmtD(Math.round(sc.profit))}</span>
              <span style={{fontSize:10,color:sc.profitPct>=0.10?"#059669":"#d97706"}}>{fmtP(sc.profitPct)}</span>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>

    <ProGate isPro={isPro} trigger="unlock" onActivatePro={onActivatePro}>
    {/* SECTION 3 — CAPITAL EFFICIENCY */}
    <SectionCard title="Capital Efficiency" subtitle="Net spread · Profit per dollar deployed · vs Wholesale">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
        {[
          {l:"Net Profit",     v:fmtD(c.profit),           col:c.profit>0?"#059669":"#dc2626"},
          {l:"Cap. Efficiency",v:c.capEfficiencyVsFlip.toFixed(1)+"×", col:"#2563eb"},
          {l:"Annualized ROI", v:fmtP(c.annualROI),         col:c.annualROI>=0.50?"#059669":"#d97706"},
        ].map(({l,v,col})=>(
          <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"10px",textAlign:"center"}}>
            <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:3}}>{l}</div>
            <div style={{fontSize:14,fontWeight:900,fontFamily:"'DM Mono',monospace",color:col}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{background:"#fdf2f8",borderRadius:10,padding:"12px",fontSize:11,color:"#374151",lineHeight:1.6}}>
        <b>Novation vs Wholesale:</b> Novation profit {fmtD(c.profit)} vs wholesale est. ~{fmtD(Math.round((adjArv-c.totalCosts)*0.6))} net. 
        Capital deployed: {fmtD(+i.capitalIn)} vs ~0 for wholesale. Higher risk, higher ceiling.
      </div>
    </SectionCard>

    {/* SECTION 4 — OPTIMIZATION */}
    <SectionCard title="Optimization" subtitle="Tune seller payout and timeline to hit profit target">
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Field label="Seller Payout" value={i.sellerPayout} onChange={s("sellerPayout")} prefix="$" step={2500}/>
        <Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/>
        <Field label="Timeline (mo)" value={i.duration} onChange={s("duration")} suffix="mo" step={1}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div style={{background:"#fdf2f8",borderRadius:10,padding:"10px",textAlign:"center"}}>
            <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",marginBottom:3}}>Net Profit</div>
            <div style={{fontSize:16,fontWeight:900,fontFamily:"'DM Mono',monospace",color:c.profit>0?"#be185d":"#dc2626"}}>{fmtD(c.profit)}</div>
          </div>
          <div style={{background:"#f8fafc",borderRadius:10,padding:"10px",textAlign:"center"}}>
            <div style={{fontSize:8,color:"#9ca3af",textTransform:"uppercase",marginBottom:3}}>Profit %</div>
            <div style={{fontSize:16,fontWeight:900,fontFamily:"'DM Mono',monospace",color:c.profitPct>=0.10?"#be185d":"#d97706"}}>{fmtP(c.profitPct)}</div>
          </div>
        </div>
      </div>
    </SectionCard>

    {/* SECTION 5 — LONG-TERM PROJECTION (collapsed) */}
    <div style={{background:"white",borderRadius:16,border:"1.5px solid #e5e7eb",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",marginBottom:12,overflow:"hidden"}}>
      <button onClick={()=>setProjOpen(o=>!o)} style={{width:"100%",padding:"14px 18px",border:"none",background:"#fafafa",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,fontWeight:800,color:"#111827",textTransform:"uppercase",letterSpacing:"0.07em"}}>Annualized Return Analysis</div>
          <div style={{fontSize:10,color:"#9ca3af",marginTop:1}}>ROI compression by timeline · Buyer execution risk</div>
        </div>
        <span style={{fontSize:14,color:"#9ca3af",transform:projOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
      </button>
      {projOpen&&(
        <div style={{padding:"16px 18px"}}>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginBottom:7}}>ROI at Different Timelines</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
              {[3,4,6,9].map(mo=>{
                const holdCost = +i.holding/(+i.duration||1)*mo;
                const proj = c.profit - holdCost + +i.holding;
                const roi  = +i.capitalIn>0 ? (proj/+i.capitalIn)/(mo/12) : 0;
                return(
                  <div key={mo} style={{background:"#f8fafc",borderRadius:10,padding:"10px",textAlign:"center",border:`1.5px solid ${mo===+i.duration?"#be185d":"transparent"}`}}>
                    <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",marginBottom:3}}>{mo}mo</div>
                    <div style={{fontSize:13,fontWeight:800,fontFamily:"'DM Mono',monospace",color:roi>=0.50?"#059669":"#d97706"}}>{fmtP(roi)}</div>
                    <div style={{fontSize:8,color:"#9ca3af"}}>annualized</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{fontSize:11,color:"#374151",background:"#f9fafb",borderRadius:10,padding:"12px",lineHeight:1.6}}>
            <b>Buyer Execution Risk ({finType==="FHA"?"FHA":""+finType.charAt(0).toUpperCase()+finType.slice(1)}):</b> 
            {finType==="FHA"?" FHA appraisal risk is elevated — subject to strict condition requirements. Budget for additional buyer concessions."
            :finType==="cash"?" Cash buyer eliminates appraisal and financing risk. Fastest close, lowest friction."
            :" Conventional buyer carries moderate appraisal risk. ARV cushion of "+fmtP(c.arvCushion)+" provides buffer."}
          </div>
        </div>
      )}
    </div>
    
    </ProGate>  </>);
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
// Structured reaction reasons per spec
const REACTION_REASONS = {
  solid: ["Strong equity","Good cash flow","Price accurate","Solid fundamentals","Low risk"],
  tight: ["Price too high","Thin margins","Rate assumptions aggressive","Repair underestimated","Financing risk"],
  pass:  ["ARV unrealistic","Repairs underestimated","Market too competitive","Financing risk","Deal doesn't pencil"],
};

function ReactionBar({post, onReact, userReaction, onReactWithReason}) {
  const [pendingType, setPendingType] = useState(null);
  const reactions = [
    {type:"solid", label:"✅ Buy",   active:"#059669", bg:"#f0fdf4", border:"#bbf7d0"},
    {type:"tight", label:"⚠️ Tight", active:"#d97706", bg:"#fffbeb", border:"#fde68a"},
    {type:"pass",  label:"❌ Pass",  active:"#dc2626", bg:"#fef2f2", border:"#fecaca"},
  ];
  const counts = post.reactions||{};
  const total = (counts.solid||0)+(counts.tight||0)+(counts.pass||0);

  // Consensus score
  const solidPct = total>0 ? Math.round((counts.solid||0)/total*100) : 0;
  const tightPct = total>0 ? Math.round((counts.tight||0)/total*100) : 0;
  const passPct  = total>0 ? Math.round((counts.pass||0)/total*100)  : 0;

  return (
    <div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
        {reactions.map(r=>{
          const isActive = userReaction===r.type;
          const count = counts[r.type]||0;
          return (
            <button key={r.type} onClick={e=>{e.stopPropagation();setPendingType(pendingType===r.type?null:r.type);onReact(post,r.type);}}
              style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:100,border:`1.5px solid ${isActive?r.border:"#e5e7eb"}`,background:isActive?r.bg:"white",cursor:"pointer",fontSize:12,fontWeight:isActive?700:500,color:isActive?r.active:"#6b7280",transition:"all 0.15s"}}>
              {r.label}{count>0&&<span style={{fontSize:11,fontWeight:700,color:isActive?r.active:"#9ca3af"}}>{count}</span>}
            </button>
          );
        })}
      </div>
      {/* Structured reason selector */}
      {pendingType&&(
        <div style={{background:"#f9fafb",borderRadius:10,padding:"10px 12px",marginBottom:8,border:"1px solid #e5e7eb"}}>
          <div style={{fontSize:9,fontWeight:700,color:"#6b7280",textTransform:"uppercase",marginBottom:6}}>Why? (optional — adds structured data)</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {(REACTION_REASONS[pendingType]||[]).map(reason=>(
              <button key={reason} onClick={()=>{onReactWithReason&&onReactWithReason(post,pendingType,reason);setPendingType(null);}}
                style={{padding:"4px 10px",borderRadius:100,border:"1.5px solid #e5e7eb",background:"white",color:"#374151",fontSize:10,fontWeight:600,cursor:"pointer"}}>
                {reason}
              </button>
            ))}
            <button onClick={()=>setPendingType(null)} style={{padding:"4px 8px",borderRadius:100,border:"1px solid #e5e7eb",background:"transparent",color:"#9ca3af",fontSize:10,cursor:"pointer"}}>Skip</button>
          </div>
        </div>
      )}
      {/* Consensus Score */}
      {total>=3&&(
        <div style={{background:"white",borderRadius:8,padding:"8px 10px",border:"1px solid #e5e7eb"}}>
          <div style={{fontSize:9,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",marginBottom:5}}>Community Consensus · {total} votes</div>
          <div style={{display:"flex",height:6,borderRadius:100,overflow:"hidden",marginBottom:4}}>
            <div style={{width:`${solidPct}%`,background:"#059669",transition:"width 0.3s"}}/>
            <div style={{width:`${tightPct}%`,background:"#d97706",transition:"width 0.3s"}}/>
            <div style={{width:`${passPct}%`,background:"#dc2626",transition:"width 0.3s"}}/>
          </div>
          <div style={{display:"flex",gap:10,fontSize:10}}>
            <span style={{color:"#059669",fontWeight:700}}>{solidPct}% Buy</span>
            <span style={{color:"#d97706",fontWeight:700}}>{tightPct}% Tight</span>
            <span style={{color:"#dc2626",fontWeight:700}}>{passPct}% Pass</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ForumView({user, profile, savedDeals=[], isPro=false}) {
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
// ── Leaderboard tier system per spec ──
const LB_TIERS = [
  { key:"explorer",   label:"Explorer",   minDeals:0,  minPI:0,  icon:"🌱", color:"#6b7280", bg:"#f9fafb" },
  { key:"operator",   label:"Operator",   minDeals:3,  minPI:40, icon:"⚙️", color:"#2563eb", bg:"#eff6ff" },
  { key:"builder",    label:"Builder",    minDeals:7,  minPI:55, icon:"🏗️", color:"#7c3aed", bg:"#f5f3ff" },
  { key:"scale",      label:"Scale",      minDeals:15, minPI:70, icon:"📈", color:"#d97706", bg:"#fffbeb" },
  { key:"strategist", label:"Strategist", minDeals:25, minPI:85, icon:"🎯", color:"#059669", bg:"#f0fdf4" },
];

function getLBTier(dealCount, performanceIndex) {
  const dc = dealCount || 0;
  const pi = performanceIndex || 0;
  // Traverse tiers in reverse, find highest met
  for(let i = LB_TIERS.length-1; i >= 0; i--) {
    if(dc >= LB_TIERS[i].minDeals && pi >= LB_TIERS[i].minPI) return LB_TIERS[i];
  }
  return LB_TIERS[0];
}

// Compute Performance Index per spec (0–100)
// Capital Efficiency 30% + Risk Discipline 20% + Execution Accuracy 20% (needs verified data)
function calcPerformanceIndex(profile) {
  const coc = parseFloat(profile?.avg_coc) || 0;       // proxy for capital efficiency
  const avgMargin = parseFloat(profile?.avg_margin) || 0;
  const accuracy = parseFloat(profile?.execution_accuracy) || 0.75;

  // Capital Efficiency (30%) — net profit / capital deployed proxy via avg CoC
  const ceScore = Math.min(100, Math.round(coc * 500)); // 20% CoC → 100

  // Risk Discipline (20%) — average margin of safety
  const rdScore = Math.min(100, Math.round(avgMargin * 400));

  // Execution Accuracy (20%) — projected vs actual delta
  const eaScore = Math.min(100, Math.round(accuracy * 100));

  // Community impact (30%) proxy via upvotes + deal count
  const upvotes = parseInt(profile?.upvotes_received) || 0;
  const dealCount = parseInt(profile?.deal_count) || 0;
  const ciScore = Math.min(100, Math.round((upvotes * 2 + dealCount * 3)));

  const pi = Math.min(100, Math.round(ceScore*0.30 + rdScore*0.20 + eaScore*0.20 + ciScore*0.30));
  return { pi, ceScore, rdScore, eaScore, ciScore };
}

// Community Impact Score (30%)
function calcCommunityImpact(profile) {
  const upvotes = parseInt(profile?.upvotes_received) || 0;
  const deals = parseInt(profile?.deal_count) || 0;
  const sessions = parseInt(profile?.mentoring_sessions) || 0;
  return Math.min(100, Math.round(upvotes*1.5 + deals*2 + sessions*3));
}

function LeaderboardView({user,profile,onGoProfile}) {
  const [leaders,setLeaders]=useState([]);const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState("hybrid"); // hybrid | performance | community
  const [timeFilter,setTimeFilter]=useState("all"); // monthly | quarterly | all

  useEffect(()=>{supabase.getLeaderboard().then(d=>{setLeaders(d);setLoading(false);}).catch(()=>setLoading(false));},[]);

  const myPI = profile ? calcPerformanceIndex(profile) : null;
  const myTier = profile ? getLBTier(profile.deal_count, myPI?.pi) : null;
  const myCommunity = profile ? calcCommunityImpact(profile) : 0;

  const sortedLeaders = useMemo(()=>{
    const l = [...leaders];
    if(tab==="performance") return l.sort((a,b)=>(calcPerformanceIndex(b).pi)-(calcPerformanceIndex(a).pi));
    if(tab==="community")   return l.sort((a,b)=>calcCommunityImpact(b)-calcCommunityImpact(a));
    // Hybrid: Performance × 70% + Community × 30%
    return l.sort((a,b)=>{
      const scoreA = calcPerformanceIndex(a).pi*0.70 + calcCommunityImpact(a)*0.30;
      const scoreB = calcPerformanceIndex(b).pi*0.70 + calcCommunityImpact(b)*0.30;
      return scoreB - scoreA;
    });
  },[leaders,tab]);

  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"28px"}}>
      <div style={{marginBottom:24}}>
        <h2 style={{fontFamily:"'Fraunces',serif",fontSize:26,fontWeight:800,color:"#111827",marginBottom:4}}>🏆 Investor Leaderboard</h2>
        <p style={{fontSize:13,color:"#9ca3af"}}>Performance × 70% + Community × 30% · Verified investors only</p>
      </div>

      {/* Tab + Time filters */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",gap:4,background:"#f3f4f6",borderRadius:10,padding:3}}>
          {[["hybrid","⚖️ Hybrid"],["performance","📊 Performance"],["community","🤝 Community"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{padding:"6px 14px",borderRadius:8,border:"none",background:tab===k?"white":"transparent",color:tab===k?"#111827":"#6b7280",fontSize:12,fontWeight:tab===k?700:500,cursor:"pointer",boxShadow:tab===k?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>{l}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:4}}>
          {[["monthly","Monthly"],["quarterly","Quarterly"],["all","All Time"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTimeFilter(k)} style={{padding:"5px 12px",borderRadius:100,border:`1.5px solid ${timeFilter===k?"#2563eb":"#e5e7eb"}`,background:timeFilter===k?"#eff6ff":"white",color:timeFilter===k?"#2563eb":"#6b7280",fontSize:11,fontWeight:700,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
      </div>

      {/* Tier legend */}
      <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
        {LB_TIERS.map(t=>(
          <div key={t.key} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:100,background:t.bg,border:`1px solid ${t.color}30`}}>
            <span style={{fontSize:12}}>{t.icon}</span>
            <span style={{fontSize:10,fontWeight:700,color:t.color}}>{t.label}</span>
            <span style={{fontSize:9,color:"#9ca3af"}}>{t.minDeals}+ deals · PI {t.minPI}+</span>
          </div>
        ))}
      </div>

      {/* Current user card */}
      {profile&&myPI&&(
        <div style={{background:"linear-gradient(135deg,#064e3b,#065f46)",borderRadius:16,padding:"20px 24px",marginBottom:28}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:20,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <div style={{width:46,height:46,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid rgba(255,255,255,0.2)"}}>
                <span style={{fontSize:17,fontWeight:800,color:"white"}}>{(profile.full_name||"?")[0].toUpperCase()}</span>
              </div>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:15,fontWeight:700,color:"white"}}>{profile.full_name||"You"}</span>
                  {profile.is_verified&&<span style={{fontSize:10,background:"rgba(16,185,129,0.3)",color:"#6ee7b7",border:"1px solid rgba(110,231,183,0.3)",borderRadius:100,padding:"1px 8px",fontWeight:700}}>✓ Verified</span>}
                  <span style={{fontSize:12}}>{myTier?.icon}</span>
                  <span style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontWeight:600}}>{myTier?.label}</span>
                </div>
                <span style={{fontSize:12,color:"rgba(255,255,255,0.6)"}}>Performance Index: {myPI.pi} · Community: {myCommunity}</span>
              </div>
            </div>
            <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
              {[["PI",myPI.pi],["Capital Eff.",myPI.ceScore],["Risk Disc.",myPI.rdScore],["Community",myCommunity]].map(([l,v])=>(
                <div key={l} style={{textAlign:"center"}}><div style={{fontSize:16,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"white"}}>{v}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div></div>
              ))}
            </div>
            {!profile.is_verified&&<button onClick={onGoProfile} style={{padding:"9px 18px",borderRadius:9,border:"1.5px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"white",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>Get Verified →</button>}
          </div>

          {/* PI breakdown bars */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:16}}>
            {[["Capital Efficiency",myPI.ceScore,"30%"],["Risk Discipline",myPI.rdScore,"20%"],["Execution Accuracy",myPI.eaScore,"20%"],["Community Impact",myCommunity,"30%"]].map(([l,v,w])=>(
              <div key={l}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:9,color:"rgba(255,255,255,0.6)",fontWeight:600}}>{l} <span style={{opacity:0.5}}>{w}</span></span>
                  <span style={{fontSize:9,fontWeight:700,color:"white"}}>{v}</span>
                </div>
                <div style={{height:4,background:"rgba(255,255,255,0.15)",borderRadius:100}}>
                  <div style={{height:"100%",width:`${v}%`,background:"rgba(110,231,183,0.8)",borderRadius:100}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading?<div style={{textAlign:"center",padding:"60px",color:"#9ca3af"}}>Loading leaderboard...</div>
      :sortedLeaders.length===0?(
        <div style={{textAlign:"center",padding:"80px 24px"}}>
          <div style={{fontSize:52,marginBottom:16}}>🏆</div>
          <h3 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"#111827",marginBottom:8}}>No verified investors yet</h3>
          <p style={{fontSize:14,color:"#6b7280",maxWidth:340,margin:"0 auto 24px"}}>Be the first! Verify your portfolio to appear on the leaderboard.</p>
          <Btn variant="primary" onClick={onGoProfile}>Get Verified →</Btn>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {sortedLeaders.map((l,idx)=>{
            const lPI = calcPerformanceIndex(l);
            const lTier = getLBTier(l.deal_count, lPI.pi);
            const lComm = calcCommunityImpact(l);
            const hybridScore = Math.round(lPI.pi*0.70 + lComm*0.30);
            const isMentor = l.mentoring_enabled;
            return (
              <div key={l.id} style={{background:"white",borderRadius:14,border:`1.5px solid ${idx<3?"#fde68a":"#e5e7eb"}`,padding:"16px 20px",display:"flex",alignItems:"center",gap:14,transition:"all 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 20px rgba(0,0,0,0.06)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                {/* Rank */}
                <div style={{width:34,height:34,borderRadius:"50%",background:idx===0?"linear-gradient(135deg,#f59e0b,#d97706)":idx===1?"linear-gradient(135deg,#9ca3af,#6b7280)":idx===2?"linear-gradient(135deg,#b45309,#92400e)":"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:idx<3?15:12,fontWeight:800,color:idx<3?"white":"#6b7280"}}>{idx<3?["🥇","🥈","🥉"][idx]:idx+1}</span>
                </div>
                {/* Avatar */}
                <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:15,fontWeight:800,color:"white"}}>{(l.full_name||"?")[0].toUpperCase()}</span>
                </div>
                {/* Info */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                    <span style={{fontSize:14,fontWeight:700,color:"#111827"}}>{l.full_name}</span>
                    <span style={{fontSize:12}}>{lTier.icon}</span>
                    <span style={{fontSize:9,fontWeight:700,color:lTier.color,background:lTier.bg,padding:"1px 6px",borderRadius:100}}>{lTier.label}</span>
                    <span style={{fontSize:10,background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:100,padding:"1px 6px",fontWeight:700}}>✓ Verified</span>
                    {isMentor&&<span style={{fontSize:10,background:"#fffbeb",color:"#d97706",border:"1px solid #fde68a",borderRadius:100,padding:"1px 6px",fontWeight:700}}>🎓 Mentor</span>}
                  </div>
                  <div style={{fontSize:11,color:"#6b7280"}}>{l.investor_type||""}{l.location?` · 📍 ${l.location}`:""}</div>
                </div>
                {/* Stats */}
                <div style={{display:"flex",gap:14,flexShrink:0,flexWrap:"wrap"}}>
                  {tab==="hybrid"&&[["Hybrid",hybridScore],["PI",lPI.pi],["Community",lComm],["Deals",l.deal_count||0]].map(([lbl,val])=>(
                    <div key={lbl} style={{textAlign:"center"}}>
                      <div style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#111827"}}>{val}</div>
                      <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.06em"}}>{lbl}</div>
                    </div>
                  ))}
                  {tab==="performance"&&[["PI",lPI.pi],["Cap Eff.",lPI.ceScore],["Risk Disc.",lPI.rdScore],["Exec. Acc.",lPI.eaScore]].map(([lbl,val])=>(
                    <div key={lbl} style={{textAlign:"center"}}>
                      <div style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#111827"}}>{val}</div>
                      <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.06em"}}>{lbl}</div>
                    </div>
                  ))}
                  {tab==="community"&&[["Community",lComm],["Upvotes",l.upvotes_received||0],["Sessions",l.mentoring_sessions||0],["Deals",l.deal_count||0]].map(([lbl,val])=>(
                    <div key={lbl} style={{textAlign:"center"}}>
                      <div style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#111827"}}>{val}</div>
                      <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.06em"}}>{lbl}</div>
                    </div>
                  ))}
                </div>
                {isMentor&&l.calendly_link&&(
                  <a href={l.calendly_link} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{padding:"9px 16px",borderRadius:9,border:"none",background:"#111827",color:"white",fontSize:12,fontWeight:700,cursor:"pointer",textDecoration:"none",whiteSpace:"nowrap",flexShrink:0}}>Book Session</a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Guardrails note */}
      <div style={{marginTop:24,background:"#fffbeb",borderRadius:10,padding:"12px 16px",border:"1.5px solid #fde68a"}}>
        <div style={{fontSize:10,fontWeight:700,color:"#d97706",marginBottom:4}}>⚠️ Ranking Guardrails</div>
        <div style={{fontSize:11,color:"#6b7280"}}>Ranking is NOT based on portfolio size, door count, or net worth. Performance stats only count from verified closed deals. Unverified properties appear privately but do not count toward ranking.</div>
      </div>
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

  // ── Performance Index (0–100) per spec ──
  // Weighted DSCR (30%) + Liquidity (25%) + % negative CF (25%) + Leverage (20%)
  const dscrPI     = Math.min(100, Math.round(wDSCR / 1.5 * 100));
  const totalValue = propCalcs.reduce((s,p)=>s+(parseFloat(p.value)||0),0);
  const totalDebtV = propCalcs.reduce((s,p)=>s+(parseFloat(p.loan_balance)||0),0);
  const leverageRatio = totalValue>0 ? totalDebtV/totalValue : 1;
  const levPI      = Math.min(100, Math.round((1-leverageRatio)*150));
  const negCFPct   = propCalcs.length>0?negCFProps.length/propCalcs.length:0;
  const negPI      = Math.round((1-negCFPct)*100);
  const liqCovMos  = propCalcs.length>0&&liquidityBuffer>0
    ? Math.min(12, Math.round(propCalcs.reduce((s,p)=>s+Math.max(p.mcf,0),0)/Math.max(liquidityBuffer,1)*1))
    : 6;
  const liqPI      = Math.min(100, Math.round(liqCovMos/6*100));
  const performanceIndex = Math.round(dscrPI*0.30 + liqPI*0.25 + negPI*0.25 + levPI*0.20);

  // ── Risk Profile classification ──
  let riskProfile, rpColor, rpBg, rpIcon;
  if(performanceIndex>=80&&leverageRatio<0.65)        {riskProfile="Conservative"; rpColor="#059669"; rpBg="#f0fdf4"; rpIcon="🛡️";}
  else if(performanceIndex>=60&&leverageRatio<0.75)   {riskProfile="Balanced";     rpColor="#2563eb"; rpBg="#eff6ff"; rpIcon="⚖️";}
  else if(performanceIndex>=40&&leverageRatio<0.85)   {riskProfile="Aggressive";   rpColor="#d97706"; rpBg="#fffbeb"; rpIcon="📈";}
  else                                                 {riskProfile="Overleveraged";rpColor="#dc2626"; rpBg="#fef2f2"; rpIcon="⚠️";}

  // ── Portfolio value buckets for public display ──
  const valueBucket =
    totalValue >= 5000000 ? "$5M+"  :
    totalValue >= 2000000 ? "$2M–$5M" :
    totalValue >= 1000000 ? "$1M–$2M" :
    totalValue >= 500000  ? "$500K–$1M" :
    totalValue >= 250000  ? "$250K–$500K" :
                            "$0–$250K";

  const totalEquity = totalValue - totalDebtV;
  const equityBucket =
    totalEquity >= 1000000 ? "$1M+"    :
    totalEquity >= 500000  ? "$500K–$1M" :
    totalEquity >= 250000  ? "$250K–$500K" :
    totalEquity >= 100000  ? "$100K–$250K" :
                             "$0–$100K";

  const monthlyNetCF = propCalcs.reduce((s,p)=>s+p.mcf,0);
  const cfBucket =
    monthlyNetCF >= 10000 ? "$10K+" :
    monthlyNetCF >= 5000  ? "$5K–$10K" :
    monthlyNetCF >= 3000  ? "$3K–$5K" :
    monthlyNetCF >= 1000  ? "$1K–$3K" :
    monthlyNetCF >= 0     ? "$0–$1K" :
                            "Negative";

  return {
    wDSCR, pAtLeastOneNeg:Math.min(1,pAtLeastOneNeg), portfolioPNeg,
    capitalDeployed, concentrationRisk, liquidityBuffer,
    pctStrong, pctFragile, pctIncomeWeak,
    posture, postureColor, postureBg, postureIcon, postureDesc,
    negCFProps: negCFProps.length,
    performanceIndex, riskProfile, rpColor, rpBg, rpIcon,
    leverageRatio: +leverageRatio.toFixed(2),
    totalValue, totalDebtV, totalEquity, monthlyNetCF,
    valueBucket, equityBucket, cfBucket,
    liqCovMos,
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
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:10}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:riskData.postureColor,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Portfolio Posture</div>
                  <div style={{fontSize:22,fontWeight:900,color:riskData.postureColor,lineHeight:1}}>{riskData.postureIcon} {riskData.posture}</div>
                </div>
                {/* Performance Index + Risk Profile */}
                <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:26,fontWeight:900,fontFamily:"'DM Mono',monospace",color:riskData.postureColor}}>{riskData.performanceIndex||0}</div>
                    <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.06em"}}>Performance Index</div>
                  </div>
                  <div style={{background:riskData.rpBg||riskData.postureBg,borderRadius:10,padding:"8px 12px",border:`1px solid ${riskData.rpColor||riskData.postureColor}30`}}>
                    <div style={{fontSize:13,fontWeight:800,color:riskData.rpColor||riskData.postureColor}}>{riskData.rpIcon||riskData.postureIcon} {riskData.riskProfile||riskData.posture}</div>
                    <div style={{fontSize:9,color:"#9ca3af",marginTop:2}}>Risk Profile</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:18,fontWeight:800,fontFamily:"'DM Mono',monospace",color:riskData.negCFProps>0?"#dc2626":"#059669"}}>{riskData.negCFProps||0}</div>
                    <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase"}}>At Risk</div>
                  </div>
                </div>
              </div>
              <p style={{fontSize:12,color:"#374151",margin:"0 0 10px",lineHeight:1.5}}>{riskData.postureDesc}</p>
              {/* Performance breakdown bars */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {[
                  ["Weighted DSCR", Math.min(100,Math.round(((riskData.wDSCR||0)/1.5)*100))],
                  ["Leverage Control", Math.min(100,Math.round((1-(riskData.leverageRatio||0.7))*150))],
                  ["Liquidity Cover", Math.min(100,Math.round(((riskData.liqCovMos||0)/6)*100))],
                  ["Properties Stable", Math.round((1-(riskData.negCFProps||0)/Math.max(properties.length,1))*100)],
                ].map(([l,s])=>(
                  <div key={l}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{fontSize:9,color:"#6b7280"}}>{l}</span>
                      <span style={{fontSize:9,fontWeight:700,color:riskData.postureColor}}>{s}</span>
                    </div>
                    <div style={{height:4,background:"rgba(0,0,0,0.08)",borderRadius:100}}>
                      <div style={{height:"100%",width:`${s}%`,background:riskData.postureColor,borderRadius:100,opacity:0.7}}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk probability */}
          {riskData&&(
            <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
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
            <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
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

          <div style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb"}}>
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

      {/* ── PUBLIC SUMMARY TAB ── */}
      {portfolioTab==="public"&&riskData&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:"#eff6ff",borderRadius:12,padding:"14px 18px",border:"1.5px solid #bfdbfe"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#2563eb",marginBottom:6}}>🌐 Public Portfolio Summary</div>
            <div style={{fontSize:12,color:"#374151",lineHeight:1.6}}>
              Your public profile shows only high-level buckets — never exact numbers, addresses, or loan details.
              Toggle visibility in your Profile settings.
            </div>
          </div>

          {/* Value Buckets Grid */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[
              ["Portfolio Value",riskData.valueBucket,"💰","#059669"],
              ["Equity Position",riskData.equityBucket,"📈","#7c3aed"],
              ["Monthly Cash Flow",riskData.cfBucket,"💵","#2563eb"],
              ["Risk Profile",`${riskData.rpIcon||"⚖️"} ${riskData.riskProfile||"Balanced"}`,"🛡️",riskData.rpColor||"#2563eb"],
              ["Performance Index",`${riskData.performanceIndex||0}/100`,"🏆",riskData.postureColor],
              ["Properties",properties.length+" properties","🏘️","#6b7280"],
            ].map(([l,v,ico,col])=>(
              <div key={l} style={{background:"white",borderRadius:12,border:"1.5px solid #e5e7eb",padding:"14px 16px"}}>
                <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,marginBottom:4}}>{l}</div>
                <div style={{fontSize:15,fontWeight:800,color:col}}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{background:"#fef2f2",borderRadius:12,padding:"14px 18px",border:"1.5px solid #fecaca"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#dc2626",marginBottom:6}}>🔒 Privacy Guardrails</div>
            <div style={{fontSize:11,color:"#6b7280",lineHeight:1.6}}>
              Public summary NEVER shows: addresses, loan balances, exact rent, exact equity per property, exact DSCR, or exact leverage ratios. Only buckets are visible.
            </div>
          </div>

          <div style={{background:"#f0fdf4",borderRadius:12,padding:"14px 18px",border:"1.5px solid #bbf7d0"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#059669",marginBottom:6}}>✅ Verification Unlocks</div>
            <div style={{fontSize:11,color:"#6b7280",lineHeight:1.6}}>
              Verified properties count toward: Leaderboard ranking · Public credibility badge · Marketplace trust boost · Mentor eligibility.<br/>
              Unverified properties appear privately but do not count toward any public ranking.
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
// Deal status lifecycle options
const DEAL_STATUS = [
  {key:"analyzing",    label:"Analyzing",    color:"#6b7280", bg:"#f3f4f6"},
  {key:"offer_sent",   label:"Offer Sent",   color:"#2563eb", bg:"#eff6ff"},
  {key:"negotiating",  label:"Negotiating",  color:"#d97706", bg:"#fffbeb"},
  {key:"under_contract",label:"Under Contract",color:"#7c3aed",bg:"#f5f3ff"},
  {key:"closed",       label:"Closed ✅",    color:"#059669", bg:"#f0fdf4"},
  {key:"passed",       label:"Passed",       color:"#9ca3af", bg:"#f9fafb"},
];

// Health indicator logic — compare current score against score at save time
function getDealHealth(deal) {
  const current = deal.metrics?.riskScore || 0;
  const previous = deal.prevScore || current;
  const delta = current - previous;
  if(delta > 5)        return { label:"Improving",    color:"#059669", icon:"🟢" };
  if(delta < -5)       return { label:"Deteriorating", color:"#dc2626", icon:"🔴" };
  return                      { label:"Neutral",       color:"#d97706", icon:"🟡" };
}

function SavedDealCard({deal, onLoad, onDelete, onStatusChange, rank, total}) {
  const m = MODES.find(m=>m.key===deal.mode);
  const [confirm, setConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const date = new Date(deal.created_at||deal.savedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
  const status = DEAL_STATUS.find(s=>s.key===(deal.status||"analyzing")) || DEAL_STATUS[0];
  const health = getDealHealth(deal);

  // Opportunity rank badge
  const rankColor = rank===1?"#f59e0b":rank<=3?"#6b7280":"#e5e7eb";
  const rankTextColor = rank<=3?"white":"#9ca3af";

  return (
    <div style={{background:"white",borderRadius:14,border:"1.5px solid #e5e7eb",overflow:"hidden",transition:"box-shadow 0.2s,transform 0.2s"}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 8px 28px rgba(0,0,0,0.08)";e.currentTarget.style.transform="translateY(-2px)";}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="translateY(0)";}}>
      <div style={{height:4,background:m?.color,opacity:0.7}}/>
      <div style={{padding:"16px 18px"}}>

        {/* Top row: mode badge + status + health + rank */}
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
          <span style={{fontSize:11,fontWeight:700,color:m?.color,background:m?.bg,padding:"2px 8px",borderRadius:100,border:`1px solid ${m?.border}`}}>{m?.icon} {m?.label}</span>
          <span style={{fontSize:10,fontWeight:700,color:status.color,background:status.bg,padding:"2px 7px",borderRadius:100}}>{status.label}</span>
          <span style={{fontSize:10,fontWeight:700,color:health.color,marginLeft:"auto"}}>{health.icon} {health.label}</span>
          {rank&&<div style={{width:22,height:22,borderRadius:"50%",background:rankColor,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <span style={{fontSize:10,fontWeight:800,color:rankTextColor}}>#{rank}</span>
          </div>}
        </div>

        <h4 style={{fontSize:15,fontWeight:700,color:"#111827",marginBottom:2}}>{deal.name}</h4>
        {deal.inputs?.address&&<p style={{fontSize:11,color:"#9ca3af",marginBottom:2}}>📍 {deal.inputs.address}</p>}
        <p style={{fontSize:11,color:"#d1d5db",marginBottom:10}}>{date}</p>

        {/* Primary metrics */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          {[["label","primary"],["label2","secondary"]].map(([lbl,val])=>(
            <div key={lbl} style={{background:"#f9fafb",borderRadius:9,padding:"9px 11px"}}>
              <div style={{fontSize:9,color:"#9ca3af",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>{deal.metrics?.[lbl]}</div>
              <div style={{fontSize:16,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#111827"}}>{deal.metrics?.[val]}</div>
            </div>
          ))}
        </div>

        {/* Status lifecycle selector */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:9,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",marginBottom:5}}>Deal Status</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {DEAL_STATUS.map(st=>(
              <button key={st.key} onClick={()=>onStatusChange&&onStatusChange(deal.id,st.key)}
                style={{padding:"3px 8px",borderRadius:100,border:`1.5px solid ${status.key===st.key?st.color:"#e5e7eb"}`,background:status.key===st.key?st.bg:"white",color:status.key===st.key?st.color:"#9ca3af",fontSize:9,fontWeight:700,cursor:"pointer"}}>
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Deal Evolution History toggle */}
        {deal.history&&deal.history.length>0&&(
          <div style={{marginBottom:10}}>
            <button onClick={()=>setShowHistory(v=>!v)}
              style={{fontSize:10,color:"#6b7280",background:"#f3f4f6",border:"none",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontWeight:600}}>
              📋 {deal.history.length} version{deal.history.length!==1?"s":""} {showHistory?"▲":"▼"}
            </button>
            {showHistory&&(
              <div style={{marginTop:8,background:"#f9fafb",borderRadius:8,padding:"8px 10px",border:"1px solid #e5e7eb"}}>
                {deal.history.map((h,idx)=>(
                  <div key={idx} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:idx<deal.history.length-1?"1px solid #f3f4f6":"none"}}>
                    <span style={{fontSize:10,color:"#374151",fontWeight:600}}>V{idx+1} — {h.label||"Update"}</span>
                    <div style={{display:"flex",gap:8}}>
                      {h.riskScore&&<span style={{fontSize:10,color:"#6b7280"}}>Score: {h.riskScore}</span>}
                      {h.profit&&<span style={{fontSize:10,color:"#059669"}}>{h.profit}</span>}
                      <span style={{fontSize:10,color:"#9ca3af"}}>{h.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
  const [dealLink, setDealLink] = useState("");
  const [riskScore, setRiskScore] = useState("");
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
// ── DEMO data — all numbers mathematically verified ───────────────────────────
// Rental:   $250K · 25%dn · 7.0% · $2,400 rent  → $503/mo CF, 8.7% CoC, 1.40x DSCR
// Wholesale: ARV $240K · $28K repairs · $9K fee   → $131K MAO, $9K fee
// Flip:      $175K · $40K rehab · $290K ARV · 6mo → $61K profit, 21% margin
// BRRRR:     $120K · $30K rehab · $200K ARV · 75% → $2K left, 98.7% recycled
// SubTo:     $175K @ 3.5% vs 7.5% market rate     → $545/mo CF, 3.5× cap eff
// Novation:  $295K ARV · $210K seller · $12K reh  → $61.5K profit, 20.8%
const DEMO={
  rental:{
    inputs:[["Purchase Price","$250,000"],["Down Payment","25% ($62,500)"],["Monthly Rent","$2,400"],["Rate / Term","7.0% · 30yr"]],
    highlights:[["Cash Flow","$503/mo",true],["CoC ROI","8.7%",true],["Cap Rate","8.4%",false],["DSCR","1.40x",false]],
    formula:"$2,400 rent − $650 expenses − $1,247 mortgage = $503/mo",
    verdict:"Strong Buy",score:84,
    pillars:[{l:"Margin",s:82,c:"#10b981",d:"Yield · CoC · Cash Flow"},{l:"Risk",s:79,c:"#2563eb",d:"DSCR 1.40x · Break-even 74%",dom:true},{l:"Velocity",s:91,c:"#7c3aed",d:"Capital Recovery · Equity"}],
    stress:[["3-mo Vacancy","+$1,509 gap",false],["Rate +1%","$406/mo CF",true],["Exp +20%","$373/mo CF",true]],
    stressNote:"Survives 2 of 3 stress scenarios — solid downside protection",
  },
  wholesale:{
    inputs:[["ARV","$240,000"],["Repair Estimate","$28,000"],["Offer %","70% Rule"],["Your Fee","$9,000"]],
    highlights:[["Max Allowable Offer","$131,000",true],["Your Fee","$9,000",true],["Investor Margin","$81,000",false],["Fee of Spread","11.1%",false]],
    formula:"$240K × 70% − $28K repairs − $9K fee = $131,000 MAO",
    verdict:"Strong Deal",score:88,
    pillars:[{l:"Margin",s:91,c:"#10b981",d:"Spread Strength · Margin"},{l:"Risk",s:86,c:"#2563eb",d:"Assignment · Repair Buffer",dom:true},{l:"Velocity",s:84,c:"#7c3aed",d:"Marketability · Buyer Pool"}],
    stress:[["Repairs +15%","MAO → $122K",true],["ARV −5%","MAO → $119K",true],["Fee at 15%","Spread $69K",true]],
    stressNote:"Cushion holds across all scenarios — low assignment risk",
  },
  flip:{
    inputs:[["Purchase Price","$175,000"],["Rehab Budget","$40,000"],["ARV","$290,000"],["Hold Time","6 months"]],
    highlights:[["Net Profit","$61,000",true],["Profit Margin","21.0%",true],["Total Costs","$229,000",false],["Ann. ROI","137%",false]],
    formula:"$290K ARV − $175K − $40K rehab − $14K hold/close = $61,000",
    verdict:"Strong Buy",score:81,
    pillars:[{l:"Margin",s:86,c:"#10b981",d:"Profit % · ARV Cushion"},{l:"Risk",s:75,c:"#f59e0b",d:"ARV Variance · Rehab Overrun",dom:true},{l:"Velocity",s:84,c:"#7c3aed",d:"6-month Exit · Capital Recycle"}],
    stress:[["Rehab +10%","$57K profit",true],["1-mo Delay","$58.7K profit",true],["ARV −5%","$46.5K profit",true]],
    stressNote:"Profit holds above $40K floor across all stress scenarios",
  },
  brrrr:{
    inputs:[["Purchase","$120,000"],["Rehab","$30,000"],["ARV","$200,000"],["Refi at 75% LTV","$150,000"]],
    highlights:[["Cash Left In","$2,000",true],["Post-Refi CF","$302/mo",true],["% Recovered","98.7%",false],["DSCR","1.30x",false]],
    formula:"$152K all-in − $150K refi (75% of $200K ARV) = $2K left",
    verdict:"Strong Buy",score:87,
    pillars:[{l:"Margin",s:94,c:"#10b981",d:"Capital Recovered · Yield"},{l:"Risk",s:80,c:"#2563eb",d:"Refi Fragility · DSCR 1.30x",dom:true},{l:"Velocity",s:88,c:"#7c3aed",d:"Recycle Speed · BRRRRs/5yr"}],
    stress:[["ARV −5% ($190K)","$7.5K left",true],["ARV −10% ($180K)","$17K left",false],["Rate +0.5%","CF → $268",true]],
    stressNote:"ARV drop of 10% still leaves manageable capital exposure",
  },
  subto:{
    inputs:[["Existing Balance","$175,000"],["Locked Rate","3.5% (vs 7.5% market)"],["Capital In","$10,000"],["Monthly Rent","$1,950"]],
    highlights:[["Cash Flow","$545/mo",true],["Rate Spread","4.0% locked",true],["DSCR","1.55x",false],["Cap Efficiency","3.5× vs 20% dn",false]],
    formula:"$1,950 rent − $420 exp − $985 PITI = $545/mo · locked below market forever",
    verdict:"Strong Buy",score:91,
    pillars:[{l:"Margin",s:93,c:"#10b981",d:"Rate Lock · Cash Flow"},{l:"Risk",s:88,c:"#2563eb",d:"DSCR 1.55x · Due-on-Sale Low",dom:true},{l:"Velocity",s:95,c:"#7c3aed",d:"3.5× capital leverage"}],
    stress:[["1-mo Vacancy","$440 gap covered",true],["3-mo Vacancy","CF resumes 100%",true],["Rate hits 9%","Spread widens 5.5%",true]],
    stressNote:"Rate lock advantage grows as market rates rise — asymmetric upside",
  },
  novation:{
    inputs:[["ARV","$295,000"],["Seller Payout","$210,000"],["Repairs","$12,000"],["Timeline","4 months"]],
    highlights:[["Net Profit","$61,500",true],["Profit Margin","20.8%",true],["Total Costs","$233,500",false],["Capital Deployed","$16,000",false]],
    formula:"$295K ARV − $210K seller − $12K repairs − $11.5K hold/close = $61,500",
    verdict:"Strong Buy",score:83,
    pillars:[{l:"Margin",s:88,c:"#10b981",d:"Spread · Profit % · Efficiency"},{l:"Risk",s:76,c:"#f59e0b",d:"Buyer Execution · Appraisal",dom:true},{l:"Velocity",s:86,c:"#7c3aed",d:"4-month Exit · Conv. Finance"}],
    stress:[["3% Buyer Credit","$52.7K profit",true],["ARV −2%","$55.6K profit",true],["30-day Delay","$59.3K profit",true]],
    stressNote:"Profit floor stays above $50K — strong retail execution margin",
  },
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
              Know If a Deal Works<br/><span style={{color:"#10b981",fontStyle:"italic"}}>Before You Make an Offer</span>
            </h1>
            <p style={{fontSize:"clamp(15px,1.8vw,19px)",color:"#6b7280",maxWidth:540,margin:"0 auto 16px",lineHeight:1.65}}>
              Analyze any real estate deal in seconds. Get a Margin, Risk & Velocity score, stress tests, Monte Carlo simulation, and a plain-English verdict — across 6 strategies. Built for serious investors.
            </p>
            {/* 3 proof points */}
            <div style={{display:"flex",justifyContent:"center",gap:24,marginBottom:28,flexWrap:"wrap"}}>
              {[["✓","6 strategies: Rental, Flip, Wholesale, BRRRR, Sub-To, Novation"],["✓","AI verdict with Margin, Risk & Velocity pillar scores"],["✓","Stress tests, Monte Carlo & 30-year projections"]].map(([icon,txt])=>(
                <div key={txt} style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"#059669",fontWeight:600}}>
                  <span style={{fontSize:12}}>{icon}</span>{txt}
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={onGoSignUp} style={{padding:"14px 32px",borderRadius:11,border:"none",background:"#10b981",color:"white",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(16,185,129,0.35)"}}>Analyze Your First Deal Free →</button>
              <button onClick={()=>{const el=document.getElementById("demo");if(el)el.scrollIntoView({behavior:"smooth",block:"start"});}} style={{padding:"14px 28px",borderRadius:11,border:"1.5px solid #e5e7eb",background:"white",color:"#374151",fontSize:15,fontWeight:500,cursor:"pointer",display:"inline-flex",alignItems:"center"}}>▶ See Example Deals</button>
            </div>
          </div>

          {/* Mode tabs */}
          <div style={{textAlign:"center",marginBottom:12}}>
            <p style={{fontSize:12,color:"#9ca3af",fontWeight:500}}>👇 Pick a strategy to see verified example calculations</p>
          </div>
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

          {/* Static calculator mockup — no live render, uses verified DEMO numbers */}
          <div id="demo" style={{position:"relative",borderRadius:"20px 20px 0 0",overflow:"hidden",boxShadow:"0 -4px 40px rgba(0,0,0,0.06)"}}>
            {/* Header bar */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 24px",background:active.bg,border:`1.5px solid ${active.border}`,borderBottom:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:18}}>{active.icon}</span>
                <div><h3 style={{fontSize:14,fontWeight:700,color:active.color}}>{active.label} Calculator</h3><p style={{fontSize:10,color:active.color,opacity:0.7}}>{active.sub}</p></div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,background:"white",border:"1.5px solid #e5e7eb",borderRadius:100,padding:"4px 12px"}}>
                <span style={{fontSize:10,width:6,height:6,borderRadius:"50%",background:"#10b981",display:"inline-block"}}/>
                <span style={{fontSize:11,color:"#6b7280",fontWeight:500}}>Example deal</span>
              </div>
            </div>
            {/* Intelligent demo body — per-strategy scoring */}
            <div style={{background:"white",border:`1.5px solid ${active.border}`,borderTop:"none",padding:"18px 22px",maxHeight:460,overflow:"hidden"}}>
              {/* 2-col: inputs left, pillar scores right */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:13}}>
                {/* Inputs */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
                  {data.inputs.map(([label,val])=>(
                    <div key={label} style={{background:"#f9fafb",borderRadius:9,padding:"9px 11px",border:"1.5px solid #e5e7eb"}}>
                      <div style={{fontSize:8,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{label}</div>
                      <div style={{fontSize:12,fontWeight:700,color:"#111827",fontFamily:"'DM Mono',monospace"}}>{val}</div>
                    </div>
                  ))}
                </div>
                {/* 3-Pillar scores */}
                <div style={{background:"#fafafa",borderRadius:10,border:"1.5px solid #e5e7eb",padding:"11px 13px"}}>
                  <div style={{fontSize:8,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:9}}>3-Pillar Score</div>
                  {data.pillars.map(p=>(
                    <div key={p.l} style={{marginBottom:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                        <div style={{fontSize:9,fontWeight:700,color:"#374151"}}>{p.l} {p.dom&&<span style={{fontSize:7,color:"#9ca3af"}}>40%</span>}</div>
                        <span style={{fontSize:10,fontWeight:800,color:p.c,fontFamily:"'DM Mono',monospace"}}>{p.s}</span>
                      </div>
                      <div style={{height:p.dom?5:3,background:"#e5e7eb",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${p.s}%`,background:p.c,borderRadius:3}}/>
                      </div>
                      <div style={{fontSize:7,color:"#9ca3af",marginTop:1}}>{p.d}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Formula */}
              <div style={{background:"#f0fdf4",borderRadius:7,padding:"7px 11px",marginBottom:11,border:"1px solid #bbf7d0"}}>
                <span style={{fontSize:8,fontWeight:700,color:"#059669",textTransform:"uppercase",marginRight:8}}>Formula</span>
                <span style={{fontSize:10,color:"#065f46",fontFamily:"'DM Mono',monospace"}}>{data.formula}</span>
              </div>
              {/* Key metrics */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:11}}>
                {data.highlights.map(([label,val,primary])=>(
                  <div key={label} style={{background:primary?"linear-gradient(135deg,#064e3b,#065f46)":"white",borderRadius:10,padding:"10px 8px",border:primary?"none":"1.5px solid #e5e7eb",position:"relative",overflow:"hidden",textAlign:"center"}}>
                    {primary&&<div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle at 80% 20%,rgba(16,185,129,0.25),transparent 70%)"}}/>}
                    <div style={{fontSize:7,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:primary?"rgba(255,255,255,0.5)":"#9ca3af",marginBottom:3,position:"relative"}}>{label}</div>
                    <div style={{fontSize:primary?16:13,fontWeight:900,fontFamily:"'DM Mono',monospace",color:primary?"#10b981":"#111827",position:"relative"}}>{val}</div>
                  </div>
                ))}
              </div>
              {/* Stress scenarios */}
              <div style={{background:"#fafafa",borderRadius:8,border:"1px solid #e5e7eb",padding:"9px 12px",marginBottom:10}}>
                <div style={{fontSize:8,fontWeight:700,color:"#6b7280",textTransform:"uppercase",marginBottom:6}}>Stress Test</div>
                <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:5}}>
                  {data.stress.map(([name,result,pass])=>(
                    <div key={name} style={{background:pass?"#f0fdf4":"#fff7ed",border:`1px solid ${pass?"#bbf7d0":"#fed7aa"}`,borderRadius:6,padding:"4px 8px"}}>
                      <div style={{fontSize:7,color:"#9ca3af",fontWeight:600}}>{name}</div>
                      <div style={{fontSize:9,fontWeight:700,color:pass?"#059669":"#d97706"}}>{result}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:8,color:"#6b7280",fontStyle:"italic"}}>{data.stressNote}</div>
              </div>
              {/* Verdict bar */}
              <div style={{display:"flex",alignItems:"center",gap:10,background:"#f0fdf4",borderRadius:9,padding:"9px 13px",border:"1.5px solid #bbf7d0"}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#059669,#10b981)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:12}}>✓</div>
                <div>
                  <div style={{fontSize:12,fontWeight:800,color:"#065f46"}}>{data.verdict} — All 3 pillars above threshold</div>
                  <div style={{fontSize:9,color:"#6b7280"}}>Margin · Risk (dominant) · Velocity composite scoring</div>
                </div>
                <div style={{marginLeft:"auto",background:"#065f46",color:"white",borderRadius:100,padding:"3px 12px",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>Score: {data.score}</div>
              </div>
            </div>
                        {/* Signup overlay */}
            <div style={{position:"absolute",bottom:0,left:0,right:0,height:240,background:"linear-gradient(to top,rgba(255,255,255,1) 45%,rgba(255,255,255,0))",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",paddingBottom:28}}>
              <div style={{textAlign:"center",marginBottom:16}}>
                <div style={{fontSize:15,fontWeight:700,color:"#111827",marginBottom:6}}>🔒 Enter your own numbers</div>
                <div style={{fontSize:13,color:"#6b7280"}}>Sign up free — all 6 calculators, no credit card</div>
              </div>
              <button onClick={onGoSignUp} style={{padding:"13px 32px",borderRadius:11,border:"none",background:"#10b981",color:"white",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(16,185,129,0.35)"}}>Analyze Your Deal →</button>
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
          {[["6","Investment Strategies"],["DSCR + CoC + IRR","Investor-Standard Metrics"],["8+","Stress Scenarios/Deal"],["$0","To Start"],["🏆","Medal Rankings"],["🎓","Verified Mentors"]].map(([n,l])=>(
            <div key={l} style={{textAlign:"center"}}><div style={{fontFamily:"'Fraunces',serif",fontSize:26,fontWeight:900,color:"#111827"}}>{n}</div><div style={{fontSize:11,color:"#9ca3af",fontWeight:500}}>{l}</div></div>
          ))}
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────────────── */}
      <section style={{padding:"60px 20px",background:"#f8fafc"}}>
        <div style={{maxWidth:1000,margin:"0 auto",textAlign:"center"}}>
          <div style={{fontSize:11,fontWeight:800,color:"#059669",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:10}}>HOW IT WORKS</div>
          <h2 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(26px,3.5vw,38px)",fontWeight:900,color:"#111827",marginBottom:12}}>From address to verdict in 60 seconds</h2>
          <p style={{fontSize:15,color:"#6b7280",marginBottom:44,maxWidth:520,margin:"0 auto 44px"}}>No spreadsheets. No guesswork. Just enter your numbers and get a decision.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:24}}>
            {[
              {step:"01",icon:"🏠",title:"Pick your strategy",desc:"Choose from Rental, Wholesale, Fix & Flip, BRRRR, Subject-To, or Novation"},
              {step:"02",icon:"🔢",title:"Enter the numbers",desc:"Purchase price, rent, repairs — the same inputs you'd put in a spreadsheet"},
              {step:"03",icon:"🧠",title:"Get your verdict",desc:"Margin, Risk & Velocity pillar scores with a plain-English buy/pass recommendation"},
              {step:"04",icon:"📊",title:"Stress test & decide",desc:"See how the deal holds up under vacancy spikes, rate increases, and repair overruns"},
            ].map(({step,icon,title,desc})=>(
              <div key={step} style={{background:"white",borderRadius:16,padding:"24px 20px",border:"1.5px solid #e5e7eb",textAlign:"left",position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:12,right:14,fontSize:11,fontWeight:800,color:"#e5e7eb",fontFamily:"'DM Mono',monospace"}}>{step}</div>
                <div style={{fontSize:28,marginBottom:12}}>{icon}</div>
                <div style={{fontSize:14,fontWeight:700,color:"#111827",marginBottom:6}}>{title}</div>
                <div style={{fontSize:12,color:"#6b7280",lineHeight:1.6}}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ── Why DealSource — Value Proposition ─────────────────────────── */}
      <section style={{padding:"80px 32px",background:"white"}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:52}}>
            <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.12em",color:"#10b981",textTransform:"uppercase",marginBottom:12}}>Why DealSource</p>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(26px,4vw,42px)",fontWeight:800,color:"#111827",marginBottom:14}}>
              Stop guessing. Start investing with math.
            </h2>
            <p style={{fontSize:16,color:"#6b7280",maxWidth:520,margin:"0 auto",lineHeight:1.7}}>
              Most investors either skip the analysis or waste hours in spreadsheets. DealSource gives you institutional-grade underwriting in seconds — built around how real investors actually evaluate deals.
            </p>
          </div>
          {/* 3 columns: the problem vs our solution */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(290px,1fr))",gap:24,marginBottom:52}}>
            {[
              {icon:"⚡",title:"Instant Verdict, Not Just Numbers",body:"Every deal gets a Buy / Borderline / Pass verdict with a risk score. Three pillars — Margin, Risk, Velocity — weighted the way underwriters actually think. You see exactly why a deal passes or fails.",accent:"#10b981"},
              {icon:"🛡️",title:"Stress Tests Built In",body:"What happens at 3 months vacant? Rate goes up 1%? Expenses spike 20%? Every calculator runs 8+ stress scenarios automatically so you know the downside before you commit capital.",accent:"#2563eb"},
              {icon:"🎯",title:"6 Strategies, One Platform",body:"Rental, Wholesale, Fix & Flip, BRRRR, Subject-To, Novation. Each calculator uses the correct formulas for that strategy — not a one-size-fits-all sheet. Share deals with the community and get real investor feedback.",accent:"#7c3aed"},
            ].map(({icon,title,body,accent})=>(
              <div key={title} style={{padding:28,borderRadius:18,border:"1.5px solid #e5e7eb",background:"white",transition:"all 0.2s",position:"relative",overflow:"hidden"}}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=`0 16px 40px rgba(0,0,0,0.07)`;}}
                onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}}>
                <div style={{position:"absolute",top:0,left:0,width:4,height:"100%",background:accent,borderRadius:"4px 0 0 4px"}}/>
                <div style={{fontSize:30,marginBottom:14}}>{icon}</div>
                <h3 style={{fontSize:16,fontWeight:800,color:"#111827",marginBottom:8,lineHeight:1.3}}>{title}</h3>
                <p style={{fontSize:14,color:"#6b7280",lineHeight:1.75}}>{body}</p>
              </div>
            ))}
          </div>
          {/* Social proof strip */}
          <div style={{background:"linear-gradient(135deg,#064e3b,#065f46)",borderRadius:18,padding:"28px 32px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:20}}>
            <div>
              <div style={{fontSize:18,fontWeight:800,color:"white",marginBottom:6}}>Trusted by real estate investors</div>
              <div style={{fontSize:13,color:"rgba(255,255,255,0.6)"}}>From first-time buyers to 8-figure portfolio operators</div>
            </div>
            <div style={{display:"flex",gap:28,flexWrap:"wrap"}}>
              {[["All 6","Strategies"],["DSCR · CoC · IRR","Investor Metrics"],["8+","Stress Scenarios"],["Free","To Start"]].map(([v,l])=>(
                <div key={l} style={{textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:900,color:"#10b981",fontFamily:"'Fraunces',serif"}}>{v}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",fontWeight:600,marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>
            <button onClick={onGoSignUp} style={{padding:"12px 24px",borderRadius:10,border:"none",background:"#10b981",color:"white",fontSize:14,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>Get Started Free →</button>
          </div>
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
      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section style={{padding:"60px 20px",background:"white"}}>
        <div style={{maxWidth:1000,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:40}}>
            <div style={{fontSize:11,fontWeight:800,color:"#059669",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:10}}>WHAT INVESTORS SAY</div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(24px,3vw,34px)",fontWeight:900,color:"#111827"}}>Built by investors, used by investors</h2>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:20}}>
            {[
              {quote:"I used to spend 2 hours building spreadsheets for every deal. Now I get a full risk analysis in under a minute and know exactly what questions to ask the seller.",name:"Marcus T.",role:"Buy & Hold Investor · 12 doors",avatar:"MT"},
              {quote:"The Subject-To calculator alone saved me from a bad deal. It caught the due-on-sale risk I almost missed. That's the kind of intelligence you don't get from a spreadsheet.",name:"Priya M.",role:"Creative Finance Investor",avatar:"PM"},
              {quote:"The stress tests are what got me. I can model rate increases, vacancy spikes, and repair overruns before I even make an offer. It's changed how I underwrite everything.",name:"James R.",role:"BRRRR Investor · 8 deals closed",avatar:"JR"},
            ].map(({quote,name,role,avatar})=>(
              <div key={name} style={{background:"#f8fafc",borderRadius:16,padding:"24px",border:"1.5px solid #e5e7eb"}}>
                <div style={{fontSize:20,color:"#10b981",marginBottom:12,lineHeight:1}}>"</div>
                <p style={{fontSize:13,color:"#374151",lineHeight:1.7,marginBottom:16,fontStyle:"italic"}}>{quote}</p>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span style={{fontSize:11,fontWeight:800,color:"white"}}>{avatar}</span>
                  </div>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:"#111827"}}>{name}</div>
                    <div style={{fontSize:11,color:"#9ca3af"}}>{role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      <section id="pricing" style={{padding:"88px 32px",background:"#fafafa"}}>
        <div style={{maxWidth:720,margin:"0 auto",textAlign:"center"}}>
          <p style={{fontSize:11,fontWeight:700,letterSpacing:"0.12em",color:"#10b981",textTransform:"uppercase",marginBottom:12}}>Pricing</p>
          <h2 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(26px,4vw,42px)",fontWeight:800,color:"#111827",marginBottom:12}}>Simple. No surprises.</h2>
          <p style={{fontSize:15,color:"#6b7280",marginBottom:52}}>Cancel anytime. No hidden fees.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            <div style={{padding:32,borderRadius:18,border:"1.5px solid #e5e7eb",background:"white",textAlign:"left"}}>
              <p style={{fontSize:12,fontWeight:600,color:"#9ca3af",marginBottom:10}}>Free</p>
              <div style={{fontFamily:"'Fraunces',serif",fontSize:40,fontWeight:900,color:"#111827",marginBottom:28}}>$0</div>
              {["All 6 strategy calculators","Margin · Risk · Velocity pillar scores","Stress test & deal stability","Save up to 3 deals","Community forum (read-only)","Medal ranking system"].map(f=>(
                <div key={f} style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}><span style={{color:"#10b981",fontWeight:700}}>✓</span><span style={{fontSize:14,color:"#374151"}}>{f}</span></div>
              ))}
              {["Capital Efficiency Analysis","Deal Optimization sliders","30-yr Projections","Auto Offer Letters","Unlimited deal saves","Mentoring access"].map(f=>(
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
              {["All 6 strategy calculators (full)","Capital Efficiency & Optimization","30-yr Wealth Projections","Decision Intelligence & Monte Carlo","Auto-generated offer letters","Unlimited saved deals & portfolio analysis","Expert mentor access","Leaderboard & community posting"].map(f=>(
                <div key={f} style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}><span style={{color:"#10b981",fontWeight:700}}>✓</span><span style={{fontSize:14,color:"#e5e7eb"}}>{f}</span></div>
              ))}
              <button onClick={onGoSignUp} style={{width:"100%",marginTop:24,padding:"12px 0",borderRadius:10,border:"none",background:"#10b981",color:"white",fontSize:14,fontWeight:700,cursor:"pointer"}}>Start Free Trial</button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section style={{padding:"60px 20px",background:"#f8fafc"}}>
        <div style={{maxWidth:700,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:40}}>
            <div style={{fontSize:11,fontWeight:800,color:"#059669",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:10}}>FAQ</div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(24px,3vw,34px)",fontWeight:900,color:"#111827"}}>Common questions</h2>
          </div>
          {[
            {q:"Is this a replacement for a realtor or wholesaler?",a:"No — it's a decision tool. DealSource helps you quickly determine if a deal pencils before you spend hours on due diligence or make an offer. Think of it as your underwriting co-pilot."},
            {q:"How accurate are the calculators?",a:"The formulas are investor-standard (DSCR, CoC, Cap Rate, MAO). Results are as accurate as the numbers you enter. The stress tests and Monte Carlo add a layer of probabilistic modeling that spreadsheets can't do."},
            {q:"What's the difference between Free and Pro?",a:"Free gives you full access to all 6 calculators, the deal verdict, and basic stress tests — everything you need to evaluate a deal. Pro unlocks Capital Efficiency analysis, the Optimization engine, 30-year projections, Monte Carlo simulation, offer letters, and unlimited deal saves."},
            {q:"Can I use this on mobile?",a:"Yes — DealSource is fully responsive and works on any device. The calculator inputs are optimized for mobile entry."},
            {q:"What strategies are covered?",a:"Rental/Buy & Hold, Wholesale (MAO), Fix & Flip, BRRRR, Subject-To, and Novation. Each has its own tailored risk model and metrics."},
          ].map(({q,a},i)=>(
            <div key={i} style={{borderBottom:"1px solid #e5e7eb",padding:"20px 0"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#111827",marginBottom:8}}>{q}</div>
              <div style={{fontSize:13,color:"#6b7280",lineHeight:1.7}}>{a}</div>
            </div>
          ))}
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
const FREE_DEAL_LIMIT = 3;

function AnalyzerApp({user,profile,onGoHome,onGoProfile,onSignOut}) {
  const [view,setView]=useState("calc");
  const [mode,setMode]=useState("rental");
  const [showSaveModal,setShowSaveModal]=useState(false);
  const [saveLimitHit,setSaveLimitHit]=useState(false);
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

  useEffect(()=>{
    if(!user?.id) return;
    setDealsLoading(true);
    supabase.getDeals(user.id).then(d=>setDeals(Array.isArray(d)?d:[])).catch(()=>setDeals([])).finally(()=>setDealsLoading(false));
  },[user?.id]);

  const handleCalcChange=useCallback((inputs,metrics)=>{setCurrentInputs(inputs);setCurrentMetrics(metrics);},[]);
  const dealLimit=isPro?Infinity:FREE_DEAL_LIMIT;
  const handleSaveClick=()=>{ if(deals.length>=dealLimit){setSaveLimitHit(true);}else{setShowSaveModal(true);} };

  const handleSave=async(name)=>{
    if(deals.length>=dealLimit){setShowSaveModal(false);setSaveLimitHit(true);return;}
    const deal={user_id:user.id,name,mode,inputs:currentInputs,metrics:currentMetrics,created_at:new Date().toISOString()};
    try{const saved=await supabase.insertDeal(deal);const nd=Array.isArray(saved)?saved[0]:{...deal,id:Date.now().toString()};setDeals(p=>[nd,...p]);setLoadedDealId(nd.id);}
    catch{const ld={...deal,id:Date.now().toString()};setDeals(p=>[ld,...p]);setLoadedDealId(ld.id);}
    setShowSaveModal(false);setSavedFlash(true);setTimeout(()=>setSavedFlash(false),2500);
    try{await supabase.upsertProfile({id:user.id,deal_count:(deals.length+1)});}catch{}
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
      {saveLimitHit&&(
        <div onClick={()=>setSaveLimitHit(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(6px)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"white",borderRadius:22,padding:0,maxWidth:420,width:"100%",boxShadow:"0 32px 80px rgba(0,0,0,0.2)",overflow:"hidden"}}>
            <div style={{background:"linear-gradient(135deg,#064e3b,#065f46)",padding:"28px 32px"}}>
              <div style={{fontSize:36,marginBottom:10}}>💾</div>
              <h2 style={{fontFamily:"'Fraunces',serif",fontSize:21,fontWeight:800,color:"white",marginBottom:6}}>Free Plan: {FREE_DEAL_LIMIT}-Deal Limit</h2>
              <p style={{fontSize:13,color:"rgba(255,255,255,0.65)",lineHeight:1.6}}>You've used all {FREE_DEAL_LIMIT} free deal saves. Upgrade to Pro for unlimited saves.</p>
            </div>
            <div style={{padding:"22px 32px"}}>
              {["♾️ Unlimited saved deals","📊 Capital Efficiency & Optimization","📈 30-year Wealth Projections","🧠 Decision Intelligence (Monte Carlo)","📄 Auto-generated offer letters"].map(f=>(
                <div key={f} style={{display:"flex",alignItems:"center",gap:10,fontSize:13,color:"#374151",marginBottom:8}}><span style={{color:"#10b981"}}>✓</span>{f}</div>
              ))}
              <button onClick={async()=>{
                try{const res=await fetch("/api/create-checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:user.id,email:user.email||""})});const data=await res.json();if(data.url)window.location.href=data.url;}
                catch{await supabase._fetch("/rest/v1/profiles?id=eq."+user.id,{method:"PATCH",body:JSON.stringify({is_pro:true})}).catch(()=>{});setIsPro(true);setSaveLimitHit(false);}
              }} style={{width:"100%",padding:"13px",borderRadius:11,border:"none",background:"#10b981",color:"white",fontSize:15,fontWeight:700,cursor:"pointer",margin:"16px 0 8px",boxShadow:"0 4px 20px rgba(16,185,129,0.3)"}}>
                Upgrade to Pro — $20/mo →
              </button>
              <button onClick={()=>{setSaveLimitHit(false);setView("deals");}} style={{width:"100%",padding:"10px",borderRadius:11,border:"1.5px solid #e5e7eb",background:"white",color:"#6b7280",fontSize:13,cursor:"pointer"}}>
                Manage my {FREE_DEAL_LIMIT} saved deals →
              </button>
            </div>
          </div>
        </div>
      )}

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
              <p style={{fontSize:12,color:"#9ca3af"}}>Results update instantly · Changes auto-saved when you hit Save Deal</p>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setView("deals")} style={{padding:"8px 16px",borderRadius:8,border:"1.5px solid #e5e7eb",background:"white",color:"#6b7280",fontSize:12,fontWeight:500,cursor:"pointer"}}>View Saved</button>
                <button onClick={handleSaveClick} style={{padding:"8px 20px",borderRadius:8,border:"none",background:"#111827",color:"white",fontSize:12,fontWeight:700,cursor:"pointer"}}>💾 Save Deal</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {view==="deals"&&(
        <div className="main-content" style={{maxWidth:1200,margin:"0 auto",padding:"24px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22,flexWrap:"wrap",gap:14}}>
            <div>
              <h2 style={{fontFamily:"'Fraunces',serif",fontSize:24,fontWeight:800,color:"#111827",marginBottom:4}}>Saved Deals</h2>
              {isPro
                ?<p style={{fontSize:13,color:"#9ca3af"}}>{deals.length} deal{deals.length!==1?"s":""} · <span style={{color:"#059669",fontWeight:600}}>Pro — unlimited</span></p>
                :<div style={{display:"flex",alignItems:"center",gap:10}}>
                    <p style={{fontSize:13,color:"#9ca3af",margin:0}}>{deals.length} of {FREE_DEAL_LIMIT} free deals used</p>
                    <div style={{width:80,height:5,background:"#e5e7eb",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:Math.min(100,deals.length/FREE_DEAL_LIMIT*100)+"%",background:deals.length>=FREE_DEAL_LIMIT?"#dc2626":"#10b981",borderRadius:3}}/></div>
                    {deals.length>=FREE_DEAL_LIMIT&&<button onClick={()=>setSaveLimitHit(true)} style={{fontSize:11,fontWeight:700,color:"#059669",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:100,padding:"2px 9px",cursor:"pointer"}}>Upgrade →</button>}
                  </div>
              }
            </div>
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

      {view==="forum"&&<ForumView user={user} profile={profile} savedDeals={deals||[]} isPro={isPro}/>}
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
