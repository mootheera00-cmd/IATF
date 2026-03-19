// components/MaintenanceFloorMap.tsx
// Interactive animated floor-map for maintenance plan equipment
// Drag to rearrange (unlock mode). Click to navigate (locked mode only).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, AlertCircle, CheckCircle, Clock, Zap, Move, RotateCcw, Lock, Unlock } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Equipment {
  id: number;
  equipment_no: number;
  equipment_name: string;
  year: number;
}

interface HistoryEntry {
  id: number;
  equipment_id: number;
  year: number;
  month: number;
  result: string;
  action_code: string | null;
}

interface PlanEvent {
  id: number;
  equipment_id: number;
  year: number;
  month: number;
  action_code: string | null;
}

interface MachinePos {
  id: number; // equipment.id
  x: number;  // percent 0-100
  y: number;  // percent 0-100
}

interface Props {
  equipment: Equipment[];
  allHistory: HistoryEntry[];
  allPlan: PlanEvent[];
  selectedYear: number;
}

// ─── Layout storage key — per year so each year's layout is saved separately ──
const storageKey = (year: number) => `maint_floor_map_layout_v6_${year}`;

// ─── Default positions — pixel-perfect from the provided floor plan image ─────
// Image size: 427×660px. Building: x13→414, y8→652.
// Vertical divider at x≈185 (43.3% of image width).
// Production floor: x185→414 (right side). Left rooms: x13→185.
// Positions below are % of rendered canvas div width/height.
const DEFAULT_POSITIONS: Record<number, { x: number; y: number }> = {
  //       x       y     — machine_no: color / description
  5:  { x: 55.7,  y: 17.1 },  // green       — top, just right of divider
  4:  { x: 79.6,  y: 24.4 },  // cyan        — right upper
  6:  { x: 57.1,  y: 30.3 },  // yellow      — left of floor, upper-mid
  3:  { x: 79.6,  y: 31.4 },  // magenta     — right upper-mid (same row as 6)
  2:  { x: 57.8,  y: 38.2 },  // gray        — left of floor, center
  1:  { x: 85.7,  y: 38.2 },  // red         — far right center (same row as 2)
  7:  { x: 57.8,  y: 50.8 },  // light green — left of floor, lower-mid
  8:  { x: 82.0,  y: 50.8 },  // hot pink    — right lower-mid (same row as 7)
  11: { x: 25.8,  y: 53.5 },  // light teal  — left room, mid-height
  9:  { x: 62.1,  y: 68.0 },  // teal        — center lower
  10: { x: 61.1,  y: 79.8 },  // dark teal   — bottom
};

// ─── Status helpers ───────────────────────────────────────────────────────────
function getEquipStatus(
  eq: Equipment,
  history: HistoryEntry[],
  plan: PlanEvent[],
  year: number
): 'ok' | 'pending' | 'breakdown' | 'postponed' | 'no-plan' {
  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth() + 1;

  const eqPlan = plan.filter(p => p.equipment_id === eq.id && p.year === year);
  if (eqPlan.length === 0) return 'no-plan';

  // Find most recent past plan month without history
  const missedPlan = eqPlan.find(p => {
    const isPast = p.year < todayYear || (p.year === todayYear && p.month <= todayMonth);
    const hasHist = history.some(h => h.equipment_id === eq.id && h.year === p.year && h.month === p.month);
    return isPast && !hasHist;
  });
  if (missedPlan) return 'pending';

  // Check last history result
  const eqHist = history
    .filter(h => h.equipment_id === eq.id && h.year === year)
    .sort((a, b) => b.month - a.month);
  if (eqHist.length === 0) return 'pending';
  const last = eqHist[0];
  if (last.result === 'Breakdown') return 'breakdown';
  if (last.result === 'Postponed') return 'postponed';
  return 'ok';
}

const STATUS_CONFIG = {
  ok:        { ring: '#10b981', glow: '#10b98166', label: 'OK',        icon: CheckCircle,  bg: '#ecfdf5', text: '#065f46', pulse: false },
  pending:   { ring: '#f59e0b', glow: '#f59e0b66', label: 'Pending',   icon: Clock,        bg: '#fffbeb', text: '#92400e', pulse: true  },
  breakdown: { ring: '#ef4444', glow: '#ef444466', label: 'Breakdown', icon: Zap,          bg: '#fef2f2', text: '#991b1b', pulse: true  },
  postponed: { ring: '#f97316', glow: '#f9731666', label: 'Postponed', icon: AlertCircle,  bg: '#fff7ed', text: '#7c2d12', pulse: false },
  'no-plan': { ring: '#94a3b8', glow: '#94a3b833', label: 'No Plan',   icon: Wrench,       bg: '#f8fafc', text: '#475569', pulse: false },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function MaintenanceFloorMap({ equipment, allHistory, allPlan, selectedYear }: Props) {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(true);
  const [positions, setPositions] = useState<MachinePos[]>([]);
  const [hovered, setHovered] = useState<number | null>(null); // equipment.id
  const [mounted, setMounted] = useState(false);

  // dragRef holds mutable drag state (avoids stale closure issues in event listeners)
  // moved=true means the user actually dragged; used to suppress click navigation
  const dragRef = useRef<{
    id: number;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  // ── Init positions ────────────────────────────────────────────────────────
  // Each year gets its own localStorage key so layouts are independent.
  // - On first mount OR year change: read that year's saved layout from localStorage
  // - On same-year re-renders (parent refetch): ID fingerprint guard → skip
  const lastYearLoaded = useRef<number | null>(null);
  const lastEquipIds = useRef('');

  useEffect(() => {
    if (equipment.length === 0) return;

    const key = storageKey(selectedYear);
    const ids = equipment.map(e => e.id).sort((a, b) => a - b).join(',');

    // Same year AND same equipment IDs — just a parent re-render, do nothing
    if (lastYearLoaded.current === selectedYear && ids === lastEquipIds.current) return;

    // Year changed OR first mount — load this year's layout from localStorage
    lastYearLoaded.current = selectedYear;
    lastEquipIds.current = ids;

    let saved: MachinePos[] = [];
    try {
      const raw = localStorage.getItem(key);
      if (raw) saved = JSON.parse(raw);
    } catch {}

    const initial: MachinePos[] = equipment.map(eq => {
      const savedPos = saved.find(s => s.id === eq.id);
      if (savedPos) return { id: eq.id, x: savedPos.x, y: savedPos.y };
      const def = DEFAULT_POSITIONS[eq.equipment_no];
      return { id: eq.id, x: def?.x ?? 30 + Math.random() * 40, y: def?.y ?? 20 + Math.random() * 60 };
    });
    setPositions(initial);
    if (lastYearLoaded.current !== null) setMounted(false);
    setTimeout(() => setMounted(true), 50);
  }, [equipment, selectedYear]);

  // ── Save layout to localStorage whenever positions change (backup) ──────
  useEffect(() => {
    if (positions.length > 0 && lastYearLoaded.current !== null) {
      localStorage.setItem(storageKey(lastYearLoaded.current), JSON.stringify(positions));
    }
  }, [positions]);

  // ── Drag logic ──────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent, id: number) => {
    if (locked) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = positions.find(p => p.id === id);
    dragRef.current = {
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: pos?.x ?? 50,
      origY: pos?.y ?? 50,
      moved: false,
    };
    setDraggingId(id);
  }, [locked, positions]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = e.clientX - dragRef.current.startClientX;
      const dy = e.clientY - dragRef.current.startClientY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragRef.current.moved = true;
      const nx = Math.max(3, Math.min(97, dragRef.current.origX + (dx / rect.width) * 100));
      const ny = Math.max(3, Math.min(97, dragRef.current.origY + (dy / rect.height) * 100));
      const id = dragRef.current.id;
      setPositions(prev => {
        const next = prev.map(p => p.id === id ? { ...p, x: nx, y: ny } : p);
        // Save immediately — survives tab/page switches before React flushes effects
        if (lastYearLoaded.current !== null)
          localStorage.setItem(storageKey(lastYearLoaded.current), JSON.stringify(next));
        return next;
      });
    };
    const onUp = () => { dragRef.current = null; setDraggingId(null); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // Touch support
  const onTouchStart = useCallback((e: React.TouchEvent, id: number) => {
    if (locked) return;
    e.stopPropagation();
    const t = e.touches[0];
    const pos = positions.find(p => p.id === id);
    dragRef.current = {
      id,
      startClientX: t.clientX,
      startClientY: t.clientY,
      origX: pos?.x ?? 50,
      origY: pos?.y ?? 50,
      moved: false,
    };
    setDraggingId(id);
  }, [locked, positions]);

  useEffect(() => {
    const onMove = (e: TouchEvent) => {
      if (!dragRef.current) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const t = e.touches[0];
      const dx = t.clientX - dragRef.current.startClientX;
      const dy = t.clientY - dragRef.current.startClientY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragRef.current.moved = true;
      const nx = Math.max(3, Math.min(97, dragRef.current.origX + (dx / rect.width) * 100));
      const ny = Math.max(3, Math.min(97, dragRef.current.origY + (dy / rect.height) * 100));
      const id = dragRef.current.id;
      setPositions(prev => {
        const next = prev.map(p => p.id === id ? { ...p, x: nx, y: ny } : p);
        if (lastYearLoaded.current !== null)
          localStorage.setItem(storageKey(lastYearLoaded.current), JSON.stringify(next));
        return next;
      });
    };
    const onUp = () => { dragRef.current = null; setDraggingId(null); };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); };
  }, []);

  const resetLayout = () => {
    const reset: MachinePos[] = equipment.map(eq => {
      const def = DEFAULT_POSITIONS[eq.equipment_no];
      return { id: eq.id, x: def?.x ?? 30 + Math.random() * 40, y: def?.y ?? 20 + Math.random() * 60 };
    });
    if (lastYearLoaded.current !== null)
      localStorage.setItem(storageKey(lastYearLoaded.current), JSON.stringify(reset));
    setPositions(reset);
  };

  // ── Stats bar ──────────────────────────────────────────────────────────
  const statCounts = equipment.reduce((acc, eq) => {
    const s = getEquipStatus(eq, allHistory, allPlan, selectedYear);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-col gap-3">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const count = statCounts[key] || 0;
            if (count === 0) return null;
            const Icon = cfg.icon;
            return (
              <span key={key} className="flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold border"
                style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.ring + '66' }}>
                <Icon size={11} /> {cfg.label} <span className="font-black">{count}</span>
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={resetLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors">
            <RotateCcw size={12} /> Reset Layout
          </button>
          <button onClick={() => setLocked(l => !l)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              locked
                ? 'border-slate-200 text-slate-500 bg-white hover:bg-slate-50'
                : 'border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100'
            }`}>
            {locked ? <Lock size={12} /> : <Unlock size={12} />}
            {locked ? 'Locked — click to navigate' : 'Drag Mode — click lock to navigate'}
          </button>
        </div>
      </div>

      {/* ── Canvas wrapper — limits height so whole map fits in viewport ── */}
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
        <div
          ref={canvasRef}
          className="relative rounded-2xl border-2 border-slate-300 shadow-xl select-none"
          style={{
            /* portrait ratio 100:133 — height drives width so it fits in 72vh */
            height: 'min(72vh, calc(100vw * 1.33))',
            width: 'min(calc(72vh / 1.33), 100%)',
            background: '#e8edf8',
            cursor: locked ? 'default' : 'crosshair',
            overflow: 'visible',
          }}
        >
        {/* ── SVG Floor Plan — pixel-perfect copy of provided image ── */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 133"
          preserveAspectRatio="none"
        >
          {/* White/light background */}
          <rect x="0" y="0" width="100" height="133" fill="#f8faff" />

          {/* ══ OUTER BUILDING WALLS (blue border) ══ */}
          {/* Image: thin blue rect spanning full building */}
          <rect x="3" y="1" width="94" height="131" fill="white" stroke="#2255cc" strokeWidth="1.4" />

          {/* ══ LEFT SIDE — two stacked rooms ══ */}
          {/*  Top-left room: ~x3→43, y1→21  (≈ top 20% of height) */}
          <rect x="3" y="1" width="40" height="20" fill="#f0f4ff" stroke="#2255cc" strokeWidth="1.0" />

          {/*  Bottom-left room: ~x3→33, y74→132  (lower-left corner box, shorter width) */}
          <rect x="3" y="74" width="30" height="58" fill="#f0f4ff" stroke="#2255cc" strokeWidth="1.0" />

          {/* ══ VERTICAL DIVIDER (blue line at ~43% x) ══ */}
          <line x1="43" y1="1" x2="43" y2="132" stroke="#2255cc" strokeWidth="1.2" />

          {/* ══ RIGHT SIDE — production floor ══ */}
          {/* Full right side is open (white/light) — already covered by outer rect */}

          {/* ══ TOP-RIGHT — two locker rooms stacked ══ */}
          {/* In image: two blue outlined boxes in top-right corner ~x73→97, stacked */}
          <rect x="73" y="1" width="24" height="11" fill="#eef2ff" stroke="#2255cc" strokeWidth="0.9" />
          <rect x="73" y="12" width="24" height="11" fill="#eef2ff" stroke="#2255cc" strokeWidth="0.9" />

          {/* ══ SMALL MARKS in production floor area ══ */}
          {/* Tiny dot/square around y=20% x≈47 (visible in image near top of floor) */}
          <rect x="46.5" y="19.5" width="1.5" height="1.5" fill="#888" />
          {/* Tiny green square around x≈61, y≈27 */}
          <rect x="60.5" y="26" width="1.5" height="1.5" fill="#16a34a" />
          {/* Tiny gray square x≈46.5, y≈34 */}
          <rect x="46.5" y="33.5" width="1.5" height="1.5" fill="#888" />

          {/* ══ SUBTLE FLOOR GRID (production side only) ══ */}
          {Array.from({ length: 7 }, (_, gx) =>
            Array.from({ length: 11 }, (_, gy) => (
              <circle key={`g${gx}-${gy}`}
                cx={48 + gx * 6.5} cy={16 + gy * 10}
                r="0.3" fill="#dde3f0" />
            ))
          )}
        </svg>

        {/* ── Drag hint ── */}
        {!locked && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-full shadow-lg animate-bounce">
            <Move size={12} /> Drag machines to rearrange
          </div>
        )}

        {/* ── Machine nodes ── */}
        {equipment.map((eq, idx) => {
          const pos = positions.find(p => p.id === eq.id);
          if (!pos) return null;

          const status = getEquipStatus(eq, allHistory, allPlan, selectedYear);
          const cfg = STATUS_CONFIG[status];
          const Icon = cfg.icon;
          const isHovered = hovered === eq.id;
          const isDragging = draggingId === eq.id;

          // Card sized as % of canvas — landscape, matches image proportions
          // 13% wide, aspect-ratio 1.5:1 (wider than tall, same as picture rectangles)
          const CARD_W = '13%';

          // Entry animation delay
          const delay = idx * 60;

          return (
            <div
              key={eq.id}
              className="absolute group"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: 'translate(-50%, -50%)',
                width: CARD_W,
                aspectRatio: '1.5 / 1',
                zIndex: isHovered ? 50 : 10,
                transition: isDragging ? 'none' : 'left 0.35s cubic-bezier(.4,0,.2,1), top 0.35s cubic-bezier(.4,0,.2,1)',
                opacity: mounted ? 1 : 0,
                scale: mounted ? '1' : '0.5',
                transitionDelay: mounted ? `${delay}ms` : '0ms',
              }}
              onMouseEnter={() => setHovered(eq.id)}
              onMouseLeave={() => setHovered(null)}
              onMouseDown={e => onMouseDown(e, eq.id)}
              onTouchStart={e => onTouchStart(e, eq.id)}
              onClick={() => {
                if (!locked) return;
                if (dragRef.current?.moved) return;
                navigate('/plan/maintenance/history', {
                  state: { selectedId: eq.id, year: selectedYear }
                });
              }}
            >
              {/* Pulse ring for alert statuses */}
              {cfg.pulse && (
                <span
                  className="absolute inset-0 rounded-lg"
                  style={{
                    boxShadow: `0 0 0 0 ${cfg.glow}`,
                    animation: 'machineRipple 1.8s ease-out infinite',
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* ── Machine card — number only, status color ── */}
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: cfg.bg,
                  border: `2.5px solid ${isDragging ? '#f97316' : isHovered ? cfg.ring : cfg.ring + 'cc'}`,
                  borderRadius: '8px',
                  boxShadow: isHovered
                    ? `0 6px 18px ${cfg.glow}, 0 0 0 3px ${cfg.ring}33`
                    : `0 2px 6px ${cfg.glow}`,
                  cursor: locked ? 'pointer' : 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: isDragging ? 'scale(1.08) rotate(1deg)' : isHovered && locked ? 'scale(1.05)' : 'scale(1)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
              >
                {/* Big bold number — centred in card */}
                <span style={{
                  fontSize: 'clamp(10px, 2.2vw, 28px)',
                  fontWeight: 900,
                  color: cfg.text,
                  lineHeight: 1,
                  userSelect: 'none',
                }}>
                  {eq.equipment_no}
                </span>
              </div>

              {/* Tooltip removed from here — rendered at canvas level below */}
            </div>
          );
        })}

        {/* ── Canvas-level tooltip — always on top, smart position ── */}
        {(() => {
          if (!hovered) return null;
          const eq = equipment.find(e => e.id === hovered);
          const pos = positions.find(p => p.id === hovered);
          if (!eq || !pos) return null;
          const isDragging = draggingId === eq.id;
          if (isDragging) return null;
          const status = getEquipStatus(eq, allHistory, allPlan, selectedYear);
          const cfg = STATUS_CONFIG[status];
          const Icon = cfg.icon;
          // Smart vertical: show below if card in top 45% of canvas, else above
          const showBelow = pos.y < 45;
          // Smart horizontal: anchor right if card near right edge
          const anchorRight = pos.x > 70;
          return (
            <div
              className="absolute pointer-events-none"
              style={{
                left: anchorRight ? 'auto' : `${pos.x}%`,
                right: anchorRight ? `${100 - pos.x}%` : 'auto',
                top: showBelow ? `calc(${pos.y}% + 5%)` : 'auto',
                bottom: showBelow ? 'auto' : `calc(${100 - pos.y}% + 5%)`,
                transform: anchorRight ? 'none' : 'translateX(-50%)',
                zIndex: 100,
                whiteSpace: 'nowrap',
              }}
            >
              <div className="bg-slate-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-2xl"
                style={{ minWidth: '140px' }}>
                <p className="font-bold text-white">{eq.equipment_name}</p>
                <p className="text-slate-300 text-[10px]">No. {eq.equipment_no} · {selectedYear}</p>
                <p className="mt-1 flex items-center gap-1" style={{ color: cfg.ring }}>
                  <Icon size={10} /> {cfg.label}
                </p>
                {locked
                  ? <p className="text-slate-400 text-[10px] mt-0.5">🖱 Click → view history</p>
                  : <p className="text-orange-400 text-[10px] mt-0.5">✋ Drag to rearrange</p>
                }
              </div>
              {/* Arrow tip */}
              <div style={{
                width: '8px', height: '8px',
                background: '#0f172a',
                transform: 'rotate(45deg)',
                margin: showBelow ? '-5px auto 0' : '0 auto -5px',
                order: showBelow ? -1 : 1,
              }} />
            </div>
          );
        })()}

        {/* Empty state */}
        {equipment.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-slate-400">
              <Wrench size={40} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm font-medium">No equipment for {selectedYear}</p>
            </div>
          </div>
        )}
      </div>{/* ── end canvasRef ── */}
      </div>{/* ── end canvas wrapper ── */}

      {/* Keyframe injection */}
      <style>{`
        @keyframes machineRipple {
          0%   { box-shadow: 0 0 0 0px var(--ripple-color, rgba(245,158,11,0.5)); }
          70%  { box-shadow: 0 0 0 12px rgba(0,0,0,0); }
          100% { box-shadow: 0 0 0 0px rgba(0,0,0,0); }
        }
      `}</style>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <span key={key} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium border"
              style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.ring + '55' }}>
              <Icon size={11} /> {cfg.label}
              {key === 'pending' && <span className="text-[9px] opacity-70">— past plan month not yet done</span>}
              {key === 'breakdown' && <span className="text-[9px] opacity-70">— last record = breakdown</span>}
              {key === 'ok' && <span className="text-[9px] opacity-70">— all good</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
