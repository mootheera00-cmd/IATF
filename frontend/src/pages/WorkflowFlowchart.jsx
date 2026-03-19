import React from 'react';
import {
  ArrowDown,
  Bell,
  GitPullRequest,
} from 'lucide-react';

const flowSteps = [
  {
    step: 'Step 1',
    title: 'Requester creates New Document Registration',
    detail: 'When Engineer, Leader, Assistant, and Manager click Request New Document Registration: select Category, type Document No. (system suggests existing numbers by selected Category and allows selecting before full typing), fill Document Name, fill Short Reason, then click Register New Document.',
    icon: GitPullRequest,
  },
  {
    step: 'Step 2',
    title: 'Registration Request sent to Document Controller',
    detail: 'System sends notification in the program and to Document Controller email. Document Controller reads the registration reason and sees two buttons: Reject and Approve.',
    icon: Bell,
  },
];

const levelRules = [
  'Level 1: Quality Manual',
  'Level 2: Procedure',
  'Level 3: Work Instruction, Support Document, Outside Document, Operation Standard',
  'Level 4: Form, Report',
];

export default function WorkflowFlowchart() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">New Document Registration Flowchart</h1>
        <p className="text-slate-600 mt-2">2-step registration request flow: requester submission and Document Controller intake.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="hidden lg:grid grid-cols-3 gap-4">
          {flowSteps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.step} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600 mt-0.5">
                    <Icon size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">{step.step}</p>
                    <h3 className="font-bold text-slate-900 text-sm mt-1">{step.title}</h3>
                    <p className="text-xs text-slate-600 mt-2 leading-5">{step.detail}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="lg:hidden space-y-3">
          {flowSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <React.Fragment key={step.step}>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600 mt-0.5">
                      <Icon size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">{step.step}</p>
                      <h3 className="font-bold text-slate-900 text-sm mt-1">{step.title}</h3>
                      <p className="text-xs text-slate-600 mt-2 leading-5">{step.detail}</p>
                    </div>
                  </div>
                </div>
                {index < flowSteps.length - 1 && (
                  <div className="flex justify-center">
                    <ArrowDown className="text-slate-400" size={18} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="mt-6 border-t border-slate-200 pt-6">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Level & Publish Rules</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {levelRules.map((rule) => (
              <div key={rule} className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                {rule}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600 mt-3">
            All actions must be recorded in the Change Requests page using the existing table structure. Published view must show PDF only and apply Master ID watermark except Category/Form documents.
          </p>
        </div>
      </div>
    </div>
  );
}
