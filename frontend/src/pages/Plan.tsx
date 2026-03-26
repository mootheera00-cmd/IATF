import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck2, Wrench, Gauge, Building2, Users, ArrowUpRight, ArrowRight, History as HistoryIcon } from 'lucide-react';

const planButtons = [
  {
    id: 'hub-test-equipment',
    label: 'HUB Equipment Plan',
    icon: CalendarCheck2,
    imageIcon: '🛞',
    imageAlt: 'Car tire',
    href: '/plan-hub/',
    external: true,
  },
  {
    id: 'powertrain-test-equipment',
    label: 'Powertrain Equipment Plan',
    icon: Wrench,
    imageIcon: '⚙️',
    imageAlt: 'Engine',
    href: '/plan-pt/',
    external: true,
  },
  {
    id: 'calibration-instruments',
    label: 'Calibration Plan',
    icon: Gauge,
    imageSrc: '/icons/weighing-scale.svg',
    imageAlt: 'Weighing scale',
    to: '/plan/calibration',
    badge: 'IATF 7.1.5',
    historyTo: '/plan/calibration/history',
    historyLabel: 'Cal. History',
  },
  {
    id: 'inhouse-calibration',
    label: 'In-House Calibration Planning',
    icon: Building2,
    to: '/plan/inhouse-calibration',
    badge: 'IATF 7.1.5',
    historyTo: '/plan/inhouse-calibration/history',
    historyLabel: 'In-House Cal. History',
  },
  {
    id: 'maintenance',
    label: 'Maintenance Planning',
    icon: Wrench,
    imageIcon: '🔧',
    imageAlt: 'Wrench',
    to: '/plan/maintenance',
    badge: 'IATF 7.1.3',
    historyTo: '/plan/maintenance/history',
    historyLabel: 'Maint. History',
  },
  {
    id: 'employee-training',
    label: 'Employee Training Plan',
    icon: Users,
    to: '/plan/training',
    badge: 'IATF 7.2',
  },
];

export default function Plan() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><CalendarCheck2 size={20} className="text-indigo-500" /> Plan</h1>
        <p className="text-slate-600 mt-2">Select a planning module.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {planButtons.map((item) => {
          const Icon = item.icon;

          const inner = (
            <>
              {/* Badge */}
              {item.badge && (
                <span className="absolute top-4 left-4 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-md">
                  {item.badge}
                </span>
              )}
              {item.external && (
                <span className="absolute top-4 right-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-md">
                  Open
                  <ArrowUpRight size={12} />
                </span>
              )}
              {item.to && (
                <span className="absolute top-4 right-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md">
                  View
                  <ArrowRight size={12} />
                </span>
              )}

              <div className="flex h-full flex-col items-center justify-center gap-5">
                <div className="p-4 rounded-xl bg-indigo-50 text-indigo-600">
                  {item.imageSrc ? (
                    <img src={item.imageSrc} alt={item.imageAlt || 'Icon'} className="w-9 h-9" />
                  ) : item.imageIcon ? (
                    <span className="text-4xl leading-none" role="img" aria-label={item.imageAlt || 'Icon'}>
                      {item.imageIcon}
                    </span>
                  ) : (
                    <Icon size={34} />
                  )}
                </div>
                <h2 className="text-lg font-bold text-slate-900 leading-snug group-hover:text-indigo-700 transition-colors">
                  {item.label}
                </h2>
              </div>
            </>
          );

          const baseClass =
            'group relative text-center bg-white border border-slate-200 rounded-2xl p-8 min-h-[190px] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300';

          const card = item.to ? (
            <Link key={`${item.id}-card`} to={item.to} className={baseClass}>
              {inner}
            </Link>
          ) : (
            <button
              key={`${item.id}-card`}
              type="button"
              onClick={() => {
                if (item.href) {
                  window.open(item.href, '_blank', 'noopener,noreferrer');
                }
              }}
              className={baseClass}
            >
              {inner}
            </button>
          );

          if (item.historyTo) {
            return (
              <div key={item.id} className="flex flex-col gap-2">
                {card}
                <Link
                  to={item.historyTo}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 bg-white border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all duration-200 shadow-sm"
                >
                  <HistoryIcon size={13} />
                  {item.historyLabel || 'History'}
                </Link>
              </div>
            );
          }

          return <React.Fragment key={item.id}>{card}</React.Fragment>;
        })}
      </div>
    </div>
  );
}
