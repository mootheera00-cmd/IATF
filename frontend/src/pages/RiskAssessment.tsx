// pages/RiskAssessment.tsx
import React from 'react';
import { ShieldAlert, Construction } from 'lucide-react';
import DocControlSection from '../components/DocControlSection';

export default function RiskAssessment() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert size={24} className="text-orange-500" />
          Risk Assessment
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Workplace hazard identification, risk evaluation and control measures
        </p>
      </div>

      {/* Coming-soon placeholder */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-center gap-3">
        <div className="p-4 rounded-full bg-orange-50">
          <Construction size={36} className="text-orange-400" />
        </div>
        <h2 className="text-lg font-bold text-slate-700">Risk Assessment Module — Coming Soon</h2>
        <p className="text-slate-400 text-sm max-w-md">
          Hazard identification, risk scoring (likelihood × severity), control measures and
          risk register management aligned with ISO 45001.
        </p>
      </div>

      {/* Controlled documents & DCR section */}
      <DocControlSection
        label="Risk Assessment"
        filterKeywords={['risk', 'hazard', 'safety', 'iso 45001', 'risk assessment']}
        accent="orange"
      />
    </div>
  );
}
