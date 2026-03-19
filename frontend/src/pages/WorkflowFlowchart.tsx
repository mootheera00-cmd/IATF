import React, { useState } from "react";
import {
  Bell,
  ClipboardCheck,
  CheckCircle,
  FileText,
  GitPullRequest,
  Upload,
  Eye,
  RotateCcw,
  Ban,
  Star,
  Database,
  Send,
} from "lucide-react";

// ─── Shared step definitions ──────────────────────────────────────────────────
type FlowStep = {
  id: string;
  label: string;
  sublabel?: string;
  note?: string; // small grey annotation (e.g. "Form only")
  type: "start" | "action" | "decision" | "end" | "terminal-end" | "db";
  color:
    | "indigo"
    | "blue"
    | "sky"
    | "amber"
    | "violet"
    | "emerald"
    | "rose"
    | "purple"
    | "slate"
    | "teal";
  icon?: React.ElementType;
  approve?: string; // id of next step on approve
  reject?: string; // id of next step on reject
  next?: string; // id of next step (no decision)
};

const NEW_DOC: FlowStep[] = [
  {
    id: "nd1",
    type: "start",
    label: "Requester",
    sublabel: "Creates New Document Request",
    color: "indigo",
    icon: GitPullRequest,
    next: "nd2",
  },
  {
    id: "nd2",
    type: "decision",
    label: "DC Review",
    sublabel: "Document Control",
    color: "blue",
    icon: Bell,
    approve: "nd3",
    reject: "nd_rej",
  },
  {
    id: "nd_rej",
    type: "terminal-end",
    label: "Rejected",
    sublabel: "Ticket Closed",
    color: "rose",
    icon: Ban,
  },
  {
    id: "nd3",
    type: "action",
    label: "Revision",
    sublabel: "Requester uploads Word/Excel + PDF",
    color: "amber",
    icon: Upload,
    next: "nd4",
  },
  {
    id: "nd4",
    type: "decision",
    label: "Checker",
    sublabel: "Checker reviews files",
    color: "violet",
    icon: ClipboardCheck,
    approve: "nd5",
    reject: "nd3",
  },
  {
    id: "nd5",
    type: "decision",
    label: "Approver",
    sublabel: "Approver reviews files",
    color: "purple",
    icon: Eye,
    approve: "nd6",
    reject: "nd3",
  },
  {
    id: "nd6",
    type: "action",
    label: "Non-Signed PDF",
    sublabel: "Requester uploads non-signed PDF",
    note: "Form only",
    color: "blue",
    icon: FileText,
    next: "nd7",
  },
  {
    id: "nd7",
    type: "decision",
    label: "Final DC Release",
    sublabel: "Document Control final release",
    color: "blue",
    icon: Bell,
    approve: "nd8",
    reject: "nd3",
  },
  {
    id: "nd8",
    type: "end",
    label: "Released",
    sublabel: "Document published & available",
    color: "emerald",
    icon: CheckCircle,
    next: "nd9",
  },
  {
    id: "nd9",
    type: "db",
    label: "Stored in DB",
    sublabel: "Document & revision saved to database",
    color: "teal",
    icon: Database,
  },
];

const CHANGE_REQ: FlowStep[] = [
  {
    id: "cr1",
    type: "start",
    label: "Requester",
    sublabel: "Creates Change Request",
    color: "indigo",
    icon: GitPullRequest,
    next: "cr2",
  },
  {
    id: "cr2",
    type: "decision",
    label: "DC Review",
    sublabel: "Document Control",
    color: "blue",
    icon: Bell,
    approve: "cr2b",
    reject: "cr_rej",
  },
  {
    id: "cr_rej",
    type: "terminal-end",
    label: "Rejected",
    sublabel: "Ticket Closed",
    color: "rose",
    icon: Ban,
  },
  {
    id: "cr2b",
    type: "action",
    label: "Send Original File",
    sublabel: "System sends original Word/Excel to requester",
    color: "sky",
    icon: Send,
    next: "cr3",
  },
  {
    id: "cr3",
    type: "action",
    label: "Revision",
    sublabel: "Requester uploads revised Word/Excel + PDF",
    color: "amber",
    icon: Upload,
    next: "cr4",
  },
  {
    id: "cr4",
    type: "decision",
    label: "Checker",
    sublabel: "Checker reviews files",
    color: "violet",
    icon: ClipboardCheck,
    approve: "cr5",
    reject: "cr3",
  },
  {
    id: "cr5",
    type: "decision",
    label: "Approver",
    sublabel: "Approver reviews files",
    color: "purple",
    icon: Eye,
    approve: "cr6",
    reject: "cr3",
  },
  {
    id: "cr6",
    type: "action",
    label: "Non-Signed PDF",
    sublabel: "Requester uploads non-signed PDF",
    note: "Form only",
    color: "blue",
    icon: FileText,
    next: "cr7",
  },
  {
    id: "cr7",
    type: "decision",
    label: "Final DC Release",
    sublabel: "Document Control final release",
    color: "blue",
    icon: Bell,
    approve: "cr8",
    reject: "cr3",
  },
  {
    id: "cr8",
    type: "end",
    label: "Released",
    sublabel: "Revision published & available",
    color: "emerald",
    icon: CheckCircle,
    next: "cr9",
  },
  {
    id: "cr9",
    type: "db",
    label: "Stored in DB",
    sublabel: "Revision saved to database",
    color: "teal",
    icon: Database,
  },
];

const REUPLOAD: FlowStep[] = [
  {
    id: "ru1",
    type: "start",
    label: "DC / Admin",
    sublabel: "Creates Re-upload Request",
    color: "indigo",
    icon: RotateCcw,
    next: "ru2",
  },
  {
    id: "ru2",
    type: "action",
    label: "Revision",
    sublabel: "Requester uploads updated Word/Excel + PDF",
    color: "amber",
    icon: Upload,
    next: "ru3",
  },
  {
    id: "ru3",
    type: "decision",
    label: "Checker",
    sublabel: "Checker reviews files",
    color: "violet",
    icon: ClipboardCheck,
    approve: "ru4",
    reject: "ru2",
  },
  {
    id: "ru4",
    type: "decision",
    label: "Approver",
    sublabel: "Approver reviews files",
    color: "purple",
    icon: Eye,
    approve: "ru5",
    reject: "ru2",
  },
  {
    id: "ru5",
    type: "action",
    label: "Non-Signed PDF",
    sublabel: "Requester uploads non-signed PDF",
    note: "Form only",
    color: "blue",
    icon: FileText,
    next: "ru6",
  },
  {
    id: "ru6",
    type: "decision",
    label: "Final DC Release",
    sublabel: "Document Control final release",
    color: "blue",
    icon: Bell,
    approve: "ru7",
    reject: "ru2",
  },
  {
    id: "ru7",
    type: "end",
    label: "Released",
    sublabel: "Updated revision published",
    color: "emerald",
    icon: CheckCircle,
    next: "ru8",
  },
  {
    id: "ru8",
    type: "db",
    label: "Stored in DB",
    sublabel: "Updated revision saved to database",
    color: "teal",
    icon: Database,
  },
];

// ─── Color maps ───────────────────────────────────────────────────────────────
const BG: Record<string, string> = {
  indigo: "bg-indigo-600",
  blue: "bg-blue-600",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  violet: "bg-violet-600",
  emerald: "bg-emerald-600",
  rose: "bg-rose-600",
  purple: "bg-purple-600",
  slate: "bg-slate-600",
  teal: "bg-teal-600",
};
const BORDER: Record<string, string> = {
  indigo: "border-indigo-400",
  blue: "border-blue-400",
  sky: "border-sky-400",
  amber: "border-amber-300",
  violet: "border-violet-400",
  emerald: "border-emerald-400",
  rose: "border-rose-400",
  purple: "border-purple-400",
  slate: "border-slate-400",
  teal: "border-teal-400",
};
const LIGHT: Record<string, string> = {
  indigo: "bg-indigo-50 border-indigo-200 text-indigo-800",
  blue: "bg-blue-50 border-blue-200 text-blue-800",
  sky: "bg-sky-50 border-sky-200 text-sky-800",
  amber: "bg-amber-50 border-amber-200 text-amber-900",
  violet: "bg-violet-50 border-violet-200 text-violet-800",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
  rose: "bg-rose-50 border-rose-200 text-rose-800",
  purple: "bg-purple-50 border-purple-200 text-purple-800",
  slate: "bg-slate-50 border-slate-200 text-slate-700",
  teal: "bg-teal-50 border-teal-200 text-teal-800",
};

// ─── Individual node renderers ────────────────────────────────────────────────
function NodeBox({ step }: { step: FlowStep }) {
  const Icon = step.icon;
  const isEnd = step.type === "end";
  const isTerminal = step.type === "terminal-end";
  const isStart = step.type === "start";
  const isDb = step.type === "db";

  // DB storage node — cylinder-style with dashed border
  if (isDb) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="flex flex-col items-center justify-center w-36 h-[72px] rounded-xl border-2 border-dashed border-teal-400 bg-teal-50 shadow-sm text-center px-2 gap-1">
          {Icon && <Icon size={16} className="text-teal-600" />}
          <span className="text-sm font-bold leading-tight text-teal-800">{step.label}</span>
          <span className="text-xs leading-tight text-teal-600 opacity-80">{step.sublabel}</span>
        </div>
      </div>
    );
  }

  if (isEnd || isTerminal) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div
          className={`flex flex-col items-center justify-center w-36 h-[64px] rounded-full border-2 shadow font-bold text-sm text-white text-center px-2 ${BG[step.color]} ${BORDER[step.color]}`}
        >
          {Icon && <Icon size={16} className="mb-0.5" />}
          <span className="text-sm leading-tight">{step.label}</span>
        </div>
      </div>
    );
  }

  if (step.type === "decision") {
    return (
      <div className="flex flex-col items-center h-[230px]">
        <div className="relative w-[182px] h-[182px] flex items-center justify-center">
          <div
            className={`absolute w-32 h-32 rounded-lg rotate-45 border-2 shadow-md ${BG[step.color]} ${BORDER[step.color]} opacity-90`}
          />
          <div className="relative z-10 flex flex-col items-center text-white text-center px-1">
            {Icon && <Icon size={16} className="mb-0.5" />}
            <span className="text-sm font-bold leading-tight">
              {step.label}
            </span>
          </div>
        </div>
        <span className="text-xs text-slate-500 max-w-[130px] text-center leading-tight mt-1 pb-1">
          {step.sublabel}
        </span>
      </div>
    );
  }

  // action / start
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex flex-col items-center justify-center w-36 h-[80px] rounded-xl border-2 shadow text-center px-2 gap-1 ${isStart ? `${BG[step.color]} text-white ${BORDER[step.color]}` : `${LIGHT[step.color]} border`}`}
      >
        {Icon && <Icon size={16} className={isStart ? "text-white/80" : ""} />}
        <span className="text-sm font-bold leading-tight">{step.label}</span>
        <span
          className={`text-xs leading-tight ${isStart ? "text-white/70" : "opacity-70"}`}
        >
          {step.sublabel}
        </span>
      </div>
      {step.note && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300 leading-none">
          {step.note}
        </span>
      )}
    </div>
  );
}

// ─── Vertical linear flow renderer ───────────────────────────────────────────
function FlowChart({ steps }: { steps: FlowStep[] }) {
  // Build a main-path array (excluding terminal-end branch)
  const mainPath = steps.filter((s) => s.type !== "terminal-end");
  const rejected = steps.find((s) => s.type === "terminal-end");

  // Find the DC Review step (has a reject → terminal-end)
  const dcReviewIdx = mainPath.findIndex(
    (s) =>
      s.type === "decision" &&
      steps.find((r) => r.type === "terminal-end") &&
      s.reject === rejected?.id,
  );

  // Find the Revision step index to know where to draw the back arrow to
  const revisionIdx = mainPath.findIndex((s) => s.label === "Revision");

  return (
    <div className="flex gap-6 relative justify-center mx-auto max-w-lg pb-10">
      {/* ── Left-side branches: Reject back to Revision SVG layer ── */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <svg
          className="w-full h-full text-rose-400"
          style={{ overflow: "visible" }}
        >
          <defs>
            <marker
              id="arrow-rose"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <polygon points="0,0 10,5 0,10" fill="currentColor" />
            </marker>
          </defs>
          {mainPath.map((step, idx) => {
            if (step.type !== "decision") return null;
            const rejectsBack =
              step.reject &&
              steps.find((s) => s.id === step.reject)?.type !== "terminal-end";
            if (!rejectsBack || revisionIdx === -1) return null;

            // Approximate Y positions mapping based on the fixed heights in the DOM loops below
            const nodeH = (s: FlowStep) =>
              s.type === "decision"
                ? 230
                : s.type === "end" || s.type === "terminal-end"
                  ? 64
                  : s.type === "db"
                    ? 72
                    : 80 + (s.note ? 20 : 0); // action nodes with note pill are taller

            const calcY = (index: number, isDecision: boolean) => {
              let y = 0;
              for (let i = 0; i < index; i++) {
                y += nodeH(mainPath[i]);
                if (i < mainPath.length - 1) {
                  y += 32; // Connector height
                }
              }
              return (
                y +
                (isDecision
                  ? 182 / 2
                  : mainPath[index].type === "end" ||
                      mainPath[index].type === "terminal-end"
                    ? 32
                    : 40)
              );
            };
            const startY = calcY(idx, true);
            const baseTargetY = calcY(revisionIdx, false);

            const indexDiff = idx - revisionIdx;
            // Cascade lines leftwards so they don't overlap vertically
            const leftEdge = -25 - indexDiff * 14;

            // Stagger target Y so arrows plug neatly into the side of the Revision box
            const adjustedTargetY = baseTargetY + (indexDiff - 2) * 12;

            return (
              <g key={`arrow-${step.id}`}>
                {/* Path line drawing left, up, then right to revision node */}
                <path
                  d={`M 8 ${startY} L ${leftEdge} ${startY} L ${leftEdge} ${adjustedTargetY} L -5 ${adjustedTargetY}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  markerEnd="url(#arrow-rose)"
                  strokeDasharray="4 2"
                />
                <foreignObject
                  x={leftEdge + 5}
                  y={startY - 22}
                  width="40"
                  height="20"
                  style={{ overflow: "visible" }}
                >
                  <div className="bg-white border border-rose-200 text-rose-600 text-[10px] font-bold px-1 py-0.5 rounded shadow-sm text-center w-[40px] block">
                    Reject
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>
      {/* ── Main vertical flow ── */}
      <div
        className="flex flex-col items-center relative z-10"
        style={{ paddingTop: "0px", paddingBottom: "0px", gap: "0" }}
      >
        {mainPath.map((step, idx) => {
          const hasDecision = step.type === "decision";
          const isLast = idx === mainPath.length - 1;

          return (
            <React.Fragment key={step.id}>
              {/* Node */}
              <div className="relative flex justify-center w-full z-10">
                <NodeBox step={step} />
              </div>

              {/* Connector below */}
              {!isLast && (
                <div className="flex flex-col items-center h-[32px] justify-start overflow-visible">
                  {hasDecision ? (
                    <div className="flex flex-col items-center flex-1 h-full">
                      <div className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold leading-none mt-0.5">
                        <span>✓ Approve</span>
                      </div>
                      <div className="w-0.5 flex-1 bg-emerald-400 mt-0.5" />
                    </div>
                  ) : step.type === "end" ? (
                    <div className="w-0.5 flex-1 bg-teal-400" />
                  ) : (
                    <div className="w-0.5 flex-1 bg-slate-300" />
                  )}
                  {/* Arrow tip */}
                  <svg
                    width="10"
                    height="7"
                    viewBox="0 0 10 7"
                    className={`block ${hasDecision ? "text-emerald-400" : step.type === "end" ? "text-teal-400" : "text-slate-400"}`}
                  >
                    <polygon points="5,7 0,0 10,0" fill="currentColor" />
                  </svg>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>{" "}
      {/* ── Right-side branches: Terminal Reject ── */}
      <div className="flex flex-col relative z-10 w-32">
        {mainPath.map((step, idx) => {
          const nodeHeight =
            step.type === "decision"
              ? 230
              : step.type === "end" || step.type === "terminal-end"
                ? 64
                : step.type === "db"
                  ? 72
                  : 80 + (step.note ? 20 : 0);
          const connectorHeight = 32;
          const marginTop = 0;

          if (step.type !== "decision") {
            return (
              <div
                key={step.id}
                style={{
                  height:
                    nodeHeight +
                    marginTop +
                    (idx < mainPath.length - 1 ? connectorHeight : 0),
                }}
              />
            );
          }

          const isDcReview = idx === dcReviewIdx;

          return (
            <div
              key={step.id}
              style={{
                height:
                  nodeHeight +
                  marginTop +
                  (idx < mainPath.length - 1 ? connectorHeight : 0),
              }}
              className="relative"
            >
              {isDcReview && rejected ? (
                // Reject -> END
                <div
                  className="absolute flex items-center w-[120px]"
                  style={{ top: "91px", marginTop: "-32px" }}
                >
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-1 text-rose-500 text-[10px] font-bold mb-1 ml-4">
                      <span>✗ Reject</span>
                    </div>
                    <div className="flex items-center gap-0">
                      <div className="h-0.5 w-8 bg-rose-400" />
                      <svg
                        width="7"
                        height="10"
                        viewBox="0 0 7 10"
                        className="text-rose-400"
                      >
                        <polygon points="7,5 0,0 0,10" fill="currentColor" />
                      </svg>
                      <NodeBox step={rejected} />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
const TABS = [
  { key: "new", label: "📄 New Document", steps: NEW_DOC },
  { key: "change", label: "✏️ Change Request", steps: CHANGE_REQ },
  { key: "reup", label: "🔄 Re-upload", steps: REUPLOAD },
] as const;

const levelRules = [
  { level: "Level 1", desc: "Quality Manual" },
  { level: "Level 2", desc: "Procedure" },
  {
    level: "Level 3",
    desc: "Work Instruction, Support Document, Outside Document, Operation Standard",
  },
  { level: "Level 4", desc: "Form, Report" },
];

const statusFlow = [
  { label: "Draft", color: "bg-slate-500" },
  { label: "Pending DC Review", color: "bg-blue-500" },
  { label: "Pending Revision", color: "bg-amber-500" },
  { label: "Pending Checker", color: "bg-violet-500" },
  { label: "Pending Approver", color: "bg-purple-500" },
  { label: "Pending Non-Sign PDF", color: "bg-sky-500" },
  { label: "Pending Final DC Release", color: "bg-blue-700" },
  { label: "Released", color: "bg-emerald-600" },
];

export default function WorkflowFlowchart() {
  const [activeTab, setActiveTab] = useState<"new" | "change" | "reup">("new");
  const current = TABS.find((t) => t.key === activeTab)!;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Workflow Flowchart
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Visual representation of the document control workflows.
        </p>
      </div>

      {/* Status Flow Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
          Status Flow
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {statusFlow.map((s, i) => (
            <React.Fragment key={s.label}>
              <span
                className={`text-white text-xs font-semibold px-2.5 py-1 rounded-full ${s.color}`}
              >
                {s.label}
              </span>
              {i < statusFlow.length - 1 && (
                <svg
                  width="14"
                  height="10"
                  viewBox="0 0 14 10"
                  className="text-slate-400 flex-shrink-0"
                >
                  <polygon points="14,5 0,0 0,10" fill="currentColor" />
                </svg>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Left: Flowchart panel ─────────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 text-sm font-semibold">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-3 transition-colors ${activeTab === tab.key ? "text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Flow diagram */}
          <div className="p-6 overflow-x-auto">
            <FlowChart steps={current.steps} />
          </div>
        </div>

        {/* ── Right: Legend + Level Rules ───────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {/* Node legend */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
              Shape Legend
            </p>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 border-2 border-indigo-400 flex-shrink-0" />
                <span className="text-slate-700">Start / Requester action</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-amber-100 border-2 border-amber-300 flex-shrink-0" />
                <span className="text-slate-700">Process / Upload step</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rotate-45 rounded-md bg-violet-600 border-2 border-violet-400 flex-shrink-0" />
                <span className="text-slate-700">
                  Decision (Approve / Reject)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600 border-2 border-emerald-400 flex-shrink-0" />
                <span className="text-slate-700">End / Released</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-600 border-2 border-rose-400 flex-shrink-0" />
                <span className="text-slate-700">Terminal End / Rejected</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl border-2 border-dashed border-teal-400 bg-teal-50 flex-shrink-0" />
                <span className="text-slate-700">Stored in DB</span>
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="h-0.5 w-8 bg-emerald-400" />
                <svg
                  width="8"
                  height="6"
                  viewBox="0 0 8 6"
                  className="text-emerald-400"
                >
                  <polygon points="8,3 0,0 0,6" fill="currentColor" />
                </svg>
                <span className="text-xs text-slate-600">Approve path</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-0.5 w-8 bg-rose-400" />
                <svg
                  width="8"
                  height="6"
                  viewBox="0 0 8 6"
                  className="text-rose-400"
                >
                  <polygon points="8,3 0,0 0,6" fill="currentColor" />
                </svg>
                <span className="text-xs text-slate-600">Reject path</span>
              </div>
            </div>
          </div>

          {/* Level rules */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
              Document Levels
            </p>
            <div className="space-y-2">
              {levelRules.map((r) => (
                <div key={r.level} className="flex gap-2 text-sm">
                  <span className="font-bold text-indigo-700 w-14 flex-shrink-0">
                    {r.level}
                  </span>
                  <span className="text-slate-600 text-xs leading-relaxed">
                    {r.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Key notes */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Star size={12} /> Key Notes
            </p>
            <ul className="space-y-1.5 text-xs text-amber-900 list-disc list-inside">
              <li>
                All rejections from Checker/Approver/DC return to{" "}
                <strong>Revision</strong> step.
              </li>
              <li>DC Review rejection closes the ticket permanently.</li>
              <li>
                After DC Review <strong>approves</strong>, the{" "}
                <strong>system automatically sends</strong> the original
                Word/Excel file to the requester for revision.
              </li>
              <li>
                <strong>Non-Signed PDF is required for Form documents only.</strong>
              </li>
              <li>
                Re-upload requests skip DC Review — go directly to Revision.
              </li>
              <li>
                After release, the document & revision are{" "}
                <strong>stored in the database</strong>.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
