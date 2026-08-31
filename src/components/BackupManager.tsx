import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Database, Download, Upload, RotateCcw, Plus,
  CheckCircle2, AlertTriangle, Clock, HardDrive, Shield,
  RefreshCw, CloudDownload, FolderOpen, X, AlertCircle, Trash2,
  MessageSquare, Send, QrCode, ExternalLink, Smartphone
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BackupFile {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-DZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function isSafetyBackup(filename: string) {
  return filename.includes('-safety-');
}

function isManualBackup(filename: string) {
  return filename.includes('-manual');
}

function isUploadedBackup(filename: string) {
  return filename.includes('-uploaded');
}

function getBackupTag(filename: string) {
  if (isSafetyBackup(filename))  return { label: 'Safety', color: 'bg-yellow-100 text-yellow-700' };
  if (isManualBackup(filename))  return { label: 'Manual',  color: 'bg-blue-100 text-blue-700' };
  if (isUploadedBackup(filename)) return { label: 'Upload', color: 'bg-purple-100 text-purple-700' };
  return { label: 'Auto', color: 'bg-green-100 text-green-700' };
}

// ─── Toast component ─────────────────────────────────────────────────────────

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const styles: Record<ToastType, string> = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error:   'bg-red-50   border-red-200   text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info:    'bg-blue-50  border-blue-200  text-blue-800',
  };
  const Icon = toast.type === 'success' ? CheckCircle2
    : toast.type === 'error' ? AlertCircle
    : toast.type === 'warning' ? AlertTriangle
    : RefreshCw;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium ${styles[toast.type]}`}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="flex-1">{toast.message}</span>
      <button onClick={() => onDismiss(toast.id)} className="ml-2 opacity-60 hover:opacity-100">
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  title, message, confirmLabel, danger, onConfirm, onCancel
}: {
  title: string; message: string; confirmLabel: string;
  danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${danger ? 'bg-red-100' : 'bg-blue-100'}`}>
            {danger ? <AlertTriangle className="w-5 h-5 text-red-600" /> : <Shield className="w-5 h-5 text-blue-600" />}
          </div>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        </div>
        <p className="text-sm text-slate-600 mb-6 ml-13 leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-bold rounded-xl transition-colors ${
              danger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BackupManager() {
  const { isAdmin } = useAuth();
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [downloadingLive, setDownloadingLive] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [uploadRestoring, setUploadRestoring] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<{ type: 'restore' | 'delete'; filename: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await fetch('/api/backups');
      const data = await res.json();
      setBackups(data);
    } catch {
      addToast('error', 'Impossible de charger la liste des sauvegardes.');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // ── WhatsApp Alert Gateway Status ──────────────────────────────────────────
  const [waStatus, setWaStatus] = useState<{ isConnected: boolean; qrCodeDataUrl: string | null; targetGroupId: string | null; targetGroupName: string | null; inviteCode: string } | null>(null);
  const [waTesting, setWaTesting] = useState(false);

  const fetchWhatsAppStatus = useCallback(async () => {
    try {
      const data = await api.getWhatsAppStatus();
      setWaStatus(data);
    } catch (e) {
      console.error('Failed to fetch WhatsApp status', e);
    }
  }, []);

  useEffect(() => {
    fetchBackups();
    fetchWhatsAppStatus();
    const interval = setInterval(fetchWhatsAppStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchBackups, fetchWhatsAppStatus]);

  const handleTestWhatsApp = async () => {
    setWaTesting(true);
    try {
      const res = await api.sendWhatsAppTest();
      addToast('success', res.message || 'Message de test envoyé sur WhatsApp !');
    } catch (err: any) {
      addToast('error', err.message || 'Échec de l\'envoi du message WhatsApp.');
    } finally {
      setWaTesting(false);
    }
  };

  // ── Delete a backup ───────────────────────────────────────────────────────
  async function handleDeleteBackup(filename: string) {
    setDeleting(filename);
    try {
      const res = await fetch(`/api/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addToast('success', data.message || `Sauvegarde "${filename}" supprimée avec succès.`);
      await fetchBackups();
    } catch (e: any) {
      addToast('error', e.message || 'Échec de la suppression de la sauvegarde.');
    } finally {
      setDeleting(null);
    }
  }

  // ── Download live DB ──────────────────────────────────────────────────────
  async function handleDownloadLive() {
    setDownloadingLive(true);
    try {
      const res = await fetch('/api/backups/download');
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().split('T')[0];
      a.download = `gmao-backup-${date}.db`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('success', 'Base de données téléchargée avec succès.');
    } catch {
      addToast('error', 'Échec du téléchargement.');
    } finally {
      setDownloadingLive(false);
    }
  }

  // ── Download a specific backup ────────────────────────────────────────────
  function handleDownloadBackup(filename: string) {
    const a = document.createElement('a');
    a.href = `/api/backups/download/${encodeURIComponent(filename)}`;
    a.download = filename;
    a.click();
  }

  // ── Create backup now ─────────────────────────────────────────────────────
  async function handleCreateBackup() {
    setCreatingBackup(true);
    try {
      const res = await fetch('/api/backups/create', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addToast('success', `Sauvegarde créée : ${data.filename}`);
      await fetchBackups();
    } catch (e: any) {
      addToast('error', e.message || 'Échec de la création de sauvegarde.');
    } finally {
      setCreatingBackup(false);
    }
  }

  // ── Restore from backup ───────────────────────────────────────────────────
  async function handleRestore(filename: string) {
    setRestoring(filename);
    try {
      const res = await fetch(`/api/backups/restore/${encodeURIComponent(filename)}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addToast('success', data.message);
      await fetchBackups();
    } catch (e: any) {
      addToast('error', e.message || 'Échec de la restauration.');
    } finally {
      setRestoring(null);
    }
  }

  // ── Upload & restore ──────────────────────────────────────────────────────
  async function handleUploadRestore(file: File) {
    if (!file.name.endsWith('.db')) {
      addToast('error', "Le fichier doit avoir l'extension .db");
      return;
    }
    setUploadRestoring(true);
    try {
      const formData = new FormData();
      formData.append('dbfile', file);
      const res = await fetch('/api/backups/restore-upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addToast('success', data.message);
      await fetchBackups();
    } catch (e: any) {
      addToast('error', e.message || 'Échec de la restauration depuis le fichier uploadé.');
    } finally {
      setUploadRestoring(false);
    }
  }

  const lastBackup = backups[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
        <AnimatePresence>
          {toasts.map(t => <ToastItem key={t.id} toast={t as any} onDismiss={dismissToast} />)}
        </AnimatePresence>
      </div>

      {/* Confirm dialog */}
      <AnimatePresence>
        {confirm && (
          <ConfirmDialog
            title={confirm.type === 'delete' ? 'Confirmer la suppression' : 'Confirmer la restauration'}
            message={
              confirm.type === 'delete'
                ? `Êtes-vous sûr de vouloir supprimer définitivement le fichier de sauvegarde "${confirm.filename}" ? Cette action est irréversible.`
                : `Vous êtes sur le point de restaurer "${confirm.filename}". Toutes les données actuelles seront remplacées. Une sauvegarde de sécurité sera créée automatiquement avant la restauration.`
            }
            confirmLabel={confirm.type === 'delete' ? 'Supprimer' : 'Restaurer'}
            danger={confirm.type === 'delete'}
            onConfirm={() => {
              if (confirm.type === 'delete') {
                handleDeleteBackup(confirm.filename);
              } else {
                handleRestore(confirm.filename);
              }
              setConfirm(null);
            }}
            onCancel={() => setConfirm(null)}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Backup & Restauration</h1>
              <p className="text-sm text-slate-500">Gérer les sauvegardes de la base de données GMAO</p>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {/* Last backup */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Dernière sauvegarde</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {lastBackup ? formatDate(lastBackup.createdAt) : 'Aucune'}
              </p>
            </div>
          </motion.div>

          {/* Total backups */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total sauvegardes</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{backups.length} fichiers</p>
            </div>
          </motion.div>

          {/* Auto schedule */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Auto-backup</p>
              <p className="text-sm font-bold text-green-700 mt-0.5">✅ Actif — chaque minuit</p>
            </div>
          </motion.div>
        </div>

        {/* WhatsApp Alert Gateway Section */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
          className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">Alertes WhatsApp (Groupe)</h3>
                  {waStatus?.isConnected ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Connecté
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      En attente de scan QR
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Envoi automatique des alertes en cas d'arrêt machine ou de création d'ordre de travail
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {waStatus?.isConnected && (
                <button
                  onClick={handleTestWhatsApp}
                  disabled={waTesting}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all disabled:opacity-50"
                >
                  {waTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Envoyer Test Alert
                </button>
              )}
              <button
                onClick={fetchWhatsAppStatus}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                title="Actualiser le statut"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-5">
            {waStatus?.isConnected ? (
              <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Groupe lié : <b>{waStatus.targetGroupName || 'Groupe WhatsApp'}</b></span>
                  </div>
                  <p className="text-[11px] font-mono text-emerald-700/80 ml-6">
                    ID : {waStatus.targetGroupId || 'Connecté'}
                  </p>
                </div>
                <a
                  href={`https://chat.whatsapp.com/${waStatus.inviteCode || 'Hoz4wT17uRFDljP0ivZdXn'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-emerald-200 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 transition-colors"
                >
                  <ExternalLink size={12} />
                  Ouvrir le groupe WhatsApp
                </a>
              </div>
            ) : waStatus?.qrCodeDataUrl ? (
              <div className="flex flex-col md:flex-row items-center gap-6 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm shrink-0">
                  <img src={waStatus.qrCodeDataUrl} alt="WhatsApp QR Code" className="w-44 h-44 block" />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                    <Smartphone className="w-4 h-4 text-blue-600" />
                    <span>Comment connecter votre compte WhatsApp :</span>
                  </div>
                  <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside">
                    <li>Ouvrez <b>WhatsApp</b> sur votre smartphone</li>
                    <li>Allez dans <b>Appareils connectés</b> (Linked Devices)</li>
                    <li>Appuyez sur <b>Connecter un appareil</b></li>
                    <li>Scannez le QR Code affiché à gauche</li>
                  </ol>
                  <p className="text-[11px] text-slate-400 italic">
                    Une fois scanné, la GMAO rejoindra automatiquement le groupe et commencera à diffuser les alertes.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center p-6 bg-slate-50 rounded-xl text-xs text-slate-400 gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                <span>Génération du QR Code WhatsApp en cours...</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Action buttons row */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-6"
        >
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-4">Actions rapides</h2>
          <div className="flex flex-wrap gap-3">
            {/* Download live */}
            <button
              onClick={handleDownloadLive}
              disabled={downloadingLive}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-xl shadow-md hover:shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-60"
            >
              {downloadingLive
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <CloudDownload className="w-4 h-4" />}
              Télécharger la BD actuelle
            </button>

            {/* Create manual backup */}
            <button
              onClick={handleCreateBackup}
              disabled={creatingBackup}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl shadow-sm hover:bg-slate-50 hover:shadow-md transition-all disabled:opacity-60"
            >
              {creatingBackup
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <Plus className="w-4 h-4" />}
              Créer une sauvegarde maintenant
            </button>

            {/* Refresh list */}
            <button
              onClick={fetchBackups}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl shadow-sm hover:bg-slate-50 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Rafraîchir
            </button>
          </div>
        </motion.div>

        {/* Upload & Restore section */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-6"
        >
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1">Restaurer depuis un fichier</h2>
          <p className="text-xs text-slate-500 mb-4">
            Uploadez un fichier <code className="bg-slate-100 px-1 rounded">.db</code> depuis votre ordinateur pour restaurer la base de données.
          </p>

          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault(); setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleUploadRestore(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
            }`}
          >
            {uploadRestoring ? (
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-sm font-medium text-blue-600">Restauration en cours…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-slate-400" />
                <p className="text-sm font-medium text-slate-700">Glissez-déposez un fichier <span className="font-bold">.db</span> ici</p>
                <p className="text-xs text-slate-400">ou cliquez pour choisir un fichier</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".db"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleUploadRestore(file);
              e.target.value = '';
            }}
          />
        </motion.div>

        {/* Backup list */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5"
        >
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-4">
            Sauvegardes enregistrées ({backups.length})
          </h2>

          {loading ? (
            <div className="flex items-center gap-3 text-slate-400 py-8 justify-center">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span className="text-sm">Chargement…</span>
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm font-medium">Aucune sauvegarde trouvée</p>
              <p className="text-slate-400 text-xs mt-1">Les sauvegardes automatiques démarreront à minuit.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Fichier</th>
                    <th className="text-left py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="text-left py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="text-left py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Taille</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {backups.map(b => {
                    const tag = getBackupTag(b.filename);
                    const isCurrentlyRestoring = restoring === b.filename;
                    return (
                      <tr key={b.filename} className="hover:bg-slate-50 transition-colors group">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="font-mono text-xs text-slate-700 truncate max-w-[280px]">{b.filename}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${tag.color}`}>
                            {tag.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{formatDate(b.createdAt)}</td>
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{formatBytes(b.sizeBytes)}</td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2 justify-end">
                            {/* Download */}
                            <button
                              onClick={() => handleDownloadBackup(b.filename)}
                              title="Télécharger"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            {/* Restore */}
                            {!isSafetyBackup(b.filename) && (
                              <button
                                onClick={() => setConfirm({ type: 'restore', filename: b.filename })}
                                disabled={isCurrentlyRestoring || uploadRestoring || deleting === b.filename}
                                title="Restaurer"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-40"
                              >
                                {isCurrentlyRestoring
                                  ? <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                                  : <RotateCcw className="w-4 h-4" />}
                              </button>
                            )}
                            {/* Delete (Admin only) */}
                            {isAdmin && (
                              <button
                                onClick={() => setConfirm({ type: 'delete', filename: b.filename })}
                                disabled={deleting === b.filename || isCurrentlyRestoring}
                                title="Supprimer la sauvegarde (Admin)"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                              >
                                {deleting === b.filename ? (
                                  <RefreshCw className="w-4 h-4 animate-spin text-red-500" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-400 font-medium">Légende :</span>
                {[
                  { label: 'Auto',   color: 'bg-green-100 text-green-700' },
                  { label: 'Manual', color: 'bg-blue-100 text-blue-700' },
                  { label: 'Upload', color: 'bg-purple-100 text-purple-700' },
                  { label: 'Safety', color: 'bg-yellow-100 text-yellow-700' },
                ].map(t => (
                  <span key={t.label} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${t.color}`}>
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Safety note */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="mt-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>Restauration :</strong> Avant toute restauration, une sauvegarde de sécurité automatique est créée (marquée <em>Safety</em>). La connexion à la base de données est rechargée à chaud — <strong>aucun redémarrage du serveur n'est nécessaire</strong>.
          </span>
        </motion.div>
      </div>
    </div>
  );
}
