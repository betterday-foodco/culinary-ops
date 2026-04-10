'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import {
  getCorpUser, clearCorpAuth,
  corpManager,
  type CorpOrder,
} from '../../../lib/corp-api';

/* ── Design tokens — exact match to Conner's manager_dashboard.html ── */
const dk  = '#003141';
const br  = '#00465e';
const gld = '#FFC600';
const cr  = '#FAEBDA';
const bdr = '#E8DFD2';
const sec = '#7A8F9C';
const grn = '#1a7a46';
const red = '#c0392b';
const sky = '#2d7ec4';
const amb = '#B56B10';

type Tab = 'overview' | 'orders' | 'invoices' | 'monthly' | 'employees' | 'par' | 'mealplan' | 'account';

/* ── Helpers ── */
const fmt$ = (n: number) => `$${(n ?? 0).toFixed(2)}`;
const pct  = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function getWeekBounds() {
  const now = new Date();
  const sun = new Date(now);
  sun.setDate(now.getDate() - now.getDay());
  sun.setHours(0, 0, 0, 0);
  const sat = new Date(sun);
  sat.setDate(sun.getDate() + 7);
  return { start: sun, end: sat };
}

function weekLabel(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDeadline(d: Date) {
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return 'Closed';
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

/* ── Badge ── */
function Bdg({ status }: { status: string }) {
  const MAP: Record<string, [string, string]> = {
    pending:   ['rgba(212,160,41,.15)', amb],
    confirmed: ['rgba(26,122,70,.12)',  grn],
    delivered: ['rgba(26,122,70,.15)',  '#167421'],
    cancelled: ['rgba(192,57,43,.1)',   red],
    paid:      ['rgba(26,122,70,.12)',  grn],
    unpaid:    ['rgba(212,160,41,.12)', amb],
    overdue:   ['rgba(192,57,43,.1)',   red],
    sent:      ['rgba(45,126,196,.12)', sky],
    draft:     ['#f0f4f8',             '#64748b'],
    void:      ['#f0f4f8',             '#64748b'],
  };
  const [bg, clr] = MAP[status?.toLowerCase()] ?? ['#f0f4f8', '#64748b'];
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:'999px', fontSize:'.58rem', fontWeight:800, background:bg, color:clr, textTransform:'capitalize' }}>
      {status}
    </span>
  );
}

/* ── Section label ── */
function Sl({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'.54rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'1.2px', color:sec, margin:'22px 0 10px' }}>
      {children}
      <span style={{ flex:1, height:'1px', background:'#E0D4C2' }} />
    </div>
  );
}

/* ── White card ── */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background:'#fff', borderRadius:'12px', border:`1px solid rgba(0,49,65,.06)`, boxShadow:'0 2px 12px rgba(0,49,65,.04)', ...style }}>
      {children}
    </div>
  );
}

/* ── Stat row inside glance columns ── */
function Tw({ label, value, color, sub }: { label: string; value: React.ReactNode; color?: string; sub?: string }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', fontSize:'.82rem' }}>
      <span style={{ color:'#5A6F7C', fontWeight:500 }}>{label}</span>
      <span style={{ fontWeight:800, color:color ?? dk }}>
        {value}
        {sub && <span style={{ fontSize:'.7rem', color:sec, fontWeight:600, marginLeft:'4px' }}>{sub}</span>}
      </span>
    </div>
  );
}

function TwDiv() { return <div style={{ height:'1px', background:'#F0EBE2', margin:'4px 0' }} />; }

/* ── Table styles ── */
const tblSt = { width:'100%', borderCollapse:'collapse' as const };
const thSt: React.CSSProperties  = { textAlign:'left', padding:'10px 14px', fontSize:'.56rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'.7px', color:br, background:'#F8F3EC', borderBottom:`1.5px solid ${bdr}`, whiteSpace:'nowrap' };
const tdSt: React.CSSProperties  = { padding:'11px 14px', color:'#2E4A5A', borderBottom:`1px solid rgba(0,49,65,.05)`, fontSize:'.8rem' };

/* ════════════════════════════════════════════════════════════════════════════
 * MAIN PAGE
 * ════════════════════════════════════════════════════════════════════════════ */
export default function CorporateManagerPage() {
  const router = useRouter();

  const [user, setUser]             = useState<ReturnType<typeof getCorpUser>>(null);
  const [tab, setTab]               = useState<Tab>('overview');
  const [dashboard, setDashboard]   = useState<any>(null);
  const [orders, setOrders]         = useState<CorpOrder[]>([]);
  const [employees, setEmployees]   = useState<any[]>([]);
  const [invoices, setInvoices]     = useState<any[]>([]);
  const [benefitLevels, setBenefitLevels] = useState<any[]>([]);
  const [parLevels, setParLevels]   = useState<any[]>([]);
  const [company, setCompany]       = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState('');

  const [empWorking, setEmpWorking] = useState<string | null>(null);
  const [compEdit, setCompEdit]     = useState<any>({});
  const [newPin, setNewPin]         = useState('');
  const [savingComp, setSavingComp] = useState(false);
  const [editingLevel, setEditingLevel] = useState<any | null>(null);
  const [tierDraft, setTierDraft]   = useState<any>({});
  const [savingTier, setSavingTier] = useState(false);
  const [parDraft, setParDraft]     = useState<Record<string, number>>({});
  const [savingPar, setSavingPar]   = useState(false);
  const [expandedInv, setExpandedInv] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderPage, setOrderPage]   = useState(0);
  const [selectedEmps, setSelectedEmps] = useState<Set<string>>(new Set());
  const [sendingReminders, setSendingReminders] = useState(false);
  const [pinModalEmp, setPinModalEmp] = useState<{ id: string; name: string } | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<CorpOrder | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3200); }

  async function submitSetPin() {
    if (!pinModalEmp || pinInput.length < 4) return;
    try {
      await corpManager.setEmployeePin(pinModalEmp.id, pinInput);
      showToast(`PIN set for ${pinModalEmp.name}`);
      setPinModalEmp(null); setPinInput('');
    } catch (e: any) { showToast(e.message ?? 'Failed to set PIN'); }
  }

  useEffect(() => {
    const u = getCorpUser();
    if (!u) { router.replace('/corporate/login'); return; }
    if (u.role !== 'corp_manager') { router.replace('/corporate/work'); return; }
    setUser(u);
    loadDashboard();
  }, [router]);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [dash, ords, emps, invs] = await Promise.allSettled([
        corpManager.getDashboard(),
        corpManager.getOrders(),
        corpManager.getEmployees(),
        corpManager.getInvoices(),
      ]);
      if (dash.status === 'fulfilled') setDashboard(dash.value);
      if (ords.status === 'fulfilled') setOrders((ords.value as any).orders ?? []);
      if (emps.status === 'fulfilled') setEmployees((emps.value as any).employees ?? []);
      if (invs.status === 'fulfilled') setInvoices((invs.value as any).invoices ?? []);
    } finally { setLoading(false); }
  }

  const loadBenefits = useCallback(async () => {
    try { const r = await corpManager.getBenefitLevels(); setBenefitLevels(r.benefit_levels ?? []); } catch {}
  }, []);

  const loadParLevels = useCallback(async () => {
    try {
      const r = await corpManager.getParLevels();
      const lvls = r.par_levels ?? [];
      setParLevels(lvls);
      const d: Record<string, number> = {};
      lvls.forEach((p: any) => { d[p.category_id] = p.par_quantity; });
      setParDraft(d);
    } catch {}
  }, []);

  const loadCompany = useCallback(async () => {
    try { const r = await corpManager.getCompany(); setCompany(r.company); setCompEdit(r.company ?? {}); } catch {}
  }, []);

  useEffect(() => {
    if (tab === 'mealplan') loadBenefits();
    if (tab === 'par') { loadParLevels(); }
    if (tab === 'account') loadCompany();
    if (tab === 'employees' && !benefitLevels.length) loadBenefits();
  }, [tab, loadBenefits, loadParLevels, loadCompany]);

  /* ── Employee actions ── */
  async function changeEmployeeLevel(empId: string, level: string) {
    setEmpWorking(empId);
    try { await corpManager.updateEmployee(empId, { benefit_level: level }); setEmployees(p => p.map(e => e.id === empId ? { ...e, benefit_level: level } : e)); showToast('Benefit level updated'); }
    catch (e: any) { showToast(e.message ?? 'Failed'); } finally { setEmpWorking(null); }
  }
  async function resendLink(empId: string) {
    setEmpWorking(empId);
    try { await corpManager.resendMagicLink(empId); showToast('Login link sent!'); }
    catch (e: any) { showToast(e.message ?? 'Failed'); } finally { setEmpWorking(null); }
  }
  async function removeEmployee(empId: string, name: string) {
    if (!confirm(`Deactivate ${name}? They will no longer be able to log in.`)) return;
    setEmpWorking(empId);
    try { await corpManager.deactivateEmployee(empId); setEmployees(p => p.map(e => e.id === empId ? { ...e, is_active: false } : e)); showToast('Employee deactivated'); }
    catch (e: any) { showToast(e.message ?? 'Failed'); } finally { setEmpWorking(null); }
  }

  /* ── Benefits ── */
  async function saveTierConfig() {
    if (!editingLevel) return;
    setSavingTier(true);
    try { await corpManager.updateBenefitLevelAllowances(editingLevel.level_id, tierDraft); showToast('Tier config saved'); setEditingLevel(null); loadBenefits(); }
    catch (e: any) { showToast(e.message ?? 'Failed'); } finally { setSavingTier(false); }
  }

  /* ── Par levels ── */
  async function saveParLevelsData() {
    setSavingPar(true);
    try {
      const levels = parLevels.map((p: any) => ({ ...p, par_quantity: parDraft[p.category_id] ?? p.par_quantity, modified_by: user?.email ?? 'manager' }));
      await corpManager.saveParLevels(levels); showToast('Par levels saved'); loadParLevels();
    } catch (e: any) { showToast(e.message ?? 'Failed'); } finally { setSavingPar(false); }
  }

  /* ── Account ── */
  async function saveCompany() {
    setSavingComp(true);
    try { await corpManager.updateCompany(compEdit); showToast('Company info saved'); setCompany(compEdit); }
    catch (e: any) { showToast(e.message ?? 'Failed'); } finally { setSavingComp(false); }
  }
  async function savePin() {
    if (!newPin || newPin.length < 4) { showToast('PIN must be at least 4 digits'); return; }
    setSavingComp(true);
    try { await corpManager.updatePin(newPin); setNewPin(''); showToast('PIN updated'); }
    catch (e: any) { showToast(e.message ?? 'Failed'); } finally { setSavingComp(false); }
  }

  /* ── Reminders ── */
  async function sendReminders() {
    setSendingReminders(true);
    try { await corpManager.sendReminders(); showToast('Reminders sent!'); }
    catch (e: any) { showToast(e.message ?? 'Failed to send'); } finally { setSendingReminders(false); }
  }

  /* ── Week stats ── */
  const { start: wkStart } = getWeekBounds();
  const weekOrders   = orders.filter(o => { const d = new Date(o.created_at); return d >= wkStart && o.status !== 'cancelled'; });
  const orderedIds   = new Set(weekOrders.map(o => (o as any).employee_id).filter(Boolean));
  const activeEmps   = employees.filter(e => e.is_active);
  const notOrdered   = activeEmps.filter(e => !orderedIds.has(e.id));
  const wkMeals      = weekOrders.reduce((s, o) => s + (o.items?.length ?? 0), 0);
  const wkEmpPaid    = weekOrders.reduce((s, o) => s + (o.employee_cost ?? 0), 0);
  const wkCoCov      = weekOrders.reduce((s, o) => s + (o.company_cost ?? 0), 0);
  const wkBd         = weekOrders.reduce((s, o) => s + ((o as any).bd_contribution ?? 0), 0);
  const wkPart       = pct(orderedIds.size, activeEmps.length);
  const delivDay     = dashboard?.company?.delivery_day ?? company?.delivery_day ?? 'Wednesday';
  const dayIdx: Record<string, number> = { Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 };
  const deadline     = new Date(wkStart); deadline.setDate(wkStart.getDate() + (dayIdx[delivDay] ?? 3)); deadline.setHours(23, 59, 0, 0);

  /* ── Orders table ── */
  const PAGE_SIZE = 10;
  const filteredOrders = orders.filter(o => { const q = orderSearch.toLowerCase(); return !q || o.order_code?.toLowerCase().includes(q) || (o as any).employee_name?.toLowerCase().includes(q); });
  const totalPages  = Math.ceil(filteredOrders.length / PAGE_SIZE);
  const pageOrders  = filteredOrders.slice(orderPage * PAGE_SIZE, (orderPage + 1) * PAGE_SIZE);

  const companyName = dashboard?.company?.name ?? company?.name ?? '—';
  const inputSt: React.CSSProperties = { width:'100%', padding:'9px 12px', border:`1px solid ${bdr}`, borderRadius:'8px', fontSize:'.82rem', fontFamily:"'DM Sans', sans-serif", color:dk, outline:'none', background:'#fff', boxSizing:'border-box' };
  const labelSt: React.CSSProperties = { display:'block', fontSize:'.56rem', fontWeight:800, color:sec, marginBottom:'4px', textTransform:'uppercase', letterSpacing:'.5px' };

  /* ── Sidebar nav item ── */
  function Ni({ tKey, icon, label, badge }: { tKey: Tab; icon: string; label: string; badge?: number }) {
    const on = tab === tKey;
    return (
      <button onClick={() => setTab(tKey)} className={`ni${on ? ' on' : ''}`}
        style={{ display:'flex', alignItems:'center', gap:'9px', padding:'10px 20px', width:'100%', fontSize:'.82rem', fontWeight: on ? 800 : 600, color: on ? gld : 'rgba(250,235,218,.65)', background: on ? 'rgba(255,198,0,.12)' : 'transparent', borderLeft:`3px solid ${on ? gld : 'transparent'}`, border:'none', borderLeftStyle:'solid', borderLeftWidth:'3px', borderLeftColor: on ? gld : 'transparent', cursor:'pointer', textAlign:'left', fontFamily:"'DM Sans', sans-serif", transition:'all .15s' }}>
        <span style={{ fontSize:'.68rem', opacity: on ? 1 : 0.75 }}>{icon}</span>
        <span style={{ flex:1 }}>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span style={{ fontSize:'.5rem', fontWeight:800, padding:'1px 6px', borderRadius:'999px', background:'rgba(255,198,0,.18)', color:gld }}>
            {badge}
          </span>
        )}
      </button>
    );
  }

  /* ── Loading ── */
  if (loading) return (
    <div style={{ minHeight:'100vh', background:cr, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:'40px', height:'40px', borderRadius:'50%', border:`3px solid ${bdr}`, borderTopColor:br, animation:'spin .7s linear infinite', margin:'0 auto 12px' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ color:sec, fontSize:'.88rem' }}>Loading dashboard…</p>
      </div>
    </div>
  );

  /* ════════════════════════════════════════════════════════════════════════
   * RENDER
   * ════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:"'DM Sans', sans-serif", background:cr }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box}
        .ni:hover:not(.on){color:${cr} !important;background:rgba(255,255,255,.06) !important}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(0,49,65,.2);border-radius:999px}
        tr:hover td{background:#fafafa}
      `}</style>

      {/* ══ SIDEBAR ══ */}
      <aside style={{ width:'218px', background:dk, position:'fixed', top:0, left:0, bottom:0, display:'flex', flexDirection:'column', paddingTop:'20px', zIndex:10, overflowY:'auto' }}>

        {/* Logo */}
        <div style={{ padding:'0 20px 20px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'14px' }}>
            <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:gld, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.78rem', fontWeight:900, color:dk, flexShrink:0 }}>BD</div>
            <span style={{ color:'rgba(250,235,218,.45)', fontSize:'.58rem', fontWeight:500, letterSpacing:'2px', textTransform:'uppercase' }}>FOR WORK</span>
          </div>
          <div style={{ fontSize:'1.05rem', fontWeight:800, color:gld, letterSpacing:'.3px', lineHeight:1.2 }}>{companyName}</div>
          <div style={{ fontSize:'.65rem', color:'rgba(250,235,218,.35)', fontWeight:600, marginTop:'2px' }}>Manager Portal</div>
        </div>

        {/* Nav */}
        <div style={{ flex:1 }}>
          <div style={{ padding:'14px 20px 5px', fontSize:'.5rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'1px', color:'rgba(250,235,218,.35)' }}>DASHBOARD</div>
          <Ni tKey="overview"   icon="▪" label="Overview" />
          <div style={{ height:'1px', background:'rgba(255,255,255,.06)', margin:'2px 0' }} />
          <Ni tKey="orders"     icon="≡" label="Orders"        badge={orders.length} />
          <Ni tKey="invoices"   icon="◆" label="Invoices" />
          <Ni tKey="monthly"    icon="★" label="Monthly Report" />
          <Ni tKey="employees"  icon="■" label="Employees"     badge={activeEmps.length} />

          <div style={{ height:'1px', background:'rgba(255,255,255,.07)', margin:'8px 20px' }} />
          <div style={{ padding:'14px 20px 5px', fontSize:'.5rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'1px', color:'rgba(250,235,218,.35)' }}>PAR LEVELS</div>
          <Ni tKey="par"      icon="◆" label="Office Par Levels" />

          <div style={{ height:'1px', background:'rgba(255,255,255,.07)', margin:'8px 20px' }} />
          <div style={{ padding:'14px 20px 5px', fontSize:'.5rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'1px', color:'rgba(250,235,218,.35)' }}>MEAL PROGRAM</div>
          <Ni tKey="mealplan" icon="★" label="Subsidy Tiers" />
        </div>

        {/* Footer */}
        <div style={{ borderTop:'1px solid rgba(255,255,255,.07)', paddingBottom:'12px' }}>
          <Ni tKey="account" icon="⚙" label="Account Details" />
          <button onClick={() => { clearCorpAuth(); router.replace('/corporate/login'); }} className="ni"
            style={{ display:'flex', alignItems:'center', gap:'9px', padding:'10px 20px', width:'100%', fontSize:'.82rem', fontWeight:600, color:'rgba(250,235,218,.65)', background:'transparent', border:'none', cursor:'pointer', fontFamily:"'DM Sans', sans-serif", textAlign:'left', transition:'all .15s' }}>
            <span style={{ fontSize:'.68rem' }}>→</span>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ══ MAIN ══ */}
      <div style={{ marginLeft:'218px', flex:1, minWidth:0, display:'flex', flexDirection:'column' }}>

        {/* Topbar */}
        <div style={{ height:'52px', background:dk, position:'sticky', top:0, zIndex:5, display:'flex', alignItems:'center', padding:'0 26px', gap:'12px', boxShadow:'0 2px 12px rgba(0,0,0,.18)', flexShrink:0 }}>
          <span style={{ fontSize:'.9rem', fontWeight:900, color:cr, letterSpacing:'-.2px' }}>
            betterday
            <span style={{ color:'rgba(250,235,218,.35)', margin:'0 8px', fontWeight:400 }}>·</span>
            <span style={{ color:gld }}>{companyName}</span>
          </span>
          <div style={{ marginLeft:'auto', display:'flex', gap:'10px', alignItems:'center' }}>
            <span style={{ fontSize:'.52rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'.8px', color:'rgba(250,235,218,.35)', background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.1)', borderRadius:'999px', padding:'2px 8px' }}>Manager</span>
            <button onClick={() => { clearCorpAuth(); router.replace('/corporate/login'); }} style={{ fontSize:'.68rem', fontWeight:700, color:'rgba(250,235,218,.4)', border:'1px solid rgba(250,235,218,.14)', borderRadius:'999px', padding:'5px 14px', background:'none', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>Sign out</button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding:'24px 36px', maxWidth:'1240px', flex:1 }}>

          {/* ══════════ OVERVIEW ══════════ */}
          {tab === 'overview' && (
            <>
              {/* Action bar */}
              <div style={{ display:'flex', gap:'14px', marginBottom:'16px' }}>
                {/* Ordering this week */}
                <Card style={{ flex:1, padding:'18px 22px', borderLeft:`4px solid #D4A029` }}>
                  <div style={{ fontSize:'.7rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'.8px', color:sec, marginBottom:'8px' }}>
                    ORDERING THIS WEEK — WEEK OF {weekLabel(wkStart).toUpperCase()}
                  </div>
                  <div style={{ fontSize:'1.6rem', fontWeight:900, color:dk, lineHeight:1.2, marginBottom:'4px' }}>
                    {orderedIds.size} / {activeEmps.length}
                  </div>
                  <div style={{ fontSize:'.78rem', color:'#5A6F7C', marginBottom:'10px' }}>employees have ordered</div>
                  {/* Progress bar */}
                  <div style={{ height:'8px', background:'#EDE6DA', borderRadius:'999px', marginBottom:'10px', overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${wkPart}%`, background:`linear-gradient(90deg,${grn},#27ae60)`, borderRadius:'999px', transition:'width .6s' }} />
                  </div>
                  {notOrdered.length > 0 && (
                    <div style={{ fontSize:'.72rem', color:sec, marginBottom:'12px' }}>
                      Haven't ordered: {notOrdered.slice(0, 6).map(e => e.name).join(', ')}{notOrdered.length > 6 ? ` +${notOrdered.length - 6} more` : ''}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
                    <button onClick={sendReminders} disabled={sendingReminders} style={{ padding:'7px 16px', background:'rgba(0,49,65,.08)', border:`1px solid rgba(0,49,65,.12)`, borderRadius:'6px', fontSize:'.78rem', fontWeight:700, color:dk, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                      {sendingReminders ? 'Sending…' : 'Send Reminders'}
                    </button>
                    <span style={{ fontSize:'.72rem', fontWeight:700, color:amb, background:'#FFF3E0', borderRadius:'999px', padding:'2px 10px' }}>
                      Orders close in {fmtDeadline(deadline)}
                    </span>
                  </div>
                </Card>

                {/* Par level order */}
                <Card style={{ flex:1, padding:'18px 22px', borderLeft:`4px solid ${grn}` }}>
                  <div style={{ fontSize:'.7rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'.8px', color:sec, marginBottom:'8px' }}>OFFICE PAR LEVEL ORDER</div>
                  <div style={{ fontSize:'1.6rem', fontWeight:900, color:dk, lineHeight:1.2, marginBottom:'4px' }}>
                    {parLevels.reduce((s, p) => s + (parDraft[p.category_id] ?? p.par_quantity ?? 0), 0)} items
                  </div>
                  <div style={{ fontSize:'.78rem', color:'#5A6F7C', marginBottom:'16px' }}>
                    {parLevels.filter(p => (parDraft[p.category_id] ?? p.par_quantity) > 0).length} of {parLevels.length} categories active
                  </div>
                  <button onClick={() => setTab('par')} style={{ fontSize:'.82rem', fontWeight:700, color:dk, background:'none', border:'none', padding:0, cursor:'pointer', fontFamily:"'DM Sans', sans-serif", textDecoration:'underline' }}>
                    Edit Office Order →
                  </button>
                </Card>
              </div>

              {/* This week at a glance */}
              <Sl>THIS WEEK AT A GLANCE</Sl>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'14px', marginBottom:'16px' }}>
                {/* Employee orders */}
                <Card style={{ padding:'18px 22px' }}>
                  <div style={{ fontSize:'.7rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'.8px', color:sec, marginBottom:'12px', paddingBottom:'8px', borderBottom:`1px solid #EDE6DA` }}>EMPLOYEE ORDERS</div>
                  <Tw label="Meals ordered" value={wkMeals} />
                  <Tw label="Participation" value={`${wkPart}%`} sub={`(40% avg)`} />
                  <TwDiv />
                  <Tw label="Employee paid"       value={fmt$(wkEmpPaid)} />
                  <Tw label="Company covered"     value={fmt$(wkCoCov)}  color={grn} />
                  <Tw label="BetterDay contributed" value={fmt$(wkBd)}   color={grn} />
                </Card>

                {/* Office par levels */}
                <Card style={{ padding:'18px 22px' }}>
                  <div style={{ fontSize:'.7rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'.8px', color:sec, marginBottom:'12px', paddingBottom:'8px', borderBottom:`1px solid #EDE6DA` }}>OFFICE PAR LEVELS</div>
                  {parLevels.length === 0
                    ? <div style={{ fontSize:'.78rem', color:sec, padding:'8px 0' }}>No par levels configured.</div>
                    : <>
                        <Tw label="Total items"       value={parLevels.reduce((s, p) => s + (p.par_quantity ?? 0), 0)} />
                        <Tw label="Categories active" value={`${parLevels.filter(p => p.status === 'active').length} of ${parLevels.length}`} />
                        <TwDiv />
                        <Tw label="Status" value="Editing open" color={grn} />
                      </>
                  }
                </Card>

                {/* Financials */}
                <Card style={{ padding:'18px 22px' }}>
                  <div style={{ fontSize:'.7rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'.8px', color:sec, marginBottom:'12px', paddingBottom:'8px', borderBottom:`1px solid #EDE6DA` }}>FINANCIALS</div>
                  <Tw label="This month spend"     value={fmt$(dashboard?.totals?.company ?? 0)} />
                  <Tw label="Last month"           value="—" />
                  <Tw label="Trend"                value="—" />
                  <TwDiv />
                  <Tw label="Outstanding invoices" value={invoices.filter(i => i.status === 'unpaid' || i.status === 'overdue').length} color={red} />
                  <Tw label="Amount owed"          value={fmt$(invoices.filter(i => i.status !== 'paid' && i.status !== 'void').reduce((s, i) => s + (i.amount_due ?? 0), 0))} color={red} />
                </Card>
              </div>

              {/* Program health row */}
              <Card style={{ display:'flex', marginBottom:'16px', overflow:'hidden' }}>
                {[
                  { val: dashboard?.totals?.meals ?? 0,    label:'TOTAL MEALS' },
                  { val: activeEmps.length ? ((dashboard?.totals?.meals ?? 0) / activeEmps.length).toFixed(1) : '0', label:'AVG / EMPLOYEE' },
                  { val: `${wkPart}%`,                     label:'AVG PARTICIPATION' },
                  { val: fmt$(dashboard?.totals?.bd ?? 0), label:'LIFETIME BD SAVINGS', color: grn },
                ].map((cell, i, arr) => (
                  <div key={i} style={{ flex:1, padding:'14px 18px', textAlign:'center', borderRight: i < arr.length - 1 ? `1px solid #F0EBE2` : 'none' }}>
                    <div style={{ fontSize:'1.3rem', fontWeight:900, color:(cell as any).color ?? dk, lineHeight:1.2 }}>{cell.val}</div>
                    <div style={{ fontSize:'.65rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'.5px', color:sec, marginTop:'2px' }}>{cell.label}</div>
                  </div>
                ))}
              </Card>

              {/* Recent orders */}
              <Sl>RECENT ORDERS</Sl>
              <Card>
                <table style={tblSt}>
                  <thead>
                    <tr>{['EMPLOYEE','MEALS','THEY PAID','CO. COVERED','BD','DELIVERY','STATUS'].map(h => <th key={h} style={thSt}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 8).map(o => (
                      <tr key={o.id}>
                        <td style={{ ...tdSt, fontWeight:800, color:dk }}>{(o as any).employee_name ?? '—'}</td>
                        <td style={tdSt}>{o.items?.length ?? 0}</td>
                        <td style={{ ...tdSt, fontWeight:700 }}>{fmt$(o.employee_cost ?? 0)}</td>
                        <td style={{ ...tdSt, fontWeight:700, color:grn }}>{fmt$(o.company_cost ?? 0)}</td>
                        <td style={{ ...tdSt, fontWeight:700, color:sky }}>{fmt$((o as any).bd_contribution ?? 0)}</td>
                        <td style={tdSt}>{o.delivery_date ? new Date(o.delivery_date).toLocaleDateString('en-AU',{day:'numeric',month:'short'}) : '—'}</td>
                        <td style={tdSt}><Bdg status={o.status} /></td>
                      </tr>
                    ))}
                    {!orders.length && <tr><td colSpan={7} style={{ ...tdSt, textAlign:'center', color:sec, padding:'32px' }}>No orders yet.</td></tr>}
                  </tbody>
                </table>
                {orders.length > 8 && (
                  <div style={{ padding:'11px 15px', borderTop:`1px solid rgba(0,49,65,.07)`, display:'flex', justifyContent:'flex-end' }}>
                    <button onClick={() => setTab('orders')} style={{ fontSize:'.74rem', fontWeight:700, color:sky, background:'none', border:'none', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>View all orders →</button>
                  </div>
                )}
              </Card>
            </>
          )}

          {/* ══════════ ORDERS ══════════ */}
          {tab === 'orders' && (
            <>
              {/* Summary bar */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:'1px', background:'rgba(0,49,65,.06)', borderRadius:'10px', overflow:'hidden', marginBottom:'14px' }}>
                {[
                  { label:'Orders',          val: orders.length,                                                                       color: dk      },
                  { label:'Meals',           val: orders.reduce((s, o) => s + (o.items?.length ?? 0), 0),                              color: '#6b3fa0' },
                  { label:'Employees Paid',  val: fmt$(orders.reduce((s, o) => s + (o.employee_cost ?? 0), 0)),                        color: dk      },
                  { label:'Company Covered', val: fmt$(orders.reduce((s, o) => s + (o.company_cost ?? 0), 0)),                         color: grn     },
                  { label:'BD Contributed',  val: fmt$(orders.reduce((s, o) => s + ((o as any).bd_contribution ?? 0), 0)),             color: sky     },
                  { label:'Total Value',     val: fmt$(orders.reduce((s, o) => s + ((o.employee_cost ?? 0) + (o.company_cost ?? 0)), 0)), color: amb  },
                ].map(cell => (
                  <div key={cell.label} style={{ background:'#fff', padding:'12px 16px' }}>
                    <div style={{ fontSize:'.56rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'.5px', color:sec, marginBottom:'4px' }}>{cell.label}</div>
                    <div style={{ fontSize:'1.25rem', fontWeight:900, color:cell.color }}>{cell.val}</div>
                  </div>
                ))}
              </div>

              {/* Search */}
              <div style={{ display:'flex', gap:'10px', marginBottom:'12px' }}>
                <input value={orderSearch} onChange={e => { setOrderSearch(e.target.value); setOrderPage(0); }} placeholder="Search by name or order #…" style={{ ...inputSt, flex:1 }} />
              </div>

              <Card>
                <table style={tblSt}>
                  <thead>
                    <tr>{['EMPLOYEE','ORDER #','WEEK','MEALS','THEY PAID','CO. COVERED','BD','STATUS'].map(h => <th key={h} style={thSt}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {pageOrders.map(o => (
                      <tr key={o.id} onClick={()=>setSelectedOrder(o)} style={{ cursor:'pointer' }}>
                        <td style={{ ...tdSt, fontWeight:800, color:dk }}>{(o as any).employee_name ?? '—'}</td>
                        <td style={{ ...tdSt, fontSize:'.72rem', color:'#5A6F7C' }}>#{o.order_code}</td>
                        <td style={{ ...tdSt, fontSize:'.72rem' }}>{o.delivery_date ? new Date(o.delivery_date).toLocaleDateString('en-AU',{day:'numeric',month:'short'}) : '—'}</td>
                        <td style={tdSt}>{o.items?.length ?? 0}</td>
                        <td style={{ ...tdSt, fontWeight:700 }}>{fmt$(o.employee_cost ?? 0)}</td>
                        <td style={{ ...tdSt, fontWeight:700, color:grn }}>{fmt$(o.company_cost ?? 0)}</td>
                        <td style={{ ...tdSt, fontWeight:700, color:sky }}>{fmt$((o as any).bd_contribution ?? 0)}</td>
                        <td style={tdSt}><Bdg status={o.status} /></td>
                      </tr>
                    ))}
                    {!pageOrders.length && <tr><td colSpan={8} style={{ ...tdSt, textAlign:'center', color:sec, padding:'32px' }}>No orders match your search.</td></tr>}
                  </tbody>
                </table>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 15px', borderTop:`1px solid rgba(0,49,65,.07)` }}>
                  <span style={{ fontSize:'.74rem', color:sec }}>
                    {filteredOrders.length ? `Showing ${orderPage * PAGE_SIZE + 1}–${Math.min((orderPage + 1) * PAGE_SIZE, filteredOrders.length)} of ${filteredOrders.length}` : '0 results'}
                  </span>
                  <div style={{ display:'flex', gap:'6px' }}>
                    <button onClick={() => setOrderPage(p => p - 1)} disabled={orderPage === 0} style={{ fontSize:'.72rem', fontWeight:700, color:dk, background:'none', border:`1.5px solid ${bdr}`, borderRadius:'7px', padding:'4px 11px', cursor: orderPage === 0 ? 'default' : 'pointer', opacity: orderPage === 0 ? .4 : 1, fontFamily:"'DM Sans', sans-serif" }}>← Prev</button>
                    <button onClick={() => setOrderPage(p => p + 1)} disabled={orderPage >= totalPages - 1} style={{ fontSize:'.72rem', fontWeight:700, color:dk, background:'none', border:`1.5px solid ${bdr}`, borderRadius:'7px', padding:'4px 11px', cursor: orderPage >= totalPages - 1 ? 'default' : 'pointer', opacity: orderPage >= totalPages - 1 ? .4 : 1, fontFamily:"'DM Sans', sans-serif" }}>Next →</button>
                  </div>
                </div>
              </Card>
            </>
          )}

          {/* ══════════ INVOICES ══════════ */}
          {tab === 'invoices' && (
            <>
              <Sl>WEEKLY INVOICES</Sl>
              <Card>
                <table style={tblSt}>
                  <thead>
                    <tr>{['INVOICE #','PERIOD','MEALS','AMOUNT DUE','STATUS',''].map(h => <th key={h} style={thSt}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => (
                      <Fragment key={inv.id}>
                        <tr onClick={() => setExpandedInv(expandedInv === inv.id ? null : inv.id)} style={{ cursor:'pointer' }}>
                          <td style={{ ...tdSt, fontWeight:800, color:dk }}>{inv.invoice_number}</td>
                          <td style={{ ...tdSt, fontSize:'.72rem' }}>
                            {new Date(inv.period_start).toLocaleDateString('en-AU',{day:'numeric',month:'short'})} – {new Date(inv.period_end).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}
                          </td>
                          <td style={tdSt}>{inv.total_meals ?? 0}</td>
                          <td style={{ ...tdSt, fontWeight:800, color:grn, fontSize:'.92rem' }}>{fmt$(inv.amount_due ?? 0)}</td>
                          <td style={tdSt}><Bdg status={inv.status ?? 'pending'} /></td>
                          <td style={{ ...tdSt, fontSize:'.72rem', fontWeight:700, color:sky }}>
                            {expandedInv === inv.id ? '▲ Hide' : '▼ Details'}
                          </td>
                        </tr>
                        {expandedInv === inv.id && (
                          <tr>
                            <td colSpan={6} style={{ background:cr, padding:'16px 20px', borderTop:`1px solid ${bdr}` }}>
                              <div style={{ fontSize:'.82rem', fontWeight:800, color:dk, marginBottom:'10px' }}>Invoice Breakdown</div>
                              {(inv.tier_breakdown ?? []).length > 0 ? (
                                <table style={{ ...tblSt, fontSize:'.78rem' }}>
                                  <thead>
                                    <tr>{['TIER','EMPLOYEES','MEALS','SUBTOTAL'].map(h => <th key={h} style={{ ...thSt, background:'transparent', fontSize:'.52rem' }}>{h}</th>)}</tr>
                                  </thead>
                                  <tbody>
                                    {(inv.tier_breakdown ?? []).map((row: any, i: number) => (
                                      <tr key={i}>
                                        <td style={{ ...tdSt, fontWeight:700 }}>{row.tier_name}</td>
                                        <td style={tdSt}>{row.employee_count}</td>
                                        <td style={tdSt}>{row.meals}</td>
                                        <td style={{ ...tdSt, fontWeight:800 }}>{fmt$(row.subtotal ?? 0)}</td>
                                      </tr>
                                    ))}
                                    <tr>
                                      <td colSpan={3} style={{ ...tdSt, fontWeight:900, borderTop:`2px solid ${dk}` }}>Total</td>
                                      <td style={{ ...tdSt, fontWeight:900, color:grn, borderTop:`2px solid ${dk}` }}>{fmt$(inv.amount_due ?? 0)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              ) : (
                                <div style={{ fontSize:'.78rem', color:sec }}>No tier breakdown available.</div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    {!invoices.length && <tr><td colSpan={6} style={{ ...tdSt, textAlign:'center', color:sec, padding:'32px' }}>No invoices yet.</td></tr>}
                  </tbody>
                </table>
              </Card>
            </>
          )}

          {/* ══════════ MONTHLY REPORT ══════════ */}
          {tab === 'monthly' && (
            <>
              <Sl>MONTHLY REPORT</Sl>
              <Card style={{ padding:'60px 40px', textAlign:'center' }}>
                <div style={{ fontSize:'2.5rem', marginBottom:'16px' }}>📊</div>
                <div style={{ fontWeight:800, color:dk, fontSize:'1rem', marginBottom:'6px' }}>Monthly reports coming soon</div>
                <div style={{ fontSize:'.85rem', color:sec, lineHeight:1.6 }}>Detailed monthly summaries with PDF export will be available in the next update.</div>
              </Card>
            </>
          )}

          {/* ══════════ EMPLOYEES ══════════ */}
          {tab === 'employees' && (
            <>
              {/* Bulk action bar */}
              {selectedEmps.size > 0 && (
                <div style={{ display:'flex', gap:'8px', alignItems:'center', padding:'10px 16px', marginBottom:'12px', background:'rgba(0,49,65,.06)', borderRadius:'10px', flexWrap:'wrap' }}>
                  <span style={{ fontSize:'.78rem', fontWeight:700, color:dk }}>{selectedEmps.size} selected</span>
                  <button onClick={async () => { for (const id of selectedEmps) await resendLink(id); setSelectedEmps(new Set()); }} style={{ padding:'5px 12px', background:'#E8F3FF', border:'none', borderRadius:'6px', fontSize:'.72rem', fontWeight:700, color:sky, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>Resend Links</button>
                  <button onClick={() => { if (confirm(`Deactivate ${selectedEmps.size} employees?`)) { selectedEmps.forEach(id => { const e = employees.find((x: any) => x.id === id); if (e) removeEmployee(id, e.name); }); setSelectedEmps(new Set()); } }} style={{ padding:'5px 12px', background:'#FEF2F2', border:'none', borderRadius:'6px', fontSize:'.72rem', fontWeight:700, color:red, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>Remove Selected</button>
                  <button onClick={() => setSelectedEmps(new Set())} style={{ marginLeft:'auto', padding:'5px 12px', background:'none', border:'none', fontSize:'.72rem', fontWeight:700, color:sec, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>Clear</button>
                </div>
              )}

              <Card>
                <table style={tblSt}>
                  <thead>
                    <tr>
                      <th style={{ ...thSt, width:'44px' }}>
                        <input type="checkbox" onChange={e => setSelectedEmps(e.target.checked ? new Set(activeEmps.map((x: any) => x.id)) : new Set())} />
                      </th>
                      {['EMPLOYEE','EMAIL','BENEFIT LEVEL','STATUS','ACTIONS'].map(h => <th key={h} style={thSt}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(emp => (
                      <tr key={emp.id} style={{ opacity: emp.is_active ? 1 : .5 }}>
                        <td style={tdSt}>
                          <input type="checkbox" checked={selectedEmps.has(emp.id)} disabled={!emp.is_active}
                            onChange={e => setSelectedEmps(prev => { const s = new Set(prev); e.target.checked ? s.add(emp.id) : s.delete(emp.id); return s; })} />
                        </td>
                        <td style={{ ...tdSt, fontWeight:800, color:dk }}>{emp.name}</td>
                        <td style={{ ...tdSt, fontSize:'.75rem', color:sec }}>{emp.email}</td>
                        <td style={tdSt}>
                          {emp.is_active ? (
                            <select value={emp.benefit_level ?? 'General'} onChange={e => changeEmployeeLevel(emp.id, e.target.value)} disabled={empWorking === emp.id}
                              style={{ padding:'5px 8px', border:`1px solid ${bdr}`, borderRadius:'6px', fontSize:'.75rem', fontFamily:"'DM Sans', sans-serif", color:dk, background:'#fff', cursor:'pointer' }}>
                              <option value="General">General</option>
                              {benefitLevels.map((bl: any) => <option key={bl.level_id} value={bl.level_name}>{bl.level_name}</option>)}
                            </select>
                          ) : <span style={{ fontSize:'.75rem', color:sec }}>—</span>}
                        </td>
                        <td style={tdSt}>
                          <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:'999px', fontSize:'.58rem', fontWeight:800, background: emp.is_active ? '#E8F3FF' : '#f0f0f0', color: emp.is_active ? sky : '#aaa' }}>
                            {emp.is_active ? (emp.is_manager ? 'Manager' : 'Active') : 'Inactive'}
                          </span>
                        </td>
                        <td style={tdSt}>
                          {emp.is_active && (
                            <div style={{ display:'flex', gap:'10px' }}>
                              <button onClick={() => { setPinModalEmp({ id: emp.id, name: emp.name }); setPinInput(''); }} style={{ fontSize:'.72rem', fontWeight:700, color:grn, background:'none', border:'none', padding:0, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                                {emp.pin_hash ? 'Reset PIN' : 'Set PIN'}
                              </button>
                              <button onClick={() => resendLink(emp.id)} disabled={empWorking === emp.id} style={{ fontSize:'.72rem', fontWeight:700, color:sky, background:'none', border:'none', padding:0, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                                {empWorking === emp.id ? '…' : 'Resend link'}
                              </button>
                              <button onClick={() => removeEmployee(emp.id, emp.name)} disabled={empWorking === emp.id} style={{ fontSize:'.72rem', fontWeight:700, color:'#f39c12', background:'none', border:'none', padding:0, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                                Remove
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!employees.length && <tr><td colSpan={6} style={{ ...tdSt, textAlign:'center', color:sec, padding:'32px' }}>No employees found.</td></tr>}
                  </tbody>
                </table>
              </Card>
            </>
          )}

          {/* ══════════ PAR LEVELS ══════════ */}
          {tab === 'par' && (
            <>
              <Sl>OFFICE PAR LEVELS</Sl>
              {/* Quick adjust */}
              <div style={{ display:'flex', gap:'8px', marginBottom:'16px', flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:'.72rem', fontWeight:700, color:sec }}>Quick adjust:</span>
                {[20, 40, 60].map(p => (
                  <button key={p} onClick={() => { const d: Record<string,number> = {}; parLevels.forEach((pl: any) => { d[pl.category_id] = Math.round((parDraft[pl.category_id] ?? pl.par_quantity) * (1 - p / 100)); }); setParDraft(d); }}
                    style={{ padding:'6px 14px', border:`1px solid ${bdr}`, borderRadius:'8px', fontSize:'.72rem', fontWeight:700, color:dk, background:'#fff', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                    -{p}%
                  </button>
                ))}
                <button onClick={() => { const d: Record<string,number> = {}; parLevels.forEach((pl: any) => { d[pl.category_id] = 0; }); setParDraft(d); }}
                  style={{ padding:'6px 14px', border:`1px solid rgba(192,57,43,.4)`, borderRadius:'8px', fontSize:'.72rem', fontWeight:700, color:red, background:'#fff', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                  Skip Week
                </button>
                <button onClick={() => { const d: Record<string,number> = {}; parLevels.forEach((pl: any) => { d[pl.category_id] = pl.par_quantity; }); setParDraft(d); }}
                  style={{ padding:'6px 14px', border:`1px solid ${bdr}`, borderRadius:'8px', fontSize:'.72rem', fontWeight:700, color:sec, background:'#fff', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                  Reset
                </button>
              </div>

              {!parLevels.length ? (
                <Card style={{ padding:'40px', textAlign:'center' }}>
                  <div style={{ fontSize:'.9rem', color:sec }}>No par levels configured yet. Contact your BetterDay admin.</div>
                </Card>
              ) : (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:'10px', marginBottom:'20px' }}>
                    {parLevels.map((p: any) => {
                      const qty = parDraft[p.category_id] ?? p.par_quantity;
                      const has = qty > 0;
                      return (
                        <div key={p.category_id} style={{ background: has ? '#F8FCFF' : '#fff', border:`1.5px solid ${has ? br : bdr}`, borderRadius:'14px', padding:'18px', opacity: p.status === 'paused' ? .4 : 1, transition:'.2s' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'10px' }}>
                            <div style={{ fontSize:'.82rem', fontWeight:800, color:dk, lineHeight:1.2 }}>
                              {p.category_name ?? p.category_id.replace(/_/g,' ')}
                            </div>
                            <span style={{ fontSize:'.55rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', padding:'2px 7px', borderRadius:'4px', whiteSpace:'nowrap', background: p.mode === 'auto' ? '#FEF3C7' : '#F1F5F9', color: p.mode === 'auto' ? '#92400E' : '#64748B' }}>
                              {p.mode ?? 'auto'}
                            </span>
                          </div>
                          <div style={{ fontSize:'2.2rem', fontWeight:900, color: has ? dk : '#CBD5E1', lineHeight:1 }}>{qty}</div>
                          <div style={{ fontSize:'.7rem', color:sec, marginTop:'4px', marginBottom:'14px' }}>items / week</div>
                          <div style={{ display:'flex', gap:'6px' }}>
                            <button onClick={() => setParDraft(prev => ({ ...prev, [p.category_id]: Math.max(0, (prev[p.category_id] ?? p.par_quantity) - 1) }))} style={{ flex:1, padding:'8px 0', border:`1.5px solid ${bdr}`, borderRadius:'8px', fontSize:'.9rem', fontWeight:700, color:dk, background:'#fff', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>−</button>
                            <input type="number" min="0" value={qty}
                              onChange={e => setParDraft(prev => ({ ...prev, [p.category_id]: parseInt(e.target.value) || 0 }))}
                              style={{ width:'56px', padding:'8px 4px', border:`1.5px solid ${bdr}`, borderRadius:'8px', fontSize:'.9rem', fontWeight:900, textAlign:'center', fontFamily:"'DM Sans', sans-serif", color:dk, outline:'none' }} />
                            <button onClick={() => setParDraft(prev => ({ ...prev, [p.category_id]: (prev[p.category_id] ?? p.par_quantity) + 1 }))} style={{ flex:1, padding:'8px 0', border:'none', borderRadius:'8px', fontSize:'.9rem', fontWeight:700, color:'#fff', background:br, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={saveParLevelsData} disabled={savingPar} style={{ padding:'11px 28px', background: savingPar ? '#93adb8' : dk, color:'#fff', border:'none', borderRadius:'10px', fontSize:'.88rem', fontWeight:800, cursor: savingPar ? 'default' : 'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                    {savingPar ? 'Saving…' : 'Save Par Levels'}
                  </button>
                </>
              )}
            </>
          )}

          {/* ══════════ SUBSIDY TIERS ══════════ */}
          {tab === 'mealplan' && (
            <>
              <Sl>MEAL ALLOWANCES</Sl>
              {!benefitLevels.length ? (
                <Card style={{ padding:'40px', textAlign:'center' }}>
                  <p style={{ fontWeight:800, color:dk }}>No benefit levels configured</p>
                  <p style={{ fontSize:'.85rem', color:sec, marginTop:'6px' }}>Contact your BetterDay admin to set up employee benefit tiers.</p>
                </Card>
              ) : benefitLevels.map(level => (
                <Card key={level.level_id} style={{ marginBottom:'14px', overflow:'hidden' }}>
                  <div style={{ padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', borderBottom: editingLevel?.level_id === level.level_id ? `1px solid ${bdr}` : 'none' }}
                    onClick={() => editingLevel?.level_id === level.level_id ? setEditingLevel(null) : (setEditingLevel(level), setTierDraft(level.tier_config ?? {}))}>
                    <div>
                      <div style={{ fontWeight:900, color:dk, fontSize:'.95rem' }}>{level.level_name}</div>
                      <div style={{ fontSize:'.75rem', color:sec, marginTop:'2px' }}>{level.employee_count ?? 0} employee{(level.employee_count ?? 0) !== 1 ? 's' : ''}</div>
                    </div>
                    <span style={{ fontSize:'.72rem', fontWeight:700, color: editingLevel?.level_id === level.level_id ? sec : sky }}>
                      {editingLevel?.level_id === level.level_id ? '▲ Collapse' : '▼ Edit'}
                    </span>
                  </div>
                  {editingLevel?.level_id === level.level_id && (
                    <div style={{ padding:'18px 20px' }}>
                      <table style={tblSt}>
                        <thead>
                          <tr>{['TIER','FREE MEALS','EMPLOYEE PRICE','COMPANY SUBSIDY'].map(h => <th key={h} style={{ ...thSt, background:'transparent' }}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {[{key:'free',label:'Free'},{key:'tier1',label:'Tier 1'},{key:'tier2',label:'Tier 2'},{key:'tier3',label:'Tier 3'}].map(({ key, label }) => (
                            <tr key={key}>
                              <td style={{ ...tdSt, fontWeight:700, color: key === 'free' ? grn : dk }}>{label}</td>
                              {['meals','employeePrice','companySubsidy'].map(field => (
                                <td key={field} style={tdSt}>
                                  <input type="number" step="0.01" min="0"
                                    value={tierDraft[key]?.[field] ?? 0}
                                    onChange={e => setTierDraft((prev: any) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [field]: parseFloat(e.target.value) || 0 } }))}
                                    style={{ width:'72px', height:'40px', padding:'6px 4px', border:`2px solid ${bdr}`, borderRadius:'10px', fontSize:'1rem', fontWeight:900, textAlign:'center', fontFamily:"'DM Sans', sans-serif", color:dk, background:'#fff', outline:'none' }} />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ display:'flex', gap:'10px', marginTop:'16px' }}>
                        <button onClick={saveTierConfig} disabled={savingTier} style={{ padding:'9px 22px', background: savingTier ? '#93adb8' : dk, color:'#fff', border:'none', borderRadius:'8px', fontSize:'.8rem', fontWeight:700, cursor: savingTier ? 'default' : 'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                          {savingTier ? 'Saving…' : '💾 Save Changes'}
                        </button>
                        <button onClick={() => setEditingLevel(null)} style={{ padding:'9px 16px', background:'none', border:`1px solid ${bdr}`, borderRadius:'8px', fontSize:'.8rem', fontWeight:700, color:sec, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>Cancel</button>
                      </div>
                      <div style={{ background:'#FFF8F0', border:`1px solid rgba(212,160,41,.2)`, borderRadius:'10px', padding:'14px 18px', fontSize:'.8rem', color:'#5a4a2a', lineHeight:1.5, marginTop:'14px' }}>
                        💡 Changes take effect immediately. Employees will see updated pricing on their next menu load.
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </>
          )}

          {/* ══════════ ACCOUNT DETAILS ══════════ */}
          {tab === 'account' && (
            <>
              <Sl>ACCOUNT INFORMATION</Sl>
              <Card style={{ padding:'22px', marginBottom:'14px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginBottom:'18px' }}>
                  {[
                    { key:'name',            label:'Company Name'   },
                    { key:'delivery_day',    label:'Delivery Day'   },
                    { key:'fridge_location', label:'Fridge Location' },
                    { key:'contact_name',    label:'Contact Name'   },
                    { key:'contact_email',   label:'Contact Email'  },
                    { key:'contact_phone',   label:'Contact Phone'  },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label style={labelSt}>{label}</label>
                      {key === 'delivery_day' ? (
                        <select value={compEdit[key] ?? ''} onChange={e => setCompEdit((p: any) => ({ ...p, [key]: e.target.value }))} style={inputSt}>
                          <option value="">Select…</option>
                          {['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      ) : (
                        <input value={compEdit[key] ?? ''} onChange={e => setCompEdit((p: any) => ({ ...p, [key]: e.target.value }))} style={inputSt} />
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={saveCompany} disabled={savingComp} style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'9px 22px', background: savingComp ? '#93adb8' : dk, color:'#fff', border:'none', borderRadius:'8px', fontSize:'.8rem', fontWeight:700, cursor: savingComp ? 'default' : 'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                  {savingComp ? 'Saving…' : 'Save Changes'}
                </button>
              </Card>

              <Card style={{ padding:'22px' }}>
                <div style={{ fontSize:'.9rem', fontWeight:800, color:dk, marginBottom:'4px' }}>Manager PIN</div>
                <p style={{ fontSize:'.8rem', color:sec, marginBottom:'16px', lineHeight:1.5 }}>Change the PIN used to access this manager portal.</p>
                <div style={{ display:'flex', gap:'10px', alignItems:'flex-end' }}>
                  <div>
                    <label style={labelSt}>New PIN</label>
                    <input type="password" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g,'').slice(0,6))}
                      placeholder="Enter new PIN" maxLength={6} style={{ ...inputSt, width:'160px' }} />
                  </div>
                  <button onClick={savePin} disabled={savingComp || !newPin} style={{ padding:'9px 22px', background:(!newPin || savingComp) ? '#93adb8' : dk, color:'#fff', border:'none', borderRadius:'8px', fontSize:'.8rem', fontWeight:700, cursor:(!newPin || savingComp) ? 'default' : 'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                    {savingComp ? '…' : 'Update PIN'}
                  </button>
                </div>
              </Card>
            </>
          )}

        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:'90px', left:'50%', transform:'translateX(-50%)', background:dk, color:'#fff', padding:'13px 22px', borderRadius:'14px', fontSize:'.88rem', fontWeight:700, boxShadow:'0 8px 28px rgba(0,0,0,.25)', zIndex:600, whiteSpace:'nowrap' }}>
          {toast}
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div style={{ position:'fixed', inset:0, zIndex:700, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.45)' }} onClick={()=>setSelectedOrder(null)}>
          <div style={{ background:'#fff', borderRadius:'18px', padding:'28px', maxWidth:'480px', width:'92%', maxHeight:'80vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px' }}>
              <div>
                <div style={{ fontWeight:900, color:dk, fontSize:'1.1rem' }}>Order #{selectedOrder.order_code}</div>
                <div style={{ fontSize:'.72rem', color:sec }}>{new Date(selectedOrder.created_at).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}</div>
              </div>
              <Bdg status={selectedOrder.status} />
            </div>
            {/* 3 Stat cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginBottom:'18px' }}>
              <div style={{ background:'rgba(0,49,65,.04)', borderRadius:'12px', padding:'12px', textAlign:'center' }}>
                <div style={{ fontSize:'.6rem', fontWeight:800, color:sec, textTransform:'uppercase', letterSpacing:'.5px' }}>Meals</div>
                <div style={{ fontSize:'1.4rem', fontWeight:900, color:dk }}>{selectedOrder.items?.length ?? 0}</div>
              </div>
              <div style={{ background:'rgba(26,122,70,.06)', borderRadius:'12px', padding:'12px', textAlign:'center' }}>
                <div style={{ fontSize:'.6rem', fontWeight:800, color:sec, textTransform:'uppercase', letterSpacing:'.5px' }}>Emp Paid</div>
                <div style={{ fontSize:'1.4rem', fontWeight:900, color:dk }}>{fmt$(selectedOrder.employee_cost ?? 0)}</div>
              </div>
              <div style={{ background:'rgba(116,83,162,.06)', borderRadius:'12px', padding:'12px', textAlign:'center' }}>
                <div style={{ fontSize:'.6rem', fontWeight:800, color:sec, textTransform:'uppercase', letterSpacing:'.5px' }}>Co Covered</div>
                <div style={{ fontSize:'1.4rem', fontWeight:900, color:grn }}>{fmt$(selectedOrder.company_cost ?? 0)}</div>
              </div>
            </div>
            {/* Meal items */}
            <div style={{ borderTop:`2px solid rgba(0,49,65,.06)`, paddingTop:'14px' }}>
              <div style={{ fontSize:'.7rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'.5px', color:sec, marginBottom:'10px' }}>Meal Items</div>
              {selectedOrder.items?.map((item: any) => (
                <div key={item.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid rgba(0,49,65,.04)' }}>
                  <div>
                    <div style={{ fontWeight:700, color:dk, fontSize:'.88rem' }}>{item.meal_name ?? item.meal_recipe?.display_name ?? '—'}</div>
                    <span style={{ fontSize:'.62rem', fontWeight:800, padding:'2px 7px', borderRadius:'999px', background:'rgba(45,126,196,.1)', color:sky, textTransform:'capitalize' }}>{item.tier ?? 'free'}</span>
                  </div>
                  <div style={{ fontWeight:800, color:dk, fontSize:'.9rem' }}>{(item.unit_price ?? 0) === 0 ? 'FREE' : fmt$(item.unit_price ?? 0)}</div>
                </div>
              ))}
            </div>
            <button onClick={()=>setSelectedOrder(null)} style={{ width:'100%', marginTop:'18px', padding:'12px', background:dk, color:'#fff', border:'none', borderRadius:'12px', fontWeight:800, fontSize:'.88rem', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>Close</button>
          </div>
        </div>
      )}

      {/* Set Employee PIN Modal */}
      {pinModalEmp && (
        <div style={{ position:'fixed', inset:0, zIndex:700, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.4)' }}
          onClick={() => setPinModalEmp(null)}>
          <div style={{ background:'#fff', borderRadius:'20px', padding:'28px', maxWidth:'360px', width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight:900, color:dk, fontSize:'1rem', marginBottom:'6px' }}>Set PIN for {pinModalEmp.name}</h3>
            <p style={{ fontSize:'.78rem', color:sec, marginBottom:'18px' }}>Enter a 4-digit PIN the employee will use to sign in.</p>
            <input type="password" inputMode="numeric" pattern="[0-9]{4,8}" maxLength={4}
              value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
              placeholder="****" autoFocus
              style={{ width:'100%', padding:'14px', border:`2px solid ${bdr}`, borderRadius:'12px', fontSize:'1.5rem',
                fontFamily:"'DM Sans', sans-serif", color:dk, textAlign:'center', letterSpacing:'8px', fontWeight:900, outline:'none' }} />
            <div style={{ display:'flex', gap:'8px', marginTop:'16px' }}>
              <button onClick={() => setPinModalEmp(null)}
                style={{ flex:1, padding:'12px', background:'#f0f0f0', color:dk, border:'none', borderRadius:'12px', fontWeight:700, fontSize:'.85rem', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>Cancel</button>
              <button onClick={submitSetPin} disabled={pinInput.length < 4}
                style={{ flex:1, padding:'12px', background: pinInput.length >= 4 ? grn : '#ccc', color:'#fff', border:'none', borderRadius:'12px', fontWeight:800, fontSize:'.85rem', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>Save PIN</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
