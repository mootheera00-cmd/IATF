// src/components/PdfViewer.tsx
// Canvas-based PDF viewer using PDF.js.
// Right-click "Save as" is impossible because there is no native PDF plugin —
// every page is rendered onto a <canvas> element that we fully control.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ZoomIn, ZoomOut, Maximize2, AlignCenter } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const ZOOM_STEP = 0.25;
const ZOOM_MIN  = 0.5;
const ZOOM_MAX  = 4.0;
const ZOOM_FIT  = 0;   // sentinel: fit-width
const ZOOM_PAGE = -1;  // sentinel: fit-page

interface PdfViewerProps {
  src: string;
}

export default function PdfViewer({ src }: PdfViewerProps) {
  const scrollRef    = useRef<HTMLDivElement>(null);
  const canvasesRef  = useRef<HTMLCanvasElement[]>([]);

  const pdfRef           = useRef<PDFDocumentProxy | null>(null);
  const renderingRef     = useRef(false);
  const pendingRenderRef = useRef(false);
  const scaleRef         = useRef<number>(ZOOM_FIT);

  const [numPages,  setNumPages]  = useState(0);
  const [scale,     setScale]     = useState<number>(ZOOM_FIT);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);

  // ── render all pages at the given scale ────────────────────────────────

  const renderAllPages = useCallback(async (pdf: PDFDocumentProxy, requestedScale: number) => {
    if (renderingRef.current) {
      pendingRenderRef.current = true;
      return;
    }
    renderingRef.current = true;

    const container = scrollRef.current;
    if (!container) { renderingRef.current = false; return; }

    const containerWidth  = container.clientWidth  - 32;
    const containerHeight = container.clientHeight - 32;

    try {
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page   = await pdf.getPage(pageNum);
        const baseVp = page.getViewport({ scale: 1 });

        let s: number;
        if (requestedScale === ZOOM_FIT) {
          s = containerWidth / baseVp.width;
        } else if (requestedScale === ZOOM_PAGE) {
          s = Math.min(containerWidth / baseVp.width, containerHeight / baseVp.height);
        } else {
          s = requestedScale;
        }

        const viewport = page.getViewport({ scale: s });
        const canvas   = canvasesRef.current[pageNum - 1];
        if (!canvas) continue;

        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width  = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      }
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('PdfViewer render error:', err);
      }
    } finally {
      renderingRef.current = false;
      if (pendingRenderRef.current) {
        pendingRenderRef.current = false;
        renderAllPages(pdf, scaleRef.current);
      }
    }
  }, []);

  // ── load PDF ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!src) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        canvasesRef.current = [];
        scaleRef.current = ZOOM_FIT;
        setScale(ZOOM_FIT);
        setNumPages(0);

        const pdf = await pdfjsLib.getDocument({ url: src, disableStream: true }).promise;
        if (cancelled) return;

        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          console.error('PdfViewer load error:', err);
          setLoadError('Failed to load PDF.');
          setLoading(false);
        }
      }
    };

    load();
    return () => { cancelled = true; pdfRef.current = null; };
  }, [src]);

  // ── re-render when scale or page count changes ──────────────────────────

  useEffect(() => {
    if (!pdfRef.current || numPages === 0) return;
    scaleRef.current = scale;
    renderAllPages(pdfRef.current, scale);
  }, [scale, numPages, renderAllPages]);

  // ── Ctrl + scroll wheel zoom ─────────────────────────────────────────────

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setScale((prev) => {
        const current = prev <= 0 ? 1.5 : prev;
        const next    = e.deltaY < 0
          ? Math.min(current + ZOOM_STEP, ZOOM_MAX)
          : Math.max(current - ZOOM_STEP, ZOOM_MIN);
        return Math.round(next * 100) / 100;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [numPages]);

  // ── zoom helpers ─────────────────────────────────────────────────────────

  const zoomIn   = () => setScale((p) => Math.min((p <= 0 ? 1.5 : p) + ZOOM_STEP, ZOOM_MAX));
  const zoomOut  = () => setScale((p) => Math.max((p <= 0 ? 1.5 : p) - ZOOM_STEP, ZOOM_MIN));
  const fitWidth = () => setScale(ZOOM_FIT);
  const fitPage  = () => setScale(ZOOM_PAGE);

  const zoomLabel =
    scale === ZOOM_FIT  ? 'Fit Width' :
    scale === ZOOM_PAGE ? 'Fit Page'  :
    `${Math.round(scale * 100)}%`;

  // ── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col w-full h-full"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white shrink-0 select-none">
        <button
          onClick={zoomOut}
          disabled={typeof scale === 'number' && scale > 0 && scale <= ZOOM_MIN}
          className="p-1.5 rounded hover:bg-slate-600 disabled:opacity-40 transition-colors"
          title="Zoom Out  (Ctrl + scroll down)"
        >
          <ZoomOut size={16} />
        </button>

        <span className="text-xs font-mono w-20 text-center bg-slate-800 rounded px-2 py-1 cursor-default select-none">
          {zoomLabel}
        </span>

        <button
          onClick={zoomIn}
          disabled={typeof scale === 'number' && scale > 0 && scale >= ZOOM_MAX}
          className="p-1.5 rounded hover:bg-slate-600 disabled:opacity-40 transition-colors"
          title="Zoom In  (Ctrl + scroll up)"
        >
          <ZoomIn size={16} />
        </button>

        <div className="w-px h-5 bg-slate-500 mx-1" />

        <button
          onClick={fitWidth}
          className={`p-1.5 rounded transition-colors ${scale === ZOOM_FIT ? 'bg-indigo-600' : 'hover:bg-slate-600'}`}
          title="Fit Width"
        >
          <AlignCenter size={16} />
        </button>

        <button
          onClick={fitPage}
          className={`p-1.5 rounded transition-colors ${scale === ZOOM_PAGE ? 'bg-indigo-600' : 'hover:bg-slate-600'}`}
          title="Fit Page"
        >
          <Maximize2 size={16} />
        </button>

        <span className="ml-auto text-xs text-slate-400 select-none">
          {numPages > 0 && `${numPages} page${numPages !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* ── Scrollable canvas area ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto bg-slate-400"
        style={{ userSelect: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}
        onContextMenu={(e) => e.preventDefault()}
      >
        {loading && (
          <div className="flex h-full items-center justify-center text-white text-sm">
            Loading…
          </div>
        )}

        {loadError && (
          <div className="flex h-full items-center justify-center text-red-200 text-sm">
            {loadError}
          </div>
        )}

        {!loading && !loadError && (
          <div className="flex flex-col items-center gap-3 p-4">
            {Array.from({ length: numPages }, (_, i) => (
              <canvas
                key={i}
                ref={(el) => { if (el) canvasesRef.current[i] = el; }}
                onContextMenu={(e) => e.preventDefault()}
                style={{
                  display: 'block',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
                  borderRadius: '2px',
                  background: '#ffffff',
                  maxWidth: '100%',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
