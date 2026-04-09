'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import { api, BdCompany, BdEmployee, BdOrder, BdInvoice } from '@/app/lib/api';

type Tab = 'overview' | 'companies' | 'invoices' | 'orders' | 'reports';

// ── Design tokens ──────────────────────────────────────────────────────────────
const D = '#003141';   // dark navy
const T = '#00465E';   // teal brand
const G = '#FFC600';   // gold
const C = '#FAEBDA';   // cream
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
.ca-wrap *{box-sizing:border-box;margin:0;padding:0}
.ca-wrap{font-family:'DM Sans',sans-serif;background:${C};color:${D};min-height:100%}

/* Topbar */
.ca-tb{height:52px;background:${D};display:flex;align-items:center;padding:0 26px;gap:12px;position:sticky;top:0;z-index:5;box-shadow:0 2px 12px rgba(0,0,0,.18)}
.ca-tb-title{font-size:.9rem;font-weight:900;color:${C};letter-spacing:-.2px}
.ca-tb-title b{color:${G}}
.ca-tb-pill{font-size:.52rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:rgba(250,235,218,.35);background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:99px;padding:2px 8px}
.ca-tb-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.ca-tb-btn{font-size:.7rem;font-weight:800;background:${G};color:${D};border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:.12s}
.ca-tb-btn:hover{background:#e6b200}
.ca-tb-out{font-size:.68rem;font-weight:700;color:rgba(250,235,218,.5);border:1px solid rgba(250,235,218,.14);border-radius:99px;padding:5px 14px;cursor:pointer;background:none;font-family:'DM Sans',sans-serif}
.ca-tb-out:hover{color:${C}}

/* Inner tabs */
.ca-tabs{background:${D};border-top:1px solid rgba(255,255,255,.08);display:flex;gap:0;padding:0 26px}
.ca-tab{padding:11px 18px;font-size:.82rem;font-weight:700;color:rgba(255,255,255,.45);cursor:pointer;border:none;background:transparent;font-family:'DM Sans',sans-serif;border-bottom:3px solid transparent;transition:.12s;white-space:nowrap}
.ca-tab:hover{color:rgba(255,255,255,.8)}
.ca-tab.on{color:#fff;border-bottom-color:${G};font-weight:800}

/* Content */
.ca-cont{padding:24px 28px 40px}

/* Section label */
.sl{font-size:.54rem;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#7A8F9C;margin:22px 0 10px;display:flex;align-items:center;gap:8px}
.sl:first-child{margin-top:0}
.sl::after{content:'';flex:1;height:1px;background:#E0D4C2}

/* Hero rev */
.hero-rev{background:${D};border-radius:14px;padding:22px 28px;margin-bottom:14px;box-shadow:0 8px 30px rgba(0,49,65,.15);display:flex;align-items:center;gap:28px;flex-wrap:wrap}
.hl-label{font-size:.6rem;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,.5);margin-bottom:6px}
.hl-value{font-size:40px;font-weight:800;color:${G};line-height:1}
.hero-div{width:1px;height:50px;background:rgba(255,198,0,.2);flex-shrink:0}
.hero-stat .hs-val{font-size:22px;font-weight:800;color:#fff}
.hero-stat .hs-lbl{font-size:.55rem;text-transform:uppercase;letter-spacing:.5px;color:rgba(255,255,255,.45)}

/* Stat cards */
.card{background:#fff;border-radius:10px;padding:16px 18px;border:1px solid rgba(0,49,65,.06);box-shadow:0 2px 12px rgba(0,49,65,.04)}
.card-gold{background:linear-gradient(135deg,#fffbf0,#fff8e8);border-color:rgba(212,160,41,.4)}
.card-sky{background:linear-gradient(135deg,#e8f3ff,#f0f7ff);border-color:rgba(78,162,253,.35)}
.card-purple{background:linear-gradient(135deg,#f3eeff,#f8f4ff);border-color:rgba(200,164,245,.4)}
.card-green{background:linear-gradient(135deg,#eefbe8,#f4fdf0);border-color:rgba(107,189,82,.35)}
.card-gradient{background:linear-gradient(145deg,#fde0b0 0%,#e0d0ff 32%,#b8dcff 65%,#b8f0d0 100%);border-color:rgba(0,49,65,.1)}
.s-label{font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;margin-bottom:10px}
.s-label.gold{color:#b8860b}.s-label.sky{color:#2d7ec4}.s-label.purple{color:#7453A2}.s-label.green{color:#167421}
.s-value{font-size:28px;font-weight:800;line-height:1.1;color:${D}}
.s-value.gold{color:#b8860b}.s-value.sky{color:#2d7ec4}.s-value.purple{color:#7453A2}.s-value.green{color:#167421}

/* Quick actions */
.qa-btn{display:flex;align-items:center;gap:10px;border:none;border-radius:10px;padding:12px 16px;font-size:.78rem;font-weight:700;cursor:pointer;transition:.15s;font-family:'DM Sans',sans-serif;text-decoration:none}
.qa-btn-amber{background:#B56B10;color:#fff;box-shadow:0 2px 8px rgba(181,107,16,.25)}
.qa-btn-amber:hover{background:#D4A04A}
.qa-btn-dark{background:${D};color:#fff;box-shadow:0 2px 8px rgba(0,49,65,.15)}
.qa-btn-dark:hover{background:${T}}

/* Growth grid */
.growth-wrap{background:#fff;border-radius:10px;border:1px solid rgba(0,49,65,.06);box-shadow:0 2px 12px rgba(0,49,65,.04);overflow:hidden;margin-bottom:14px}
.growth-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(0,49,65,.06)}
.gc{background:#fff;padding:16px 18px}
.gc-val{font-size:26px;font-weight:900;color:${D}}
.gc-val.green{color:#167421}.gc-val.sky{color:#2d7ec4}
.gc-lbl{font-size:.6rem;color:#4a6d5c;margin-top:3px}

/* Financial */
.fin-section{background:#fff;border-radius:12px;padding:22px 26px;border:1px solid rgba(0,49,65,.06);box-shadow:0 2px 12px rgba(0,49,65,.04);margin-bottom:14px}
.fin-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px}
.fin-title{font-size:.88rem;font-weight:800;color:${D}}
.fin-link{font-size:.68rem;font-weight:700;color:${T};background:rgba(0,70,94,.06);border:1px solid rgba(0,70,94,.12);border-radius:20px;padding:4px 12px;text-decoration:none;cursor:pointer;transition:.12s;display:inline-flex;align-items:center;gap:4px}
.fin-link:hover{background:rgba(0,70,94,.12)}
.fin-link.alert{background:rgba(181,107,16,.08);border-color:rgba(181,107,16,.2);color:#B56B10}
.fin-grid{display:grid;grid-template-columns:1fr 1fr;gap:0}
.fin-col{padding-right:22px}
.fin-col+.fin-col{padding-left:22px;padding-right:0;border-left:1px solid rgba(0,49,65,.07)}
.fin-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid rgba(0,49,65,.05)}
.fin-row:last-child{border-bottom:none}
.fin-row-lbl{font-size:.8rem;color:#4a6d5c}
.fin-row-val{font-size:.95rem;font-weight:800;color:${D}}
.fin-row-val.gold{color:#b8860b}.fin-row-val.green{color:#167421}.fin-row-val.sky{color:#2d7ec4}.fin-row-val.amber{color:#B56B10}
.fin-total{border-top:2px solid ${D};margin-top:4px;padding-top:10px;display:flex;justify-content:space-between;align-items:center}
.fin-total-lbl{font-size:.8rem;font-weight:800;color:${D};text-transform:uppercase}
.fin-total-val{font-size:1.3rem;font-weight:900;color:${D}}

/* Tables */
.tw{background:#fff;border-radius:10px;border:1px solid rgba(0,49,65,.06);box-shadow:0 2px 12px rgba(0,49,65,.04);overflow:hidden}
.tw table{width:100%;border-collapse:collapse}
.tw thead{background:#F8F3EC}.tw thead tr{border-bottom:1.5px solid #E8DFD2}
.tw th{text-align:left;padding:9px 13px;font-size:.52rem;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:${T};white-space:nowrap}
.tw td{padding:10px 13px;font-size:.8rem;border-bottom:1px solid rgba(0,49,65,.05);color:#2E4A5A}
.tw tbody tr:last-child td{border-bottom:none}
.tw tbody tr:hover td{background:rgba(0,49,65,.02)}
.tn{font-weight:800;color:${D}}.tg{font-weight:700;color:#167421}
.bdg{display:inline-block;padding:2px 8px;border-radius:99px;font-size:.58rem;font-weight:800}
.ba{background:#EEFBE8;color:#167421}.bp{background:#FFF3E0;color:#B56B10}.bs{background:#E8F3FF;color:#0066BF}.bd{background:#FDEDEB;color:#c0392b}.bv{background:#f0f0f0;color:#999}
.pag{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-top:1px solid rgba(0,49,65,.07);font-size:.74rem;color:#7A8F9C}
.pgb{font-size:.72rem;font-weight:700;color:${T};background:none;border:1.5px solid #E8DFD2;border-radius:7px;padding:4px 11px;cursor:pointer}
.pgb:hover{border-color:${T}}.pgb:disabled{opacity:.35;cursor:default}

/* Company cards */
.co-card{background:#fff;border-radius:14px;border:1px solid rgba(0,49,65,.06);box-shadow:0 2px 12px rgba(0,49,65,.04);padding:20px 22px;margin-bottom:12px}
.co-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
.co-name{font-size:1rem;font-weight:800;color:${D}}
.co-id{font-size:.68rem;color:#7A8F9C;margin-top:2px}
.co-mini{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
.co-mini-box{background:#FAF6F0;border-radius:8px;padding:9px 12px}
.co-mini-lbl{font-size:.52rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#7A8F9C;margin-bottom:3px}
.co-mini-val{font-size:1rem;font-weight:800;color:${D}}
.co-mini-val.green{color:#167421}.co-mini-val.sky{color:#2d7ec4}
.co-actions{display:flex;gap:8px}
.btn-outline{font-size:.68rem;font-weight:700;color:${T};border:1.5px solid #E8DFD2;border-radius:8px;padding:5px 12px;background:#fff;cursor:pointer;font-family:'DM Sans',sans-serif;transition:.12s;text-decoration:none}
.btn-outline:hover{border-color:${T}}
.btn-gold{background:${G};color:${D};border-color:${G};font-weight:800}
.btn-gold:hover{background:#e6b200;border-color:#e6b200}

/* AR Summary */
.ar-card{flex:1;min-width:130px;background:#fff;border-radius:12px;padding:14px 16px;box-shadow:0 2px 8px rgba(0,49,65,.06)}
.ar-lbl{font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
.ar-val{font-size:1.4rem;font-weight:900;color:${D}}

/* Invoice detail expandable */
.inv-detail{background:#F8F3EC}
.inv-detail-inner{padding:12px 18px;font-size:.75rem;color:#4a6d5c}
.inv-detail-inner table{width:100%;border-collapse:collapse;margin-top:8px}
.inv-detail-inner th,.inv-detail-inner td{padding:5px 9px;text-align:left;border-bottom:1px solid rgba(0,49,65,.07)}
.inv-detail-inner th{font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#7A8F9C}

/* Orders summary bar */
.sum-bar{display:grid;grid-template-columns:repeat(5,1fr);background:${D};border-radius:14px 14px 0 0;overflow:hidden}
.sb-cell{padding:12px 16px}
.sb-cell .sbl{font-size:.55rem;text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin-bottom:3px}
.sb-cell .sbv{font-size:18px;font-weight:800;color:#fff}
.c-navy .sbl{color:rgba(255,255,255,.5)}.c-yellow .sbl{color:${G}}.c-purple .sbl{color:#C8A4F5}.c-green .sbl{color:#6BBD52}.c-sky .sbl{color:#7BC4FF}

/* Controls */
.ctrl-input{font-size:.78rem;padding:7px 12px;border:1.5px solid #E8DFD2;border-radius:8px;outline:none;font-family:'DM Sans',sans-serif}
.ctrl-input:focus{border-color:${T}}
.ctrl-select{font-size:.78rem;padding:7px 12px;border:1.5px solid #E8DFD2;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;cursor:pointer;outline:none}
.ctrl-select:focus{border-color:${T}}
.sect-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;gap:8px;flex-wrap:wrap}
.sect-t{font-size:.94rem;font-weight:900;color:${D};letter-spacing:-.15px}

/* Loading / empty */
.ca-loading{text-align:center;padding:60px 20px;color:#7A8F9C;font-size:.85rem}

@media(max-width:900px){
  .ca-cont{padding:16px}
  .fin-grid{grid-template-columns:1fr}
  .fin-col+.fin-col{border-left:none;padding-left:0;margin-top:14px;padding-top:14px;border-top:1px solid rgba(0,49,65,.07)}
  .growth-grid{grid-template-columns:repeat(2,1fr)}
  .sum-bar{grid-template-columns:repeat(3,1fr)}
  .co-mini{grid-template-columns:repeat(2,1fr)}
}
`;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  return `$${(n ?? 0).toFixed(2)}`;
}
function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtShort(s: string | null | undefined) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}
function statusBdg(status: string) {
  const map: Record<string,string> = { paid:'ba', sent:'bs', pending:'bp', overdue:'bd', void:'bv', partial:'bs' };
  return <span className={`bdg ${map[status] ?? 'bv'}`}>{status.charAt(0).toUpperCase()+status.slice(1)}</span>;
}

// ── Company Form Modal ─────────────────────────────────────────────────────────

function CompanyModal({ company, onClose, onSaved }: { company: BdCompany | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    id: company?.id ?? '', name: company?.name ?? '',
    delivery_day: company?.delivery_day ?? '', contact_name: company?.contact_name ?? '',
    contact_email: company?.contact_email ?? '', is_active: company?.is_active ?? true,
    fridge_location: (company as any)?.fridge_location ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const p: any = { ...form }; if (!p.id) delete p.id;
      await api.bdUpsertCompany(p); onSaved(); onClose();
    } catch (err: any) { alert(err.message); } finally { setSaving(false); }
  }

  return (
    <div style={{ position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.5)',fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ width:'100%',maxWidth:440,background:'#fff',borderRadius:16,boxShadow:'0 24px 60px rgba(0,0,0,.3)',overflow:'hidden' }}>
        <div style={{ background:D,padding:'18px 22px',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <span style={{ color:'#fff',fontWeight:800,fontSize:'.9rem' }}>{company ? 'Edit Company' : 'New Company'}</span>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'rgba(255,255,255,.6)',fontSize:'1.2rem',cursor:'pointer' }}>×</button>
        </div>
        <form onSubmit={submit} style={{ padding:'22px',display:'flex',flexDirection:'column',gap:14 }}>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
            <div>
              <label style={{ display:'block',fontSize:'.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:T,marginBottom:5 }}>Company Name *</label>
              <input required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="ctrl-input" style={{ width:'100%' }} />
            </div>
            <div>
              <label style={{ display:'block',fontSize:'.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:T,marginBottom:5 }}>Code {!company && <span style={{ fontWeight:400,color:'#aaa' }}>(auto)</span>}</label>
              <input value={form.id} onChange={e=>setForm(f=>({...f,id:e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')}))} disabled={!!company} className="ctrl-input" style={{ width:'100%',fontFamily:'monospace' }} placeholder="e.g. ACME" />
            </div>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
            <div>
              <label style={{ display:'block',fontSize:'.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:T,marginBottom:5 }}>Delivery Day</label>
              <select value={form.delivery_day} onChange={e=>setForm(f=>({...f,delivery_day:e.target.value}))} className="ctrl-select" style={{ width:'100%' }}>
                <option value="">— none —</option>
                {['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d=><option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display:'block',fontSize:'.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:T,marginBottom:5 }}>Status</label>
              <select value={form.is_active?'true':'false'} onChange={e=>setForm(f=>({...f,is_active:e.target.value==='true'}))} className="ctrl-select" style={{ width:'100%' }}>
                <option value="true">Active</option><option value="false">Inactive</option>
              </select>
            </div>
          </div>
          {[
            { key:'contact_name',lbl:'Contact Name' },
            { key:'contact_email',lbl:'Contact Email',type:'email' },
            { key:'fridge_location',lbl:'Fridge Location' },
          ].map(({key,lbl,type})=>(
            <div key={key}>
              <label style={{ display:'block',fontSize:'.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:T,marginBottom:5 }}>{lbl}</label>
              <input type={type??'text'} value={(form as any)[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} className="ctrl-input" style={{ width:'100%' }} />
            </div>
          ))}
          <div style={{ display:'flex',justifyContent:'flex-end',gap:10,paddingTop:4 }}>
            <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
            <button type="submit" disabled={saving} style={{ background:saving?'#93adb8':D,color:'#fff',border:'none',borderRadius:8,padding:'8px 20px',fontFamily:"'DM Sans',sans-serif",fontSize:'.82rem',fontWeight:800,cursor:saving?'default':'pointer' }}>
              {saving?'Saving…':'Save Company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Employee Form Modal ────────────────────────────────────────────────────────

function EmployeeModal({ employee, companies, defaultCompanyId, onClose, onSaved }: {
  employee: BdEmployee | null; companies: BdCompany[]; defaultCompanyId?: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    id: employee?.id ?? '', company_id: employee?.company_id ?? defaultCompanyId ?? '',
    name: employee?.name ?? '', email: employee?.email ?? '',
    role: employee?.role ?? 'employee', employee_code: employee?.employee_code ?? '',
    is_active: employee?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const p: any = { ...form };
      if (!p.id) delete p.id; if (!p.employee_code) delete p.employee_code;
      await api.bdUpsertEmployee(p); onSaved(); onClose();
    } catch (err: any) { alert(err.message); } finally { setSaving(false); }
  }

  return (
    <div style={{ position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.5)',fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ width:'100%',maxWidth:420,background:'#fff',borderRadius:16,boxShadow:'0 24px 60px rgba(0,0,0,.3)',overflow:'hidden' }}>
        <div style={{ background:D,padding:'18px 22px',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <span style={{ color:'#fff',fontWeight:800,fontSize:'.9rem' }}>{employee ? 'Edit Employee' : 'Add Employee'}</span>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'rgba(255,255,255,.6)',fontSize:'1.2rem',cursor:'pointer' }}>×</button>
        </div>
        <form onSubmit={submit} style={{ padding:'22px',display:'flex',flexDirection:'column',gap:14 }}>
          <div>
            <label style={{ display:'block',fontSize:'.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:T,marginBottom:5 }}>Company *</label>
            <select required value={form.company_id} onChange={e=>setForm(f=>({...f,company_id:e.target.value}))} className="ctrl-select" style={{ width:'100%' }}>
              <option value="">— select —</option>
              {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
            <div>
              <label style={{ display:'block',fontSize:'.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:T,marginBottom:5 }}>Full Name *</label>
              <input required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="ctrl-input" style={{ width:'100%' }} />
            </div>
            <div>
              <label style={{ display:'block',fontSize:'.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:T,marginBottom:5 }}>Role</label>
              <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} className="ctrl-select" style={{ width:'100%' }}>
                <option value="employee">Employee</option><option value="manager">Manager</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ display:'block',fontSize:'.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:T,marginBottom:5 }}>Email *</label>
            <input required type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} className="ctrl-input" style={{ width:'100%' }} />
          </div>
          <div style={{ display:'flex',justifyContent:'flex-end',gap:10,paddingTop:4 }}>
            <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
            <button type="submit" disabled={saving} style={{ background:saving?'#93adb8':D,color:'#fff',border:'none',borderRadius:8,padding:'8px 20px',fontFamily:"'DM Sans',sans-serif",fontSize:'.82rem',fontWeight:800,cursor:saving?'default':'pointer' }}>
              {saving?'Saving…':'Save Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── PIN Modal ──────────────────────────────────────────────────────────────────

function PinModal({ companyId, companyName, onClose }: { companyId: string; companyName: string; onClose: () => void }) {
  const [pin, setPin] = useState(''); const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (pin.length < 4) return alert('PIN must be at least 4 digits.'); setSaving(true);
    try { await api.bdUpdateCompanyPin(companyId, pin); alert(`✓ PIN updated for ${companyName}`); onClose(); }
    catch (err: any) { alert(err.message); } finally { setSaving(false); }
  }
  return (
    <div style={{ position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.5)',fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ width:'100%',maxWidth:360,background:'#fff',borderRadius:16,boxShadow:'0 24px 60px rgba(0,0,0,.3)',overflow:'hidden' }}>
        <div style={{ background:D,padding:'18px 22px',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <span style={{ color:'#fff',fontWeight:800,fontSize:'.9rem' }}>Change PIN — {companyName}</span>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'rgba(255,255,255,.6)',fontSize:'1.2rem',cursor:'pointer' }}>×</button>
        </div>
        <form onSubmit={submit} style={{ padding:'22px' }}>
          <label style={{ display:'block',fontSize:'.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:T,marginBottom:8 }}>New PIN (4–8 digits)</label>
          <input required type="password" inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))}
            className="ctrl-input" style={{ width:'100%',textAlign:'center',letterSpacing:6,fontSize:'1.3rem',marginBottom:16 }} placeholder="••••" />
          <div style={{ display:'flex',justifyContent:'flex-end',gap:10 }}>
            <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
            <button type="submit" disabled={saving} style={{ background:saving?'#aaa':'#B56B10',color:'#fff',border:'none',borderRadius:8,padding:'8px 20px',fontFamily:"'DM Sans',sans-serif",fontSize:'.82rem',fontWeight:800,cursor:saving?'default':'pointer' }}>
              {saving?'Saving…':'Update PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Company Drawer ─────────────────────────────────────────────────────────────

function CompanyDrawer({ company, onClose, onEditEmployee, onAddEmployee, onChangePin }: {
  company: BdCompany; onClose: () => void;
  onEditEmployee: (e: BdEmployee) => void; onAddEmployee: (id: string) => void; onChangePin: (id: string, name: string) => void;
}) {
  type DTab = 'overview' | 'employees' | 'orders' | 'invoices';
  const [tab, setTab] = useState<DTab>('overview');
  const [dash, setDash]       = useState<any>(null);
  const [emps, setEmps]       = useState<BdEmployee[]>([]);
  const [orders, setOrders]   = useState<BdOrder[]>([]);
  const [invs, setInvs]       = useState<BdInvoice[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (tab === 'overview') setDash((await api.bdGetCompanyDashboard(company.id)));
        else if (tab === 'employees') setEmps((await api.bdGetCompanyEmployees(company.id)).employees);
        else if (tab === 'orders')   setOrders((await api.bdGetCompanyOrders(company.id, 50)).orders);
        else if (tab === 'invoices') setInvs((await api.bdGetCompanyInvoices(company.id)).invoices);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [tab, company.id]);

  return (
    <div style={{ position:'fixed',inset:0,zIndex:40,display:'flex',fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ flex:1,background:'rgba(0,0,0,.35)' }} onClick={onClose} />
      <div style={{ width:'100%',maxWidth:580,background:'#fff',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'-8px 0 40px rgba(0,0,0,.2)' }}>
        {/* Header */}
        <div style={{ background:D,padding:'18px 22px' }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
            <span style={{ color:'#fff',fontWeight:900,fontSize:'1rem' }}>{company.name}</span>
            <div style={{ display:'flex',gap:8,alignItems:'center' }}>
              <button onClick={()=>onChangePin(company.id,company.name)} style={{ background:'rgba(181,107,16,.8)',color:'#fff',border:'none',borderRadius:7,padding:'5px 11px',fontSize:'.68rem',fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif" }}>🔑 PIN</button>
              <button onClick={onClose} style={{ background:'none',border:'none',color:'rgba(255,255,255,.6)',fontSize:'1.3rem',cursor:'pointer' }}>×</button>
            </div>
          </div>
          <span style={{ fontSize:'.68rem',color:'rgba(255,255,255,.5)' }}>
            {company.id} · {company.delivery_day??'No delivery'} · {company._count?.employees??0} employees
          </span>
        </div>
        {/* Inner tabs */}
        <div style={{ background:D,borderTop:'1px solid rgba(255,255,255,.08)',display:'flex',padding:'0 16px' }}>
          {(['overview','employees','orders','invoices'] as DTab[]).map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{ padding:'9px 14px',fontSize:'.75rem',fontWeight:tab===t?800:600,color:tab===t?'#fff':'rgba(255,255,255,.45)',background:'transparent',border:'none',borderBottom:`2.5px solid ${tab===t?G:'transparent'}`,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",textTransform:'capitalize',transition:'.12s' }}>
              {t}
            </button>
          ))}
        </div>
        {/* Content */}
        <div style={{ flex:1,overflowY:'auto',padding:'18px 20px' }}>
          {loading && <div className="ca-loading">Loading…</div>}
          {/* Overview */}
          {!loading && tab==='overview' && dash && (
            <div>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14 }}>
                {[
                  {lbl:'Employees',val:dash.company?.employee_count??0,cls:''},
                  {lbl:'Orders (30d)',val:dash.recent_orders??0,cls:'sky'},
                  {lbl:'Meals (30d)',val:dash.totals?.meals??0,cls:'green'},
                  {lbl:'Employee Cost',val:fmt(dash.totals?.employee),cls:''},
                  {lbl:'Company Cost',val:fmt(dash.totals?.company),cls:'gold'},
                  {lbl:'BD Revenue',val:fmt(dash.totals?.bd),cls:'sky'},
                ].map(s=>(
                  <div key={s.lbl} className="co-mini-box">
                    <div className="co-mini-lbl">{s.lbl}</div>
                    <div className={`co-mini-val ${s.cls}`}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Employees */}
          {!loading && tab==='employees' && (
            <div>
              <div style={{ display:'flex',justifyContent:'flex-end',marginBottom:12 }}>
                <button onClick={()=>onAddEmployee(company.id)} style={{ background:D,color:'#fff',border:'none',borderRadius:8,padding:'7px 14px',fontSize:'.75rem',fontWeight:800,cursor:'pointer',fontFamily:"'DM Sans',sans-serif" }}>+ Add Employee</button>
              </div>
              {emps.length===0 ? <div className="ca-loading">No employees found.</div> : (
                <div className="tw">
                  <table>
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Code</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {emps.map(emp=>(
                        <tr key={emp.id}>
                          <td className="tn">{emp.name}</td>
                          <td style={{ fontSize:'.72rem',color:'#6b7f90' }}>{emp.email}</td>
                          <td><span style={{ fontSize:'.6rem',fontWeight:800,padding:'2px 7px',borderRadius:99,background:emp.role==='manager'?'rgba(116,83,162,.1)':'rgba(0,70,94,.08)',color:emp.role==='manager'?'#7453A2':T }}>{emp.role}</span></td>
                          <td style={{ fontFamily:'monospace',fontSize:'.72rem',color:'#9aabb8' }}>{emp.employee_code}</td>
                          <td><span className={`bdg ${emp.is_active?'ba':'bv'}`}>{emp.is_active?'Active':'Inactive'}</span></td>
                          <td><button onClick={()=>onEditEmployee(emp)} className="btn-outline" style={{ fontSize:'.65rem' }}>Edit</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {/* Orders */}
          {!loading && tab==='orders' && (
            <div className="tw">
              {orders.length===0 ? <div className="ca-loading">No orders found.</div> : (
                <table>
                  <thead><tr><th>Order #</th><th>Employee</th><th>Delivery</th><th>Meals</th><th>Emp Paid</th><th>Co. Covered</th></tr></thead>
                  <tbody>
                    {orders.map(o=>(
                      <tr key={o.id}>
                        <td className="tn">{o.order_code}</td>
                        <td>{(o as any).employee?.name??'—'}</td>
                        <td style={{ fontSize:'.75rem' }}>{fmtShort(o.delivery_date)}</td>
                        <td>{o.items?.length??0}</td>
                        <td>{fmt(o.employee_cost)}</td>
                        <td className="tg">{fmt(o.company_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {/* Invoices */}
          {!loading && tab==='invoices' && (
            <div className="tw">
              {invs.length===0 ? <div className="ca-loading">No invoices found.</div> : (
                <table>
                  <thead><tr><th>Invoice #</th><th>Period</th><th>Meals</th><th>Amount Due</th><th>Status</th></tr></thead>
                  <tbody>
                    {invs.map(inv=>(
                      <tr key={inv.id}>
                        <td className="tn">{inv.invoice_number}</td>
                        <td style={{ fontSize:'.75rem' }}>{fmtShort(inv.period_start)} – {fmtShort(inv.period_end)}</td>
                        <td>{(inv as any).total_meals??'—'}</td>
                        <td style={{ fontWeight:800 }}>{fmt(inv.total_amount)}</td>
                        <td>{statusBdg(inv.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
        <div style={{ padding:'12px 20px',borderTop:'1px solid #f0f4f8',background:'#fafcfe',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <button onClick={()=>onAddEmployee(company.id)} className="btn-outline">+ Add Employee</button>
          <span className={`bdg ${company.is_active?'ba':'bv'}`}>{company.is_active?'Active':'Inactive'}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function BdCorporateAdminPage() {
  const [tab, setTab] = useState<Tab>('overview');

  // Data
  const [overview,   setOverview]   = useState<any>(null);
  const [companies,  setCompanies]  = useState<BdCompany[]>([]);
  const [invoices,   setInvoices]   = useState<(BdInvoice & { company?: { name: string } })[]>([]);
  const [orders,     setOrders]     = useState<BdOrder[]>([]);
  const [arSummary,  setArSummary]  = useState<any>(null);
  const [loadingMap, setLoadingMap] = useState<Record<Tab, boolean>>({ overview:true, companies:false, invoices:false, orders:false, reports:false });
  const [creditModal, setCreditModal] = useState(false);
  const [creditForm, setCreditForm] = useState({ company_id: '', employee_id: '', amount: '', reason: '' });
  const [creditSaving, setCreditSaving] = useState(false);

  // Filters
  const [invCoFilter,  setInvCoFilter]  = useState('');
  const [invStFilter,  setInvStFilter]  = useState('');
  const [ordCoFilter,  setOrdCoFilter]  = useState('');
  const [ordSearch,    setOrdSearch]    = useState('');
  const [ordPage,      setOrdPage]      = useState(0);
  const [expandedInv,  setExpandedInv]  = useState<string | null>(null);

  // Modals
  const [companyModal,  setCompanyModal]  = useState<{ company: BdCompany | null } | null>(null);
  const [employeeModal, setEmployeeModal] = useState<{ emp: BdEmployee | null; companyId?: string } | null>(null);
  const [pinModal,      setPinModal]      = useState<{ id: string; name: string } | null>(null);
  const [drawer,        setDrawer]        = useState<BdCompany | null>(null);

  function setLoading(t: Tab, v: boolean) { setLoadingMap(m=>({...m,[t]:v})); }

  const loadOverview = useCallback(async () => {
    setLoading('overview', true);
    try {
      const [ov, co] = await Promise.all([api.bdGetOverview(), api.bdGetAllCompanies()]);
      setOverview(ov); setCompanies(co.companies);
    } catch (e) { console.error(e); }
    setLoading('overview', false);
  }, []);

  const loadCompanies = useCallback(async () => {
    setLoading('companies', true);
    try { setCompanies((await api.bdGetAllCompanies()).companies); }
    catch (e) { console.error(e); }
    setLoading('companies', false);
  }, []);

  const loadInvoices = useCallback(async () => {
    setLoading('invoices', true);
    try {
      const [inv, ar] = await Promise.all([api.bdGetAllInvoices(), api.bdGetArSummary()]);
      setInvoices(inv.invoices); setArSummary(ar);
    } catch (e) { console.error(e); }
    setLoading('invoices', false);
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading('orders', true);
    try { setOrders((await api.bdGetAllOrdersGlobal()).orders); }
    catch (e) { console.error(e); }
    setLoading('orders', false);
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => {
    if (tab === 'companies' && companies.length === 0) loadCompanies();
    if (tab === 'invoices'  && invoices.length === 0)  loadInvoices();
    if (tab === 'orders'    && orders.length === 0)    loadOrders();
  }, [tab]);

  // Filtered invoice/order sets
  const filteredInv = invoices.filter(inv =>
    (!invCoFilter || inv.company_id === invCoFilter) &&
    (!invStFilter || inv.status === invStFilter)
  );
  const filteredOrd = orders.filter(o =>
    (!ordCoFilter || (o as any).company?.name === ordCoFilter || o.company_id === ordCoFilter) &&
    (!ordSearch   || (o as any).employee?.name?.toLowerCase().includes(ordSearch.toLowerCase()) || o.order_code?.toLowerCase().includes(ordSearch.toLowerCase()))
  );
  const ORD_PAGE_SZ = 20;
  const ordPages = Math.ceil(filteredOrd.length / ORD_PAGE_SZ);
  const pageOrders = filteredOrd.slice(ordPage * ORD_PAGE_SZ, (ordPage + 1) * ORD_PAGE_SZ);

  // Order summary bar totals
  const ordSumOrders = filteredOrd.length;
  const ordSumMeals  = filteredOrd.reduce((s,o)=>s+(o.items?.length??0),0);
  const ordSumEmp    = filteredOrd.reduce((s,o)=>s+o.employee_cost,0);
  const ordSumCo     = filteredOrd.reduce((s,o)=>s+o.company_cost,0);
  const ordSumBd     = filteredOrd.reduce((s,o)=>s+o.bd_cost,0);

  const pendingInvCount = invoices.filter(i=>i.status==='pending'||i.status==='overdue').length;

  return (
    <div className="ca-wrap" suppressHydrationWarning>
      <style suppressHydrationWarning>{CSS}</style>

      {/* ── Topbar ── */}
      <div className="ca-tb">
        <div className="ca-tb-title">betterday <b>· Corporate Admin</b></div>
        <span className="ca-tb-pill">BD ADMIN</span>
        <div className="ca-tb-right">
          {pendingInvCount > 0 && (
            <button onClick={()=>setTab('invoices')} className="ca-tb-out" style={{ color:'#FFC600',borderColor:'rgba(255,198,0,.3)' }}>
              ⚠ {pendingInvCount} unpaid
            </button>
          )}
          <button onClick={()=>setCompanyModal({company:null})} className="ca-tb-btn">+ New Company</button>
        </div>
      </div>

      {/* ── Inner tabs ── */}
      <div className="ca-tabs">
        {([
          { key:'overview',  label:'Overview'  },
          { key:'companies', label:`Companies${companies.length ? ` (${companies.length})` : ''}` },
          { key:'invoices',  label:`Invoices${pendingInvCount ? ` ⚠${pendingInvCount}` : ''}` },
          { key:'orders',    label:'Orders'    },
          { key:'reports',   label:'Reports'   },
        ] as {key:Tab,label:string}[]).map(({key,label})=>(
          <button key={key} onClick={()=>setTab(key)} className={`ca-tab${tab===key?' on':''}`}>{label}</button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="ca-cont">

        {/* ════ OVERVIEW ════ */}
        {tab==='overview' && (
          <>
            {loadingMap.overview && <div className="ca-loading">Loading overview…</div>}
            {!loadingMap.overview && overview && (
              <>
                {/* Revenue hero */}
                <div className="hero-rev">
                  <div>
                    <div className="hl-label">Total Revenue — All Time</div>
                    <div className="hl-value">{fmt(overview.total_revenue)}</div>
                  </div>
                  <div className="hero-div" />
                  <div style={{ display:'flex',gap:28,flexWrap:'wrap' }}>
                    {[
                      { val: overview.total_meals,    lbl: 'Meals'     },
                      { val: overview.total_orders,   lbl: 'Orders'    },
                      { val: overview.active_companies, lbl: 'Companies' },
                    ].map(s=>(
                      <div key={s.lbl} className="hero-stat">
                        <div className="hs-val">{s.val}</div>
                        <div className="hs-lbl">{s.lbl}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* This week */}
                <div className="sl">This Week</div>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12,marginBottom:14 }}>
                  <div className="card card-gold"><div className="s-label gold">Revenue</div><div className="s-value gold">{fmt(overview.week_revenue)}</div></div>
                  <div className="card card-sky"><div className="s-label sky">Orders</div><div className="s-value sky">{overview.week_orders}</div></div>
                  <div className="card card-purple"><div className="s-label purple">Meals</div><div className="s-value purple">{overview.week_meals}</div></div>
                  <div className="card card-green"><div className="s-label green">Employees</div><div className="s-value green">{overview.week_employees}</div></div>
                  <div className="card card-sky"><div className="s-label sky">Companies</div><div className="s-value sky">{overview.week_companies}</div></div>
                  <div className="card card-purple"><div className="s-label purple">Avg Order</div><div className="s-value purple">{fmt(overview.avg_order_value)}</div></div>
                </div>

                {/* Quick actions */}
                <div className="sl">Quick Actions</div>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14 }}>
                  <button onClick={()=>setTab('invoices')} className="qa-btn qa-btn-amber"><span style={{ fontSize:18 }}>📄</span>View Invoices</button>
                  <button onClick={()=>setTab('orders')}   className="qa-btn qa-btn-dark"><span style={{ fontSize:18 }}>📦</span>All Orders</button>
                  <button onClick={()=>setTab('companies')} className="qa-btn qa-btn-dark"><span style={{ fontSize:18 }}>🏢</span>All Companies</button>
                  <button onClick={()=>setCompanyModal({company:null})} className="qa-btn qa-btn-dark"><span style={{ fontSize:18 }}>+</span>New Company</button>
                </div>

                {/* Top performers */}
                {overview.top_meal && (
                  <div className="card card-gradient" style={{ marginBottom:14,display:'flex',alignItems:'center',minHeight:80,padding:'20px 26px' }}>
                    <div>
                      <div style={{ fontSize:'.6rem',textTransform:'uppercase',letterSpacing:1,color:'#3a5a4e',marginBottom:4 }}>Best-Selling Dish</div>
                      <div style={{ fontSize:'1.3rem',fontWeight:800,color:T }}>{overview.top_meal}</div>
                      <div style={{ fontSize:'.82rem',fontWeight:700,color:T,marginTop:4 }}>{overview.top_meal_count} orders all time</div>
                    </div>
                  </div>
                )}

                {/* Financial overview */}
                <div className="sl">Financial Overview</div>
                <div className="fin-section">
                  <div className="fin-head">
                    <div className="fin-title">All-Time Summary</div>
                    <div style={{ display:'flex',gap:6 }}>
                      {pendingInvCount > 0 && <button onClick={()=>setTab('invoices')} className="fin-link alert">⚠ {pendingInvCount} Unpaid</button>}
                      <button onClick={()=>setTab('invoices')} className="fin-link">📄 Invoices</button>
                    </div>
                  </div>
                  <div className="fin-grid">
                    <div className="fin-col">
                      <div style={{ fontSize:'.6rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'.8px',color:'#7A8F9C',marginBottom:8 }}>Revenue</div>
                      <div className="fin-row"><span className="fin-row-lbl">Total Revenue</span><span className="fin-row-val">{fmt(overview.total_revenue)}</span></div>
                      <div className="fin-row"><span className="fin-row-lbl">Total Orders</span><span className="fin-row-val">{overview.total_orders}</span></div>
                      <div className="fin-total"><span className="fin-total-lbl">Total Meals</span><span className="fin-total-val">{overview.total_meals}</span></div>
                    </div>
                    <div className="fin-col">
                      <div style={{ fontSize:'.6rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'.8px',color:'#7A8F9C',marginBottom:8 }}>Invoices</div>
                      {arSummary && <>
                        <div className="fin-row"><span className="fin-row-lbl">Outstanding (current)</span><span className="fin-row-val">{fmt(arSummary.buckets?.current)}</span></div>
                        <div className="fin-row"><span className="fin-row-lbl">15+ days overdue</span><span className="fin-row-val amber">{fmt(arSummary.buckets?.days_15_30)}</span></div>
                        <div className="fin-total"><span className="fin-total-lbl">Total AR</span><span className="fin-total-val" style={{ color:'#B56B10' }}>{fmt(arSummary.total_ar)}</span></div>
                      </>}
                    </div>
                  </div>
                </div>

                {/* Recent invoices */}
                <div className="sect-hd">
                  <div className="sect-t">Recent Invoices</div>
                  <button onClick={()=>setTab('invoices')} className="btn-outline">View All</button>
                </div>
                <div className="tw">
                  <table>
                    <thead><tr><th>Invoice #</th><th>Company</th><th>Period</th><th>Meals</th><th>Amount Due</th><th>Status</th></tr></thead>
                    <tbody>
                      {invoices.slice(0,6).map(inv=>(
                        <tr key={inv.id}>
                          <td className="tn">{inv.invoice_number}</td>
                          <td className="tn">{(inv as any).company?.name ?? inv.company_id}</td>
                          <td style={{ fontSize:'.75rem' }}>{fmtShort(inv.period_start)}</td>
                          <td>{(inv as any).total_meals??'—'}</td>
                          <td style={{ fontWeight:800 }}>{fmt(inv.total_amount)}</td>
                          <td>{statusBdg(inv.status)}</td>
                        </tr>
                      ))}
                      {invoices.length===0 && <tr><td colSpan={6} style={{ textAlign:'center',padding:'30px',color:'#9eb0bc' }}>No invoices yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* ════ COMPANIES ════ */}
        {tab==='companies' && (
          <>
            <div className="sect-hd">
              <div className="sect-t">All Companies</div>
              <button onClick={()=>setCompanyModal({company:null})} className="btn-outline btn-gold">+ New Company</button>
            </div>
            {loadingMap.companies && <div className="ca-loading">Loading companies…</div>}
            {companies.map(c=>(
              <div key={c.id} className="co-card">
                <div className="co-head">
                  <div>
                    <div className="co-name">{c.name}</div>
                    <div className="co-id">{c.id} · {c.delivery_day??'No delivery day'}</div>
                  </div>
                  <span className={`bdg ${c.is_active?'ba':'bv'}`}>{c.is_active?'Active':'Inactive'}</span>
                </div>
                <div className="co-mini">
                  <div className="co-mini-box"><div className="co-mini-lbl">Employees</div><div className="co-mini-val">{c._count?.employees??0}</div></div>
                  <div className="co-mini-box"><div className="co-mini-lbl">Orders</div><div className="co-mini-val sky">{c._count?.orders??0}</div></div>
                  <div className="co-mini-box"><div className="co-mini-lbl">Contact</div><div className="co-mini-val" style={{ fontSize:'.72rem',fontWeight:600 }}>{c.contact_name??'—'}</div></div>
                  <div className="co-mini-box"><div className="co-mini-lbl">Email</div><div className="co-mini-val" style={{ fontSize:'.65rem',fontWeight:600,color:'#50657a' }}>{c.contact_email??'—'}</div></div>
                </div>
                <div className="co-actions">
                  <button onClick={()=>setDrawer(c)} className="btn-outline">View Detail</button>
                  <button onClick={()=>setCompanyModal({company:c})} className="btn-outline">Edit</button>
                  <button onClick={()=>setPinModal({id:c.id,name:c.name})} className="btn-outline" style={{ color:'#B56B10',borderColor:'rgba(181,107,16,.3)' }}>🔑 PIN</button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ════ INVOICES ════ */}
        {tab==='invoices' && (
          <>
            {/* AR Summary cards */}
            {arSummary && (
              <div style={{ display:'flex',gap:12,flexWrap:'wrap',marginBottom:20 }}>
                <div className="ar-card"><div className="ar-lbl" style={{ color:'#7A8F9C' }}>Total Outstanding</div><div className="ar-val">{fmt(arSummary.total_ar)}</div></div>
                <div className="ar-card"><div className="ar-lbl" style={{ color:'#27ae60' }}>Current</div><div className="ar-val" style={{ color:'#27ae60' }}>{fmt(arSummary.buckets?.current)}</div></div>
                <div className="ar-card"><div className="ar-lbl" style={{ color:'#f39c12' }}>15+ Days</div><div className="ar-val" style={{ color:'#f39c12' }}>{fmt(arSummary.buckets?.days_15_30)}</div></div>
                <div className="ar-card"><div className="ar-lbl" style={{ color:'#e74c3c' }}>30+ Days</div><div className="ar-val" style={{ color:'#e74c3c' }}>{fmt(arSummary.buckets?.days_30_60)}</div></div>
                <div className="ar-card"><div className="ar-lbl" style={{ color:'#c0392b' }}>60+ Days</div><div className="ar-val" style={{ color:'#c0392b' }}>{fmt(arSummary.buckets?.days_60_90)}</div></div>
              </div>
            )}
            <div className="sect-hd">
              <div className="sect-t">All Invoices</div>
              <div style={{ display:'flex',gap:8,flexWrap:'wrap',alignItems:'center' }}>
                <button onClick={()=>setCreditModal(true)} className="ca-tb-btn" style={{ fontSize:'.72rem',padding:'5px 12px' }}>+ Issue Credit</button>
                <select className="ctrl-select" value={invCoFilter} onChange={e=>{setInvCoFilter(e.target.value)}}>
                  <option value="">All Companies</option>
                  {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className="ctrl-select" value={invStFilter} onChange={e=>setInvStFilter(e.target.value)}>
                  <option value="">All Statuses</option>
                  {['pending','sent','paid','overdue','partial','void'].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>
            </div>
            {loadingMap.invoices && <div className="ca-loading">Loading invoices…</div>}
            <div className="tw">
              <table>
                <thead><tr><th>Invoice #</th><th>Company</th><th>Period</th><th>Meals</th><th>Amount Due</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {filteredInv.length===0 && <tr><td colSpan={7} style={{ textAlign:'center',padding:'30px',color:'#9eb0bc' }}>No invoices</td></tr>}
                  {filteredInv.map(inv=>(
                    <Fragment key={inv.id}>
                      <tr style={{ cursor:'pointer' }} onClick={()=>setExpandedInv(expandedInv===inv.id?null:inv.id)}>
                        <td style={{ fontWeight:700,fontSize:'.82rem' }}>{inv.invoice_number}</td>
                        <td className="tn">{(inv as any).company?.name ?? inv.company_id}</td>
                        <td style={{ fontSize:'.75rem' }}>{fmtShort(inv.period_start)}</td>
                        <td>{(inv as any).total_meals??'—'}</td>
                        <td style={{ fontWeight:800 }}>{fmt(inv.total_amount)}</td>
                        <td>{statusBdg(inv.status)}</td>
                        <td style={{ whiteSpace:'nowrap' }}>
                          {(inv.status==='pending'||inv.status==='unpaid') && (
                            <>
                              <button className="btn-outline" style={{ marginRight:4,fontSize:'.65rem' }} onClick={async e=>{e.stopPropagation();await api.bdMarkInvoice(inv.id,'sent');loadInvoices();}}>Send</button>
                              <button className="btn-outline" style={{ fontSize:'.65rem' }} onClick={async e=>{e.stopPropagation();await api.bdMarkInvoice(inv.id,'paid');loadInvoices();}}>Paid</button>
                            </>
                          )}
                          {(inv.status==='sent'||inv.status==='overdue') && (
                            <button className="btn-outline" style={{ fontSize:'.65rem' }} onClick={async e=>{e.stopPropagation();await api.bdMarkInvoice(inv.id,'paid');loadInvoices();}}>Mark Paid</button>
                          )}
                        </td>
                      </tr>
                      {expandedInv===inv.id && (
                        <tr className="inv-detail">
                          <td colSpan={7}>
                            <div className="inv-detail-inner">
                              <div style={{ display:'flex',gap:20,flexWrap:'wrap',marginBottom:8 }}>
                                {[
                                  { lbl:'Full Retail',  val: fmt((inv as any).subtotal_full_retail) },
                                  { lbl:'Emp. Paid',    val: fmt((inv as any).employee_paid) },
                                  { lbl:'Co. Owes',     val: fmt((inv as any).company_owed ?? inv.total_amount) },
                                  { lbl:'BD Subsidy',   val: fmt((inv as any).bd_contributed) },
                                ].map(r=>(
                                  <span key={r.lbl}>{r.lbl}: <strong>{r.val}</strong></span>
                                ))}
                              </div>
                              {(inv as any).tier_breakdown && (
                                <>
                                  <strong>Tier Breakdown</strong>
                                  <table>
                                    <thead><tr><th>Tier</th><th>Meals</th><th>Co. Total</th></tr></thead>
                                    <tbody>
                                      {Object.entries((inv as any).tier_breakdown as Record<string,any>).map(([tier,td])=>(
                                        <tr key={tier}><td>{tier}</td><td>{td.meals}</td><td>{fmt(td.company_total)}</td></tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ════ ORDERS ════ */}
        {tab==='orders' && (
          <>
            <div className="sect-hd" style={{ marginBottom:0 }}>
              <div className="sect-t">All Orders</div>
              <div style={{ display:'flex',gap:8,flexWrap:'wrap',alignItems:'center' }}>
                <input className="ctrl-input" placeholder="Search employee or order #…" value={ordSearch} onChange={e=>{setOrdSearch(e.target.value);setOrdPage(0);}} style={{ minWidth:220 }} />
                <select className="ctrl-select" value={ordCoFilter} onChange={e=>{setOrdCoFilter(e.target.value);setOrdPage(0);}}>
                  <option value="">All Companies</option>
                  {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            {/* Summary bar */}
            <div className="sum-bar" style={{ marginTop:14 }}>
              <div className="sb-cell c-navy"><div className="sbl">Orders</div><div className="sbv">{ordSumOrders}</div></div>
              <div className="sb-cell c-yellow"><div className="sbl">Meals</div><div className="sbv">{ordSumMeals}</div></div>
              <div className="sb-cell c-purple"><div className="sbl">Emp Paid</div><div className="sbv">{fmt(ordSumEmp)}</div></div>
              <div className="sb-cell c-green"><div className="sbl">Co. Covered</div><div className="sbv">{fmt(ordSumCo)}</div></div>
              <div className="sb-cell c-sky"><div className="sbl">BD</div><div className="sbv">{fmt(ordSumBd)}</div></div>
            </div>
            {loadingMap.orders && <div className="ca-loading" style={{ background:'#fff',borderRadius:'0 0 10px 10px' }}>Loading orders…</div>}
            <div className="tw" style={{ borderRadius:'0 0 10px 10px' }}>
              <table>
                <thead><tr><th>Order #</th><th>Employee</th><th>Company</th><th>Delivery</th><th>Meals</th><th>Emp Paid</th><th>Co. Covered</th><th>BD</th></tr></thead>
                <tbody>
                  {pageOrders.length===0 && <tr><td colSpan={8} style={{ textAlign:'center',padding:'30px',color:'#9eb0bc' }}>No orders found</td></tr>}
                  {pageOrders.map(o=>(
                    <tr key={o.id}>
                      <td className="tn">{o.order_code}</td>
                      <td>{(o as any).employee?.name??'—'}</td>
                      <td>{(o as any).company?.name??o.company_id}</td>
                      <td style={{ fontSize:'.75rem' }}>{fmtShort(o.delivery_date)}</td>
                      <td>{o.items?.length??0}</td>
                      <td>{fmt(o.employee_cost)}</td>
                      <td className="tg">{fmt(o.company_cost)}</td>
                      <td style={{ fontSize:'.75rem',color:'#9aabb8' }}>{fmt(o.bd_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pag">
                <button className="pgb" disabled={ordPage===0} onClick={()=>setOrdPage(p=>p-1)}>← Prev</button>
                <span>Page {ordPage+1} of {ordPages||1} · {filteredOrd.length} orders</span>
                <button className="pgb" disabled={ordPage>=ordPages-1} onClick={()=>setOrdPage(p=>p+1)}>Next →</button>
              </div>
            </div>
          </>
        )}

        {/* ════ REPORTS ════ */}
        {tab==='reports' && (
          <>
            <div className="sect-hd"><div className="sect-t">Corporate Reports</div></div>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:14,marginTop:14 }}>
              {[
                { href:'/reports/delivery',      icon:'🚚', title:'Delivery Report',    sub:'Client addresses, meal counts, gate codes, driver assignments' },
                { href:'/reports/labels',         icon:'🏷️', title:'Labels Report',       sub:'Meal container labels for printing — dish, diet, employee' },
                { href:'/reports/picklists',      icon:'📋', title:'Picklist Report',     sub:'Qty, diet, dish, SKU — for kitchen packing' },
                { href:'/reports/production-bd',  icon:'🏭', title:'Production Report',   sub:'Production quantities and dish breakdown by week' },
              ].map(r=>(
                <a key={r.href} href={r.href} className="card" style={{ display:'block',textDecoration:'none',padding:'22px 24px',cursor:'pointer',transition:'box-shadow .15s' }}
                  onMouseEnter={e=>(e.currentTarget.style.boxShadow='0 4px 20px rgba(0,49,65,.12)')}
                  onMouseLeave={e=>(e.currentTarget.style.boxShadow='')}>
                  <div style={{ fontSize:'1.8rem',marginBottom:10 }}>{r.icon}</div>
                  <div style={{ fontSize:'.92rem',fontWeight:800,color:D,marginBottom:4 }}>{r.title}</div>
                  <div style={{ fontSize:'.75rem',color:'#7A8F9C',lineHeight:1.5 }}>{r.sub}</div>
                </a>
              ))}
            </div>
          </>
        )}

      </div>{/* ca-cont */}

      {/* ── Modals ── */}
      {companyModal  !== null && <CompanyModal  company={companyModal.company} onClose={()=>setCompanyModal(null)} onSaved={()=>{loadCompanies();loadOverview();}} />}
      {employeeModal !== null && <EmployeeModal employee={employeeModal.emp} companies={companies} defaultCompanyId={employeeModal.companyId} onClose={()=>setEmployeeModal(null)} onSaved={loadCompanies} />}
      {pinModal      && <PinModal companyId={pinModal.id} companyName={pinModal.name} onClose={()=>setPinModal(null)} />}
      {drawer        && <CompanyDrawer company={drawer} onClose={()=>setDrawer(null)} onEditEmployee={e=>setEmployeeModal({emp:e})} onAddEmployee={id=>setEmployeeModal({emp:null,companyId:id})} onChangePin={(id,name)=>setPinModal({id,name})} />}

      {/* Credit Note Modal */}
      {creditModal && (
        <div style={{ position:'fixed',inset:0,zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.45)' }} onClick={()=>setCreditModal(false)}>
          <div style={{ background:'#fff',borderRadius:'16px',padding:'28px',maxWidth:'420px',width:'92%',boxShadow:'0 20px 60px rgba(0,0,0,.2)',fontFamily:"'DM Sans',sans-serif" }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontWeight:900,fontSize:'1.05rem',color:D,marginBottom:'18px' }}>Issue Credit Note</div>
            <div style={{ display:'flex',flexDirection:'column',gap:'12px' }}>
              <div>
                <label style={{ display:'block',fontSize:'.7rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'.4px',color:'#5A6F7C',marginBottom:'4px' }}>Company *</label>
                <select value={creditForm.company_id} onChange={e=>setCreditForm(f=>({...f,company_id:e.target.value}))}
                  style={{ width:'100%',padding:'9px 12px',border:'1.5px solid #E8DFD2',borderRadius:'8px',fontSize:'.88rem',fontFamily:"'DM Sans',sans-serif",color:D }}>
                  <option value="">Select company</option>
                  {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display:'block',fontSize:'.7rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'.4px',color:'#5A6F7C',marginBottom:'4px' }}>Amount ($) *</label>
                <input type="number" step="0.01" value={creditForm.amount} onChange={e=>setCreditForm(f=>({...f,amount:e.target.value}))}
                  placeholder="0.00" style={{ width:'100%',padding:'9px 12px',border:'1.5px solid #E8DFD2',borderRadius:'8px',fontSize:'.88rem',fontFamily:"'DM Sans',sans-serif",color:D }} />
              </div>
              <div>
                <label style={{ display:'block',fontSize:'.7rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'.4px',color:'#5A6F7C',marginBottom:'4px' }}>Reason</label>
                <input value={creditForm.reason} onChange={e=>setCreditForm(f=>({...f,reason:e.target.value}))}
                  placeholder="e.g. Missed delivery March 15" style={{ width:'100%',padding:'9px 12px',border:'1.5px solid #E8DFD2',borderRadius:'8px',fontSize:'.88rem',fontFamily:"'DM Sans',sans-serif",color:D }} />
              </div>
            </div>
            <div style={{ display:'flex',gap:'8px',marginTop:'20px' }}>
              <button onClick={()=>setCreditModal(false)} style={{ flex:1,padding:'10px',border:'1.5px solid #E8DFD2',borderRadius:'10px',background:'#fff',color:D,fontWeight:700,fontSize:'.85rem',cursor:'pointer',fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
              <button disabled={creditSaving || !creditForm.company_id || !creditForm.amount} onClick={async()=>{
                setCreditSaving(true);
                try {
                  await api.bdCreateCreditNote({ company_id:creditForm.company_id, amount:parseFloat(creditForm.amount), reason:creditForm.reason || undefined });
                  setCreditModal(false); setCreditForm({company_id:'',employee_id:'',amount:'',reason:''});
                  alert('Credit note created');
                } catch(e:any) { alert(e.message); }
                setCreditSaving(false);
              }} style={{ flex:1,padding:'10px',border:'none',borderRadius:'10px',background:G,color:D,fontWeight:800,fontSize:'.85rem',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",opacity:(!creditForm.company_id||!creditForm.amount)?0.4:1 }}>
                {creditSaving ? 'Saving...' : 'Issue Credit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
