// pages/PowertrainPlan.tsx
import React from 'react';
import { Cog, Construction } from 'lucide-react';

export default function PowertrainPlan() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Cog size={24} className="text-indigo-600" />
          Test Equipment Planning — Powertrain
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Planning and tracking of powertrain test equipment
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 flex flex-col items-center justify-center text-center gap-4">
        <div className="p-5 rounded-full bg-indigo-50">
          <Construction size={40} className="text-indigo-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-700">Module Coming Soon</h2>
        <p className="text-slate-400 text-sm max-w-md">
          This module will cover test equipment planning, scheduling and tracking
          for the Powertrain product line.
        </p>
      </div>
    </div>
  );
}
