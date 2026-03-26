import React from 'react';
import { ArrowUpRight, Briefcase, FileText } from 'lucide-react';

const reportButtons = [
  {
    id: 'work-log-management',
    label: 'Work Log Management',
    description: 'Open Work Log Management system',
    icon: Briefcase,
    href: 'http://aptc150-096.asia.ad.nsk.com/signin.php'
  },
  {
    id: 'report',
    label: 'Report',
    description: 'Open Report program',
    icon: FileText,
    href: '/report/apxt'
  }
];

export default function Report() {
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><FileText size={20} className="text-indigo-500" /> Report</h1>
          <p className="text-slate-600 mt-2">IATF 16949 quality system overview and reports.</p>
        </div>
      </div>

      {/* Report Buttons */}
      <div>
        <h2 className="text-lg font-semibold text-slate-700 mb-4">External Reports</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {reportButtons.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => window.open(item.href, '_blank', 'noopener,noreferrer')}
                className="group relative text-center bg-white border border-slate-200 rounded-2xl p-8 min-h-[190px] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <span className="absolute top-4 right-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-md">
                  Open
                  <ArrowUpRight size={12} />
                </span>

                <div className="flex h-full flex-col items-center justify-center gap-4">
                  <div className="p-4 rounded-xl bg-indigo-50 text-indigo-600">
                    <Icon size={34} />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 leading-snug group-hover:text-indigo-700 transition-colors">
                    {item.label}
                  </h2>
                  <p className="text-sm text-slate-500">{item.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}