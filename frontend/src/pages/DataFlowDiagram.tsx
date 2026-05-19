import React, { useState, useEffect, useRef, useCallback } from 'react';
import mermaid from 'mermaid';
import { ZoomIn, ZoomOut, RotateCcw, Database, GitBranch } from 'lucide-react';

/* ──────────────────── Mermaid Chart Definition ──────────────────── */

const CHART = `flowchart LR
    User(["fa:fa-user User\\nBrowser"])

    subgraph UI["Browser — React / Vite  :5173"]
        direction TB
        A1["Login / Auth"]
        A2["Dashboard"]
        A3["Documents and DCR\\nRepository · List · Create · Detail · Upload"]
        A4["Plans\\nCalibration · Maintenance · Training · Power Transmission"]
        A5["Quality and Safety\\nMSA · Risk Assessment · Abnormal Situations"]
        A6["Reports and Analytics\\nReport · Search · KPI Flowchart"]
        A7["Flowcharts and Diagrams\\nWorkflow · Turtle · IATF · Procedure · Data Flow"]
        A8["Admin and Logs"]
    end

    User <-->|"Screen Interaction"| UI
    UI -->|"HTTP REST via Axios\\nAuthorization: Bearer JWT"| MW

    subgraph Backend["API Layer — Express.js  :4550"]
        direction TB
        MW["Middleware\\nCORS · Helmet · Rate Limiter\\nJWT Authentication"]
        MW --> R1["/api/auth\\n/api/users"]
        MW --> R2["/api/documents\\n/api/change-requests\\n/api/uploads"]
        MW --> R3["/api/calibration\\n/api/inhouse-calibration\\n/api/maintenance\\n/api/training"]
        MW --> R4["/api/msa\\n/api/risk-assessment\\n/api/incidents"]
        MW --> R5["/api/report\\n/api/search\\n/api/kpi-csv"]
        MW --> R6["/api/admin\\n/api/logs\\n/api/audit\\n/api/notifications"]
    end

    Backend -->|"JSON Response\\n+ HTTP Status"| UI

    R1 & R2 & R3 & R4 & R5 & R6 <-->|"SQL Queries"| DB
    R2 <-->|"File I/O"| FS

    subgraph Data["Data Layer"]
        DB[("SQLite Database\\nnskiatf_doccontrol.db\\n─────────────────────\\nusers · change_requests\\ndocuments · document_revisions\\ndocument_categories\\ncalibration_plans · inhouse_calibration_plans\\nmaintenance_plans · training_plans\\nmsa_records · risk_assessments\\naudit_logs · notifications")]
        FS[/"File System\\nuploads/ — PDF · Word · Excel\\nsecure_storage/ — Private Docs\\nstaging/ — Temporary Files"/]
    end

    classDef userClass fill:#4f46e5,color:#fff,stroke:#3730a3,stroke-width:2px,font-weight:bold
    classDef uiClass fill:#e0f2fe,color:#0369a1,stroke:#38bdf8,stroke-width:1.5px
    classDef mwClass fill:#fef9c3,color:#854d0e,stroke:#fbbf24,stroke-width:2px,font-weight:bold
    classDef routeClass fill:#f0fdf4,color:#166534,stroke:#86efac,stroke-width:1.5px
    classDef dbClass fill:#fdf4ff,color:#6b21a8,stroke:#d8b4fe,stroke-width:2px
    classDef fsClass fill:#fff7ed,color:#9a3412,stroke:#fdba74,stroke-width:2px

    class User userClass
    class A1,A2,A3,A4,A5,A6,A7,A8 uiClass
    class MW mwClass
    class R1,R2,R3,R4,R5,R6 routeClass
    class DB dbClass
    class FS fsClass`;

/* ──────────────────── Component ──────────────────── */

const DataFlowDiagram: React.FC = () => {
  const [scale, setScale] = useState(0.42);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const isDragging = useRef(false);
  const svgNaturalWidthRef = useRef<number>(0);
  const svgNaturalHeightRef = useRef<number>(0);
  const scaleRef = useRef(0.42);
  scaleRef.current = scale;

  useEffect(() => {
    if (!initializedRef.current) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          fontFamily: 'Inter, sans-serif',
          fontSize: '13px',
          primaryColor: '#e0f2fe',
          primaryTextColor: '#1e3a8a',
          primaryBorderColor: '#7dd3fc',
          lineColor: '#64748b',
          secondaryColor: '#f0fdf4',
          tertiaryColor: '#fef9c3',
        },
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
          curve: 'basis',
          nodeSpacing: 60,
          rankSpacing: 80,
          padding: 16,
        },
      });
      initializedRef.current = true;
    }
  }, []);

  const renderChart = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      const id = `dfd-svg-${Date.now()}`;
      const { svg } = await mermaid.render(id, CHART);
      containerRef.current.innerHTML = svg;
      const svgEl = containerRef.current.querySelector('svg');
      if (svgEl) {
        const vb = svgEl.getAttribute('viewBox');
        if (vb) {
          const parts = vb.trim().split(/[\s,]+/);
          svgNaturalWidthRef.current = parseFloat(parts[2]) || 1200;
          svgNaturalHeightRef.current = parseFloat(parts[3]) || 800;
        } else {
          const w = parseFloat(svgEl.getAttribute('width') || '1200');
          const h = parseFloat(svgEl.getAttribute('height') || '800');
          svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
          svgNaturalWidthRef.current = w;
          svgNaturalHeightRef.current = h;
        }
        svgEl.removeAttribute('width');
        svgEl.removeAttribute('height');
        svgEl.style.maxWidth = '';
        svgEl.style.display = 'block';
        svgEl.style.width = `${svgNaturalWidthRef.current * scaleRef.current}px`;
        svgEl.style.height = `${svgNaturalHeightRef.current * scaleRef.current}px`;
      }
    } catch (err) {
      console.error('Mermaid Render Error:', err);
      if (containerRef.current) {
        containerRef.current.innerHTML = '<p class="text-red-500 p-4">Error rendering diagram.</p>';
      }
    }
  }, []);

  useEffect(() => {
    renderChart();
  }, [renderChart]);

  const applySvgScale = useCallback(() => {
    if (!containerRef.current || !svgNaturalWidthRef.current) return;
    const svgEl = containerRef.current.querySelector('svg');
    if (!svgEl) return;
    svgEl.style.width = `${svgNaturalWidthRef.current * scaleRef.current}px`;
    svgEl.style.height = `${svgNaturalHeightRef.current * scaleRef.current}px`;
  }, []);

  useEffect(() => {
    applySvgScale();
  }, [scale, applySvgScale]);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      setScale(prev => Math.min(Math.max(prev * factor, 0.15), 8));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPan(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
  };
  const handleMouseUp = (e: React.MouseEvent) => {
    isDragging.current = false;
    (e.currentTarget as HTMLElement).style.cursor = 'grab';
  };

  const zoomIn  = () => setScale(prev => Math.min(prev * 1.25, 8));
  const zoomOut = () => setScale(prev => Math.max(prev * 0.8, 0.15));
  const resetView = () => { setScale(0.42); setPan({ x: 0, y: 0 }); };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] gap-3">
      {/* Header */}
      <div className="flex items-start justify-between bg-white px-6 py-3 rounded-xl shadow-sm border border-slate-100">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <GitBranch size={22} className="text-indigo-500" />
            High-Level Data Flow Diagram
          </h1>
          <p className="text-slate-500 text-sm">
            End-to-end data flow across all pages — from user interaction through the API to the database and back.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <Database size={13} className="text-purple-500" />
            <span>SQLite · Express.js · React</span>
          </div>
        </div>
      </div>

      {/* Diagram */}
      <div
        ref={outerRef}
        className="flex-1 min-h-0 w-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative"
      >
        {/* Zoom Controls */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-lg px-1.5 py-1 shadow border border-slate-200">
          <button
            onClick={zoomIn}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={15} />
          </button>
          <span className="text-xs text-slate-500 min-w-[3.2rem] text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomOut}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={15} />
          </button>
          <div className="w-px h-4 bg-slate-300 mx-0.5" />
          <button
            onClick={resetView}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors"
            title="Reset View"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        <span className="absolute bottom-2 left-2 z-10 text-[10px] text-slate-400 select-none pointer-events-none">
          Scroll to zoom · Drag to pan
        </span>

        <div
          className="w-full h-full flex items-center justify-center select-none"
          style={{ cursor: 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, willChange: 'transform' }}>
            <div ref={containerRef} className="text-slate-400">
              Loading diagram...
            </div>
          </div>
        </div>
      </div>

      {/* Legend / Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
          <h3 className="font-bold text-blue-800 mb-1 text-sm flex items-center gap-1">
            <span>🖥️</span> UI Layer
          </h3>
          <p className="text-xs text-blue-700 leading-relaxed">
            React pages running in the browser (Vite, port 5173). Users interact with forms, tables, and charts. Axios sends authenticated HTTP requests to the API.
          </p>
        </div>
        <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
          <h3 className="font-bold text-amber-800 mb-1 text-sm flex items-center gap-1">
            <span>⚙️</span> API Layer
          </h3>
          <p className="text-xs text-amber-700 leading-relaxed">
            Express.js server (port 4550). Every request passes through CORS, Helmet, Rate Limiter, and JWT auth middleware before reaching the route handler.
          </p>
        </div>
        <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
          <h3 className="font-bold text-purple-800 mb-1 text-sm flex items-center gap-1">
            <span>🗄️</span> Database
          </h3>
          <p className="text-xs text-purple-700 leading-relaxed">
            SQLite database (nskiatf_doccontrol.db). Tables cover documents, change requests, plans, quality records, audit logs, and notifications.
          </p>
        </div>
        <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
          <h3 className="font-bold text-orange-800 mb-1 text-sm flex items-center gap-1">
            <span>📁</span> File System
          </h3>
          <p className="text-xs text-orange-700 leading-relaxed">
            Document files (Word, Excel, PDF) are stored on disk under <code className="bg-orange-100 px-0.5 rounded">uploads/</code> and <code className="bg-orange-100 px-0.5 rounded">secure_storage/</code>. Temporary files land in <code className="bg-orange-100 px-0.5 rounded">staging/</code>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DataFlowDiagram;
