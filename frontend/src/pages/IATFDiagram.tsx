import React, { useState, useEffect, useRef, useCallback } from 'react';
import mermaid from 'mermaid';
import { Languages, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

/* ──────────────────── Mermaid Chart Definitions ──────────────────── */

const CHART_TH = `graph TD
    Root["<b>วัตถุประสงค์หลักของระบบมาตรฐาน IATF 16949</b><br/><i>ออกแบบมาเพื่อยกระดับคุณภาพและลดความเสี่ยง<br/>ตลอดทั้งห่วงโซ่อุปทาน (Supply Chain) ของการผลิตชิ้นส่วนยานยนต์</i>"]
    Root --> G1{"🎯 3 วัตถุประสงค์แกนหลัก<br/>(The 'Big 3' Objectives)"}
    Root --> G2{"📌 วัตถุประสงค์เชิงลึก<br/>และเป้าหมายสนับสนุน"}

    G1 --> B1["<b>1. การปรับปรุงอย่างต่อเนื่อง<br/>(Continual Improvement)</b>"]
    B1 --- B1_D["กลไกเพิ่มประสิทธิภาพการผลิต<br/>ลดต้นทุน และยกระดับคุณภาพสินค้า"]

    G1 --> B2["<b>2. การป้องกันข้อบกพร่อง<br/>(Defect Prevention)</b>"]
    B2 --- B2_D["เปลี่ยนคัดของเสีย (Detection)<br/>เป็นการป้องกันไม่ให้เกิด (Prevention)<br/><i>ใช้ Core Tools: FMEA, APQP, SPC</i>"]

    G1 --> B3["<b>3. การลดความผันแปรและความสูญเปล่า<br/>(Reduction of Variation & Waste)</b>"]
    B3 --- B3_D["กระบวนการแม่นยำ/เสถียร<br/>และกำจัดขั้นตอนที่ไม่ก่อเกิดมูลค่า<br/><i>(ตั้งแต่ Sub-tier ถึง ลูกค้าปลายทาง)</i>"]

    G2 --> S1["<b>ความปลอดภัยของผลิตภัณฑ์<br/>(Product Safety)</b>"]
    S1 -.-> S1_D(["ควบคุมเข้มงวดตั้งแต่<br/>การออกแบบจนถึงการผลิต"])

    G2 --> S2["<b>การบริหารจัดการความเสี่ยง<br/>(Risk Management)</b>"]
    S2 -.-> S2_D(["ประเมินความเสี่ยงและ<br/>เตรียมแผนฉุกเฉิน Contingency Plans"])

    G2 --> S3["<b>การตอบสนองความต้องการเฉพาะลูกค้า<br/>(Customer Specific Requirements - CSRs)</b>"]
    S3 -.-> S3_D(["ผนวกข้อกำหนดพิเศษของลูกค้า<br/>เช่น Toyota, Honda, Ford<br/>เข้ากับระบบอย่างเคร่งครัด"])

    G2 --> S4["<b>ความรับผิดชอบของซัพพลายเออร์<br/>(Supplier Management)</b>"]
    S4 -.-> S4_D(["ผลักดันและควบคุม Supplier<br/>ให้มีระบบคุณภาพที่ดีเทียบเท่า"])

    G2 --> S5["<b>การควบคุมข้อมูลและเอกสาร<br/>(Document & Record Control)</b>"]
    S5 -.-> S5_D(["มาตรฐานรองรับ (Standardized Work)<br/>ตรวจสอบย้อนกลับได้ (Traceability)"])

    B1_D ===> Final
    B2_D ===> Final
    B3_D ===> Final
    S1_D --> Final
    S2_D --> Final
    S3_D --> Final
    S4_D --> Final
    S5_D --> Final

    Final(("🌟 <b>เป้าหมายสูงสุด</b> 🌟<br/><br/>สร้าง <b>ระบบนิเวศการผลิตยานยนต์</b><br/>ที่สมบูรณ์แบบ แข็งแกร่ง ไร้รอยต่อ<br/>และมีความเสี่ยงต่อผู้บริโภคต่ำที่สุด"))

    classDef rootClass fill:#1e3a8a,color:#ffffff,stroke:#bfdbfe,stroke-width:3px,border-radius:8px,font-size:16px;
    classDef group1Class fill:#0ea5e9,color:#ffffff,stroke:#bae6fd,stroke-width:3px,font-size:16px;
    classDef group2Class fill:#f59e0b,color:#ffffff,stroke:#fde68a,stroke-width:3px,font-size:16px;
    classDef boxBig3 fill:#f0f9ff,color:#0369a1,stroke:#38bdf8,stroke-width:2px,font-size:14px;
    classDef noteBig3 fill:#e0f2fe,color:#075985,stroke:#7dd3fc,stroke-width:2px,border-radius:4px,font-size:14px;
    classDef boxSupport fill:#fffbeb,color:#b45309,stroke:#fbbf24,stroke-width:2px,font-size:14px;
    classDef noteSupport fill:#fef3c7,color:#92400e,stroke:#fcd34d,stroke-width:2px,border-style:dashed,font-size:14px;
    classDef finalClass fill:#10b981,color:#ffffff,stroke:#6ee7b7,stroke-width:4px,font-size:13px;

    class Root rootClass; class G1 group1Class; class G2 group2Class;
    class B1,B2,B3 boxBig3; class B1_D,B2_D,B3_D noteBig3;
    class S1,S2,S3,S4,S5 boxSupport; class S1_D,S2_D,S3_D,S4_D,S5_D noteSupport;
    class Final finalClass;`;

const CHART_EN = `graph TD
    Root["<b>Main Objectives of IATF 16949</b><br/><i>Designed to enhance quality and reduce risks<br/>throughout the automotive supply chain</i>"]
    Root --> G1{"🎯 3 Core Objectives<br/>(The 'Big 3' Objectives)"}
    Root --> G2{"📌 In-depth Objectives<br/>& Supporting Goals"}

    G1 --> B1["<b>1. Continual Improvement</b>"]
    B1 --- B1_D["Mechanisms to increase production efficiency,<br/>reduce costs, and enhance product quality"]

    G1 --> B2["<b>2. Defect Prevention</b>"]
    B2 --- B2_D["Shift from Defect Detection<br/>to Defect Prevention<br/><i>Utilizing Core Tools: FMEA, APQP, SPC</i>"]

    G1 --> B3["<b>3. Reduction of Variation & Waste</b>"]
    B3 --- B3_D["Precise/stable processes<br/>and eliminating non-value-added steps<br/><i>(From Sub-tier to End Customer)</i>"]

    G2 --> S1["<b>Product Safety</b>"]
    S1 -.-> S1_D(["Strict control from<br/>design to production"])

    G2 --> S2["<b>Risk Management</b>"]
    S2 -.-> S2_D(["Risk assessment and<br/>Contingency Plans preparation"])

    G2 --> S3["<b>Customer Specific Requirements<br/>(CSRs)</b>"]
    S3 -.-> S3_D(["Strictly integrating special requirements<br/>from customers (e.g., Toyota, Honda, Ford)"])

    G2 --> S4["<b>Supplier Management</b>"]
    S4 -.-> S4_D(["Driving and controlling suppliers<br/>to achieve equivalent quality systems"])

    G2 --> S5["<b>Document & Record Control</b>"]
    S5 -.-> S5_D(["Standardized Work and<br/>Traceability when issues occur"])

    B1_D ===> Final
    B2_D ===> Final
    B3_D ===> Final
    S1_D --> Final
    S2_D --> Final
    S3_D --> Final
    S4_D --> Final
    S5_D --> Final

    Final(("🌟 <b>Ultimate Goal</b> 🌟<br/><br/>Creating a flawless, robust, and seamless<br/><b>Automotive Manufacturing Ecosystem</b><br/>with the lowest possible risk to consumers"))

    classDef rootClass fill:#1e3a8a,color:#ffffff,stroke:#bfdbfe,stroke-width:3px,border-radius:8px,font-size:16px;
    classDef group1Class fill:#0ea5e9,color:#ffffff,stroke:#bae6fd,stroke-width:3px,font-size:16px;
    classDef group2Class fill:#f59e0b,color:#ffffff,stroke:#fde68a,stroke-width:3px,font-size:16px;
    classDef boxBig3 fill:#f0f9ff,color:#0369a1,stroke:#38bdf8,stroke-width:2px,font-size:14px;
    classDef noteBig3 fill:#e0f2fe,color:#075985,stroke:#7dd3fc,stroke-width:2px,border-radius:4px,font-size:14px;
    classDef boxSupport fill:#fffbeb,color:#b45309,stroke:#fbbf24,stroke-width:2px,font-size:14px;
    classDef noteSupport fill:#fef3c7,color:#92400e,stroke:#fcd34d,stroke-width:2px,border-style:dashed,font-size:14px;
    classDef finalClass fill:#10b981,color:#ffffff,stroke:#6ee7b7,stroke-width:4px,font-size:13px;

    class Root rootClass; class G1 group1Class; class G2 group2Class;
    class B1,B2,B3 boxBig3; class B1_D,B2_D,B3_D noteBig3;
    class S1,S2,S3,S4,S5 boxSupport; class S1_D,S2_D,S3_D,S4_D,S5_D noteSupport;
    class Final finalClass;`;

/* ──────────────────── Component ──────────────────── */

const IATFDiagram: React.FC = () => {
  const [lang, setLang] = useState<'th' | 'en'>('th');
  const [scale, setScale] = useState(0.38);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const isDragging = useRef(false);
  const svgNaturalWidthRef = useRef<number>(0);
  const svgNaturalHeightRef = useRef<number>(0);
  const scaleRef = useRef(0.38);
  // Keep scaleRef in sync during render so callbacks always see the current value
  scaleRef.current = scale;

  // Initialize mermaid once
  useEffect(() => {
    if (!initializedRef.current) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          fontFamily: 'Inter, sans-serif',
          fontSize: '14px',
          primaryColor: '#e0f2fe',
          primaryTextColor: '#1e3a8a',
          primaryBorderColor: '#7dd3fc',
          lineColor: '#64748b',
          secondaryColor: '#f0fdf4',
          tertiaryColor: '#fffbeb',
        },
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
          curve: 'basis',
          nodeSpacing: 80,
          rankSpacing: 90,
          padding: 12,
          wrappingWidth: 200,
        },
      });
      initializedRef.current = true;
    }
  }, []);

  const renderChart = useCallback(async () => {
    if (!containerRef.current) return;
    const code = lang === 'th' ? CHART_TH : CHART_EN;
    try {
      const id = `mermaid-svg-${Date.now()}`;
      const { svg } = await mermaid.render(id, code);
      containerRef.current.innerHTML = svg;
      // Inject a <style> block into the SVG that targets the finalClass node's
      // shape children (circle, ellipse, any path) via the CSS class Mermaid adds.
      // The label lives in a <foreignObject> sibling — untouched by these rules.
      const svgEl = containerRef.current.querySelector('svg');
      if (svgEl) {
        const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        styleEl.textContent = `
          .finalClass circle,
          .finalClass ellipse,
          .finalClass path.label-container {
            transform-box: fill-box;
            transform-origin: center;
            transform: scale(1.5);
          }
        `;
        svgEl.insertBefore(styleEl, svgEl.firstChild);

        const vb = svgEl.getAttribute('viewBox');
        if (vb) {
          const parts = vb.trim().split(/[\s,]+/);
          svgNaturalWidthRef.current = parseFloat(parts[2]) || 800;
          svgNaturalHeightRef.current = parseFloat(parts[3]) || 600;
        } else {
          const w = parseFloat(svgEl.getAttribute('width') || '800');
          const h = parseFloat(svgEl.getAttribute('height') || '600');
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
      containerRef.current.innerHTML =
        '<p class="text-red-500 p-4">Error rendering flowchart.</p>';
    }
  }, [lang]);

  useEffect(() => {
    renderChart();
  }, [renderChart]);

  // Update SVG pixel dimensions on scale change (crisp at every zoom level)
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

  // Scroll-wheel zoom
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
  const resetView = () => { setScale(0.38); setPan({ x: 0, y: 0 }); };

  const toggleLang = () => { setLang((prev) => (prev === 'th' ? 'en' : 'th')); resetView(); };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] gap-3">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div className="text-center flex-1 space-y-1 bg-white px-6 py-3 rounded-xl shadow-sm border border-slate-100">
          {lang === 'th' ? (
            <>
              <h1 className="text-2xl md:text-3xl font-bold text-blue-900">
                Flowchart โครงสร้างวัตถุประสงค์ IATF 16949
              </h1>
              <p className="text-slate-600 md:text-lg">
                ระบบการจัดการคุณภาพสำหรับอุตสาหกรรมยานยนต์ (Automotive Quality Management System)
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl md:text-3xl font-bold text-blue-900">
                IATF 16949 Objectives Structure Flowchart
              </h1>
              <p className="text-slate-600 md:text-lg">
                Automotive Quality Management System
              </p>
            </>
          )}
        </div>
        {/* Language Toggle */}
        <button
          onClick={toggleLang}
          className="ml-3 flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium py-2 px-4 rounded-full shadow-sm transition-colors duration-200 shrink-0"
        >
          <Languages size={18} className="text-blue-600" />
          {lang === 'th' ? 'English' : 'ภาษาไทย'}
        </button>
      </div>

      {/* Flowchart */}
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

        {/* Hint label */}
        <span className="absolute bottom-2 left-2 z-10 text-[10px] text-slate-400 select-none pointer-events-none">
          Scroll to zoom · Drag to pan
        </span>

        {/* Draggable / zoomable area */}
        <div
          className="w-full h-full flex items-center justify-center select-none"
          style={{ cursor: 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px)`,
              willChange: 'transform',
            }}
          >
            <div ref={containerRef} className="text-slate-400">
              Loading Flowchart...
            </div>
          </div>
        </div>
      </div>

      {/* Footer info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
        {lang === 'th' ? (
          <>
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
              <h3 className="font-bold text-blue-800 mb-1 flex items-center text-sm">
                <span className="text-lg mr-2">🎯</span> Core Tools ที่บังคับใช้
              </h3>
              <ul className="list-disc list-inside text-xs text-blue-900 space-y-0.5">
                <li><b>FMEA</b> (Failure Mode and Effects Analysis): การวิเคราะห์ความเสี่ยง</li>
                <li><b>APQP</b> (Advanced Product Quality Planning): การวางแผนคุณภาพล่วงหน้า</li>
                <li><b>SPC</b> (Statistical Process Control): การควบคุมกระบวนการทางสถิติ</li>
              </ul>
            </div>
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
              <h3 className="font-bold text-amber-800 mb-1 flex items-center text-sm">
                <span className="text-lg mr-2">🛡️</span> การป้องกันความเสี่ยงที่สำคัญ
              </h3>
              <ul className="list-disc list-inside text-xs text-amber-900 space-y-0.5">
                <li>ปัญหาการผลิตหยุดชะงัก (เครื่องจักรเสีย, วัตถุดิบขาด)</li>
                <li>ปัญหาด้านความปลอดภัยต่อชีวิตผู้ใช้งาน</li>
                <li>ปัญหาด้านความน่าเชื่อถือและการตรวจสอบย้อนกลับ (Traceability)</li>
              </ul>
            </div>
          </>
        ) : (
          <>
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
              <h3 className="font-bold text-blue-800 mb-1 flex items-center text-sm">
                <span className="text-lg mr-2">🎯</span> Mandatory Core Tools
              </h3>
              <ul className="list-disc list-inside text-xs text-blue-900 space-y-0.5">
                <li><b>FMEA</b> (Failure Mode and Effects Analysis)</li>
                <li><b>APQP</b> (Advanced Product Quality Planning)</li>
                <li><b>SPC</b> (Statistical Process Control)</li>
              </ul>
            </div>
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
              <h3 className="font-bold text-amber-800 mb-1 flex items-center text-sm">
                <span className="text-lg mr-2">🛡️</span> Key Risk Preventions
              </h3>
              <ul className="list-disc list-inside text-xs text-amber-900 space-y-0.5">
                <li>Production interruptions (machine breakdown, material shortage)</li>
                <li>End-user safety and life-threatening issues</li>
                <li>Product reliability and traceability issues</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default IATFDiagram;
