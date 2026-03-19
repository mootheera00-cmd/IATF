import React from 'react';
import { Check, Activity, Clock } from 'lucide-react';

interface StepAuditEntry {
  stage?: string;
  status?: string;
  actor_name?: string;
  created_at?: string;
  comments?: string;
}

interface DCRStepperProps {
  currentStatus?: string;
  history?: StepAuditEntry[];
}

export default function DCRStepper({ currentStatus, history = [] }: DCRStepperProps) {
  const steps = [
    { id: 1, label: 'Submit Request', statusKey: ['Draft', 'Submitted'] },
    { id: 2, label: 'Pending DC Review', statusKey: ['Pending DC Review'] },
    { id: 3, label: 'Pending Revision', statusKey: ['Pending Revision', 'Returned for Revision'] },
    { id: 4, label: 'Pending Checker', statusKey: ['Pending Checker'] },
  { id: 5, label: 'Pending Approver', statusKey: ['Pending Approval', 'Pending Approver'] },
  { id: 6, label: 'Pending Non-Sign PDF', statusKey: ['Pending Non-Sign PDF'] },
  { id: 7, label: 'Pending Final DC Release', statusKey: ['Pending Final DC Release'] },
  { id: 8, label: 'Released', statusKey: ['Released', 'Approved', 'Effective'] },
  ];

  const getStepStatus = (step: (typeof steps)[number], index: number) => {
    const currentStepIndex = steps.findIndex(s => s.statusKey.includes(currentStatus || ''));
    const isFinalStep = index === steps.length - 1;
  const isFinalStatus = ['Released', 'Approved', 'Effective'].includes(currentStatus || '');

  if (currentStatus === 'Rejected' || currentStatus === 'Closed') return 'error';

    if (currentStepIndex === -1) {
      return 'pending';
    }

    if (index < currentStepIndex) return 'completed';
    if (index === currentStepIndex) {
      if (isFinalStep && isFinalStatus) return 'completed';
      return 'current';
    }
    return 'pending';
  };

  const getStepAudit = (step: (typeof steps)[number]) => {
    return history.find(h => h.stage === step.label || h.status === step.statusKey[0]) || null;
  };

  return (
    <div className="w-full bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-6">Workflow Progress</h3>
      <div className="flex items-center justify-between relative px-4">
        {/* Connecting Line Background */}
        <div className="absolute top-[26px] left-0 w-full h-1 bg-slate-100 -z-10" />

        {steps.map((step, index) => {
          const status = getStepStatus(step, index);
          const isLast = index === steps.length - 1;
          const audit = getStepAudit(step);

          let circleClass = 'bg-slate-100 text-slate-400 border-slate-300';

          if (status === 'completed') {
            circleClass = 'bg-emerald-600 text-white border-emerald-600';
          } else if (status === 'current') {
            circleClass = 'bg-blue-600 text-white border-blue-600 shadow-[0_0_0_4px_rgba(37,99,235,0.2)]';
          } else if (status === 'error') {
             circleClass = 'bg-red-600 text-white border-red-600';
          }

          return (
            <div key={step.id} className="flex-1 relative group">
               {/* Step Node */}
               <div className="relative flex flex-col items-center z-10">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all duration-200 ${circleClass}`}>
                    {status === 'completed' ? <Check className="w-6 h-6" /> :
                     status === 'current' ? <Activity className="w-6 h-6 animate-pulse" /> :
                     <span className="text-lg font-mono font-bold">{index + 1}</span>}
                  </div>

                  {/* Labels */}
                  <div className="mt-3 text-center">
                    <p className={`text-sm font-bold ${status === 'current' ? 'text-blue-700' : status === 'completed' ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {step.label}
                    </p>
                    {audit && (
                      <div className="text-xs text-slate-500 mt-1">
                        <p>{audit.actor_name || 'System'}</p>
                        <p className="font-mono text-[10px]">{new Date(audit.created_at || '').toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>

                  {/* Hover Tooltip */}
                  {audit && (
                    <div className="absolute top-16 mt-6 w-56 p-3 bg-slate-800 text-white text-xs rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      <div className="font-bold mb-1">{step.label}</div>
                      <div className="grid grid-cols-[50px_1fr] gap-1">
                        <span className="text-slate-400">By:</span> <span>{audit.actor_name}</span>
                        <span className="text-slate-400">Date:</span> <span>{new Date(audit.created_at || '').toLocaleString()}</span>
                        {audit.comments && (
                          <>
                           <span className="text-slate-400">Note:</span> <span className="italic">"{audit.comments}"</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
               </div>

               {/* Connector Line */}
               {!isLast && (
                  <div className={`absolute top-[26px] left-[50%] w-full h-1 -z-10 ${status === 'completed' ? 'bg-emerald-500' : 'bg-slate-100'}`} />
               )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
