// pages/Quality.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, ArrowRight } from 'lucide-react';

const qualityModules = [
  {
    id: 'msa',
    label: 'MSA',
    description: 'Measurement System Analysis — gauge R&R, bias, linearity & stability studies.',
    icon: FlaskConical,
    emoji: '📏',
    to: '/quality/msa',
    badge: 'IATF 7.1.5.1',
  },
];

export default function Quality() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><FlaskConical size={20} className="text-indigo-500" /> Quality</h1>
        <p className="text-slate-600 mt-2">Select a quality module.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {qualityModules.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              to={item.to}
              className="group relative text-center bg-white border border-slate-200 rounded-2xl p-8 min-h-[190px] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              {item.badge && (
                <span className="absolute top-4 left-4 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-md">
                  {item.badge}
                </span>
              )}
              <span className="absolute top-4 right-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md">
                View <ArrowRight size={12} />
              </span>
              <div className="flex h-full flex-col items-center justify-center gap-5">
                <div className="p-4 rounded-xl bg-indigo-50 text-indigo-600">
                  <span className="text-4xl leading-none" role="img" aria-label={item.label}>
                    {item.emoji}
                  </span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                    {item.label}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1 leading-snug">{item.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
