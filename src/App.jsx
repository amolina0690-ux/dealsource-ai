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
    <div style={{minHeight:"100vh",display:"grid",gridTemplateColumns:"1fr 1fr",background:"#fff"}}>
      <div style={{background:"linear-gradient(160deg,#064e3b 0%,#065f46 40%,#047857 100%)",display:"flex",flexDirection:"column",justifyContent:"space-between",padding:48,position:"relative",overflow:"hidden"}}>
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
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"48px 56px",overflowY:"auto"}}>
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
  return <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #f3f4f6"}}><span style={{fontSize:12,color:"#6b7280"}}>{label}</span><span style={{fontSize:highlight?14:13,fontWeight:highlight?700:500,fontFamily:"'DM Mono',monospace",color}}>{value}</span></div>;
}
function BigResult({label,value,positive,negative}) {
  const bg=positive?"#f0fdf4":negative?"#fef2f2":"#f9fafb";
  const border=positive?"#bbf7d0":negative?"#fecaca":"#e5e7eb";
  const color=positive?"#059669":negative?"#dc2626":"#374151";
  return <div style={{textAlign:"center",padding:"18px 14px",background:bg,borderRadius:12,border:`1.5px solid ${border}`}}><div style={{fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"#9ca3af",marginBottom:8}}>{label}</div><div style={{fontSize:24,fontWeight:800,fontFamily:"'DM Mono',monospace",color}}>{value}</div></div>;
}
function AddressBar({value,onChange}) {
  return <div style={{marginBottom:18}}><div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:10}}><span style={{fontSize:16}}>📍</span><input type="text" value={value} onChange={e=>onChange(e.target.value)} placeholder="Enter property address (optional)..." style={{flex:1,background:"transparent",border:"none",outline:"none",fontSize:13,color:"#111827",fontFamily:"'DM Sans',sans-serif"}}/></div></div>;
}

// ─── Calculators ───────────────────────────────────────────────────────────────
function RentalCalc({saved,onCalcChange}) {
  const [addr,setAddr]=useState(saved?.address||"");
  const [i,setI]=useState(saved||{pp:320000,down:20,cc:8500,rehab:0,rent:2800,expenses:750,pmt:1420});
  const s=k=>v=>setI(p=>({...p,[k]:v}));
  const c=useMemo(()=>{const da=+i.pp*+i.down/100,ti=da+ +i.cc+ +i.rehab,noi=(+i.rent-+i.expenses)*12,mcf=+i.rent-+i.expenses-+i.pmt,acf=mcf*12;return{da,ti,noi,mcf,acf,cap:+i.pp>0?noi/+i.pp:0,coc:ti>0?acf/ti:0};},[i]);
  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.mcf),secondary:fmtP(c.coc),label:"Mo. Cash Flow",label2:"CoC ROI"}),[i,c,addr]);
  return (<><AddressBar value={addr} onChange={setAddr}/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:28}}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Divider label="Purchase"/><Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000}/><Field label="Down Payment" value={i.down} onChange={s("down")} suffix="%" step={0.5}/><Field label="Closing Costs" value={i.cc} onChange={s("cc")} prefix="$" step={500}/><Field label="Rehab Costs" value={i.rehab} onChange={s("rehab")} prefix="$" step={1000}/>
        <Divider label="Monthly"/><Field label="Monthly Rent" value={i.rent} onChange={s("rent")} prefix="$" step={50}/><Field label="Monthly Expenses" value={i.expenses} onChange={s("expenses")} prefix="$" step={50}/><Field label="Mortgage Payment" value={i.pmt} onChange={s("pmt")} prefix="$" step={25}/>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><BigResult label="Monthly Cash Flow" value={fmtD(c.mcf)} positive={c.mcf>=0} negative={c.mcf<0}/><BigResult label="Cash-on-Cash ROI" value={fmtP(c.coc)} positive={c.coc>=0.08} negative={c.coc<0}/></div>
        <div style={{background:"#f9fafb",borderRadius:12,padding:"2px 16px"}}><OutRow label="Annual Cash Flow" value={fmtD(c.acf)} positive={c.acf>=0} negative={c.acf<0}/><OutRow label="Cap Rate" value={fmtP(c.cap)}/><OutRow label="NOI" value={fmtD(c.noi)}/><OutRow label="Total Investment" value={fmtD(c.ti)} highlight/></div>
      </div>
    </div></>);
}
function WholesaleCalc({saved,onCalcChange}) {
  const [addr,setAddr]=useState(saved?.address||"");
  const [i,setI]=useState(saved||{arv:240000,repairs:28000,pct:70,fee:9000});
  const s=k=>v=>setI(p=>({...p,[k]:v}));
  const mao=useMemo(()=>+i.arv*+i.pct/100-+i.repairs-+i.fee,[i]);
  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(mao),secondary:fmtD(+i.fee),label:"MAO",label2:"Your Fee"}),[i,mao,addr]);
  return (<><AddressBar value={addr} onChange={setAddr}/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:28}}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}><Divider label="Deal Details"/><Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/><Field label="Estimated Repairs" value={i.repairs} onChange={s("repairs")} prefix="$" step={1000}/><Field label="Max Offer %" value={i.pct} onChange={s("pct")} suffix="%" step={1}/><Field label="Wholesale Fee" value={i.fee} onChange={s("fee")} prefix="$" step={500}/></div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><BigResult label="Max Allowable Offer" value={fmtD(mao)} positive={mao>0} negative={mao<=0}/><BigResult label="Your Fee" value={fmtD(+i.fee)} positive/></div>
        <div style={{background:"#f9fafb",borderRadius:12,padding:"2px 16px"}}><OutRow label="ARV" value={fmtD(+i.arv)}/><OutRow label={`ARV × ${i.pct}%`} value={fmtD(+i.arv*+i.pct/100)}/><OutRow label="Minus Repairs" value={`−${fmtD(+i.repairs)}`}/><OutRow label="Minus Fee" value={`−${fmtD(+i.fee)}`}/><OutRow label="MAO" value={fmtD(mao)} positive={mao>0} negative={mao<=0} highlight/></div>
      </div>
    </div></>);
}
function FlipCalc({saved,onCalcChange}) {
  const [addr,setAddr]=useState(saved?.address||"");
  const [i,setI]=useState(saved||{pp:165000,rehab:38000,arv:275000,agent:6,closing:5000,holding:4500,misc:2000});
  const s=k=>v=>setI(p=>({...p,[k]:v}));
  const c=useMemo(()=>{const aa=+i.arv*+i.agent/100,tc=+i.pp+ +i.rehab+aa+ +i.closing+ +i.holding+ +i.misc;return{aa,tc,profit:+i.arv-tc,roi:tc>0?(+i.arv-tc)/tc:0};},[i]);
  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.profit),secondary:fmtP(c.roi),label:"Net Profit",label2:"ROI"}),[i,c,addr]);
  return (<><AddressBar value={addr} onChange={setAddr}/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:28}}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}><Divider label="Acquisition"/><Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000}/><Field label="Rehab Costs" value={i.rehab} onChange={s("rehab")} prefix="$" step={1000}/><Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/><Divider label="Selling Costs"/><Field label="Agent Fees" value={i.agent} onChange={s("agent")} suffix="%" step={0.5}/><Field label="Closing Costs" value={i.closing} onChange={s("closing")} prefix="$" step={500}/><Field label="Holding Costs" value={i.holding} onChange={s("holding")} prefix="$" step={500}/><Field label="Misc" value={i.misc} onChange={s("misc")} prefix="$" step={500}/></div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><BigResult label="Net Profit" value={fmtD(c.profit)} positive={c.profit>0} negative={c.profit<=0}/><BigResult label="ROI" value={fmtP(c.roi)} positive={c.roi>0.15} negative={c.roi<=0}/></div>
        <div style={{background:"#f9fafb",borderRadius:12,padding:"2px 16px"}}><OutRow label="Purchase + Rehab" value={fmtD(+i.pp+ +i.rehab)}/><OutRow label="Agent Fees" value={fmtD(c.aa)}/><OutRow label="Other Costs" value={fmtD(+i.closing+ +i.holding+ +i.misc)}/><OutRow label="Net Profit" value={fmtD(c.profit)} positive={c.profit>0} negative={c.profit<=0} highlight/></div>
      </div>
    </div></>);
}
function BRRRRCalc({saved,onCalcChange}) {
  const [addr,setAddr]=useState(saved?.address||"");
  const [i,setI]=useState(saved||{pp:110000,rehab:45000,arv:210000,refPct:75,rent:1750,expenses:780});
  const s=k=>v=>setI(p=>({...p,[k]:v}));
  const c=useMemo(()=>{const ti=+i.pp+ +i.rehab,ra=+i.arv*+i.refPct/100,co=ra-ti,mcf=+i.rent-+i.expenses;return{ti,ra,co,mcf,acf:mcf*12,roi:ti>0?(mcf*12)/ti:0};},[i]);
  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.co),secondary:fmtD(c.mcf),label:"Cash Out",label2:"Mo. Cash Flow"}),[i,c,addr]);
  return (<><AddressBar value={addr} onChange={setAddr}/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:28}}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}><Divider label="Acquisition"/><Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000}/><Field label="Rehab Costs" value={i.rehab} onChange={s("rehab")} prefix="$" step={1000}/><Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/><Field label="Refinance %" value={i.refPct} onChange={s("refPct")} suffix="%" step={1}/><Divider label="Rental"/><Field label="Monthly Rent" value={i.rent} onChange={s("rent")} prefix="$" step={50}/><Field label="Monthly Expenses" value={i.expenses} onChange={s("expenses")} prefix="$" step={50}/></div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><BigResult label="Cash Out at Refi" value={fmtD(c.co)} positive={c.co>=0} negative={c.co<0}/><BigResult label="Monthly Cash Flow" value={fmtD(c.mcf)} positive={c.mcf>=0} negative={c.mcf<0}/></div>
        <div style={{background:"#f9fafb",borderRadius:12,padding:"2px 16px"}}><OutRow label="Total Invested" value={fmtD(c.ti)}/><OutRow label="Refi Amount" value={fmtD(c.ra)}/><OutRow label="Annual Cash Flow" value={fmtD(c.acf)}/><OutRow label="Annual ROI" value={fmtP(c.roi)} positive={c.roi>0.08} highlight/></div>
      </div>
    </div></>);
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

function SubToCalc({saved,onCalcChange,profile}) {
  const [addr,setAddr]=useState(saved?.address||"");
  const [i,setI]=useState(saved||{balance:175000,dp:8000,cc:2500,pmt:1050,rent:1700,expenses:350});
  const s=k=>v=>setI(p=>({...p,[k]:v}));
  const c=useMemo(()=>{const ti=+i.dp+ +i.cc,mcf=+i.rent-+i.pmt-+i.expenses,acf=mcf*12;return{ti,mcf,acf,roi:ti>0?acf/ti:0};},[i]);
  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.mcf),secondary:fmtP(c.roi),label:"Mo. Cash Flow",label2:"ROI"}),[i,c,addr]);
  return (<><AddressBar value={addr} onChange={setAddr}/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:28}}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}><Divider label="Existing Loan"/><Field label="Loan Balance" value={i.balance} onChange={s("balance")} prefix="$" step={5000}/><Field label="Monthly Mortgage" value={i.pmt} onChange={s("pmt")} prefix="$" step={25}/><Divider label="Your Investment"/><Field label="Down to Seller" value={i.dp} onChange={s("dp")} prefix="$" step={1000}/><Field label="Closing Costs" value={i.cc} onChange={s("cc")} prefix="$" step={500}/><Divider label="Income"/><Field label="Monthly Rent" value={i.rent} onChange={s("rent")} prefix="$" step={50}/><Field label="Monthly Expenses" value={i.expenses} onChange={s("expenses")} prefix="$" step={50}/></div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><BigResult label="Monthly Cash Flow" value={fmtD(c.mcf)} positive={c.mcf>=0} negative={c.mcf<0}/><BigResult label="ROI" value={fmtP(c.roi)} positive={c.roi>0.10} negative={c.roi<0}/></div>
        <div style={{background:"#f9fafb",borderRadius:12,padding:"2px 16px"}}><OutRow label="Total Cash In" value={fmtD(c.ti)}/><OutRow label="Loan Balance" value={fmtD(+i.balance)}/><OutRow label="Annual Cash Flow" value={fmtD(c.acf)} positive={c.acf>=0} negative={c.acf<0} highlight/></div>
        <button onClick={()=>generateAndDownload("subto",{...i,address:addr},c,profile)} style={{padding:"11px 16px",borderRadius:10,border:"2px dashed #a5f3fc",background:"#ecfeff",color:"#0891b2",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}>📄 Generate Subject-To Offer Letter (.doc)</button>
      </div>
    </div></>);
}
function NovationCalc({saved,onCalcChange,profile}) {
  const [addr,setAddr]=useState(saved?.address||"");
  const [i,setI]=useState(saved||{pp:155000,repairs:22000,arv:270000,agent:6,closing:4500,sellerPayout:12000,holding:3000,misc:1500});
  const s=k=>v=>setI(p=>({...p,[k]:v}));
  const c=useMemo(()=>{const aa=+i.arv*+i.agent/100,tc=+i.pp+ +i.repairs+aa+ +i.closing+ +i.sellerPayout+ +i.holding+ +i.misc;return{aa,tc,profit:+i.arv-tc,roi:tc>0?(+i.arv-tc)/tc:0};},[i]);
  useEffect(()=>onCalcChange({...i,address:addr},{primary:fmtD(c.profit),secondary:fmtP(c.roi),label:"Net Profit",label2:"ROI"}),[i,c,addr]);
  return (<><AddressBar value={addr} onChange={setAddr}/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:28}}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}><Divider label="Deal"/><Field label="Purchase Price" value={i.pp} onChange={s("pp")} prefix="$" step={5000}/><Field label="Repair Costs" value={i.repairs} onChange={s("repairs")} prefix="$" step={1000}/><Field label="ARV" value={i.arv} onChange={s("arv")} prefix="$" step={5000}/><Divider label="Costs"/><Field label="Agent Fees" value={i.agent} onChange={s("agent")} suffix="%" step={0.5}/><Field label="Closing Costs" value={i.closing} onChange={s("closing")} prefix="$" step={500}/><Field label="Seller Payout" value={i.sellerPayout} onChange={s("sellerPayout")} prefix="$" step={1000}/><Field label="Holding + Misc" value={+i.holding+ +i.misc} onChange={v=>{s("holding")(v*0.6);s("misc")(v*0.4);}} prefix="$" step={500}/></div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><BigResult label="Net Profit" value={fmtD(c.profit)} positive={c.profit>0} negative={c.profit<=0}/><BigResult label="ROI" value={fmtP(c.roi)} positive={c.roi>0.15} negative={c.roi<=0}/></div>
        <div style={{background:"#f9fafb",borderRadius:12,padding:"2px 16px"}}><OutRow label="Total Costs" value={fmtD(c.tc)}/><OutRow label="ARV" value={fmtD(+i.arv)}/><OutRow label="Net Profit" value={fmtD(c.profit)} positive={c.profit>0} negative={c.profit<=0} highlight/></div>
        <button onClick={()=>generateAndDownload("novation",{...i,address:addr},c,profile)} style={{padding:"11px 16px",borderRadius:10,border:"2px dashed #fbcfe8",background:"#fdf2f8",color:"#be185d",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}>📄 Generate Novation Offer Letter (.doc)</button>
      </div>
    </div></>);
}

// ─── Forum ─────────────────────────────────────────────────────────────────────
function ForumView({user,profile}) {
  const [posts,setPosts]=useState([]);const [loading,setLoading]=useState(true);const [showNew,setShowNew]=useState(false);
  const [filterMode,setFilterMode]=useState("all");
  const [form,setForm]=useState({title:"",mode:"",address:"",question:"",metrics:{}});
  const [submitting,setSubmitting]=useState(false);const [activePost,setActivePost]=useState(null);
  const [comments,setComments]=useState([]);const [newComment,setNewComment]=useState("");const [postingComment,setPostingComment]=useState(false);

  const loadPosts=async(m)=>{setLoading(true);const p=await supabase.getPosts(m==="all"?"":m);setPosts(p);setLoading(false);};
  useEffect(()=>{loadPosts("all");},[]);

  const handleFilter=(m)=>{setFilterMode(m);loadPosts(m);};

  const submit=async()=>{
    if(!form.title||!form.mode||!form.question)return;
    setSubmitting(true);
    try{
      const post={user_id:user.id,author_name:profile?.full_name||"Anonymous",author_type:profile?.investor_type||"",author_verified:profile?.is_verified||false,author_portfolio:profile?.portfolio_value||0,title:form.title,mode:form.mode,address:form.address,question:form.question,metrics:form.metrics,upvotes:0,created_at:new Date().toISOString()};
      const saved=await supabase.insertPost(post).catch(()=>null);
      const np=Array.isArray(saved)?saved[0]:{...post,id:Date.now().toString()};
      setPosts(p=>[np,...p]);setShowNew(false);setForm({title:"",mode:"",address:"",question:"",metrics:{}});
    }finally{setSubmitting(false);}
  };

  const openPost=async(post)=>{setActivePost(post);const c=await supabase.getComments(post.id).catch(()=>[]);setComments(c);};

  const handleUpvote=async(post,e)=>{
    e.stopPropagation();
    await supabase.upvotePost(post.id,post.upvotes||0).catch(()=>{});
    setPosts(prev=>prev.map(p=>p.id===post.id?{...p,upvotes:(p.upvotes||0)+1}:p));
  };

  const submitComment=async()=>{
    if(!newComment.trim()||!activePost)return;
    setPostingComment(true);
    try{
      const c={post_id:activePost.id,user_id:user.id,author_name:profile?.full_name||"Anonymous",author_verified:profile?.is_verified||false,body:newComment.trim(),created_at:new Date().toISOString()};
      const saved=await supabase.insertComment(c).catch(()=>null);
      const nc=Array.isArray(saved)?saved[0]:{...c,id:Date.now().toString()};
      setComments(prev=>[...prev,nc]);setNewComment("");
    }finally{setPostingComment(false);}
  };

  if(activePost){
    const m=MODES.find(m=>m.key===activePost.mode||m.label===activePost.mode);
    const medal=getMedal(+(activePost.author_portfolio||0));
    return (
      <div style={{maxWidth:800,margin:"0 auto",padding:"28px"}}>
        <button onClick={()=>setActivePost(null)} style={{background:"none",border:"none",fontSize:13,color:"#6b7280",cursor:"pointer",marginBottom:20}}>← Back to Community</button>
        <div style={{background:"white",borderRadius:18,border:"1.5px solid #e5e7eb",overflow:"hidden",marginBottom:24}}>
          <div style={{padding:"24px 28px",borderBottom:"1px solid #f3f4f6"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              {m&&<span style={{fontSize:11,fontWeight:700,color:m.color,background:m.bg,padding:"3px 10px",borderRadius:100,border:`1px solid ${m.border}`}}>{m.icon} {m.label}</span>}
              {activePost.address&&<span style={{fontSize:12,color:"#6b7280"}}>📍 {activePost.address}</span>}
            </div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"#111827",marginBottom:10}}>{activePost.title}</h2>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
              <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:12,fontWeight:800,color:"white"}}>{(activePost.author_name||"?")[0].toUpperCase()}</span>
              </div>
              <span style={{fontSize:13,fontWeight:600,color:"#111827"}}>{activePost.author_name}</span>
              <span style={{fontSize:13}}>{medal.icon}</span>
              {activePost.author_verified&&<span style={{fontSize:10,background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:100,padding:"1px 6px",fontWeight:700}}>✓ Verified</span>}
              {activePost.author_type&&<span style={{fontSize:11,color:"#9ca3af"}}>· {activePost.author_type}</span>}
            </div>
            <p style={{fontSize:14,color:"#374151",lineHeight:1.75,marginBottom:20}}>{activePost.question}</p>
            {activePost.metrics&&Object.keys(activePost.metrics).filter(k=>activePost.metrics[k]).length>0&&(
              <div style={{background:"#f9fafb",borderRadius:12,padding:"14px 18px",display:"flex",gap:20,flexWrap:"wrap"}}>
                {Object.entries(activePost.metrics).filter(([,v])=>v).map(([k,v])=>(
                  <div key={k}><div style={{fontSize:9,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",marginBottom:3}}>{k}</div><div style={{fontSize:15,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#111827"}}>{v}</div></div>
                ))}
              </div>
            )}
          </div>
          <div style={{padding:"20px 28px"}}>
            <h3 style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:16}}>{comments.length} Response{comments.length!==1?"s":""}</h3>
            {comments.map(c=>(
              <div key={c.id} style={{marginBottom:16,paddingBottom:16,borderBottom:"1px solid #f3f4f6"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:11,fontWeight:800,color:"white"}}>{(c.author_name||"?")[0].toUpperCase()}</span></div>
                  <span style={{fontSize:13,fontWeight:600,color:"#111827"}}>{c.author_name}</span>
                  {c.author_verified&&<span style={{fontSize:10,background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:100,padding:"1px 6px",fontWeight:700}}>✓</span>}
                  <span style={{fontSize:11,color:"#9ca3af"}}>{new Date(c.created_at).toLocaleDateString()}</span>
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

  return (
    <div style={{maxWidth:960,margin:"0 auto",padding:"28px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:14}}>
        <div><h2 style={{fontFamily:"'Fraunces',serif",fontSize:26,fontWeight:800,color:"#111827",marginBottom:4}}>👥 Community Forum</h2><p style={{fontSize:13,color:"#9ca3af"}}>Share deals, ask questions, get feedback from fellow investors</p></div>
        <Btn variant="primary" onClick={()=>setShowNew(true)}>+ Share a Deal</Btn>
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:22}}>
        <button onClick={()=>handleFilter("all")} style={{padding:"6px 14px",borderRadius:100,border:`1.5px solid ${filterMode==="all"?"#111827":"#e5e7eb"}`,background:filterMode==="all"?"#111827":"white",color:filterMode==="all"?"white":"#6b7280",fontSize:12,fontWeight:600,cursor:"pointer"}}>All</button>
        {MODES.map(m=><button key={m.key} onClick={()=>handleFilter(m.key)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 14px",borderRadius:100,border:`1.5px solid ${filterMode===m.key?m.border:"#e5e7eb"}`,background:filterMode===m.key?m.bg:"white",color:filterMode===m.key?m.color:"#6b7280",fontSize:12,fontWeight:600,cursor:"pointer"}}>{m.icon} {m.label}</button>)}
      </div>

      {showNew&&(
        <div style={{background:"white",borderRadius:18,border:"1.5px solid #e5e7eb",padding:"28px",marginBottom:24,animation:"fadeUp 0.3s ease both"}}>
          <h3 style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:800,color:"#111827",marginBottom:20}}>Share a Deal for Feedback</h3>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Input label="Deal title" value={form.title} onChange={v=>setForm(p=>({...p,title:v}))} placeholder="e.g. 3BR rental in Atlanta — good deal?"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <Sel label="Strategy type" value={form.mode} onChange={v=>setForm(p=>({...p,mode:v}))} options={MODES.map(m=>m.key)} placeholder="Select strategy..."/>
              <Input label="Property address (optional)" value={form.address} onChange={v=>setForm(p=>({...p,address:v}))} placeholder="123 Main St, City" icon="📍"/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:5}}>Your question / what feedback do you need?</label>
              <textarea value={form.question} onChange={e=>setForm(p=>({...p,question:e.target.value}))} placeholder="Describe the deal and what specific advice you're looking for..." rows={4}
                style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:14,color:"#111827",outline:"none",resize:"vertical",fontFamily:"'DM Sans',sans-serif"}}/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:10}}>Key numbers (optional)</label>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {["Purchase Price","Monthly Rent","ARV","Cash Flow","ROI","Down Payment"].map(k=>(
                  <div key={k}><label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:4}}>{k}</label><input type="text" placeholder="e.g. $320,000" onChange={e=>setForm(p=>({...p,metrics:{...p.metrics,[k]:e.target.value}}))} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:12,outline:"none",fontFamily:"'DM Mono',monospace"}}/></div>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn variant="ghost" onClick={()=>setShowNew(false)}>Cancel</Btn>
              <Btn variant="primary" loading={submitting} disabled={!form.title||!form.mode||!form.question} onClick={submit}>Post to Community →</Btn>
            </div>
          </div>
        </div>
      )}

      {loading?<div style={{textAlign:"center",padding:"60px",color:"#9ca3af"}}>Loading...</div>
      :posts.length===0?<div style={{textAlign:"center",padding:"80px 24px"}}><div style={{fontSize:52,marginBottom:16}}>👋</div><h3 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"#111827",marginBottom:8}}>Be the first to share!</h3><p style={{fontSize:14,color:"#6b7280"}}>Post a deal and get feedback from the community.</p></div>
      :(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {posts.map(post=>{
            const m=MODES.find(m=>m.key===post.mode||m.label===post.mode);
            const medal=getMedal(+(post.author_portfolio||0));
            return (
              <div key={post.id} onClick={()=>openPost(post)} style={{background:"white",borderRadius:14,border:"1.5px solid #e5e7eb",padding:"18px 22px",cursor:"pointer",transition:"all 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#10b981";e.currentTarget.style.boxShadow="0 4px 20px rgba(0,0,0,0.06)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="#e5e7eb";e.currentTarget.style.boxShadow="none";}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                      {m&&<span style={{fontSize:11,fontWeight:700,color:m.color,background:m.bg,padding:"2px 8px",borderRadius:100,border:`1px solid ${m.border}`}}>{m.icon} {m.label}</span>}
                      {post.address&&<span style={{fontSize:11,color:"#9ca3af"}}>📍 {post.address}</span>}
                    </div>
                    <h3 style={{fontSize:16,fontWeight:700,color:"#111827",marginBottom:5}}>{post.title}</h3>
                    <p style={{fontSize:13,color:"#6b7280",lineHeight:1.6,marginBottom:8}}>{post.question?.slice(0,120)}{post.question?.length>120?"...":""}</p>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:11,color:"#9ca3af"}}>By {post.author_name}</span>
                      <span style={{fontSize:12}}>{medal.icon}</span>
                      {post.author_verified&&<span style={{fontSize:10,background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:100,padding:"1px 6px",fontWeight:700}}>✓ Verified</span>}
                      <span style={{fontSize:11,color:"#9ca3af"}}>· {new Date(post.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                    <button onClick={e=>handleUpvote(post,e)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"8px 12px",borderRadius:10,border:"1.5px solid #e5e7eb",background:"white",cursor:"pointer",transition:"all 0.15s"}}
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

// ─── Portfolio Analyzer ────────────────────────────────────────────────────────
function PortfolioAnalyzer({profile,onSave}) {
  const [properties,setProperties]=useState(profile?.portfolio_properties||[]);
  const [showAdd,setShowAdd]=useState(false);
  const [newProp,setNewProp]=useState({address:"",type:"Single Family",value:"",equity:"",monthly_rent:"",monthly_expenses:"",monthly_mortgage:"",notes:""});
  const [projYears,setProjYears]=useState(5);
  const [projGrowth,setProjGrowth]=useState(4);
  const [projAcqValue,setProjAcqValue]=useState(250000);
  const [projAcqEquity,setProjAcqEquity]=useState(50000);
  const [projAcqCF,setProjAcqCF]=useState(400);
  const [projAcqCount,setProjAcqCount]=useState(1);
  const np=k=>v=>setNewProp(p=>({...p,[k]:v}));

  const addProp=()=>{
    if(!newProp.address)return;
    setProperties(prev=>[...prev,{...newProp,id:Date.now().toString()}]);
    setNewProp({address:"",type:"Single Family",value:"",equity:"",monthly_rent:"",monthly_expenses:"",monthly_mortgage:"",notes:""});
    setShowAdd(false);
  };
  const removeProp=id=>setProperties(p=>p.filter(x=>x.id!==id));

  // Portfolio totals
  const totals=useMemo(()=>{
    const tv=properties.reduce((s,p)=>s+(parseFloat(p.value)||0),0);
    const te=properties.reduce((s,p)=>s+(parseFloat(p.equity)||0),0);
    const tmcf=properties.reduce((s,p)=>s+(parseFloat(p.monthly_rent)||0)-(parseFloat(p.monthly_expenses)||0)-(parseFloat(p.monthly_mortgage)||0),0);
    const tacf=tmcf*12;
    const roi=te>0?tacf/te:0;
    const ltvRatio=tv>0?(tv-te)/tv:0;
    return{tv,te,tmcf,tacf,roi,ltvRatio,count:properties.length};
  },[properties]);

  // Future projections
  const projections=useMemo(()=>{
    const years=Array.from({length:projYears+1},(_,i)=>i);
    const g=projGrowth/100;
    return years.map(yr=>{
      const existingValue=totals.tv*Math.pow(1+g,yr);
      const existingEquity=totals.te+((totals.tv*Math.pow(1+g,yr))-totals.tv);
      const newUnitsValue=projAcqCount*projAcqValue*(yr>0?Math.pow(1+g,yr):0);
      const newUnitsEquity=yr>0?projAcqCount*projAcqEquity*yr:0;
      const newUnitsCF=yr>0?projAcqCount*projAcqCF:0;
      return{
        year:yr,
        totalValue:Math.round(existingValue+newUnitsValue),
        totalEquity:Math.round(existingEquity+newUnitsEquity),
        monthlyCF:Math.round(totals.tmcf+newUnitsCF),
        properties:totals.count+(yr>0?projAcqCount*yr:0),
      };
    });
  },[totals,projYears,projGrowth,projAcqValue,projAcqEquity,projAcqCF,projAcqCount]);

  const maxVal=Math.max(...projections.map(p=>p.totalValue),1);
  const maxEq=Math.max(...projections.map(p=>p.totalEquity),1);

  const handleSave=()=>{
    const tv=totals.tv;
    onSave({portfolio_properties:properties,portfolio_value:tv});
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:24}}>
      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14}}>
        {[
          ["🏠","Properties",totals.count,""],
          ["💰","Total Value",fmtM(totals.tv),""],
          ["📈","Total Equity",fmtM(totals.te),""],
          ["💵","Mo. Cash Flow",fmtD(totals.tmcf),totals.tmcf>=0?"pos":"neg"],
          ["📊","Annual Cash Flow",fmtD(totals.tacf),totals.tacf>=0?"pos":"neg"],
          ["🎯","Cash-on-Cash ROI",fmtP(totals.roi),totals.roi>=0.08?"pos":""],
        ].map(([icon,label,val,flag])=>(
          <div key={label} style={{background:flag==="pos"?"#f0fdf4":flag==="neg"?"#fef2f2":"white",border:`1.5px solid ${flag==="pos"?"#bbf7d0":flag==="neg"?"#fecaca":"#e5e7eb"}`,borderRadius:14,padding:"18px 16px",textAlign:"center"}}>
            <div style={{fontSize:22,marginBottom:8}}>{icon}</div>
            <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>{label}</div>
            <div style={{fontSize:20,fontWeight:800,fontFamily:"'DM Mono',monospace",color:flag==="pos"?"#059669":flag==="neg"?"#dc2626":"#111827"}}>{val}</div>
          </div>
        ))}
      </div>

      {/* LTV bar */}
      {totals.tv>0&&(
        <div style={{background:"white",borderRadius:14,border:"1.5px solid #e5e7eb",padding:"20px 22px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:13,fontWeight:600,color:"#374151"}}>Portfolio LTV</span>
            <span style={{fontSize:13,fontFamily:"'DM Mono',monospace",fontWeight:700,color:"#374151"}}>{fmtP(totals.ltvRatio)} debt · {fmtP(1-totals.ltvRatio)} equity</span>
          </div>
          <div style={{height:12,background:"#f3f4f6",borderRadius:6,overflow:"hidden",display:"flex"}}>
            <div style={{width:`${(1-totals.ltvRatio)*100}%`,background:"linear-gradient(90deg,#10b981,#059669)",borderRadius:"6px 0 0 6px",transition:"width 0.5s"}}/>
            <div style={{flex:1,background:"#fde68a"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
            <span style={{fontSize:11,color:"#059669",fontWeight:600}}>Equity {fmtM(totals.te)}</span>
            <span style={{fontSize:11,color:"#d97706",fontWeight:600}}>Debt {fmtM(totals.tv-totals.te)}</span>
          </div>
        </div>
      )}

      {/* Properties list */}
      <div style={{background:"white",borderRadius:14,border:"1.5px solid #e5e7eb",overflow:"hidden"}}>
        <div style={{padding:"18px 22px",borderBottom:"1px solid #f3f4f6",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h3 style={{fontSize:15,fontWeight:700,color:"#111827"}}>My Properties</h3>
          <button onClick={()=>setShowAdd(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,border:"1.5px solid #bbf7d0",background:"#f0fdf4",color:"#059669",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Add Property</button>
        </div>
        {showAdd&&(
          <div style={{padding:"18px 22px",background:"#fafafa",borderBottom:"1px solid #f3f4f6"}}>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <input value={newProp.address} onChange={e=>np("address")(e.target.value)} placeholder="Property address *" style={{padding:"9px 12px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:13,outline:"none",fontFamily:"'DM Sans',sans-serif"}}/>
              <select value={newProp.type} onChange={e=>np("type")(e.target.value)} style={{padding:"9px 12px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:13,outline:"none"}}>
                {["Single Family","Multi-Family","Commercial","STR","Vacant Land"].map(t=><option key={t}>{t}</option>)}
              </select>
              <input type="number" value={newProp.value} onChange={e=>np("value")(e.target.value)} placeholder="Value $" style={{padding:"9px 12px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:13,outline:"none",fontFamily:"'DM Mono',monospace"}}/>
              <input type="number" value={newProp.equity} onChange={e=>np("equity")(e.target.value)} placeholder="Equity $" style={{padding:"9px 12px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:13,outline:"none",fontFamily:"'DM Mono',monospace"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 2fr",gap:10,marginBottom:12}}>
              <input type="number" value={newProp.monthly_rent} onChange={e=>np("monthly_rent")(e.target.value)} placeholder="Mo. Rent $" style={{padding:"9px 12px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:13,outline:"none",fontFamily:"'DM Mono',monospace"}}/>
              <input type="number" value={newProp.monthly_expenses} onChange={e=>np("monthly_expenses")(e.target.value)} placeholder="Expenses $" style={{padding:"9px 12px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:13,outline:"none",fontFamily:"'DM Mono',monospace"}}/>
              <input type="number" value={newProp.monthly_mortgage} onChange={e=>np("monthly_mortgage")(e.target.value)} placeholder="Mortgage $" style={{padding:"9px 12px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:13,outline:"none",fontFamily:"'DM Mono',monospace"}}/>
              <input value={newProp.notes} onChange={e=>np("notes")(e.target.value)} placeholder="Notes (optional)" style={{padding:"9px 12px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:13,outline:"none",fontFamily:"'DM Sans',sans-serif"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn variant="ghost" small onClick={()=>setShowAdd(false)}>Cancel</Btn>
              <Btn variant="primary" small disabled={!newProp.address} onClick={addProp}>Add Property</Btn>
            </div>
          </div>
        )}
        {properties.length===0?(
          <div style={{padding:"40px 22px",textAlign:"center",color:"#9ca3af"}}>
            <div style={{fontSize:36,marginBottom:10}}>🏠</div>
            <p style={{fontSize:14}}>No properties added yet. Click "+ Add Property" to start.</p>
          </div>
        ):(
          <div>
            {properties.map((prop,idx)=>{
              const mcf=(parseFloat(prop.monthly_rent)||0)-(parseFloat(prop.monthly_expenses)||0)-(parseFloat(prop.monthly_mortgage)||0);
              return (
                <div key={prop.id} style={{padding:"16px 22px",borderBottom:idx<properties.length-1?"1px solid #f3f4f6":"none",display:"flex",alignItems:"center",gap:16}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                      <span style={{fontSize:14,fontWeight:700,color:"#111827"}}>{prop.address}</span>
                      <span style={{fontSize:11,background:"#f3f4f6",color:"#6b7280",padding:"1px 8px",borderRadius:100}}>{prop.type}</span>
                    </div>
                    {prop.notes&&<p style={{fontSize:12,color:"#9ca3af"}}>{prop.notes}</p>}
                  </div>
                  <div style={{display:"flex",gap:16,flexShrink:0}}>
                    {[["Value",fmtM(parseFloat(prop.value)||0)],["Equity",fmtM(parseFloat(prop.equity)||0)],["Mo. CF",fmtD(mcf)]].map(([l,v])=>(
                      <div key={l} style={{textAlign:"center"}}>
                        <div style={{fontSize:13,fontWeight:800,fontFamily:"'DM Mono',monospace",color:l==="Mo. CF"&&mcf<0?"#dc2626":l==="Mo. CF"&&mcf>=0?"#059669":"#111827"}}>{v}</div>
                        <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase"}}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>removeProp(prop.id)} style={{padding:"6px 10px",borderRadius:7,border:"1.5px solid #fee2e2",background:"#fff5f5",color:"#dc2626",fontSize:12,cursor:"pointer",flexShrink:0}}>✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Future Acquisition Planner */}
      <div style={{background:"white",borderRadius:14,border:"1.5px solid #e5e7eb",overflow:"hidden"}}>
        <div style={{padding:"18px 22px",borderBottom:"1px solid #f3f4f6",background:"linear-gradient(135deg,#f0fdf4,#ecfdf5)"}}>
          <h3 style={{fontSize:15,fontWeight:700,color:"#111827",marginBottom:3}}>🔮 Future Acquisition Planner</h3>
          <p style={{fontSize:12,color:"#6b7280"}}>Project your portfolio value by adding future acquisitions</p>
        </div>
        <div style={{padding:"22px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:14,marginBottom:24}}>
            {[
              ["Projection Years",projYears,v=>setProjYears(+v),"yr",1,30],
              ["Annual Growth %",projGrowth,v=>setProjGrowth(+v),"%",0,20],
              ["Acquisitions/yr",projAcqCount,v=>setProjAcqCount(+v),"props",1,20],
              ["Avg Value/Property",projAcqValue,v=>setProjAcqValue(+v),"$",50000,2000000],
              ["Avg Equity/Property",projAcqEquity,v=>setProjAcqEquity(+v),"$",10000,500000],
              ["Avg Mo. CF/Property",projAcqCF,v=>setProjAcqCF(+v),"$",0,5000],
            ].map(([lbl,val,setter,unit,min,max])=>(
              <div key={lbl} style={{display:"flex",flexDirection:"column",gap:6}}>
                <label style={{fontSize:11,fontWeight:600,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.05em"}}>{lbl}</label>
                <input type="number" value={val} min={min} max={max} onChange={e=>setter(e.target.value)}
                  style={{padding:"9px 12px",borderRadius:8,border:"1.5px solid #e5e7eb",fontSize:13,fontFamily:"'DM Mono',monospace",outline:"none",color:"#111827"}}/>
                <span style={{fontSize:10,color:"#9ca3af"}}>{unit}</span>
              </div>
            ))}
          </div>

          {/* Projection chart (CSS bar chart) */}
          <div style={{marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
              <span style={{fontSize:12,fontWeight:700,color:"#374151"}}>Portfolio Value Projection</span>
              <div style={{display:"flex",gap:14}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:2,background:"#10b981"}}/><span style={{fontSize:11,color:"#6b7280"}}>Value</span></div>
                <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:2,background:"#7c3aed"}}/><span style={{fontSize:11,color:"#6b7280"}}>Equity</span></div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"flex-end",gap:6,height:160,padding:"0 4px"}}>
              {projections.map((p,i)=>(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{width:"100%",display:"flex",gap:2,alignItems:"flex-end",height:130}}>
                    <div style={{flex:1,background:"#10b981",borderRadius:"4px 4px 0 0",opacity:0.85,height:`${(p.totalValue/maxVal)*100}%`,minHeight:4,transition:"height 0.4s"}}/>
                    <div style={{flex:1,background:"#7c3aed",borderRadius:"4px 4px 0 0",opacity:0.85,height:`${(p.totalEquity/maxVal)*100}%`,minHeight:4,transition:"height 0.4s"}}/>
                  </div>
                  <span style={{fontSize:9,color:"#9ca3af",whiteSpace:"nowrap"}}>Yr {p.year}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Projection table */}
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{background:"#f9fafb"}}>
                  {["Year","Portfolio Value","Total Equity","Monthly CF","Properties"].map(h=>(
                    <th key={h} style={{padding:"8px 12px",textAlign:"right",fontWeight:700,color:"#6b7280",letterSpacing:"0.04em",fontSize:10,textTransform:"uppercase",borderBottom:"1.5px solid #e5e7eb"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projections.map((p,i)=>(
                  <tr key={i} style={{background:i%2===0?"white":"#fafafa",transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#f0fdf4"}
                    onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"white":"#fafafa"}>
                    <td style={{padding:"10px 12px",fontWeight:i===0?600:800,color:i===0?"#9ca3af":"#111827",borderBottom:"1px solid #f3f4f6"}}>{i===0?"Now":`Year ${p.year}`}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontFamily:"'DM Mono',monospace",fontWeight:700,color:"#059669",borderBottom:"1px solid #f3f4f6"}}>{fmtM(p.totalValue)}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontFamily:"'DM Mono',monospace",fontWeight:700,color:"#7c3aed",borderBottom:"1px solid #f3f4f6"}}>{fmtM(p.totalEquity)}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontFamily:"'DM Mono',monospace",fontWeight:700,color:p.monthlyCF>=0?"#059669":"#dc2626",borderBottom:"1px solid #f3f4f6"}}>{fmtD(p.monthlyCF)}/mo</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontFamily:"'DM Mono',monospace",color:"#374151",borderBottom:"1px solid #f3f4f6"}}>{p.properties}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{display:"flex",justifyContent:"flex-end"}}>
        <Btn variant="primary" onClick={handleSave}>Save Portfolio</Btn>
      </div>
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
          {[["profile","👤 Profile"],["portfolio","🏠 Portfolio & Analyzer"],["mentoring","🎓 Mentoring"],["verify","✅ Verification"]].map(([key,label])=>(
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
function DealCard({deal,onLoad,onDelete}) {
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
function MentorDirectory() {
  const [mentors,setMentors]=useState([]);const [loading,setLoading]=useState(true);
  useEffect(()=>{
    supabase._fetch("/rest/v1/profiles?is_verified=eq.true&mentoring_enabled=eq.true&order=portfolio_value.desc&select=*")
      .then(d=>{setMentors(Array.isArray(d)?d:[]);setLoading(false);})
      .catch(()=>setLoading(false));
  },[]);
  return (
    <div style={{maxWidth:960,margin:"0 auto",padding:"28px"}}>
      <div style={{marginBottom:28}}>
        <h2 style={{fontFamily:"'Fraunces',serif",fontSize:26,fontWeight:800,color:"#111827",marginBottom:4}}>🎓 Find a Mentor</h2>
        <p style={{fontSize:13,color:"#9ca3af"}}>Verified investors offering 1-on-1 coaching sessions</p>
      </div>
      {loading?<div style={{textAlign:"center",padding:"60px",color:"#9ca3af"}}>Loading mentors...</div>
      :mentors.length===0?<div style={{textAlign:"center",padding:"80px 24px"}}><div style={{fontSize:52,marginBottom:16}}>🎓</div><h3 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,color:"#111827",marginBottom:8}}>No mentors yet</h3><p style={{fontSize:14,color:"#6b7280"}}>Verified investors can enable mentoring in their profile settings.</p></div>
      :(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:18}}>
          {mentors.map(m=>{
            const medal=getMedal(+(m.portfolio_value||0));
            return (
              <div key={m.id} style={{background:"white",borderRadius:18,border:"1.5px solid #e5e7eb",overflow:"hidden",transition:"all 0.2s"}}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 12px 32px rgba(0,0,0,0.08)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}}>
                <div style={{height:4,background:"linear-gradient(90deg,#10b981,#059669)"}}/>
                <div style={{padding:"22px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
                    <div style={{width:52,height:52,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontSize:20,fontWeight:800,color:"white"}}>{(m.full_name||"?")[0].toUpperCase()}</span>
                    </div>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                        <span style={{fontSize:15,fontWeight:700,color:"#111827"}}>{m.full_name}</span>
                        <span style={{fontSize:14}}>{medal.icon}</span>
                      </div>
                      {m.title&&<p style={{fontSize:12,color:"#6b7280"}}>{m.title}</p>}
                      <div style={{display:"flex",gap:6,marginTop:3,flexWrap:"wrap"}}>
                        <span style={{fontSize:10,background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:100,padding:"1px 6px",fontWeight:700}}>✓ Verified</span>
                        {m.investor_type&&<span style={{fontSize:10,background:"#f3f4f6",color:"#6b7280",borderRadius:100,padding:"1px 6px"}}>{m.investor_type}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:14,marginBottom:14}}>
                    {[["Portfolio",m.portfolio_public?fmtM(+(m.portfolio_value||0)):"Private"],["Deals",m.deal_count||0],["Sessions",m.mentoring_sessions||0]].map(([l,v])=>(
                      <div key={l}><div style={{fontSize:13,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#111827"}}>{v}</div><div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase"}}>{l}</div></div>
                    ))}
                  </div>
                  {m.mentoring_bio&&<p style={{fontSize:13,color:"#6b7280",lineHeight:1.6,marginBottom:14}}>{m.mentoring_bio.slice(0,120)}{m.mentoring_bio.length>120?"...":""}</p>}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:12,borderTop:"1px solid #f3f4f6"}}>
                    <div>
                      {m.hourly_rate&&<><span style={{fontSize:18,fontWeight:800,fontFamily:"'DM Mono',monospace",color:"#111827"}}>${m.hourly_rate}</span><span style={{fontSize:12,color:"#9ca3af"}}>/hour</span></>}
                    </div>
                    {m.calendly_link?<a href={m.calendly_link} target="_blank" rel="noreferrer" style={{padding:"9px 18px",borderRadius:9,border:"none",background:"#111827",color:"white",fontSize:13,fontWeight:700,textDecoration:"none"}}>Book Session</a>:<span style={{fontSize:12,color:"#9ca3af"}}>Contact via forum</span>}
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
  const active=MODES.find(m=>m.key===mode);const data=DEMO[mode];
  useEffect(()=>{const h=()=>setScrolled(window.scrollY>50);window.addEventListener("scroll",h);return()=>window.removeEventListener("scroll",h);},[]);
  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#fff",color:"#111827"}}>
      <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:200,transition:"all 0.25s",background:scrolled?"rgba(255,255,255,0.97)":"transparent",backdropFilter:scrolled?"blur(12px)":"none",borderBottom:scrolled?"1px solid #e5e7eb":"none"}}>
        <div style={{maxWidth:1140,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:60,padding:"0 32px"}}>
          <Logo/>
          <div style={{display:"flex",gap:24}}>
            {["Features","Community","Mentoring","Pricing"].map(l=>(
              <button key={l} onClick={()=>{const el=document.getElementById(l.toLowerCase());if(el)el.scrollIntoView({behavior:"smooth",block:"start"});}} style={{background:"none",border:"none",fontSize:14,color:"#6b7280",fontWeight:500,cursor:"pointer",padding:0}}>{l}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={onGoSignIn} style={{padding:"8px 18px",borderRadius:8,border:"1.5px solid #e5e7eb",background:"white",color:"#374151",fontSize:13,fontWeight:500,cursor:"pointer"}}>Sign In</button>
            <button onClick={onGoSignUp} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#111827",color:"white",fontSize:13,fontWeight:600,cursor:"pointer"}}>Start Free Trial</button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{paddingTop:80,background:"linear-gradient(180deg,#f0fdf4 0%,#fafafa 55%,#fff 100%)"}}>
        <div style={{maxWidth:1140,margin:"0 auto",padding:"52px 32px 0"}}>
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

          {/* Demo calculator */}
          <div id="demo" style={{background:"white",borderRadius:"20px 20px 0 0",border:"1.5px solid #e5e7eb",borderBottom:"none",boxShadow:"0 -4px 40px rgba(0,0,0,0.06)",overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 28px",background:active.bg,borderBottom:`1.5px solid ${active.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:20}}>{active.icon}</span>
                <div><h3 style={{fontSize:15,fontWeight:700,color:active.color}}>{active.label} Calculator</h3><p style={{fontSize:11,color:active.color,opacity:0.7}}>{active.sub}</p></div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,background:"white",border:"1.5px solid #e5e7eb",borderRadius:100,padding:"5px 14px"}}>
                <span style={{fontSize:12}}>👀</span><span style={{fontSize:12,color:"#6b7280",fontWeight:500}}>Demo — sign up to use your own numbers</span>
              </div>
            </div>
            <div style={{padding:"28px",display:"grid",gridTemplateColumns:"260px 1fr",gap:28,alignItems:"start"}}>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"#9ca3af"}}>Inputs</span>
                  <button onClick={onGoSignUp} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:100,border:"1.5px solid #e5e7eb",background:"white",color:"#6b7280",fontSize:11,fontWeight:600,cursor:"pointer"}}>✏️ Edit</button>
                </div>
                {data.inputs.map(([label,value],idx)=>(
                  <div key={idx} onClick={onGoSignUp} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",background:"#f9fafb",border:"1.5px solid #e5e7eb",borderRadius:8,cursor:"pointer",transition:"border-color 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=active.border}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="#e5e7eb"}>
                    <span style={{fontSize:12,color:"#6b7280"}}>{label}</span>
                    <span style={{fontSize:13,fontWeight:600,color:"#374151",fontFamily:"'DM Mono',monospace"}}>{value}</span>
                  </div>
                ))}
                <button onClick={onGoSignUp} style={{marginTop:6,padding:"11px 0",borderRadius:10,border:"2px dashed #d1fae5",background:"#f0fdf4",color:"#059669",fontSize:13,fontWeight:600,cursor:"pointer"}}>✏️ Enter your own numbers →</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {data.highlights.map(([label,value,positive],idx)=>(
                  <div key={idx} style={{textAlign:"center",padding:"16px 12px",background:positive?"#f0fdf4":"#f9fafb",borderRadius:10,border:`1.5px solid ${positive?"#bbf7d0":"#e5e7eb"}`}}>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:"#9ca3af",marginBottom:6}}>{label}</div>
                    <div style={{fontSize:22,fontWeight:800,fontFamily:"'DM Mono',monospace",color:positive?"#059669":"#374151"}}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{padding:"14px 28px",borderTop:"1px solid #f3f4f6",background:"#fafafa",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
              <p style={{fontSize:13,color:"#9ca3af"}}>🔒 Sample numbers. <button onClick={onGoSignUp} style={{color:"#10b981",fontWeight:700,background:"none",border:"none",cursor:"pointer",fontSize:13,padding:0}}>Sign up free →</button></p>
              <button onClick={onGoSignUp} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#111827",color:"white",fontSize:12,fontWeight:600,cursor:"pointer"}}>Try it free</button>
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
      <section id="mentoring" style={{padding:"88px 32px",background:"#f9fafb",borderTop:"1px solid #e5e7eb"}}>
        <div style={{maxWidth:1100,margin:"0 auto",display:"grid",gridTemplateColumns:"1fr 1fr",gap:60,alignItems:"center"}}>
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

  useEffect(()=>{supabase.getDeals(user.id).then(d=>{setDeals(d);setDealsLoading(false);}).catch(()=>setDealsLoading(false));},[user.id]);

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
          <div style={{display:"flex",background:"#f3f4f6",borderRadius:10,padding:3,gap:2,overflowX:"auto"}}>
            {TABS.map(tab=>(
              <button key={tab.key} onClick={()=>setView(tab.key)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,border:"none",background:view===tab.key?"white":"transparent",color:view===tab.key?"#111827":"#6b7280",fontSize:12,fontWeight:view===tab.key?700:500,cursor:"pointer",boxShadow:view===tab.key?"0 1px 4px rgba(0,0,0,0.08)":"none",transition:"all 0.15s",whiteSpace:"nowrap"}}>
                <span>{tab.icon}</span>{tab.label}
              </button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {savedFlash&&<span style={{fontSize:12,color:"#059669",fontWeight:600}}>✓ Saved!</span>}
            <button onClick={onGoProfile} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 12px 5px 5px",borderRadius:100,border:"1.5px solid #e5e7eb",background:"white",cursor:"pointer",transition:"border-color 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="#10b981"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="#e5e7eb"}>
              <div style={{width:26,height:26,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:10,fontWeight:800,color:"white"}}>{initials}</span>
              </div>
              <span style={{fontSize:13,fontWeight:600,color:"#374151"}}>{profile?.full_name?.split(" ")[0]||"Profile"}</span>
              <span style={{fontSize:13}}>{medal.icon}</span>
              {profile?.is_verified&&<span style={{fontSize:9,background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:100,padding:"1px 5px",fontWeight:700}}>✓</span>}
            </button>
          </div>
        </div>
      </header>

      {view==="calc"&&(
        <div style={{maxWidth:1200,margin:"0 auto",padding:"24px"}}>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:22}}>
            {MODES.map(m=>(
              <button key={m.key} onClick={()=>{setMode(m.key);setLoadedDealId(null);}}
                style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px",borderRadius:100,border:`2px solid ${mode===m.key?m.border:"#e5e7eb"}`,background:mode===m.key?m.bg:"white",cursor:"pointer",transition:"all 0.15s"}}>
                <span>{m.icon}</span>
                <div style={{lineHeight:1.2}}>
                  <div style={{fontSize:12,fontWeight:700,color:mode===m.key?m.color:"#374151"}}>{m.label}</div>
                  <div style={{fontSize:9,color:mode===m.key?m.color:"#9ca3af",opacity:0.85}}>{m.sub}</div>
                </div>
              </button>
            ))}
          </div>
          <div style={{background:"white",borderRadius:18,border:"1.5px solid #e5e7eb",overflow:"hidden",boxShadow:"0 2px 16px rgba(0,0,0,0.04)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 22px",background:activeMode.bg,borderBottom:`1.5px solid ${activeMode.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:20}}>{activeMode.icon}</span>
                <div><h2 style={{fontSize:15,fontWeight:700,color:activeMode.color}}>{activeMode.label} Calculator</h2><p style={{fontSize:11,color:activeMode.color,opacity:0.7}}>{activeMode.sub}</p></div>
              </div>
              {loadedDealId&&<div style={{display:"flex",alignItems:"center",gap:7,background:"white",border:`1.5px solid ${activeMode.border}`,borderRadius:100,padding:"4px 12px"}}><span style={{fontSize:11}}>📂</span><span style={{fontSize:11,color:activeMode.color,fontWeight:600}}>Loaded from saved</span></div>}
            </div>
            <div style={{padding:"24px 22px"}}>
              <CalcComponent key={`${mode}-${loadedDealId}`} saved={loadedDealId?deals.find(d=>d.id===loadedDealId)?.inputs:null} onCalcChange={handleCalcChange} profile={profile}/>
            </div>
            <div style={{padding:"12px 22px",borderTop:"1px solid #f3f4f6",background:"#fafafa",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
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
        <div style={{maxWidth:1200,margin:"0 auto",padding:"24px"}}>
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
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>{filteredDeals.map(deal=><DealCard key={deal.id} deal={deal} onLoad={handleLoad} onDelete={handleDelete}/>)}</div>}
        </div>
      )}

      {view==="forum"&&<ForumView user={user} profile={profile}/>}
      {view==="leaderboard"&&<LeaderboardView user={user} profile={profile} onGoProfile={onGoProfile}/>}
      {view==="mentors"&&<MentorDirectory/>}
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
        if(u){setUser(u);supabase.getProfile(u.id).then(p=>{setProfile(p);setPage("app");}).catch(()=>setPage("app"));}
        else{supabase._token=null;try{localStorage.removeItem("ds_token");}catch{}setPage("home");}
      }).catch(()=>setPage("home"));
    }else{setPage("home");}
  },[]);

  const handleSignIn=(u,p)=>{setUser(u);setProfile(p);setPage("app");};
  const handleSignOut=async()=>{await supabase.auth.signOut();setUser(null);setProfile(null);setPage("home");};
  const handleProfileUpdate=(p)=>setProfile(p);

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
