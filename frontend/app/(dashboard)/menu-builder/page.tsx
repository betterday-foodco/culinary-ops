'use client';

import { useEffect, useState, useRef, useMemo, useCallback, Fragment } from 'react';
import {
  api,
  type MealRecipe,
  type MenuQueueItem,
  type MenuQueueResponse,
  type QueueColumn as QueueColumnDef,
  type MenuAdvanceLog,
} from '../../lib/api';

// ── Color constants ────────────────────────────────────────────────────────────
const C = {
  navy:    '#003141',
  yellow:  '#FFC600',
  sky:     '#4EA2FD',
  green:   '#6BBD52',
  meatHdr: '#B45309',   // BetterDay amber/warm
  omniHdr: '#003141',   // BetterDay navy
  veganHdr:'#166534',   // forest green
  plantDk: '#15803D',
  cream:   '#F8F3EC',   // BetterDay cream
};

// ── Scorecard rows ─────────────────────────────────────────────────────────────
const SC_ROW1 = [
  { key:'ch',   lbl:'Chicken' },
  { key:'tr',   lbl:'Turkey'  },
  { key:'bf',   lbl:'Beef'    },
  { key:'pk',   lbl:'Pork'    },
  { key:'sf',   lbl:'Seafood' },
  { key:'da',   lbl:'Dairy'   },
];
const SC_ROW2 = [
  { key:'gl',        lbl:'Gluten'  },
  { key:'peanut',    lbl:'Peanut'  },
  { key:'st_rice',   lbl:'Rice'    },
  { key:'st_pasta',  lbl:'Pasta'   },
  { key:'st_potato', lbl:'Potato'  },
  { key:'st_other',  lbl:'Other'   },
];
const SC_ALL_KEYS = [...SC_ROW1.map(c=>c.key),...SC_ROW2.map(c=>c.key)];
const SC_LABELS: Record<string,string> = {};
[...SC_ROW1,...SC_ROW2].forEach(c=>{ SC_LABELS[c.key]=c.lbl; });

const CELL_MAX: Record<string,number> = { ch:8,tr:5,bf:5,pk:5,sf:5,da:5,gl:5,peanut:5,st_rice:5,st_pasta:5,st_potato:5,st_other:5 };

// ── Color helpers ──────────────────────────────────────────────────────────────
function redCell(val:number, max:number):{bg:string;fg:string}{
  if(!val) return {bg:'#ffffff',fg:'#aaa'};
  const t=Math.min(val/max,1);
  const L=Math.round(97-t*34); const S=Math.round(40+t*45);
  const fg=L<75?'#5a1a1a':'#9a3030';
  return {bg:`hsl(4,${S}%,${L}%)`,fg};
}
function psColor(total:number):{bg:string;fg:string}{
  if(!total) return {bg:'#ffffff',fg:'#aaa'};
  const t=Math.max(0,Math.min(1,(total-10)/20));
  const L=Math.round(96-t*30); const S=Math.round(20+(1-t)*55);
  const fg=L<72?'#14532d':'#166534';
  return {bg:`hsl(142,${S}%,${L}%)`,fg};
}

// ── Meal attribute helpers ─────────────────────────────────────────────────────
function getMealAttrs(meal: MenuQueueItem['meal']) {
  const tags = (meal.allergen_tags??[]).map(t=>t.toLowerCase());
  const name = meal.display_name.toLowerCase();
  const cat  = (meal.category??'').toLowerCase();
  return {
    ch: tags.includes('chicken') || name.includes('chicken') ? 1 : 0,
    tr: tags.includes('turkey')  || name.includes('turkey')  ? 1 : 0,
    bf: tags.includes('beef')    || name.includes('beef') || name.includes('steak') || name.includes('brisket') ? 1 : 0,
    pk: tags.includes('pork')    || name.includes('pork') || name.includes('bacon') ? 1 : 0,
    sf: tags.includes('seafood') || tags.includes('fish') || tags.includes('shrimp') || tags.includes('prawn') || name.includes('salmon') || name.includes('shrimp') || name.includes('prawn') ? 1 : 0,
    da: tags.includes('dairy')   || tags.includes('milk') || tags.includes('cheese') || name.includes('parmesan') || name.includes('alfredo') ? 1 : 0,
    gl: tags.includes('gluten')  || tags.includes('wheat') ? 1 : 0,
    peanut: tags.includes('peanut') || name.includes('peanut') || name.includes('satay') ? 1 : 0,
    st: cat.includes('pasta') || name.includes('pasta') || name.includes('linguine') || name.includes('rotini') || name.includes('orzo') || name.includes('spaghetti') || name.includes('mac') || name.includes('penne') ? 'Pasta'
      : cat.includes('rice') || name.includes('rice') || name.includes('sushi') || name.includes('bowl') || cat.includes('curry') || name.includes('curry') || name.includes('thai') || name.includes('burrito') ? 'Rice'
      : name.includes('potato') || name.includes('mashed') || name.includes('hash') ? 'Potato'
      : 'Other',
    ps: meal.portion_score ?? 0,
    isGluten: tags.includes('gluten') || tags.includes('wheat'),
  };
}

type ScStats = {
  ch:number; tr:number; bf:number; pk:number; sf:number; da:number;
  gl:number; peanut:number; st_rice:number; st_pasta:number; st_potato:number; st_other:number;
  ps_total:number; mt:number; pl:number; total:number;
};

// ── Layout constants ───────────────────────────────────────────────────────────
const SC_W = 380;
const COL_W = 128;

// ── Drag: unique key per slot ──────────────────────────────────────────────────
type DragFrom = { colId:string; itemId:string; mealId:string; rowIdx:number } | null;

// ══════════════════════════════════════════════════════════════════════════════
export default function MenuBuilderPage() {
  const [queueData,    setQueueData]    = useState<MenuQueueResponse|null>(null);
  const [meals,        setMeals]        = useState<MealRecipe[]>([]);
  const [lastAdvanced, setLastAdvanced] = useState<MenuAdvanceLog|null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  // Drawer
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [drawerSearch, setDrawerSearch] = useState('');

  // Add modal (fallback)
  const [addModal,  setAddModal]  = useState<{columnId:string;label:string}|null>(null);
  const [addSearch, setAddSearch] = useState('');

  // Advance modal
  const [advanceModal, setAdvanceModal] = useState(false);
  const [advanceLabel, setAdvanceLabel] = useState('');

  // Scorecard settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reqMeat,  setReqMeat]  = useState(11);
  const [reqPlant, setReqPlant] = useState(7);
  const [scRanges, setScRanges] = useState<Record<string,{max:number|null;min:number|null}>>(
    () => Object.fromEntries(SC_ALL_KEYS.map(k=>[k,{max:null,min:null}]))
  );

  // Diet toggles (in-memory) — keyed by meal_id
  const [dietToggles, setDietToggles] = useState<Record<string,{meatOff:boolean;plantOff:boolean}>>({});

  // Pinned columns (in-memory)
  const [pinnedCols, setPinnedCols] = useState<Record<string,boolean>>({});

  // Column unlock / edit mode
  const [colUnlocked, setColUnlocked] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  // Drag state
  const dragFrom = useRef<DragFrom>(null);
  const [dragTarget, setDragTarget] = useState<{colId:string;rowIdx:number}|null>(null);
  const [dragOverCol, setDragOverCol] = useState<string|null>(null);

  // Swap modal
  const [swapModal,       setSwapModal]       = useState<{weekRow:number}|null>(null);
  const [swapTab,         setSwapTab]         = useState<'summary'|'trace'|'override'>('summary');
  const [swapOverrides,   setSwapOverrides]   = useState<Record<string,string>>({});
  const [overrideSearch,  setOverrideSearch]  = useState('');

  // Pair assignment modal
  const [pairModal, setPairModal] = useState<{mealId:string}|null>(null);
  const [pairSearch, setPairSearch] = useState('');

  // Local column overrides (rename, color, order) — persist visual changes
  const [colOverrides, setColOverrides] = useState<Record<string,{label?:string;color?:string}>>({});
  const [colOrder, setColOrder] = useState<string[]|null>(null);

  // Color picker state
  const [colorPickerCol, setColorPickerCol] = useState<string|null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [scShadow, setScShadow] = useState(false);

  useEffect(()=>{ loadAll(); },[]);

  async function loadAll(){
    setLoading(true); setError('');
    try{
      const [qR,mR,lR] = await Promise.allSettled([
        api.getMenuQueue(), api.getMeals(), api.getLastAdvanced(),
      ]);
      if(qR.status==='fulfilled'){ setQueueData(qR.value); }
      else setError('Menu queue unavailable.');
      if(mR.status==='fulfilled') setMeals(mR.value);
      if(lR.status==='fulfilled') setLastAdvanced(lR.value);
    } finally{ setLoading(false); }
  }

  // ── Derived data ────────────────────────────────────────────────────────────
  const allMealsById = useMemo(()=>{
    const m = new Map<string,MealRecipe>();
    meals.forEach(ml=>m.set(ml.id,ml));
    return m;
  },[meals]);

  const rawColumns  = queueData?.columns ?? [];
  const queue       = queueData?.queue   ?? {};

  // Apply local column order
  const columns = useMemo(()=>{
    const base = rawColumns;
    if(!colOrder) return base;
    const map = new Map(base.map(c=>[c.id,c]));
    return colOrder.map(id=>map.get(id)).filter(Boolean) as QueueColumnDef[];
  },[rawColumns,colOrder]);

  const maxRows = useMemo(()=>
    Math.max(1,...columns.map(c=>(queue[c.id]??[]).length+1)),
  [columns,queue]);

  // All queued meal_ids
  const allQueuedIds = useMemo(()=>{
    const s=new Set<string>();
    Object.values(queue).flat().forEach(i=>s.add(i.meal_id));
    return s;
  },[queue]);

  // Frequency: how many times each meal_id appears total
  const freqCount = useMemo(()=>{
    const m=new Map<string,number>();
    columns.forEach(col=>{
      (queue[col.id]??[]).forEach(item=>{
        m.set(item.meal_id,(m.get(item.meal_id)??0)+1);
      });
    });
    return m;
  },[columns,queue]);

  // Occurrence index: col|row → which occurrence number (1st, 2nd...)
  const freqOccurrence = useMemo(()=>{
    const occ=new Map<string,number>();
    const running=new Map<string,number>();
    for(let r=0;r<maxRows;r++){
      columns.forEach(col=>{
        const item=(queue[col.id]??[])[r];
        if(item){
          const n=(running.get(item.meal_id)??0)+1;
          running.set(item.meal_id,n);
          occ.set(`${col.id}|${r}`,n);
        }
      });
    }
    return occ;
  },[columns,queue,maxRows]);

  // Week dates anchored to last Monday
  const weekDates = useMemo(()=>{
    const d=new Date(); d.setHours(0,0,0,0);
    const dow=d.getDay(); const diff=dow===0?-6:1-dow;
    const monday=new Date(d); monday.setDate(d.getDate()+diff);
    return Array.from({length:maxRows},(_,i)=>{
      const w=new Date(monday); w.setDate(monday.getDate()+i*7);
      return w.toLocaleDateString('en-CA',{month:'short',day:'numeric'});
    });
  },[maxRows]);

  // ── Stats per row ────────────────────────────────────────────────────────────
  function computeRowStats(rowIdx:number): ScStats|null {
    const s:ScStats = {ch:0,tr:0,bf:0,pk:0,sf:0,da:0,gl:0,peanut:0,st_rice:0,st_pasta:0,st_potato:0,st_other:0,ps_total:0,mt:0,pl:0,total:0};
    let hasAny=false;
    const countedMeat=new Set<string>(); const countedPlant=new Set<string>();

    columns.forEach(col=>{
      const arr=queue[col.id]??[];
      let item=arr[rowIdx];
      if(!item && pinnedCols[col.id] && arr[0]) item=arr[0]; // pinned
      if(!item) return;
      hasAny=true;
      const tog=dietToggles[item.meal_id]??{meatOff:false,plantOff:false};
      const plantId=item.meal.linked_meal_id;
      const colType=col.type;

      if(colType==='omni' && plantId){
        if(!tog.meatOff && !countedMeat.has(item.meal_id)){ s.mt++; countedMeat.add(item.meal_id); }
        if(!tog.plantOff && !countedPlant.has(plantId)){ s.pl++; countedPlant.add(plantId); }
      } else if(colType==='vegan'){
        if(!countedPlant.has(item.meal_id)){ s.pl++; countedPlant.add(item.meal_id); }
      } else {
        if(!tog.meatOff && !countedMeat.has(item.meal_id)){ s.mt++; countedMeat.add(item.meal_id); }
      }

      const a=getMealAttrs(item.meal);
      s.total++; s.ps_total+=a.ps;
      s.ch+=a.ch; s.tr+=a.tr; s.bf+=a.bf; s.pk+=a.pk; s.sf+=a.sf; s.da+=a.da;
      s.gl+=a.gl; s.peanut+=a.peanut;
      if(a.st==='Rice') s.st_rice++;
      else if(a.st==='Pasta') s.st_pasta++;
      else if(a.st==='Potato') s.st_potato++;
      else s.st_other++;
    });
    return hasAny?s:null;
  }

  // ── Swap engine ───────────────────────────────────────────────────────────────
  function getWeekSKUs(rowIdx:number){
    const skus:{meal_id:string;name:string;diet:'meat'|'plant';colId:string}[]=[];
    columns.forEach(col=>{
      const arr=queue[col.id]??[];
      let item=arr[rowIdx];
      if(!item && pinnedCols[col.id] && arr[0]) item=arr[0];
      if(!item) return;
      const tog=dietToggles[item.meal_id]??{meatOff:false,plantOff:false};
      const plantId=item.meal.linked_meal_id;
      const colType=col.type;
      if(colType==='omni' && plantId){
        if(!tog.meatOff) skus.push({meal_id:item.meal_id,name:item.meal.display_name,diet:'meat',colId:col.id});
        if(!tog.plantOff){ const pm=allMealsById.get(plantId); skus.push({meal_id:plantId,name:pm?.display_name??plantId,diet:'plant',colId:col.id}); }
      } else if(colType==='vegan'){
        skus.push({meal_id:item.meal_id,name:item.meal.display_name,diet:'plant',colId:col.id});
      } else {
        if(!tog.meatOff) skus.push({meal_id:item.meal_id,name:item.meal.display_name,diet:'meat',colId:col.id});
      }
    });
    return skus;
  }

  function computeSwaps(fromRow:number,toRow:number){
    const outSKUs=getWeekSKUs(fromRow); const inSKUs=getWeekSKUs(toRow);
    const swaps:{outId:string;outName:string;inId:string|null;inName:string|null;diet:'meat'|'plant';colId:string;status:'direct'|'cross'|'orphan'}[]=[];
    const trace:string[]=[];
    const inClaimed=new Set<string>(); const outMatched=new Set<string>();

    // Step 1: direct column matches
    outSKUs.forEach(out=>{
      const match=inSKUs.find(ins=>ins.colId===out.colId&&ins.diet===out.diet&&!inClaimed.has(ins.meal_id));
      if(match){ swaps.push({outId:out.meal_id,outName:out.name,inId:match.meal_id,inName:match.name,diet:out.diet,colId:out.colId,status:'direct'}); inClaimed.add(match.meal_id); outMatched.add(out.meal_id); const cn=getColLabel(out.colId); trace.push(`✓ ${cn} [${out.diet}]: ${out.meal_id.slice(-6)} → ${match.meal_id.slice(-6)}`); }
    });

    // Step 2: cross-column
    const unmOut=outSKUs.filter(s=>!outMatched.has(s.meal_id));
    const unmIn=inSKUs.filter(s=>!inClaimed.has(s.meal_id));
    ['meat','plant'].forEach(diet=>{
      const outs=unmOut.filter(s=>s.diet===diet); const ins=unmIn.filter(s=>s.diet===diet&&!inClaimed.has(s.meal_id));
      outs.forEach((out,i)=>{
        if(i<ins.length){ swaps.push({outId:out.meal_id,outName:out.name,inId:ins[i].meal_id,inName:ins[i].name,diet:out.diet as any,colId:out.colId,status:'cross'}); inClaimed.add(ins[i].meal_id); trace.push(`↔ Cross [${diet}]: ${out.meal_id.slice(-6)} → ${ins[i].meal_id.slice(-6)}`); }
        else { swaps.push({outId:out.meal_id,outName:out.name,inId:null,inName:null,diet:out.diet as any,colId:out.colId,status:'orphan'}); trace.push(`⚠ Orphan [${diet}]: ${out.meal_id.slice(-6)} — no match`); }
      });
    });
    return {swaps,trace};
  }

  // ── Column helpers ────────────────────────────────────────────────────────────
  function getColLabel(colId:string){ return colOverrides[colId]?.label ?? columns.find(c=>c.id===colId)?.label ?? colId; }
  function getColColor(col:QueueColumnDef){
    if(colOverrides[col.id]?.color) return colOverrides[col.id].color!;
    return col.type==='meat'?C.meatHdr:col.type==='vegan'?C.veganHdr:C.omniHdr;
  }

  function toggleColLock(){
    if(lockTimerRef.current) clearTimeout(lockTimerRef.current);
    setColUnlocked(v=>!v);
    if(!colUnlocked){ lockTimerRef.current=setTimeout(()=>setColUnlocked(false),15000); }
  }
  function renameCol(colId:string,newName:string){ setColOverrides(p=>({...p,[colId]:{...p[colId],label:newName}})); setColUnlocked(false); }
  function setColColor2(colId:string,color:string){ setColOverrides(p=>({...p,[colId]:{...p[colId],color}})); setColorPickerCol(null); setColUnlocked(false); }

  // Column drag reorder
  const colDragId = useRef<string|null>(null);
  function colDragStart(e:React.DragEvent,colId:string){ colDragId.current=colId; e.dataTransfer.effectAllowed='move'; }
  function colDrop(e:React.DragEvent,targetId:string){
    e.preventDefault();
    const fromId=colDragId.current; colDragId.current=null;
    if(!fromId||fromId===targetId) return;
    const order=colOrder??columns.map(c=>c.id);
    const fi=order.indexOf(fromId); const ti=order.indexOf(targetId);
    if(fi<0||ti<0) return;
    const next=[...order]; next.splice(fi,1); next.splice(ti,0,fromId);
    setColOrder(next); setColUnlocked(false);
  }

  // Toggle pin
  function togglePin(colId:string){ setPinnedCols(p=>({...p,[colId]:!p[colId]})); }

  // Diet toggle
  function toggleDiet(mealId:string,side:'meat'|'plant'){
    setDietToggles(p=>{
      const cur=p[mealId]??{meatOff:false,plantOff:false};
      if(side==='meat'&&!cur.meatOff&&cur.plantOff) return p; // can't disable both
      if(side==='plant'&&!cur.plantOff&&cur.meatOff) return p;
      return {...p,[mealId]:{...cur,[side==='meat'?'meatOff':'plantOff']:!cur[side==='meat'?'meatOff':'plantOff']}};
    });
  }

  // ── Queue ops ─────────────────────────────────────────────────────────────────
  async function handleAdd(columnId:string,mealId:string){
    setSaving(true);
    try{ await api.addToQueue({column_id:columnId,meal_id:mealId}); setQueueData(await api.getMenuQueue()); setAddModal(null); setAddSearch(''); setPairModal(null); }
    catch(e:any){ alert(e.message??'Error'); } finally{ setSaving(false); }
  }

  async function handleRemove(itemId:string){
    setSaving(true);
    try{ await api.removeFromQueue(itemId); setQueueData(await api.getMenuQueue()); }
    catch(e:any){ alert(e.message??'Error'); } finally{ setSaving(false); }
  }

  async function handleDuplicate(colId:string,mealId:string){
    setSaving(true);
    try{ await api.addToQueue({column_id:colId,meal_id:mealId}); setQueueData(await api.getMenuQueue()); }
    catch(e:any){ alert(e.message??'Error'); } finally{ setSaving(false); }
  }

  async function handleReorder(colId:string,items:MenuQueueItem[]){
    setSaving(true);
    try{ setQueueData(await api.reorderQueueColumn(colId,items.map(i=>i.id))); }
    catch(e:any){ alert(e.message??'Reorder failed'); } finally{ setSaving(false); }
  }

  async function handleAdvance(){
    setSaving(true);
    try{ const r=await api.advanceMenuQueue({week_label:advanceLabel||undefined}); setQueueData(r.queue); setLastAdvanced(r.log); setAdvanceModal(false); setAdvanceLabel(''); }
    catch(e:any){ alert(e.message??'Advance failed'); } finally{ setSaving(false); }
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────────
  function onCardDragStart(e:React.DragEvent,colId:string,itemId:string,mealId:string,rowIdx:number){
    dragFrom.current={colId,itemId,mealId,rowIdx};
    e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setData('type','card');
    e.dataTransfer.setData('itemId',itemId);
    e.dataTransfer.setData('mealId',mealId);
  }
  function onPoolDragStart(e:React.DragEvent,mealId:string){
    dragFrom.current=null;
    e.dataTransfer.effectAllowed='copy';
    e.dataTransfer.setData('type','pool');
    e.dataTransfer.setData('mealId',mealId);
  }
  function onCellDragOver(e:React.DragEvent,colId:string,rowIdx:number){
    e.preventDefault(); e.dataTransfer.dropEffect='move';
    setDragTarget(p=>(p?.colId===colId&&p?.rowIdx===rowIdx)?p:{colId,rowIdx});
    setDragOverCol(p=>p===colId?p:colId);
  }
  async function onCellDrop(e:React.DragEvent,colId:string,rowIdx:number){
    e.preventDefault();
    setDragTarget(null); setDragOverCol(null);
    const type=e.dataTransfer.getData('type');
    const mealId=e.dataTransfer.getData('mealId');
    const from=dragFrom.current; dragFrom.current=null;
    if(!mealId) return;
    if(type==='pool'){
      setSaving(true);
      try{ await api.addToQueue({column_id:colId,meal_id:mealId}); setQueueData(await api.getMenuQueue()); }
      catch(e:any){ alert(e.message??'Error'); } finally{ setSaving(false); }
    } else if(type==='card' && from){
      if(from.colId===colId){
        // Same-column reorder
        if(from.rowIdx!==rowIdx){
          const items=[...(queue[colId]??[])];
          const [moved]=items.splice(from.rowIdx,1);
          items.splice(rowIdx,0,moved);
          await handleReorder(colId,items);
        }
      } else {
        // Cross-column move: remove from source column, add to target
        setSaving(true);
        try{
          await api.removeFromQueue(from.itemId);
          await api.addToQueue({column_id:colId,meal_id:from.mealId});
          setQueueData(await api.getMenuQueue());
        } catch(e:any){ alert(e.message??'Error'); } finally{ setSaving(false); }
      }
    }
  }
  function onDragEnd(){ setDragTarget(null); setDragOverCol(null); dragFrom.current=null; }

  // Scroll shadow
  useEffect(()=>{
    const el=wrapRef.current; if(!el) return;
    const handler=()=>setScShadow(el.scrollLeft>2);
    el.addEventListener('scroll',handler);
    return ()=>el.removeEventListener('scroll',handler);
  },[]);

  // Outside click for settings & color picker
  useEffect(()=>{
    function handler(e:MouseEvent){
      if(settingsOpen && !(e.target as Element).closest('.sc-settings-panel') && !(e.target as Element).closest('.sc-settings-btn')) setSettingsOpen(false);
      if(colorPickerCol && !(e.target as Element).closest('.color-picker-popup') && !(e.target as Element).closest('.col-color-dot')) setColorPickerCol(null);
    }
    document.addEventListener('click',handler);
    return ()=>document.removeEventListener('click',handler);
  },[settingsOpen,colorPickerCol]);

  // ── Add-modal filtered list ───────────────────────────────────────────────────
  const addFiltered = useMemo(()=>{
    if(!addModal) return [];
    const inCol=new Set((queue[addModal.columnId]??[]).map(i=>i.meal_id));
    const q=addSearch.toLowerCase();
    return meals.filter(m=>{ if(inCol.has(m.id)) return false; if(!q) return true; return m.display_name.toLowerCase().includes(q)||(m.meal_code??'').toLowerCase().includes(q); });
  },[addModal,addSearch,meals,queue]);

  // Pair modal filtered list (plant-based meals only)
  const pairFiltered = useMemo(()=>{
    const q=pairSearch.toLowerCase();
    return meals.filter(m=>{
      const cat=(m.category??'').toLowerCase(); const tags=(m.dietary_tags??[]).map((t:string)=>t.toLowerCase());
      const isPlant=cat.includes('vegan')||cat.includes('plant')||tags.includes('vegan')||tags.includes('plant-based');
      if(!isPlant) return false;
      if(!q) return true;
      return m.display_name.toLowerCase().includes(q)||(m.meal_code??'').toLowerCase().includes(q);
    });
  },[pairSearch,meals]);

  // ── Settings panel helpers ─────────────────────────────────────────────────────
  function stepScRange(key:string,type:'max'|'min',delta:number){
    setScRanges(p=>{ const cur=p[key]??{max:null,min:null}; const val=cur[type]; return {...p,[key]:{...cur,[type]:val===null?Math.max(0,delta):Math.max(0,val+delta)}}; });
  }
  function clearScRange(key:string,type:'max'|'min'){
    setScRanges(p=>({...p,[key]:{...p[key],[type]:null}}));
  }
  function isOutOfRange(key:string,val:number){ const r=scRanges[key]; if(!r) return false; if(r.max!==null&&val>r.max) return true; if(r.min!==null&&val<r.min) return true; return false; }

  // ── Drawer pool ────────────────────────────────────────────────────────────────
  const poolMeals = useMemo(()=>{
    const q=drawerSearch.toLowerCase();
    const result:{meat:MealRecipe[];omni:MealRecipe[];vegan:MealRecipe[]}={meat:[],omni:[],vegan:[]};
    meals.forEach(m=>{
      const cat=(m.category??'').toLowerCase(); const tags=(m.dietary_tags??[]).map((t:string)=>t.toLowerCase());
      let diet:'meat'|'omni'|'vegan'='omni';
      if(cat.includes('vegan')||cat.includes('plant')||tags.includes('vegan')) diet='vegan';
      else if(m.linked_meal_id) diet='omni';
      else if(cat.includes('meat only')||(!m.linked_meal_id&&cat.includes('meat'))) diet='meat';
      if(q && !m.display_name.toLowerCase().includes(q) && !(m.meal_code??'').toLowerCase().includes(q)) return;
      result[diet].push(m);
    });
    return result;
  },[meals,drawerSearch]);

  const PICKER_COLORS=['#003141','#B45309','#166534','#4EA2FD','#6BBD52','#7c3aed'];

  if(loading) return <div className="flex items-center justify-center h-screen text-sm text-gray-400">Loading menu builder…</div>;
  if(error)   return <div className="flex items-center justify-center h-screen"><div className="text-center"><p className="text-red-600 text-sm mb-3">{error}</p><button onClick={loadAll} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Retry</button></div></div>;

  const gridTplCols = `${SC_W}px ${columns.map(()=>`${COL_W}px`).join(' ')} 40px`;

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden',background:C.cream}}>

      {/* ── Grid wrap ──────────────────────────────────────────────────────── */}
      <div ref={wrapRef} style={{flex:1,overflow:'auto',position:'relative',margin:'10px 16px',border:'1px solid #e5e7eb',borderRadius:10,background:'white'}}>

        {/* Overlay drawer */}
        <div style={{position:'absolute',top:0,left:0,bottom:0,width:380,background:'white',borderRight:'2px solid '+C.navy,boxShadow:'4px 0 20px rgba(0,0,0,.15)',zIndex:20,display:'flex',flexDirection:'column',transform:drawerOpen?'translateX(0)':'translateX(-100%)',transition:'transform .25s ease'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:'1px solid #e5e7eb',background:C.navy,flexShrink:0}}>
            <span style={{fontSize:13,fontWeight:700,color:'white'}}>Unassigned Dishes</span>
            <button onClick={()=>setDrawerOpen(false)} style={{background:'none',border:'none',color:'rgba(255,255,255,.7)',fontSize:20,cursor:'pointer',lineHeight:1,padding:'2px 6px'}}>×</button>
          </div>
          <div style={{padding:'8px 10px',borderBottom:'1px solid #e5e7eb',flexShrink:0}}>
            <input value={drawerSearch} onChange={e=>setDrawerSearch(e.target.value)} placeholder="Search dishes…" style={{width:'100%',padding:'6px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:12,outline:'none',fontFamily:'inherit',boxSizing:'border-box'}}/>
          </div>
          <div style={{flex:1,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',overflow:'hidden',minHeight:0}}>
            {(['meat','omni','vegan'] as const).map(dt=>{
              const hdr=dt==='meat'?C.meatHdr:dt==='vegan'?C.veganHdr:C.omniHdr;
              const list=poolMeals[dt];
              return (
                <div key={dt} style={{display:'flex',flexDirection:'column',borderRight:'1px solid #e5e7eb',overflow:'hidden'}}>
                  <div style={{padding:'7px 8px 5px',background:hdr,flexShrink:0}}>
                    <div style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'white'}}>{dt==='meat'?'Meat':dt==='omni'?'Omni':'Vegan'}</div>
                    <div style={{fontSize:9,color:'rgba(255,255,255,.65)',marginTop:1}}>{list.length}</div>
                  </div>
                  <div style={{flex:1,overflowY:'auto',padding:'4px 4px 20px'}}>
                    {list.sort((a,b)=>a.display_name.localeCompare(b.display_name)).map(m=>(
                      <div key={m.id} draggable onDragStart={e=>onPoolDragStart(e,m.id)} style={{background:'white',border:'1px solid #e5e7eb',borderRadius:6,padding:'6px 8px',marginBottom:4,cursor:'grab',userSelect:'none',opacity:allQueuedIds.has(m.id)?0.4:1}} title={m.display_name}>
                        <div style={{fontSize:11,fontWeight:600,color:'#111',lineHeight:1.3}}>{m.display_name.length>22?m.display_name.slice(0,20)+'…':m.display_name}</div>
                        {m.meal_code&&<div style={{fontSize:9,color:'#9ca3af',fontFamily:'monospace',marginTop:1}}>{m.meal_code}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CSS Grid ───────────────────────────────────────────────────────── */}
        <div style={{display:'grid',gridTemplateColumns:gridTplCols,width:`${SC_W+columns.length*COL_W+40}px`}}>

          {/* ── Header row ── */}

          {/* Scorecard header */}
          <div style={{position:'sticky',left:0,zIndex:11,background:C.navy,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 12px',minHeight:44,boxShadow:scShadow?'6px 0 16px rgba(0,0,0,.1)':undefined}} className="sc-settings-btn-wrap">
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'white'}}>Scorecard</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <button className="sc-settings-btn" onClick={e=>{e.stopPropagation();setSettingsOpen(v=>!v);}} style={{background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.2)',color:'rgba(255,255,255,.85)',fontSize:9,fontWeight:600,padding:'6px 10px',borderRadius:6,cursor:'pointer',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:4}}>⚙ Set Min/Max</button>
              <button onClick={()=>setDrawerOpen(v=>!v)} style={{background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.2)',color:'rgba(255,255,255,.85)',fontSize:9,fontWeight:600,padding:'6px 14px',borderRadius:6,cursor:'pointer',whiteSpace:'nowrap'}}>▾ View All Meals</button>
              <button onClick={()=>setAdvanceModal(true)} style={{background:C.green,border:'none',color:'white',fontSize:9,fontWeight:700,padding:'6px 12px',borderRadius:6,cursor:'pointer',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:4}}>▶ Advance Week</button>
              {saving&&<span style={{fontSize:9,color:'rgba(255,255,255,.6)'}}>Saving…</span>}
            </div>
            {/* Settings dropdown */}
            {settingsOpen&&(
              <div className="sc-settings-panel" onClick={e=>e.stopPropagation()} style={{position:'absolute',top:'100%',left:0,right:0,background:'white',border:'1px solid #e5e7eb',borderTop:'2px solid '+C.navy,boxShadow:'0 8px 30px rgba(0,0,0,.2)',zIndex:25,maxHeight:600,overflowY:'auto',borderRadius:'0 0 8px 8px',textTransform:'none',letterSpacing:'normal',fontSize:14,color:'#111',textAlign:'left'}}>
                {/* Required rows */}
                {[{k:'mt',lbl:'Meat dishes',val:reqMeat,set:setReqMeat},{k:'pl',lbl:'Plant dishes',val:reqPlant,set:setReqPlant}].map(({k,lbl,val,set})=>(
                  <div key={k} style={{display:'flex',alignItems:'center',height:36,background:k==='mt'?C.meatHdr:C.plantDk}}>
                    <span style={{flex:1,fontSize:12,fontWeight:700,color:'white',padding:'0 14px'}}>{lbl}</span>
                    <div style={{display:'flex',alignItems:'center',marginRight:10}}>
                      <button onClick={()=>set(v=>Math.max(0,v-1))} style={{width:30,height:28,border:'none',fontSize:15,fontWeight:700,cursor:'pointer',background:'rgba(255,255,255,.2)',color:'white',borderRadius:'4px 0 0 4px'}}>−</button>
                      <input type="text" value={val} onChange={e=>set(parseInt(e.target.value)||0)} onClick={e=>e.stopPropagation()} style={{width:36,height:28,background:'rgba(255,255,255,.95)',color:'#111',fontSize:13,fontWeight:700,textAlign:'center',border:'none',outline:'none',fontFamily:'inherit'}}/>
                      <button onClick={()=>set(v=>v+1)} style={{width:30,height:28,border:'none',fontSize:15,fontWeight:700,cursor:'pointer',background:'rgba(255,255,255,.2)',color:'white',borderRadius:'0 4px 4px 0'}}>+</button>
                    </div>
                    <span style={{color:'rgba(255,255,255,.6)',fontSize:10,marginRight:12,whiteSpace:'nowrap'}}>per week</span>
                  </div>
                ))}
                <div style={{fontSize:13,fontWeight:700,color:'#111',padding:'10px 14px 2px'}}>Set min / max</div>
                <div style={{fontSize:10,color:'#9ca3af',padding:'0 14px 6px',lineHeight:1.35}}>Scorecard cell turns red when outside set range.</div>
                <table style={{width:'100%',borderCollapse:'collapse',tableLayout:'fixed'}}>
                  <colgroup><col/><col style={{width:100}}/><col style={{width:100}}/></colgroup>
                  <thead><tr><th style={{fontSize:10,fontWeight:600,color:'#9ca3af',padding:'3px 8px 4px',textAlign:'left',paddingLeft:14,borderBottom:'1px solid #e5e7eb'}}>Category</th><th style={{fontSize:10,fontWeight:600,color:'#9ca3af',padding:'3px 8px 4px',textAlign:'center',borderBottom:'1px solid #e5e7eb'}}>Max</th><th style={{fontSize:10,fontWeight:600,color:'#9ca3af',padding:'3px 8px 4px',textAlign:'center',borderBottom:'1px solid #e5e7eb'}}>Min</th></tr></thead>
                  <tbody>
                    {SC_ALL_KEYS.map((k,i)=>{
                      const r=scRanges[k]??{max:null,min:null};
                      return(
                        <tr key={k} style={{background:i%2===1?'#f8f9fb':undefined}}>
                          <td style={{padding:'2px 8px',paddingLeft:14,height:26,fontSize:11,fontWeight:600,color:'#111',verticalAlign:'middle'}}>{SC_LABELS[k]}</td>
                          {(['max','min'] as const).map(type=>{
                            const val=r[type];
                            return(
                              <td key={type} style={{padding:'2px 8px',textAlign:'center',verticalAlign:'middle',height:26}}>
                                <div style={{display:'inline-flex',alignItems:'center',width:90,justifyContent:'center'}}>
                                  {val===null?(
                                    <button onClick={()=>stepScRange(k,type,1)} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:76,height:22,borderRadius:5,border:`1px solid ${type==='max'?'#f4a8a6':'#93b8f0'}`,background:type==='max'?'#fff0f0':'#eff5ff',color:type==='max'?C.meatHdr:C.omniHdr,fontSize:10,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',fontFamily:'inherit'}}>+ {type}</button>
                                  ):(
                                    <div style={{display:'inline-flex',alignItems:'center'}}>
                                      <div style={{display:'inline-flex',alignItems:'center',borderRadius:5,overflow:'hidden',border:'1px solid #e5e7eb',height:22}}>
                                        <button onClick={()=>stepScRange(k,type,-1)} style={{width:18,height:22,border:'none',fontSize:11,fontWeight:700,cursor:'pointer',background:'#f3f4f6',color:'#6b7280'}}>−</button>
                                        <input type="text" value={val} onChange={e=>{ const n=parseInt(e.target.value); if(!isNaN(n)) setScRanges(p=>({...p,[k]:{...p[k],[type]:n}})); }} style={{width:36,height:22,background:'white',fontSize:11,fontWeight:700,textAlign:'center',border:'none',borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb',outline:'none',fontFamily:'inherit'}}/>
                                        <button onClick={()=>stepScRange(k,type,1)} style={{width:18,height:22,border:'none',fontSize:11,fontWeight:700,cursor:'pointer',background:'#f3f4f6',color:'#6b7280'}}>+</button>
                                      </div>
                                      <button onClick={()=>clearScRange(k,type)} style={{background:'none',border:'none',color:'#d1d5db',fontSize:9,cursor:'pointer',padding:'0 3px'}} title="Clear">✕</button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Column headers */}
          {columns.map((col,ci)=>{
            const color=getColColor(col);
            const pinned=!!pinnedCols[col.id];
            const arr=queue[col.id]??[];
            const canPin=arr.length<=1||pinned;
            return(
              <div key={`hdr-${col.id}`} data-col-id={col.id}
                style={{background:color,padding:'7px 10px',textAlign:'center',fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'white',position:'sticky',top:0,zIndex:10,minHeight:44,display:'flex',alignItems:'center',justifyContent:'center',borderRight:'1px solid rgba(255,255,255,.15)',outline:colUnlocked?'1px dashed rgba(255,255,255,.3)':undefined,outlineOffset:colUnlocked?-2:undefined,cursor:colUnlocked?'grab':undefined}}
                draggable={colUnlocked}
                onDragStart={e=>colDragStart(e,col.id)}
                onDragOver={e=>{if(colUnlocked){e.preventDefault();(e.currentTarget as HTMLElement).style.outline='2px solid '+C.yellow;}}}
                onDragLeave={e=>{(e.currentTarget as HTMLElement).style.outline=colUnlocked?'1px dashed rgba(255,255,255,.3)':''}}
                onDrop={e=>colDrop(e,col.id)}
              >
                {colUnlocked?(
                  <input defaultValue={colOverrides[col.id]?.label??col.label} onBlur={e=>renameCol(col.id,e.target.value)} onClick={e=>e.stopPropagation()} onDragStart={e=>e.stopPropagation()} style={{background:'transparent',border:'none',borderBottom:'1px dashed rgba(255,255,255,.4)',color:'white',fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',textAlign:'center',width:'80%',outline:'none',fontFamily:'inherit',padding:'2px 0'}}/>
                ):(
                  <span>{colOverrides[col.id]?.label??col.label}</span>
                )}
                {canPin&&(
                  <button onClick={e=>{e.stopPropagation();togglePin(col.id);}} title={pinned?'Unpin':'Pin'} style={{position:'absolute',top:4,right:colUnlocked?22:4,background:pinned?C.sky:'none',border:'1px solid rgba(255,255,255,.25)',color:pinned?'white':'rgba(255,255,255,.5)',fontSize:9,width:18,height:18,borderRadius:'50%',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>∞</button>
                )}
                {colUnlocked&&(
                  <>
                    <div className="col-color-dot" onClick={e=>{e.stopPropagation();setColorPickerCol(colorPickerCol===col.id?null:col.id);}} style={{position:'absolute',bottom:3,left:'50%',transform:'translateX(-50%)',width:10,height:10,borderRadius:'50%',border:'1px solid rgba(255,255,255,.5)',background:color,cursor:'pointer'}}/>
                    <button onClick={e=>{e.stopPropagation();if(window.confirm(`Delete column "${getColLabel(col.id)}"?`)){/* would need API */}}} style={{position:'absolute',top:2,right:2,background:'rgba(0,0,0,.3)',border:'none',color:'rgba(255,255,255,.7)',fontSize:9,width:14,height:14,borderRadius:'50%',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>×</button>
                    {colorPickerCol===col.id&&(
                      <div className="color-picker-popup" style={{position:'absolute',bottom:'100%',left:'50%',transform:'translateX(-50%)',background:'white',borderRadius:8,boxShadow:'0 4px 20px rgba(0,0,0,.2)',padding:8,zIndex:30,marginBottom:4,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:5}} onClick={e=>e.stopPropagation()}>
                        {PICKER_COLORS.map(c=>(
                          <div key={c} onClick={e=>{e.stopPropagation();setColColor2(col.id,c);}} style={{width:28,height:28,borderRadius:6,background:c,cursor:'pointer',border:'2px solid transparent',transition:'all .1s'}} onMouseEnter={e=>(e.currentTarget.style.border='2px solid '+C.navy)} onMouseLeave={e=>(e.currentTarget.style.border='2px solid transparent')}/>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* Lock/Add column header */}
          <div style={{background:C.navy,cursor:'pointer',minWidth:40,width:40,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2,position:'sticky',top:0,zIndex:10}}>
            <button onClick={toggleColLock} title={colUnlocked?'Lock columns':'Unlock to edit'} style={{background:colUnlocked?'rgba(255,198,0,.25)':'rgba(255,255,255,.08)',border:`1px solid ${colUnlocked?C.yellow:'rgba(255,255,255,.2)'}`,color:colUnlocked?C.yellow:'rgba(255,255,255,.6)',fontSize:11,width:24,height:24,borderRadius:4,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              {colUnlocked?'🔓':'🔒'}
            </button>
            <div style={{fontSize:14,cursor:'pointer',color:'rgba(255,255,255,.5)'}} title="Add column" onClick={()=>setAddModal({columnId:'',label:'Add Meal'})}>+</div>
          </div>

          {/* ── Data rows ── */}
          {Array.from({length:maxRows}).map((_,rowIdx)=>{
            const stats=computeRowStats(rowIdx);
            const isCurrent=rowIdx===0;
            const {bg:psBg,fg:psFg}=stats?psColor(stats.ps_total):{bg:'#fff',fg:'#aaa'};
            const mtBad=stats?stats.mt!==reqMeat:false;
            const plBad=stats?stats.pl!==reqPlant:false;

            return(
              <Fragment key={`row-${rowIdx}`}>

                {/* ── Scorecard cell ── */}
                <div style={{borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:'white',minWidth:SC_W,width:SC_W,position:'sticky',left:0,zIndex:8,boxShadow:scShadow?'6px 0 16px rgba(0,0,0,.1)':undefined}}>
                  {!stats?(
                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',background:C.cream,color:'#9ca3af',fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',padding:6}}>Incomplete Menu</div>
                  ):(
                    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
                      {/* Week header */}
                      <div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 8px',background:C.navy,flexShrink:0}}>
                        <span style={{fontSize:7,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'rgba(255,255,255,.55)'}}>{isCurrent?'NOW':'WK '+(rowIdx+1)}</span>
                        <span style={{fontSize:10,fontWeight:700,color:'white'}}>{weekDates[rowIdx]}</span>
                        {isCurrent&&<span style={{fontSize:7,fontWeight:700,padding:'1px 5px',borderRadius:20,background:C.yellow,color:C.navy,whiteSpace:'nowrap'}}>Current</span>}
                        <span style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:3,fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:20,background:psBg,color:psFg}}>
                          <span style={{fontSize:7,opacity:.7,textTransform:'uppercase',letterSpacing:'.04em'}}>Score</span>{stats.ps_total}
                        </span>
                        {rowIdx>0&&<button onClick={()=>{setSwapModal({weekRow:rowIdx});setSwapTab('summary');setSwapOverrides({});}} style={{fontSize:8,fontWeight:700,padding:'2px 8px',border:`1px solid ${C.yellow}`,borderRadius:20,background:'transparent',color:C.yellow,cursor:'pointer',whiteSpace:'nowrap',marginLeft:4}}>⇄ Swaps</button>}
                      </div>
                      {/* Stats grid: 7 columns × 2 rows */}
                      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1,padding:'3px 6px',flex:1,alignContent:'center'}}>
                        {SC_ROW1.map(cell=>{
                          const val=stats[cell.key as keyof ScStats] as number||0;
                          const bad=isOutOfRange(cell.key,val);
                          const {bg,fg}=bad?{bg:'#dc2626',fg:'#fff'}:redCell(val,CELL_MAX[cell.key]||5);
                          return(<div key={cell.key} style={{borderRadius:3,padding:'2px 2px 1px',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:bg}} title={`${cell.lbl}: ${val}`}>
                            <span style={{fontSize:6,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:fg,whiteSpace:'nowrap'}}>{cell.lbl}</span>
                            <span style={{fontSize:11,fontWeight:800,lineHeight:1,color:fg}}>{val}</span>
                          </div>);
                        })}
                        {/* MEAT tile */}
                        <div style={{borderRadius:3,padding:'2px 2px 1px',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:mtBad?undefined:C.meatHdr,animation:mtBad?'mismatch-flash .6s ease-in-out infinite':undefined,boxShadow:mtBad?'0 0 8px rgba(255,0,64,.6)':undefined}} title={`Meat: ${stats.mt}`}>
                          <span style={{fontSize:6,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'rgba(255,255,255,.9)'}}>MEAT</span>
                          <span style={{fontSize:11,fontWeight:800,lineHeight:1,color:'white'}}>{stats.mt}<span style={{fontSize:8,fontWeight:600,opacity:.8}}>/{reqMeat}</span></span>
                        </div>
                        {SC_ROW2.map(cell=>{
                          const val=stats[cell.key as keyof ScStats] as number||0;
                          const bad=isOutOfRange(cell.key,val);
                          const {bg,fg}=bad?{bg:'#dc2626',fg:'#fff'}:redCell(val,CELL_MAX[cell.key]||5);
                          return(<div key={cell.key} style={{borderRadius:3,padding:'2px 2px 1px',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:bg}} title={`${cell.lbl}: ${val}`}>
                            <span style={{fontSize:6,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:fg,whiteSpace:'nowrap'}}>{cell.lbl}</span>
                            <span style={{fontSize:11,fontWeight:800,lineHeight:1,color:fg}}>{val}</span>
                          </div>);
                        })}
                        {/* PLANT tile */}
                        <div style={{borderRadius:3,padding:'2px 2px 1px',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:plBad?undefined:C.plantDk,animation:plBad?'mismatch-flash .6s ease-in-out infinite':undefined,boxShadow:plBad?'0 0 8px rgba(255,0,64,.6)':undefined}} title={`Plant: ${stats.pl}`}>
                          <span style={{fontSize:6,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'rgba(255,255,255,.9)'}}>PLANT</span>
                          <span style={{fontSize:11,fontWeight:800,lineHeight:1,color:'white'}}>{stats.pl}<span style={{fontSize:8,fontWeight:600,opacity:.8}}>/{reqPlant}</span></span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Meal cells ── */}
                {columns.map((col,ci)=>{
                  const arr=queue[col.id]??[];
                  let item=arr[rowIdx]??null;
                  const isPinned=!item && !!pinnedCols[col.id] && !!arr[0];
                  if(isPinned) item=arr[0];

                  const isDragTarget=dragTarget?.colId===col.id&&dragTarget?.rowIdx===rowIdx;

                  // Consecutive dup detection
                  const prevItem=arr[rowIdx-1]??null;
                  const nextItem=arr[rowIdx+1]??null;
                  const sameAsPrev=item&&prevItem&&item.meal_id===prevItem.meal_id&&!isPinned;
                  const sameAsNext=item&&nextItem&&item.meal_id===nextItem.meal_id&&!isPinned;
                  let dupRole:''|'dup-first'|'dup-mid'|'dup-last'='';
                  if(sameAsPrev&&sameAsNext) dupRole='dup-mid';
                  else if(sameAsPrev)        dupRole='dup-last';
                  else if(sameAsNext)        dupRole='dup-first';

                  // Frequency
                  const totalFreq=item?freqCount.get(item.meal_id)??0:0;
                  const isFreqCard=!isPinned&&!dupRole&&totalFreq>=2;
                  const freqOcc=isFreqCard?(freqOccurrence.get(`${col.id}|${rowIdx}`)??1):0;

                  // Gluten
                  const isGluten=item?getMealAttrs(item.meal).isGluten:false;

                  // Diet toggle
                  const tog=item?(dietToggles[item.meal_id]??{meatOff:false,plantOff:false}):{meatOff:false,plantOff:false};

                  // Plant pair
                  const plantId=item?.meal.linked_meal_id??null;
                  const plantMeal=plantId?allMealsById.get(plantId):null;

                  // Card background
                  const cardBg=isPinned?'#e8f4fd':isFreqCard?C.navy:isGluten?'#f5ecc6':'white';
                  const cardBorder=isPinned?'1px dashed #93b8f0':`1px solid ${dupRole?'none':'#e5e7eb'}`;

                  // Cell style based on dup role
                  let cellPaddingBottom=6; let cellPaddingTop=6;
                  if(dupRole==='dup-first') cellPaddingBottom=0;
                  else if(dupRole==='dup-mid') { cellPaddingTop=0; cellPaddingBottom=0; }
                  else if(dupRole==='dup-last') cellPaddingTop=0;

                  return(
                    <div key={`cell-${col.id}-${rowIdx}`}
                      style={{
                        borderRight:'1px solid #e5e7eb',
                        borderBottom:dupRole==='dup-first'||dupRole==='dup-mid'?'none':'1px solid #e5e7eb',
                        padding:`${cellPaddingTop}px 6px ${cellPaddingBottom}px`,
                        display:'flex',flexDirection:'column',
                        minHeight:dupRole?undefined:82,
                        background:isDragTarget?'rgba(78,162,253,.08)':dupRole?'transparent':undefined,
                        outline:isDragTarget?`2px solid ${C.sky}`:undefined,
                        outlineOffset:isDragTarget?-2:undefined,
                        position:'relative',
                      }}
                      onDragOver={e=>onCellDragOver(e,col.id,rowIdx)}
                      onDrop={e=>onCellDrop(e,col.id,rowIdx)}
                      onDragLeave={e=>{ if(!e.currentTarget.contains(e.relatedTarget as Node) && dragTarget?.colId===col.id&&dragTarget?.rowIdx===rowIdx) setDragTarget(null); }}
                    >
                      {isDragTarget?(
                        /* Drag-over hole visual */
                        <div style={{height:62,border:`2px dashed ${C.sky}`,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginBottom:4,background:'rgba(78,162,253,.06)',pointerEvents:'none'}}>
                          <span style={{fontSize:9,color:C.sky,fontWeight:700}}>DROP HERE</span>
                        </div>
                      ):!item?(
                        /* Empty slot */
                        <div style={{height:62,border:'1.5px dashed #d1c9bc',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginBottom:4,background:C.cream}}>
                          <button onClick={()=>setAddModal({columnId:col.id,label:getColLabel(col.id)})} style={{background:'none',border:'none',color:'#a89a8a',fontSize:10,cursor:'pointer',padding:'4px 8px',borderRadius:4}}>+ Add</button>
                        </div>
                      ):(
                        /* Card */
                        <div style={{display:'flex',flexDirection:'column',marginBottom:dupRole?0:4,flexShrink:0,position:'relative'}}>
                          {/* Frequency badge */}
                          {isFreqCard&&(
                            <div style={{position:'absolute',right:0,top:0,bottom:0,width:26,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:1,background:C.yellow,borderRadius:'0 6px 6px 0',zIndex:4,pointerEvents:'none'}}>
                              <span style={{fontSize:9,fontWeight:800,color:C.navy,lineHeight:1}}>#</span>
                              <span style={{fontSize:22,fontWeight:900,color:C.navy,lineHeight:1}}>{freqOcc}</span>
                            </div>
                          )}

                          {/* Diet banner */}
                          {dupRole!=='dup-mid'&&dupRole!=='dup-last'&&(
                            <div style={{display:'flex',width:'100%',height:16,borderRadius:'6px 6px 0 0',overflow:'hidden',flexShrink:0}}>
                              {col.type==='omni'&&plantId?(
                                <>
                                  <div onClick={()=>toggleDiet(item!.meal_id,'meat')} title={(tog.meatOff?'Enable':'Disable')+' meat'} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',borderBottom:'1px solid #b84a48',background:tog.meatOff?'#555':'#d4605e',cursor:'pointer'}}>
                                    <span style={{fontSize:7,fontWeight:700,fontFamily:'monospace',color:tog.meatOff?'#999':'#4a1514',textDecoration:tog.meatOff?'line-through':undefined}}>{item!.meal.meal_code??item!.meal_id.slice(-4)}</span>
                                  </div>
                                  <div onClick={()=>toggleDiet(item!.meal_id,'plant')} title={(tog.plantOff?'Enable':'Disable')+' plant'} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',borderBottom:'1px solid #4da34c',background:tog.plantOff?'#555':'#6bbe6a',cursor:'pointer'}}>
                                    <span style={{fontSize:7,fontWeight:700,fontFamily:'monospace',color:tog.plantOff?'#999':'#1a3d1a',textDecoration:tog.plantOff?'line-through':undefined}}>{plantMeal?.meal_code??plantId!.slice(-4)}</span>
                                  </div>
                                </>
                              ):col.type==='omni'&&!plantId?(
                                /* Omni missing pair */
                                <>
                                  <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'#d4605e',borderBottom:'1px solid #b84a48'}}>
                                    <span style={{fontSize:7,fontWeight:700,fontFamily:'monospace',color:'#4a1514'}}>{item!.meal.meal_code??item!.meal_id.slice(-4)}</span>
                                  </div>
                                  <div onClick={()=>{setPairModal({mealId:item!.meal_id});setPairSearch('');}} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'#00ffd5',borderBottom:'1px solid #00e6bf',cursor:'pointer'}} title="Assign plant-based pair">
                                    <span style={{fontSize:7,fontWeight:700,fontFamily:'monospace',color:'#003d33',fontStyle:'italic'}}>⚠ ???</span>
                                  </div>
                                </>
                              ):col.type==='vegan'?(
                                <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'#6bbe6a',borderBottom:'1px solid #4da34c'}}>
                                  <span style={{fontSize:7,fontWeight:700,fontFamily:'monospace',color:'#1a3d1a'}}>{item!.meal.meal_code??item!.meal_id.slice(-4)}</span>
                                </div>
                              ):(
                                <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'#d4605e',borderBottom:'1px solid #b84a48'}}>
                                  <span style={{fontSize:7,fontWeight:700,fontFamily:'monospace',color:'#4a1514'}}>{item!.meal.meal_code??item!.meal_id.slice(-4)}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Card body */}
                          <div
                            draggable={!isPinned}
                            onDragStart={e=>onCardDragStart(e,col.id,item!.id,item!.meal_id,rowIdx)}
                            onDragEnd={onDragEnd}
                            style={{
                              background:dupRole==='dup-first'||dupRole==='dup-mid'||dupRole==='dup-last'?'#c8b8f0':cardBg,
                              border:dupRole?`1px solid ${dupRole==='dup-first'?'#b8a0e8':'#b8a0e8'}`:cardBorder,
                              borderTop:dupRole==='dup-mid'||dupRole==='dup-last'?'none':undefined,
                              borderBottom:dupRole==='dup-first'||dupRole==='dup-mid'?'none':undefined,
                              borderRadius:dupRole==='dup-first'?'0 0 0 0':dupRole==='dup-mid'?0:dupRole==='dup-last'?'0 0 6px 6px':'0 0 6px 6px',
                              padding:'6px 8px 14px 10px',
                              display:'flex',flexDirection:'column',
                              position:'relative',
                              cursor:isPinned?'default':'grab',
                              userSelect:'none',
                              height:dupRole?'auto':62,
                              overflow:'hidden',
                              opacity:isPinned?0.6:1,
                            }}
                          >
                            {dupRole!=='dup-mid'&&dupRole!=='dup-last'&&(
                              <div style={{fontSize:12,fontWeight:700,color:isFreqCard?'white':'#111',lineHeight:1.15,display:'-webkit-box',WebkitBoxOrient:'vertical' as any,WebkitLineClamp:3,overflow:'hidden'}}>
                                {item.meal.display_name}
                              </div>
                            )}
                            <div style={{position:'absolute',bottom:3,right:7,fontSize:7,color:isFreqCard?'rgba(255,255,255,.5)':'#d1d5db',fontFamily:'monospace',lineHeight:1}}>
                              {item.meal.meal_code??''}
                            </div>
                            {/* Hover actions */}
                            {!isPinned&&(
                              <div className="card-actions" style={{display:'none',position:'absolute',bottom:0,left:0,right:0,height:16,overflow:'hidden',zIndex:2,borderRadius:'0 0 5px 5px'}}>
                                <button onClick={()=>handleDuplicate(col.id,item!.meal_id)} style={{flex:1,border:'none',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1,background:'#e8dff5',color:'#7c3aed',width:'50%',height:'100%',float:'left'}}>+</button>
                                <button onClick={()=>handleRemove(item!.id)} style={{flex:1,border:'none',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1,background:'#e5e7eb',color:'#6b7280',width:'50%',height:'100%',float:'left'}}>×</button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add-column spacer */}
                <div style={{borderBottom:'1px solid #e5e7eb'}}/>
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Advance modal ─────────────────────────────────────────────────────── */}
      {advanceModal&&(
        <div onClick={()=>setAdvanceModal(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'white',borderRadius:12,width:400,padding:24,boxShadow:'0 20px 60px rgba(0,0,0,.25)'}}>
            <h2 style={{fontSize:16,fontWeight:800,marginBottom:4}}>Advance Queue</h2>
            <p style={{fontSize:12,color:'#6b7280',marginBottom:16}}>This removes week 1 from every column and shifts everything up.</p>
            <input value={advanceLabel} onChange={e=>setAdvanceLabel(e.target.value)} placeholder="Week label (optional)" style={{width:'100%',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,marginBottom:16,boxSizing:'border-box' as any}}/>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setAdvanceModal(false)} style={{padding:'8px 16px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,cursor:'pointer',background:'white'}}>Cancel</button>
              <button onClick={handleAdvance} disabled={saving} style={{padding:'8px 20px',background:C.yellow,color:C.navy,border:'none',borderRadius:6,fontSize:13,fontWeight:700,cursor:'pointer'}}>▶ Advance</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add-meal modal ─────────────────────────────────────────────────────── */}
      {addModal&&(
        <div onClick={()=>setAddModal(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'white',borderRadius:12,width:380,maxHeight:'75vh',boxShadow:'0 20px 60px rgba(0,0,0,.25)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{padding:'14px 18px 10px',borderBottom:'1px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <div><div style={{fontSize:14,fontWeight:700}}>Add to {addModal.label}</div></div>
              <button onClick={()=>setAddModal(null)} style={{background:'none',border:'none',fontSize:18,color:'#9ca3af',cursor:'pointer',lineHeight:1}}>×</button>
            </div>
            <div style={{padding:'8px 12px',borderBottom:'1px solid #e5e7eb',flexShrink:0}}>
              <input autoFocus value={addSearch} onChange={e=>setAddSearch(e.target.value)} placeholder="Search meals…" style={{width:'100%',padding:'6px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:12,outline:'none',fontFamily:'inherit',boxSizing:'border-box' as any}}/>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'4px 0'}}>
              {addFiltered.slice(0,80).map(m=>(
                <div key={m.id} onClick={()=>addModal.columnId&&handleAdd(addModal.columnId,m.id)} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',cursor:addModal.columnId?'pointer':'default',transition:'background .1s'}} onMouseEnter={e=>(e.currentTarget.style.background='#f3f4f6')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                  <div style={{flex:1,fontSize:12,fontWeight:600,color:'#111'}}>{m.display_name}</div>
                  {m.meal_code&&<div style={{fontSize:10,color:'#9ca3af',fontFamily:'monospace'}}>{m.meal_code}</div>}
                </div>
              ))}
              {addFiltered.length===0&&<div style={{padding:20,textAlign:'center',color:'#9ca3af',fontSize:12}}>No meals found</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── Pair assignment modal ──────────────────────────────────────────────── */}
      {pairModal&&(
        <div onClick={()=>setPairModal(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'white',borderRadius:12,width:360,maxHeight:'70vh',boxShadow:'0 20px 60px rgba(0,0,0,.25)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{padding:'14px 18px 10px',borderBottom:'1px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <div><div style={{fontSize:14,fontWeight:700}}>Assign Plant-Based Pair</div><div style={{fontSize:11,color:'#9ca3af',marginTop:2}}>Select the plant-based version for this omni slot</div></div>
              <button onClick={()=>setPairModal(null)} style={{background:'none',border:'none',fontSize:18,color:'#9ca3af',cursor:'pointer',lineHeight:1}}>×</button>
            </div>
            <div style={{padding:'8px 12px',borderBottom:'1px solid #e5e7eb',flexShrink:0}}>
              <input autoFocus value={pairSearch} onChange={e=>setPairSearch(e.target.value)} placeholder="Search plant-based dishes…" style={{width:'100%',padding:'6px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:12,outline:'none',fontFamily:'inherit',boxSizing:'border-box' as any}}/>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'4px 0'}}>
              {pairFiltered.slice(0,50).map(m=>(
                <div key={m.id} onClick={async()=>{
                  // Link meal pair via API — use the linked_meal PATCH
                  setSaving(true);
                  try{
                    await fetch(`/api/meals/${pairModal.mealId}/link-variant`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('token')??''}`},body:JSON.stringify({linked_meal_id:m.id})});
                    setQueueData(await api.getMenuQueue());
                    setPairModal(null);
                  } catch{} finally{ setSaving(false); }
                }} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',cursor:'pointer',transition:'background .1s'}} onMouseEnter={e=>(e.currentTarget.style.background='#f0faf4')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:C.veganHdr,flexShrink:0}}/>
                  <div style={{flex:1,fontSize:12,fontWeight:600,color:'#111'}}>{m.display_name}</div>
                  {m.meal_code&&<div style={{fontSize:10,color:'#9ca3af',fontFamily:'monospace'}}>{m.meal_code}</div>}
                </div>
              ))}
              {pairFiltered.length===0&&<div style={{padding:20,textAlign:'center',color:'#9ca3af',fontSize:12}}>No plant-based meals found</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── Swap Report Modal ──────────────────────────────────────────────────── */}
      {swapModal&&(()=>{
        // weekRow is the INCOMING row; outgoing is weekRow-1
        const fromRow=swapModal.weekRow-1;
        const toRow=swapModal.weekRow;
        const {swaps,trace}=computeSwaps(fromRow,toRow);
        const direct=swaps.filter(s=>s.status==='direct');
        const cross=swaps.filter(s=>s.status==='cross');
        const orphan=swaps.filter(s=>s.status==='orphan');
        const inWeekSKUs=getWeekSKUs(toRow);
        const statusColors:{[k:string]:{bg:string;fg:string}}={direct:{bg:'#dcfce7',fg:'#166534'},cross:{bg:'#fef3c7',fg:'#92400e'},manual:{bg:'#ede9fe',fg:'#5b21b6'},orphan:{bg:'#fee2e2',fg:'#991b1b'}};
        const dateFrom=weekDates[fromRow]??'';
        const dateTo=weekDates[toRow]??'';
        return(
          <div onClick={()=>setSwapModal(null)} style={{display:'flex',position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:200,alignItems:'flex-start',justifyContent:'center',paddingTop:30,overflowY:'auto'}}>
            <div onClick={e=>e.stopPropagation()} style={{background:'white',borderRadius:12,width:1040,maxWidth:'96vw',boxShadow:'0 24px 80px rgba(0,0,0,.25)',display:'flex',flexDirection:'column',maxHeight:'calc(100vh - 60px)',overflow:'hidden'}}>
              <div style={{padding:'16px 20px 12px',borderBottom:'1px solid #e5e7eb',display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexShrink:0}}>
                <div>
                  <div style={{fontSize:16,fontWeight:800}}>Swap Report — Week {fromRow+1} → Week {toRow+1}</div>
                  <div style={{fontSize:11,color:'#9ca3af',marginTop:2}}>{dateFrom} → {dateTo}</div>
                  <div style={{fontSize:11,marginTop:5,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                    <span style={{color:'#166534',fontWeight:700}}>✓ {direct.length} Direct</span>
                    <span style={{color:'#6b7280'}}>—</span>
                    <span style={{color:'#92400e',fontWeight:700}}>{cross.length} Cross</span>
                    {orphan.length>0&&<><span style={{color:'#6b7280'}}>·</span><span style={{color:'#991b1b',fontWeight:700}}>⚠ {orphan.length} Orphan</span></>}
                    <span style={{color:'#6b7280'}}>·</span>
                    <span style={{fontWeight:600,color:'#374151'}}>{swaps.length} total</span>
                  </div>
                </div>
                <button onClick={()=>setSwapModal(null)} style={{background:'none',border:'none',fontSize:20,color:'#9ca3af',cursor:'pointer',lineHeight:1,padding:'2px 6px',flexShrink:0}}>×</button>
              </div>
              {/* Tabs */}
              <div style={{display:'flex',borderBottom:'1px solid #e5e7eb',flexShrink:0}}>
                {([['summary','Summary'],['trace','How We Got Here'],['override','Override']] as const).map(([id,lbl])=>(
                  <div key={id} onClick={()=>setSwapTab(id)} style={{padding:'10px 20px',fontSize:12,fontWeight:600,color:swapTab===id?C.navy:'#9ca3af',cursor:'pointer',borderBottom:swapTab===id?`3px solid ${C.yellow}`:'3px solid transparent',transition:'all .12s'}}>{lbl}</div>
                ))}
              </div>
              <div style={{flex:1,overflowY:'auto',padding:'16px 20px 24px'}}>
                {swapTab==='summary'&&(
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                    <thead><tr style={{background:C.navy}}>
                      {['Diet','Out','Outgoing','→','In','Incoming','Status'].map(h=>(
                        <th key={h} style={{color:C.yellow,padding:'7px 10px',textAlign:'left',fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {swaps.map((s,i)=>{
                        const overrideId=swapOverrides[s.outId];
                        const sc=statusColors[overrideId?'manual':s.status];
                        const statusLabel=overrideId?'Manual':s.status.charAt(0).toUpperCase()+s.status.slice(1);
                        const outCode=allMealsById.get(s.outId)?.meal_code??'';
                        const resolvedInId=overrideId??s.inId;
                        const inCode=resolvedInId?allMealsById.get(resolvedInId)?.meal_code??'':'';
                        const inName=resolvedInId?(overrideId?allMealsById.get(overrideId)?.display_name??s.inName:s.inName):null;
                        return(<tr key={i} onMouseEnter={e=>(e.currentTarget.style.background='#f9fafb')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid #f3f4f6'}}>
                            <span style={{fontSize:8,fontWeight:700,padding:'2px 6px',borderRadius:20,whiteSpace:'nowrap',background:s.diet==='meat'?'#fff0f0':'#e2f5dc',color:s.diet==='meat'?'#9f3a38':'#2d7a4f'}}>{s.diet==='meat'?'MEAT':'PLANT'}</span>
                          </td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid #f3f4f6',fontFamily:'monospace',fontSize:10,color:'#6b7280'}}>{outCode}</td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid #f3f4f6',fontWeight:600,color:'#111'}}>{s.outName}</td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid #f3f4f6',color:'#d1d5db',fontSize:14,textAlign:'center'}}>→</td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid #f3f4f6',fontFamily:'monospace',fontSize:10,color:'#6b7280'}}>{inCode}</td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid #f3f4f6'}}>{inName??<span style={{color:'#9ca3af',fontStyle:'italic'}}>None</span>}</td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid #f3f4f6'}}><span style={{fontSize:8,fontWeight:700,padding:'2px 7px',borderRadius:20,whiteSpace:'nowrap',background:sc.bg,color:sc.fg}}>{statusLabel}</span></td>
                        </tr>);
                      })}
                    </tbody>
                  </table>
                )}
                {swapTab==='trace'&&(
                  <div style={{fontFamily:'monospace',fontSize:11,lineHeight:1.8,color:'#374151'}}>
                    {trace.map((t,i)=>{
                      const cls=t.startsWith('✓')?'match':t.startsWith('↔')?'cross':t.startsWith('⚠')?'orphan':'';
                      const borderColor=cls==='match'?C.green:cls==='cross'?'#f59e0b':cls==='orphan'?'#ef4444':C.navy;
                      return(<div key={i} style={{marginBottom:6,padding:'6px 10px',background:'#f9fafb',borderRadius:6,borderLeft:`3px solid ${borderColor}`}}>{t}</div>);
                    })}
                  </div>
                )}
                {swapTab==='override'&&(()=>{
                  // avail = meals already in the incoming week, grouped by diet (same as HTML prototype)
                  const availMeat=inWeekSKUs.filter(s=>s.diet==='meat');
                  const availPlant=inWeekSKUs.filter(s=>s.diet==='plant');
                  // Fallback: full library for each diet (for sparse weeks)
                  const libMeat=meals.filter(m=>m.category!=='Vegan'&&m.is_active!==false);
                  const libPlant=meals.filter(m=>m.category==='Vegan'&&m.is_active!==false);
                  return(
                  <div>
                    <div style={{fontSize:11,color:'#6b7280',marginBottom:12}}>
                      Force a specific swap pairing. The dropdown shows meals already scheduled in <strong>Week {toRow+1}</strong> first, then the full library as a fallback.
                    </div>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                      <thead><tr style={{background:C.navy}}>
                        {['Diet','Out SKU','Outgoing (exiting)','Swap In — Incoming','Status'].map(h=>(
                          <th key={h} style={{color:'white',padding:'7px 10px',textAlign:'left',fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {swaps.map((s,i)=>{
                          const curOverride=swapOverrides[s.outId];
                          const sc=curOverride?statusColors['manual']:statusColors[s.status];
                          const statusLabel=curOverride?'Manual':s.status.charAt(0).toUpperCase()+s.status.slice(1);
                          const outCode=allMealsById.get(s.outId)?.meal_code??'';
                          const inWeekOptions=s.diet==='meat'?availMeat:availPlant;
                          const libOptions=s.diet==='meat'?libMeat:libPlant;
                          const selectedVal=curOverride??s.inId??'';
                          return(<tr key={i} onMouseEnter={e=>(e.currentTarget.style.background='#f9fafb')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                            <td style={{padding:'7px 10px',borderBottom:'1px solid #f3f4f6'}}>
                              <span style={{fontSize:8,fontWeight:700,padding:'2px 6px',borderRadius:20,whiteSpace:'nowrap',background:s.diet==='meat'?'#fff0f0':'#e2f5dc',color:s.diet==='meat'?'#9f3a38':'#2d7a4f'}}>{s.diet==='meat'?'MEAT':'PLANT'}</span>
                            </td>
                            <td style={{padding:'7px 10px',borderBottom:'1px solid #f3f4f6',fontFamily:'monospace',fontSize:10,color:'#6b7280'}}>{outCode}</td>
                            <td style={{padding:'7px 10px',borderBottom:'1px solid #f3f4f6',fontWeight:600,color:'#111'}}>{s.outName}</td>
                            <td style={{padding:'7px 10px',borderBottom:'1px solid #f3f4f6'}}>
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                <select
                                  value={selectedVal}
                                  onChange={e=>{ const v=e.target.value; if(!v||v===s.inId){ setSwapOverrides(p=>{const n={...p};delete n[s.outId];return n;}); } else { setSwapOverrides(p=>({...p,[s.outId]:v})); } }}
                                  style={{fontSize:11,padding:'3px 6px',border:`1px solid ${curOverride?'#a78bfa':'#e5e7eb'}`,borderRadius:4,background:curOverride?'#faf5ff':'white',cursor:'pointer',flex:1,maxWidth:310}}
                                >
                                  {/* Auto-computed match first */}
                                  {s.inId
                                    ? <option value={s.inId}>{s.inName}{!curOverride?' (auto)':''}</option>
                                    : <option value="">— no auto match —</option>
                                  }
                                  {/* Already in incoming week */}
                                  {inWeekOptions.filter(o=>o.meal_id!==s.inId).length>0&&(
                                    <optgroup label={`Week ${toRow+1} meals (${s.diet})`}>
                                      {inWeekOptions.filter(o=>o.meal_id!==s.inId).map(o=>(
                                        <option key={o.meal_id} value={o.meal_id}>{o.name}</option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {/* Full library fallback */}
                                  <optgroup label={`All ${s.diet==='meat'?'meat/omni':'vegan'} meals`}>
                                    {libOptions.filter(m=>m.id!==s.inId&&!inWeekOptions.find(o=>o.meal_id===m.id)).map(m=>(
                                      <option key={m.id} value={m.id}>{m.display_name}{m.meal_code?` · ${m.meal_code}`:''}</option>
                                    ))}
                                  </optgroup>
                                </select>
                                {curOverride&&(
                                  <button onClick={()=>setSwapOverrides(p=>{const n={...p};delete n[s.outId];return n;})} style={{fontSize:10,color:'#9ca3af',background:'none',border:'1px solid #e5e7eb',borderRadius:4,cursor:'pointer',whiteSpace:'nowrap',padding:'2px 8px'}}>↺ Reset</button>
                                )}
                              </div>
                              {curOverride&&<div style={{fontSize:9,color:'#5b21b6',marginTop:3}}>↳ {allMealsById.get(curOverride)?.display_name??curOverride} ({allMealsById.get(curOverride)?.meal_code??''})</div>}
                            </td>
                            <td style={{padding:'7px 10px',borderBottom:'1px solid #f3f4f6'}}><span style={{fontSize:8,fontWeight:700,padding:'2px 7px',borderRadius:20,whiteSpace:'nowrap',background:sc.bg,color:sc.fg}}>{statusLabel}</span></td>
                          </tr>);
                        })}
                      </tbody>
                    </table>
                  </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Global CSS ────────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes mismatch-flash {
          0%,100% { background: #ff0040 !important; box-shadow: 0 0 8px rgba(255,0,64,.6); }
          50%      { background: #ff4d7a !important; box-shadow: 0 0 16px rgba(255,0,64,.9); }
        }
        .dnd-card:hover .card-actions,
        [style*="cursor: grab"]:hover .card-actions {
          display: flex !important;
        }
        div[draggable]:hover .card-actions { display: flex !important; }
      `}</style>
    </div>
  );
}
