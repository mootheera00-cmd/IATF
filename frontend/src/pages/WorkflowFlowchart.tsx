import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  X,
  Users,
  ListChecks,
  ShieldCheck,
  Briefcase,
  Hexagon,
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

// ─── Role / step info data for popups ─────────────────────────────────────────
interface RoleInfo {
  who: string;
  responsibilities: string[];
  checklist: string[];
  security: string[];
}

const ROLE_INFO: Record<string, RoleInfo> = {
  Requester: {
    who: "Any employee who needs a new document created or an existing document changed. Typically a Process Owner, Engineer, or Department Lead.",
    responsibilities: [
      "Submit a Document Change Request (DCR) with clear justification",
      "Prepare and upload the draft document (Word / Excel)",
      "Upload the corresponding PDF for review",
      "Respond to rejection feedback and revise as needed",
    ],
    checklist: [
      "Document title and ID confirmed",
      "Correct document level selected (Level 1–4)",
      "Draft file in approved format (Word / Excel)",
      "PDF version generated from the draft",
      "Change reason / justification clearly described",
      "Affected departments / processes identified",
    ],
    security: [
      "Only authenticated users with an active account can submit requests",
      "Requester can only view and edit their own draft tickets",
      "All uploads are virus-scanned and file-type validated",
    ],
  },
  "DC Review": {
    who: "Document Controller (DC) — the designated person responsible for managing the document control system under IATF 16949.",
    responsibilities: [
      "Verify the request form is complete and justified",
      "Check for duplicate or conflicting document IDs",
      "Approve the request to proceed or reject with reason",
      "Ensure correct document level classification",
    ],
    checklist: [
      "Request form fields fully completed",
      "Document ID does not conflict with existing records",
      "Justification is clear and valid",
      "Correct document level assigned",
      "Requester has authority for the requested scope",
    ],
    security: [
      "Only users with Document Control role can access this review",
      "Approval / rejection decision is audit-logged with timestamp",
      "Rejection reason is mandatory and recorded",
    ],
  },
  Revision: {
    who: "The original Requester who submitted the DCR. They are responsible for preparing the revised document files.",
    responsibilities: [
      "Download the original file (for change requests)",
      "Make the required changes in Word / Excel",
      "Generate a matching PDF version",
      "Upload both files to the system",
      "Ensure revision marks or change highlights are visible",
    ],
    checklist: [
      "Original file downloaded (change request only)",
      "All requested changes implemented",
      "Revision number / date updated in the document",
      "Change history table updated within the document",
      "PDF generated from the latest Word / Excel",
      "Both Word/Excel and PDF uploaded to system",
    ],
    security: [
      "Only the assigned requester can upload revision files",
      "File uploads are restricted to allowed types and size limits",
      "Previous versions are preserved — no overwriting",
    ],
  },
  Checker: {
    who: "A designated reviewer assigned to verify the document content. Typically a Senior Engineer, Supervisor, or Subject-Matter Expert.",
    responsibilities: [
      "Review the uploaded document for technical accuracy",
      "Verify formatting meets the IATF 16949 template standards",
      "Approve or reject the revision with feedback",
      "Ensure all required sections are complete",
    ],
    checklist: [
      "Document content is technically correct",
      "Format follows the controlled document template",
      "Revision number and date are correct",
      "Referenced standards / procedures are accurate",
      "No grammatical or typographical errors",
    ],
    security: [
      "Only users assigned as Checker for this document can review",
      "Checker cannot be the same person as the Requester",
      "Decision (approve/reject) is recorded with timestamp and user ID",
    ],
  },
  Approver: {
    who: "A senior authority such as a Department Manager, QMR (Quality Management Representative), or Plant Manager who gives final content approval.",
    responsibilities: [
      "Review the document for management-level correctness",
      "Confirm alignment with quality objectives and IATF 16949",
      "Approve or reject with comments",
      "Authorize the document for release preparation",
    ],
    checklist: [
      "Document aligns with quality policy and objectives",
      "All checker review feedback has been addressed",
      "Appropriate scope and applicability confirmed",
      "Management authorization is justified",
    ],
    security: [
      "Only users assigned as Approver for this document can approve",
      "Approver cannot be the Requester or Checker for the same request",
      "Decision is immutable once recorded in the audit trail",
    ],
  },
  "Non-Signed PDF": {
    who: "The Requester — required to upload a non-signed (clean) PDF version for Form-type documents (Level 4).",
    responsibilities: [
      "Generate a clean PDF without signatures for distribution",
      "Ensure the PDF matches the approved Word / Excel content exactly",
      "Upload the non-signed PDF to the system",
    ],
    checklist: [
      "PDF generated from the final approved Word / Excel",
      "No signature fields filled in (clean copy)",
      "Content matches the approved revision exactly",
      "File name follows naming convention",
    ],
    security: [
      "Only the assigned requester can upload this file",
      "File type restricted to PDF only",
      "This step is required only for Form-type documents",
    ],
  },
  "Final DC Release": {
    who: "Document Controller (DC) — performs the final release check before the document becomes officially controlled.",
    responsibilities: [
      "Verify all approvals are in place",
      "Confirm the PDF matches the approved content",
      "Release the document into the controlled system",
      "Reject back to Revision if discrepancies found",
    ],
    checklist: [
      "All approval steps show approved status",
      "PDF content matches the latest Word / Excel",
      "Document metadata (ID, title, level, revision) is correct",
      "Non-signed PDF uploaded (if Form type)",
      "No pending issues or open comments",
    ],
    security: [
      "Only Document Control role can perform final release",
      "Release action triggers notification to all stakeholders",
      "Released documents are locked from further edits",
      "Full audit trail recorded for compliance",
    ],
  },
  Released: {
    who: "System action — the document is now officially released and available in the Document Repository.",
    responsibilities: [
      "Document is published and visible to authorized users",
      "Previous revision is archived automatically",
      "Notification sent to relevant departments",
    ],
    checklist: [
      "Document appears in the repository under correct category",
      "Correct revision number displayed",
      "Previous revision marked as superseded",
    ],
    security: [
      "Released documents are read-only",
      "Only Document Control can initiate further changes via new DCR",
      "Access controlled by role-based permissions",
    ],
  },
  "Stored in DB": {
    who: "System action — the document and its revision data are permanently stored in the database.",
    responsibilities: [
      "All document metadata saved (ID, title, level, revision, dates)",
      "File attachments stored in secure storage",
      "Audit trail entries preserved",
    ],
    checklist: [
      "Database record created with complete metadata",
      "Files stored in the secure file system",
      "Backup included in the regular backup cycle",
    ],
    security: [
      "Database access restricted to system processes only",
      "All stored files are access-controlled",
      "Data integrity verified through checksums",
    ],
  },
  "Send Original File": {
    who: "System action — the system automatically sends the original Word/Excel file to the Requester after DC Review approval.",
    responsibilities: [
      "Retrieve the current released version of the document",
      "Deliver the original editable file to the requester",
      "Enable the requester to make changes on the correct base version",
    ],
    checklist: [
      "Correct original file version sent",
      "Requester receives download notification",
      "File matches the currently released revision",
    ],
    security: [
      "File is sent only to the authorized requester",
      "Download link is time-limited and single-use",
      "Action is logged in the audit trail",
    ],
  },
  "DC / Admin": {
    who: "Document Controller or System Admin — initiates a re-upload request when a document needs correction without a full change request cycle.",
    responsibilities: [
      "Identify the document that requires re-upload",
      "Create a re-upload request ticket",
      "Assign the requester to prepare the updated files",
    ],
    checklist: [
      "Document ID confirmed for re-upload",
      "Reason for re-upload documented",
      "Requester identified and notified",
    ],
    security: [
      "Only DC or Admin roles can initiate re-upload",
      "Re-upload bypasses DC Review but still requires Checker and Approver",
      "Action logged in audit trail",
    ],
  },
  Rejected: {
    who: "System status — the request has been rejected by Document Control and the ticket is closed.",
    responsibilities: [
      "Rejection reason is recorded and visible to the Requester",
      "Requester is notified of the rejection",
      "Requester may submit a new request if needed",
    ],
    checklist: [
      "Rejection reason clearly stated",
      "Requester has been notified",
      "Ticket status is closed — no further action possible",
    ],
    security: [
      "Rejected tickets are read-only and cannot be modified",
      "Rejection reason is part of the permanent audit trail",
      "Only a new DCR can restart the process",
    ],
  },
};

// ─── Role Info Popup ──────────────────────────────────────────────────────────
function RolePopup({
  step,
  onClose,
}: {
  step: FlowStep;
  onClose: () => void;
}) {
  const info = ROLE_INFO[step.label];
  if (!info) return null;

  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 ${BG[step.color]} rounded-t-2xl`}>
          <div className="flex items-center gap-3 text-white">
            {Icon && <Icon size={22} />}
            <div>
              <h3 className="text-base font-bold">{step.label}</h3>
              {step.sublabel && <p className="text-xs text-white/70">{step.sublabel}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* WHO */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Users size={15} className="text-indigo-500" />
              <h4 className="text-sm font-bold text-slate-800">Who holds this role?</h4>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed pl-[23px]">{info.who}</p>
          </div>

          {/* RESPONSIBILITIES */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Briefcase size={15} className="text-amber-500" />
              <h4 className="text-sm font-bold text-slate-800">Responsibilities</h4>
            </div>
            <ul className="space-y-1 pl-[23px]">
              {info.responsibilities.map((r, i) => (
                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {/* CHECKLIST */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <ListChecks size={15} className="text-emerald-500" />
              <h4 className="text-sm font-bold text-slate-800">Preparation Checklist</h4>
            </div>
            <ul className="space-y-1 pl-[23px]">
              {info.checklist.map((c, i) => (
                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                  <CheckCircle size={13} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                  {c}
                </li>
              ))}
            </ul>
          </div>

          {/* SECURITY */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldCheck size={15} className="text-blue-500" />
              <h4 className="text-sm font-bold text-slate-800">System Security</h4>
            </div>
            <ul className="space-y-1 pl-[23px]">
              {info.security.map((s, i) => (
                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Individual node renderers ────────────────────────────────────────────────
function NodeBox({ step, onClick }: { step: FlowStep; onClick?: () => void }) {
  const Icon = step.icon;
  const isEnd = step.type === "end";
  const isTerminal = step.type === "terminal-end";
  const isStart = step.type === "start";
  const isDb = step.type === "db";
  const hasInfo = Boolean(ROLE_INFO[step.label]);
  const clickable = hasInfo && onClick;
  const cursor = clickable ? "cursor-pointer hover:scale-105 hover:shadow-lg transition-all duration-150" : "";

  // DB storage node — cylinder-style with dashed border
  if (isDb) {
    return (
      <div className={`flex flex-col items-center gap-1 ${cursor}`} onClick={clickable ? onClick : undefined}>
        <div className="flex flex-col items-center justify-center w-28 h-[68px] rounded-xl border-2 border-dashed border-teal-400 bg-teal-50 shadow-sm text-center px-2 gap-1">
          {Icon && <Icon size={14} className="text-teal-600" />}
          <span className="text-xs font-bold leading-tight text-teal-800">{step.label}</span>
          <span className="text-[10px] leading-tight text-teal-600 opacity-80">{step.sublabel}</span>
        </div>
      </div>
    );
  }

  if (isEnd || isTerminal) {
    return (
      <div className={`flex flex-col items-center gap-1 ${cursor}`} onClick={clickable ? onClick : undefined}>
        <div
          className={`flex flex-col items-center justify-center w-28 h-[60px] rounded-full border-2 shadow font-bold text-xs text-white text-center px-2 ${BG[step.color]} ${BORDER[step.color]}`}
        >
          {Icon && <Icon size={14} className="mb-0.5" />}
          <span className="text-xs leading-tight">{step.label}</span>
        </div>
      </div>
    );
  }

  if (step.type === "decision") {
    return (
      <div className={`flex flex-col items-center ${cursor}`} style={{ width: 140 }} onClick={clickable ? onClick : undefined}>
        <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
          <div
            className={`absolute w-24 h-24 rounded-lg rotate-45 border-2 shadow-md ${BG[step.color]} ${BORDER[step.color]} opacity-90`}
          />
          <div className="relative z-10 flex flex-col items-center text-white text-center px-1">
            {Icon && <Icon size={14} className="mb-0.5" />}
            <span className="text-xs font-bold leading-tight">{step.label}</span>
          </div>
        </div>
        <span className="text-[10px] text-slate-500 max-w-[120px] text-center leading-tight mt-0.5">
          {step.sublabel}
        </span>
      </div>
    );
  }

  // action / start
  return (
    <div className={`flex flex-col items-center gap-1 ${cursor}`} onClick={clickable ? onClick : undefined}>
      <div
        className={`flex flex-col items-center justify-center w-28 h-[76px] rounded-xl border-2 shadow text-center px-2 gap-1 ${isStart ? `${BG[step.color]} text-white ${BORDER[step.color]}` : `${LIGHT[step.color]} border`}`}
      >
        {Icon && <Icon size={14} className={isStart ? "text-white/80" : ""} />}
        <span className="text-xs font-bold leading-tight">{step.label}</span>
        <span className={`text-[10px] leading-tight ${isStart ? "text-white/70" : "opacity-70"}`}>
          {step.sublabel}
        </span>
      </div>
      {step.note && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-300 leading-none">
          {step.note}
        </span>
      )}
    </div>
  );
}

// ─── Horizontal linear flow renderer ─────────────────────────────────────────
function FlowChart({ steps, onNodeClick }: { steps: FlowStep[]; onNodeClick: (step: FlowStep) => void }) {
  const mainPath = steps.filter((s) => s.type !== "terminal-end");
  const rejected = steps.find((s) => s.type === "terminal-end");

  const dcReviewIdx = mainPath.findIndex(
    (s) => s.type === "decision" && s.reject === rejected?.id,
  );
  const revisionIdx = mainPath.findIndex((s) => s.label === "Revision");

  // Width of each node slot
  const nodeW = (s: FlowStep) => (s.type === "decision" ? 140 : 112);
  const connW = 52; // connector strip width

  // X center of a given index in the main path
  const calcX = (index: number) => {
    let x = 0;
    for (let i = 0; i < index; i++) {
      x += nodeW(mainPath[i]) + connW;
    }
    return x + nodeW(mainPath[index]) / 2;
  };

  // All three flows use the same top padding so node Y-positions are identical.
  // The "Rejected" terminal (where present) is absolutely positioned above DC Review
  // so it NEVER displaces the flex row, keeping SVG arrow coordinates consistent.
  const flowPaddingTop = 90;
  const ROW_TOP = 160;     // SVG Y reference (matches Re-upload which looks correct)
  const REJECT_BELOW = 140; // px below ROW_TOP for the first reject-back loop line

  // Compute bottom padding to avoid clipping the deepest reject arrow
  const deepestLoopY = mainPath.reduce((max, step, idx) => {
    if (step.type !== "decision") return max;
    const rejectsBack = step.reject && steps.find((s) => s.id === step.reject)?.type !== "terminal-end";
    if (!rejectsBack || revisionIdx === -1) return max;
    const loopY = ROW_TOP + REJECT_BELOW + (idx - revisionIdx - 1) * 28;
    return Math.max(max, loopY + 30);
  }, ROW_TOP + 70);
  const containerPaddingBottom = Math.max(60, deepestLoopY - (flowPaddingTop + 140) + 80);

  const REJECTED_W = 112; // w-28 in px

  return (
    <div className="relative px-6" style={{ minWidth: "max-content", paddingBottom: containerPaddingBottom }}>
      {/* ── Absolutely positioned "Rejected" terminal above DC Review ── */}
      {rejected && dcReviewIdx !== -1 && (() => {
        const dcX = calcX(dcReviewIdx);
        const leftPx = 24 + dcX - REJECTED_W / 2; // 24 = px-6 padding
        const Icon = rejected.icon;
        return (
          <div
            className="absolute z-10 flex flex-col items-center cursor-pointer hover:scale-105 transition-all duration-150"
            style={{ left: leftPx, top: 0, width: REJECTED_W }}
            onClick={() => onNodeClick(rejected)}
          >
            <div
              className={`flex flex-col items-center justify-center w-28 h-[60px] rounded-full border-2 shadow font-bold text-xs text-white text-center px-2 ${BG[rejected.color]} ${BORDER[rejected.color]}`}
            >
              {Icon && <Icon size={14} className="mb-0.5" />}
              <span className="text-xs leading-tight">{rejected.label}</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-3 w-0.5 bg-rose-400" />
              <svg width="10" height="7" viewBox="0 0 10 7" className="text-rose-400">
                <polygon points="5,7 0,0 10,0" fill="currentColor" />
              </svg>
              <span className="text-[9px] font-bold text-rose-500 leading-none mt-0.5">✗ Reject</span>
            </div>
          </div>
        );
      })()}

      {/* ── SVG overlay: reject-back arrows below ── */}
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{ width: "100%", height: "100%", overflow: "visible" }}
      >
        <defs>
          <marker id="arr-rose" viewBox="0 0 10 10" refX="10" refY="5"
            markerWidth="5" markerHeight="5" orient="auto">
            <polygon points="0,0 10,5 0,10" fill="#f87171" />
          </marker>
        </defs>
        {mainPath.map((step, idx) => {
          if (step.type !== "decision") return null;
          const rejectsBack =
            step.reject &&
            steps.find((s) => s.id === step.reject)?.type !== "terminal-end";
          if (!rejectsBack || revisionIdx === -1) return null;

          // Add px-6 (24px) padding offset so SVG coords align with the flex row
          const fromX = calcX(idx) + 24;
          const toX = calcX(revisionIdx) + 24;
          const indexDiff = idx - revisionIdx;
          const loopY = ROW_TOP + REJECT_BELOW + (indexDiff - 1) * 28;

          return (
            <g key={`rej-${step.id}`}>
              <path
                d={`M ${fromX} ${ROW_TOP + 100} L ${fromX} ${loopY} L ${toX} ${loopY} L ${toX} ${ROW_TOP + 55}`}
                fill="none"
                stroke="#f87171"
                strokeWidth="1.5"
                strokeDasharray="4 2"
                markerEnd="url(#arr-rose)"
              />
              <rect x={fromX - 20} y={loopY - 9} width="40" height="14" rx="3" fill="white" stroke="#fca5a5" strokeWidth="0.8" />
              <text x={fromX} y={loopY + 1} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#e11d48">Reject</text>
            </g>
          );
        })}
      </svg>

      {/* ── Main horizontal flow ── */}
      <div className="flex flex-row items-center relative z-10" style={{ paddingTop: flowPaddingTop, gap: 0 }}>
        {mainPath.map((step, idx) => {
          const hasDecision = step.type === "decision";
          const isLast = idx === mainPath.length - 1;

          return (
            <React.Fragment key={step.id}>
              {/* Node */}
              <div className="relative flex flex-col items-center">
                <NodeBox step={step} onClick={() => onNodeClick(step)} />
              </div>

              {/* Horizontal connector to next node */}
              {!isLast && (
                <div className="flex flex-col items-center justify-center" style={{ width: connW }}>
                  {hasDecision ? (
                    <>
                      <span className="text-[9px] font-bold text-emerald-600 whitespace-nowrap mb-0.5">✓ Ok</span>
                      <div className="flex flex-row items-center w-full">
                        <div className="flex-1 h-0.5 bg-emerald-400" />
                        <svg width="7" height="10" viewBox="0 0 7 10" className="text-emerald-400">
                          <polygon points="7,5 0,0 0,10" fill="currentColor" />
                        </svg>
                      </div>
                    </>
                  ) : step.type === "end" ? (
                    <div className="flex flex-row items-center w-full">
                      <div className="flex-1 h-0.5 bg-teal-400" />
                      <svg width="7" height="10" viewBox="0 0 7 10" className="text-teal-400">
                        <polygon points="7,5 0,0 0,10" fill="currentColor" />
                      </svg>
                    </div>
                  ) : (
                    <div className="flex flex-row items-center w-full">
                      <div className="flex-1 h-0.5 bg-slate-300" />
                      <svg width="7" height="10" viewBox="0 0 7 10" className="text-slate-400">
                        <polygon points="7,5 0,0 0,10" fill="currentColor" />
                      </svg>
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
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
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"new" | "change" | "reup">("new");
  const [popupStep, setPopupStep] = useState<FlowStep | null>(null);
  const current = TABS.find((t) => t.key === activeTab)!;

  return (
    <div className="space-y-4">
      {/* Role info popup */}
      {popupStep && ROLE_INFO[popupStep.label] && (
        <RolePopup step={popupStep} onClose={() => setPopupStep(null)} />
      )}
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <GitPullRequest size={20} className="text-indigo-500" /> Workflow for Document Control
          </h1>
          <p className="text-slate-400 text-[11px] mt-0">
            Visual representation of the document control workflows.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* IATF Diagram Button */}
          <button
            onClick={() => navigate('/flowchart/iatf-diagram')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-semibold shadow-md hover:shadow-lg hover:scale-[1.02] transition-all duration-200"
          >
            <ShieldCheck size={16} />
            IATF Diagram
          </button>
          {/* High-Level Data Flow Diagram Button */}
          <button
            onClick={() => navigate('/flowchart/data-flow')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold shadow-md hover:shadow-lg hover:scale-[1.02] transition-all duration-200"
          >
            <Briefcase size={16} />
            Data Flow Diagram
          </button>
        </div>
      </div>

      {/* Status Flow Strip — muted reference legend */}
      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-2">
          Status Flow
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {statusFlow.map((s, i) => (
            <React.Fragment key={s.label}>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 px-2 py-0.5 rounded-full bg-white border border-slate-200">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.color}`} />
                {s.label}
              </span>
              {i < statusFlow.length - 1 && (
                <svg width="10" height="8" viewBox="0 0 14 10" className="text-slate-300 flex-shrink-0">
                  <polygon points="14,5 0,0 0,10" fill="currentColor" />
                </svg>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Flowchart panel (full width) — primary focus ─────────────── */}
      <div className="bg-white border-2 border-indigo-200 rounded-xl shadow-lg overflow-hidden">
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

        {/* Flow diagram — zoom-to-fit, centered */}
        <div className="p-4 overflow-x-auto">
          <p className="text-[10px] text-slate-400 text-center mb-2 italic">Click any step to see role details, responsibilities, checklist & security info</p>
          <div style={{ zoom: 0.85, display: "table", margin: "0 auto" }}>
            <FlowChart steps={current.steps} onNodeClick={setPopupStep} />
          </div>
        </div>
      </div>

      {/* ── Bottom row: Legend + Levels + Notes ──────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* Shape Legend */}
        <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Shape Legend</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-indigo-600 border border-indigo-400 flex-shrink-0" />
              <span className="text-[10px] text-slate-700">Start</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-amber-100 border border-amber-300 flex-shrink-0" />
              <span className="text-[10px] text-slate-700">Process</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rotate-45 rounded-sm bg-violet-600 border border-violet-400 flex-shrink-0" />
              <span className="text-[10px] text-slate-700">Decision</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full bg-emerald-600 border border-emerald-400 flex-shrink-0" />
              <span className="text-[10px] text-slate-700">Released</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full bg-rose-600 border border-rose-400 flex-shrink-0" />
              <span className="text-[10px] text-slate-700">Rejected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded border border-dashed border-teal-400 bg-teal-50 flex-shrink-0" />
              <span className="text-[10px] text-slate-700">Stored in DB</span>
            </div>
          </div>
          <div className="mt-2 flex gap-3">
            <div className="flex items-center gap-1">
              <div className="h-0.5 w-5 bg-emerald-400" />
              <svg width="5" height="7" viewBox="0 0 7 10" className="text-emerald-400"><polygon points="7,5 0,0 0,10" fill="currentColor" /></svg>
              <span className="text-[9px] text-slate-600">Approve</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-0.5 w-5 bg-rose-400" style={{ borderTop: "1.5px dashed #f87171", background: "none" }} />
              <svg width="5" height="7" viewBox="0 0 7 10" className="text-rose-400"><polygon points="7,5 0,0 0,10" fill="currentColor" /></svg>
              <span className="text-[9px] text-slate-600">Reject</span>
            </div>
          </div>
        </div>

        {/* Document Levels */}
        <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Document Levels</p>
          <div className="space-y-1">
            {levelRules.map((r) => (
              <div key={r.level} className="flex gap-1.5">
                <span className="font-bold text-indigo-700 w-12 flex-shrink-0 text-[10px]">{r.level}</span>
                <span className="text-slate-600 text-[10px] leading-relaxed">{r.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Key Notes */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 shadow-sm">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
            <Star size={10} /> Key Notes
          </p>
          <ul className="space-y-0.5 text-[10px] text-slate-600 list-disc list-inside">
            <li>All rejections from Checker/Approver/DC return to <strong>Revision</strong>.</li>
            <li>DC Review rejection closes the ticket permanently.</li>
            <li>After DC Review approves, the <strong>system automatically sends</strong> the original file to requester.</li>
            <li><strong>Non-Signed PDF is required for Form documents only.</strong></li>
            <li>Re-upload skips DC Review — goes directly to Revision.</li>
            <li>After release, document &amp; revision are <strong>stored in DB</strong>.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
