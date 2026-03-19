import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Workflow, BarChart3, FileText, ArrowRight } from 'lucide-react';

export default function Flowchart() {
  const navigate = useNavigate();

  const categories = [
    {
      id: 'workflow',
      title: 'Workflow',
      description: 'Business process flows and operational diagrams',
      icon: Workflow,
      path: '/flowchart/workflow',
      styles: {
        blob: 'bg-blue-50',
        icon: 'bg-blue-50 text-blue-600',
        cta: 'group-hover:bg-blue-600 group-hover:text-white'
      }
    },
    {
      id: 'kpi',
      title: 'KPI',
      description: 'Key Performance Indicators and metrics visualization',
      icon: BarChart3,
      path: '/flowchart/kpi',
      styles: {
        blob: 'bg-green-50',
        icon: 'bg-green-50 text-green-600',
        cta: 'group-hover:bg-green-600 group-hover:text-white'
      }
    },
    {
      id: 'procedure',
      title: 'Procedure',
      description: 'Standard Operating Procedures (SOPs) and guidelines',
      icon: FileText,
      path: '/flowchart/procedure',
      styles: {
        blob: 'bg-purple-50',
        icon: 'bg-purple-50 text-purple-600',
        cta: 'group-hover:bg-purple-600 group-hover:text-white'
      }
    }
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Process Visualization</h1>
        <p className="text-slate-600 mt-2">Select a category to view detailed flowcharts, metrics, and procedures.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <button
              key={category.id}
              className="group flex flex-col items-center text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 relative overflow-hidden"
              onClick={() => navigate(category.path)}
            >
              {/* Decorative Background Blob */}
              <div className={`absolute top-0 right-0 w-32 h-32 ${category.styles.blob} rounded-bl-full -mr-8 -mt-8 opacity-50 group-hover:scale-110 transition-transform`}></div>

              <div className={`p-6 rounded-full ${category.styles.icon} mb-6 group-hover:scale-110 transition-transform duration-300`}>
                <Icon size={48} strokeWidth={1.5} />
              </div>
              
              <h2 className="text-2xl font-bold text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors">
                {category.title}
              </h2>
              
              <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                {category.description}
              </p>

              <div className={`mt-auto px-6 py-2 rounded-full text-sm font-semibold bg-slate-50 text-slate-600 ${category.styles.cta} transition-all flex items-center gap-2`}>
                View Details <ArrowRight size={16} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
