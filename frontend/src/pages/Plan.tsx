import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck2, Wrench, Gauge, Building2, Users, ArrowUpRight, ArrowRight } from 'lucide-react';

const planButtons = [
  {
    id: 'hub-test-equipment',
    label: 'Test Equipment Planning of HUB',
    icon: CalendarCheck2,
    imageIcon: '🛞',
    imageAlt: 'Car tire',
    href: '/plan-hub/',
    external: true,
  },
  {
    id: 'powertrain-test-equipment',
    label: 'Test Equipment Planning of Powertrain',
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
  },
  {
    id: 'inhouse-calibration',
    label: 'In-House Calibration Planning',
    icon: Building2,
    to: '/plan/inhouse-calibration',
    badge: 'IATF 7.1.5',
  },
  {
    id: 'maintenance',
    label: 'Maintenance Planning',
    icon: Wrench,
    imageIcon: '🔧',
    imageAlt: 'Wrench',
    to: '/plan/maintenance',
    badge: 'IATF 7.1.3',
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
        <h1 className="text-3xl font-bold text-slate-900">Plan</h1>
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

          if (item.to) {
            return (
              <Link key={item.id} to={item.to} className={baseClass}>
                {inner}
              </Link>
            );
          }

          return (
            <button
              key={item.id}
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
        })}
      </div>
    </div>
  );
}
