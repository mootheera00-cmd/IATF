import React, { useEffect, useMemo, useState } from 'react';
import { adminAPI } from '../api';
import { RefreshCw, ArrowUpDown, Search, Shield } from 'lucide-react';

interface LogItem {
  id: number | string;
  entity_type?: string;
  entity_id?: number | string;
  action?: string;
  actor_name?: string;
  created_at?: string;
  metadata?: string;
}

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Date' },
  { value: 'action', label: 'Action' },
  { value: 'entity_type', label: 'Entity' },
  { value: 'actor_name', label: 'Actor' }
];

// Human-readable action labels
const ACTION_LABELS: Record<string, string> = {
  LOGIN: '🔑 Login',
  LOGOUT: '🚪 Logout',
  USER_CREATED: '👤 User Created',
  USER_UPDATED: '✏️ User Updated',
  USER_DELETED: '🗑️ User Deleted',
  CR_CREATED: '📝 Ticket Created',
  CR_NEW_DOC_CREATED: '📄 New Doc Ticket',
  CR_REUPLOAD_CREATED: '🔄 Re-upload Ticket',
  CR_SUBMITTED: '📤 Ticket Submitted',
  CR_DECISION_APPROVE: '✅ Approved (Gate A)',
  CR_DECISION_REJECT: '❌ Rejected (Gate A)',
  CR_REVIEW_APPROVE: '✅ Approved (Gate B)',
  CR_REVIEW_REJECT: '❌ Rejected (Gate B)',
  CR_REVIEW_RETURN: '↩️ Returned',
  CR_FILES_UPLOADED: '📎 Files Uploaded',
  CR_NON_SIGNED_PDF_UPLOADED: '📎 Non-Signed PDF Uploaded',
  CR_CLOSED: '🔒 Ticket Closed',
  CR_DELETE_REQUESTED: '🗑️ Delete Requested',
  CR_DELETE_APPROVED: '🗑️ Delete Approved',
  SYSTEM_WIPE: '⚠️ System Wipe',
  FILE_ACCESS_SUCCESS: '👁️ File Viewed',
  FILE_ACCESS_DENIED: '🚫 File Access Denied',
  ASSIGN_ROLE: '🏷️ Role Assigned',
};

const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'bg-blue-50 text-blue-700',
  LOGOUT: 'bg-slate-50 text-slate-600',
  USER_CREATED: 'bg-teal-50 text-teal-700',
  USER_UPDATED: 'bg-amber-50 text-amber-700',
  USER_DELETED: 'bg-red-50 text-red-700',
  CR_SUBMITTED: 'bg-indigo-50 text-indigo-700',
  CR_DECISION_APPROVE: 'bg-emerald-50 text-emerald-700',
  CR_REVIEW_APPROVE: 'bg-emerald-50 text-emerald-700',
  CR_DECISION_REJECT: 'bg-red-50 text-red-700',
  CR_REVIEW_REJECT: 'bg-red-50 text-red-700',
  CR_REVIEW_RETURN: 'bg-orange-50 text-orange-700',
  CR_CLOSED: 'bg-slate-100 text-slate-600',
  CR_DELETE_APPROVED: 'bg-red-100 text-red-800',
  SYSTEM_WIPE: 'bg-red-200 text-red-900',
};

export default function Logs() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [actorFilter, setActorFilter] = useState('ALL');
  const [limit, setLimit] = useState('500');

  const getActionLabel = (action?: string) => {
    const a = String(action || '');
    return ACTION_LABELS[a] || a;
  };

  const getActionColorClass = (action?: string) => {
    const a = String(action || '');
    return ACTION_COLORS[a] || 'bg-indigo-50 text-indigo-700';
  };

  const getChangeRequestActionLabel = (log: any) => {
    const action = String(log.action || '').toUpperCase();
    if (action.includes('REUPLOAD')) return 'Re-upload';
    if (action.includes('CREATE_NEW_DOCUMENT') || action.includes('NEW_DOC')) return 'Create';
    if (action.includes('CREATE_NEW') || action.includes('CREATED')) return 'Change';
    if (action.includes('CREATE')) return 'Change';
    return 'Change';
  };

  const getEntityFilterLabel = (log: any) => {
    if (log.entity_type === 'ChangeRequest') {
      return `TICKET ${getChangeRequestActionLabel(log)}`;
    }
    return String(log.entity_type || '-');
  };

  const getEntityLabel = (log: any) => {
    if (log.entity_type === 'ChangeRequest' && log.entity_id) {
      const actionLabel = getChangeRequestActionLabel(log);
      return `TICKET #${log.entity_id} ${actionLabel}`;
    }
    return `${log.entity_type || '-'}${log.entity_id ? ` #${log.entity_id}` : ''}`;
  };

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError('');
  const response = await adminAPI.getLogs({ sort: sortBy, order: sortOrder, limit: Number(limit) || undefined });
      setLogs(response.data?.logs || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [sortBy, sortOrder, limit]);

  const parsedLogs = useMemo(() => {
    return logs.map((log) => {
      let metadata: any = null;
      try {
        metadata = log.metadata ? JSON.parse(log.metadata) : null;
      } catch {
        metadata = log.metadata;
      }
      return { ...log, metadata };
    });
  }, [logs]);

  const filterOptions = useMemo(() => {
    const entities = new Set<string>();
    const actions = new Set<string>();
    const actors = new Set<string>();

    parsedLogs.forEach((log) => {
      entities.add(getEntityFilterLabel(log));
      if (log.action) actions.add(String(log.action));
      if (log.actor_name) actors.add(String(log.actor_name));
    });

    return {
      entities: Array.from(entities).sort(),
      actions: Array.from(actions).sort(),
      actors: Array.from(actors).sort()
    };
  }, [parsedLogs]);

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const normalize = (value?: string) => String(value || '').trim().toLowerCase();
    const entityNeedle = entityFilter === 'ALL' ? null : normalize(entityFilter);
    const actionNeedle = actionFilter === 'ALL' ? null : normalize(actionFilter);
    const actorNeedle = actorFilter === 'ALL' ? null : normalize(actorFilter);

    return parsedLogs.filter((log) => {
      if (entityNeedle && normalize(getEntityFilterLabel(log)) !== entityNeedle) return false;
      if (actionNeedle && normalize(log.action) !== actionNeedle) return false;
      if (actorNeedle && normalize(log.actor_name) !== actorNeedle) return false;

      if (!query) return true;
      const metadataText = log.metadata
        ? typeof log.metadata === 'string'
          ? log.metadata
          : JSON.stringify(log.metadata)
        : '';
      const haystack = [
        getEntityLabel(log),
        log.action,
        log.actor_name,
        log.created_at,
        metadataText
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [parsedLogs, searchQuery, entityFilter, actionFilter, actorFilter]);

  const resetFilters = () => {
    setSearchQuery('');
    setEntityFilter('ALL');
    setActionFilter('ALL');
    setActorFilter('ALL');
  };

  const renderMetadata = (metadata: any) => {
    if (!metadata) return <span className="text-slate-400">-</span>;
    if (typeof metadata === 'string') return <span>{metadata}</span>;
    if (typeof metadata !== 'object') return <span>{String(metadata)}</span>;

    return (
      <div className="space-y-1 text-xs text-slate-600">
        {Object.entries(metadata).map(([key, value]) => (
          <div key={key} className="flex flex-wrap gap-2">
            <span className="font-semibold text-slate-700">{key}:</span>
            <span>
              {value === null || typeof value === 'undefined'
                ? '-'
                : typeof value === 'object'
                  ? JSON.stringify(value)
                  : typeof value === 'bigint'
                    ? value.toString()
                    : String(value)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="h-7 w-7 text-indigo-600" /> Audit Trail
          </h1>
          <p className="text-slate-600">All system events logged for IATF compliance.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <ArrowUpDown className="h-4 w-4 text-slate-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-700 outline-none"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
              className="bg-transparent text-sm font-semibold text-slate-700 outline-none"
            >
              <option value="desc">Newest</option>
              <option value="asc">Oldest</option>
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <select
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-700 outline-none"
            >
              <option value="100">Latest 100</option>
              <option value="200">Latest 200</option>
              <option value="500">Latest 500</option>
              <option value="1000">Latest 1,000</option>
              <option value="9999">All</option>
            </select>
          </div>
          <button
            type="button"
            onClick={loadLogs}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-3 lg:grid-cols-4">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 lg:col-span-2">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search action, actor, entity, metadata..."
            className="w-full bg-transparent text-sm text-slate-700 outline-none"
          />
        </div>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          <option value="ALL">All Entities</option>
          {filterOptions.entities.map((entity) => (
            <option key={entity} value={entity}>{entity}</option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          <option value="ALL">All Actions</option>
          {filterOptions.actions.map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>
        <select
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          <option value="ALL">All Actors</option>
          {filterOptions.actors.map((actor) => (
            <option key={actor} value={actor}>{actor}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={resetFilters}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Clear Filters
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          <span>Showing <strong className="text-slate-700">{filteredLogs.length}</strong> of <strong className="text-slate-700">{parsedLogs.length}</strong> events</span>
        </div>
        <div className="table-wrap">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading logs...</td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No logs found.</td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                        {log.actor_name || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${getActionColorClass(log.action)}`}>
                        {getActionLabel(log.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        {getEntityLabel(log)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {renderMetadata(log.metadata)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
