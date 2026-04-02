import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Lock, AlertTriangle, Folder, Download } from 'lucide-react';
import axios from 'axios';

interface CustomButton {
  id: number;
  label: string;
  path: string;
}

const API_URL = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

const defaultButtons = [
  { id: 'abnormal', label: 'Abnormal Situations Record', path: '/other/abnormal-situations', active: true },
];

const colorMap: Record<string, string> = {
  abnormal: 'from-amber-500 to-orange-600',
};

const customColors = [
  'from-teal-500 to-emerald-600', 'from-violet-500 to-purple-600',
  'from-cyan-500 to-blue-600', 'from-rose-500 to-pink-600',
  'from-lime-500 to-green-600', 'from-fuchsia-500 to-pink-600',
];

/** Returns true for Windows absolute paths like G:\... or G:/... or \\server\share */
const isFolderPath = (p: string) => /^([A-Za-z][:/\\]|\\\\)/.test(p);

export default function OtherPage() {
  const navigate = useNavigate();
  const [customButtons, setCustomButtons] = useState<CustomButton[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newPath, setNewPath] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [showSetupInfo, setShowSetupInfo] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/shared-buttons`, authHeaders())
      .then(r => setCustomButtons(r.data))
      .catch(() => {});
  }, []);

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    try {
      const res = await axios.post(`${API_URL}/shared-buttons`, {
        label: newLabel.trim(),
        path: newPath.trim() || '',
      }, authHeaders());
      setCustomButtons(prev => [...prev, res.data]);
      setNewLabel('');
      setNewPath('');
      setShowAddModal(false);
    } catch { /* ignore */ }
  };

  const handleRemove = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/shared-buttons/${id}`, authHeaders());
      setCustomButtons(prev => prev.filter(b => b.id !== id));
    } catch { /* ignore */ }
    setConfirmDeleteId(null);
  };

  const handleButtonClick = async (btnPath: string) => {
    if (!btnPath) return;
    if (isFolderPath(btnPath)) {
      // Use custom openfolder: protocol to open Explorer on the user's own PC
      // Requires one-time setup (see Setup button)
      window.location.href = 'openfolder:' + btnPath;
    } else {
      navigate(btnPath);
    }
  };

  const BTN_HEIGHT = 'h-28';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Other</h1>
        <p className="text-sm text-slate-500 mt-1">Additional tools and records</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {defaultButtons.map(btn => (
          <button key={btn.id} onClick={() => btn.active && handleButtonClick(btn.path)}
            disabled={!btn.active}
            className={`relative group ${BTN_HEIGHT} rounded-xl px-6 text-left text-white shadow-md transition-all duration-200 flex flex-col justify-center
              ${btn.active
                ? `bg-gradient-to-br ${colorMap[btn.id] || 'from-indigo-500 to-blue-600'} hover:shadow-lg hover:scale-[1.02] cursor-pointer`
                : 'bg-gradient-to-br from-slate-300 to-slate-400 cursor-not-allowed opacity-60'}`}>
            {!btn.active && <Lock size={14} className="absolute top-3 right-3 opacity-60" />}
            <div className="flex items-center gap-2 mb-1">
              {btn.id === 'abnormal' && <AlertTriangle size={18} className="opacity-80 shrink-0" />}
              <h3 className="font-semibold text-base leading-tight">{btn.label}</h3>
            </div>
            {btn.active && <p className="text-xs opacity-75">Click to open</p>}
          </button>
        ))}

        {customButtons.map((btn, i) => (
          <div key={btn.id} className={`relative group ${BTN_HEIGHT}`}>
            <button onClick={() => handleButtonClick(btn.path)}
              className={`w-full h-full rounded-xl px-6 text-left text-white shadow-md transition-all duration-200 flex flex-col justify-center
                bg-gradient-to-br ${customColors[i % customColors.length]} hover:shadow-lg hover:scale-[1.02]`}>
              <div className="flex items-center gap-2 mb-1">
                {btn.path && isFolderPath(btn.path) && <Folder size={16} className="opacity-80 shrink-0" />}
                <h3 className="font-semibold text-base leading-tight">{btn.label}</h3>
              </div>
              <p className="text-xs opacity-75">
                {btn.path
                  ? isFolderPath(btn.path) ? 'Open folder' : 'Click to open'
                  : 'Custom button'}
              </p>
            </button>
            {/* Light-gray subtle X — shown on hover */}
            <button
              onClick={e => { e.stopPropagation(); setConfirmDeleteId(btn.id); }}
              className="absolute -top-2 -right-2 hidden group-hover:flex items-center justify-center w-6 h-6 bg-slate-200/90 rounded-full text-slate-400 shadow hover:bg-slate-300 hover:text-slate-600 transition-colors">
              <X size={12} />
            </button>
          </div>
        ))}

        <button onClick={() => setShowAddModal(true)}
          className={`${BTN_HEIGHT} rounded-xl border-2 border-dashed border-slate-300 text-center text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-all duration-200 flex flex-col items-center justify-center`}>
          <Plus size={28} className="mb-1" />
          <span className="font-medium text-sm">Add New Button</span>
        </button>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onClick={() => setShowAddModal(false)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Add New Button</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Label *</label>
                <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Button label" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Folder Path (optional)</label>
                <input type="text" value={newPath} onChange={e => setNewPath(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={`e.g. G:\\02_Folder 5S\\FF === Group ===`} />
                <p className="text-xs text-slate-400 mt-1">Enter a Windows folder path to open it in Explorer</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={handleAdd} disabled={!newLabel.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete confirmation popup ─── */}
      {confirmDeleteId && (() => {
        const btn = customButtons.find(b => b.id === confirmDeleteId);
        if (!btn) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
            onClick={() => setConfirmDeleteId(null)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs text-center"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-center w-11 h-11 rounded-full bg-slate-100 mx-auto mb-3">
                <X size={20} className="text-slate-400" />
              </div>
              <h4 className="text-base font-semibold text-slate-800 mb-1">Delete button?</h4>
              <p className="text-sm text-slate-500 mb-5">
                &ldquo;{btn.label}&rdquo; will be permanently removed.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => handleRemove(confirmDeleteId)}
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-colors">
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Folder Setup Info ─── */}
      {customButtons.some(b => b.path && isFolderPath(b.path)) && (
        <div className="mt-4 border-t pt-4">
          <button onClick={() => setShowSetupInfo(!showSetupInfo)}
            className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors">
            <Download size={12} />
            {showSetupInfo ? 'Hide setup info' : 'Folder buttons not working? Click here'}
          </button>
          {showSetupInfo && (
            <div className="mt-3 bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-2">
              <p className="font-medium text-slate-700">One-time setup to enable folder buttons on your PC:</p>
              <ol className="list-decimal ml-5 space-y-1">
                <li>
                  Download both files:&nbsp;
                  <a href={`${API_URL}/download-setup/setup-openfolder.ps1`} className="text-indigo-600 underline hover:text-indigo-800">setup-openfolder.ps1</a>
                  &nbsp;and&nbsp;
                  <a href={`${API_URL}/download-setup/openfolder.vbs`} className="text-indigo-600 underline hover:text-indigo-800">openfolder.vbs</a>
                </li>
                <li>Put both files in the <b>same folder</b></li>
                <li>Right-click <b>setup-openfolder.ps1</b> → <b>Run with PowerShell</b> (as Administrator)</li>
                <li>Done! Folder buttons will now open Explorer on your PC.</li>
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
