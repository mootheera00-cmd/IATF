// pages/MSA.tsx
import React from 'react';
import { FlaskConical, Construction } from 'lucide-react';
import DocControlSection from '../components/DocControlSection';

export default function MSA() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FlaskConical size={24} className="text-indigo-600" />
          Measurement System Analysis (MSA)
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          IATF 16949 — Clause 7.1.5.1 Measurement System Analysis
        </p>
      </div>

      {/* Coming-soon placeholder */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-center gap-3">
        <div className="p-4 rounded-full bg-indigo-50">
          <Construction size={36} className="text-indigo-400" />
        </div>
        <h2 className="text-lg font-bold text-slate-700">MSA Module — Coming Soon</h2>
        <p className="text-slate-400 text-sm max-w-md">
          Gauge R&amp;R studies, bias analysis, linearity, stability tracking and acceptance
          criteria per IATF 16949 Clause 7.1.5.1.
        </p>
      </div>

      {/* Controlled documents & DCR section */}
      <DocControlSection
        label="MSA"
        filterKeywords={['msa', 'measurement system', 'gauge', 'gage', 'r&r', 'linearity', 'bias', '7.1.5']}
        accent="indigo"
        extraNewCategories={[
          {
            category: 'MSA',
            subCategories: ['Gauge R&R', 'Bias', 'Linearity', 'Stability', 'Attribute MSA'],
          },
        ]}
      />
    </div>
  );
}
