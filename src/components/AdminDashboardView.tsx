import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Database,
  HardDrive,
  KeyRound,
  Layers,
  Lock,
  Mail,
  Pencil,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  AdminUserSummary,
  DbProviderRecord,
  DbStorageEfficiencyReport,
  UserRole,
} from '../server/streamzDb';

const AVATAR_SWATCHES = [
  { name: 'Electric Cyan', hex: '#06B6D4' },
  { name: 'Ocean Blue', hex: '#0284C7' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Royal Violet', hex: '#7C3AED' },
  { name: 'Amber Gold', hex: '#D97706' },
  { name: 'Crimson', hex: '#E11D48' },
];

export interface PasswordValidationChecks {
  minLength: boolean;
  hasUpperAndLower: boolean;
  hasNumberOrSymbol: boolean;
  matchesConfirm: boolean;
  score: number;
  isValid: boolean;
}

export function evaluatePasswordChecks(
  password: string,
  confirmPassword?: string,
): PasswordValidationChecks {
  const minLength = password.length >= 8;
  const hasUpperAndLower = /[A-Z]/.test(password) && /[a-z]/.test(password);
  const hasNumberOrSymbol = /[0-9!@#$%^&*(),.?":{}|<>_\-+=]/.test(password);
  const matchesConfirm =
    confirmPassword === undefined ? true : password.length > 0 && password === confirmPassword;

  const score =
    (minLength ? 1 : 0) +
    (hasUpperAndLower ? 1 : 0) +
    (hasNumberOrSymbol ? 1 : 0) +
    (matchesConfirm && password.length >= 8 ? 1 : 0);

  return {
    minLength,
    hasUpperAndLower,
    hasNumberOrSymbol,
    matchesConfirm,
    score,
    isValid: minLength && hasUpperAndLower && hasNumberOrSymbol && matchesConfirm,
  };
}

export function validateEmailFormat(email: string): string | null {
  const clean = email.trim().toLowerCase();
  if (!clean) return 'Email address is required.';
  if (clean.length > 120) return 'Email address must be under 120 characters.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
    return 'Enter a valid email address (e.g. user@domain.com).';
  }
  return null;
}

export function validateDisplayNameFormat(name: string): string | null {
  const clean = name.trim();
  if (!clean) return 'Full name is required.';
  if (clean.length < 2 || clean.length > 60) {
    return 'Full name must be between 2 and 60 characters.';
  }
  if (!/[a-zA-Z]/.test(clean)) {
    return 'Full name must include letters.';
  }
  return null;
}

interface ChangePasswordModalProps {
  authToken: string;
  userEmail: string;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  authToken,
  userEmail,
  onClose,
  onSuccess,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!successMsg) return;
    const timer = window.setTimeout(() => {
      setSuccessMsg(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [successMsg]);

  const checks = useMemo(
    () => evaluatePasswordChecks(newPassword, confirmPassword),
    [newPassword, confirmPassword],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentPassword) {
      setErrorMsg('Please enter your current password.');
      return;
    }
    if (!checks.minLength) {
      setErrorMsg('New password must be at least 8 characters long.');
      return;
    }
    if (!checks.hasUpperAndLower) {
      setErrorMsg('New password must include both uppercase and lowercase letters.');
      return;
    }
    if (!checks.hasNumberOrSymbol) {
      setErrorMsg('New password must include at least one number or symbol.');
      return;
    }
    if (!checks.matchesConfirm) {
      setErrorMsg('New password and confirmation password do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const data = (await resp.json()) as { ok?: boolean; message?: string; error?: string };
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || 'Failed to change password.');
      }
      const msg = 'Password changed and synced to database.';
      setSuccessMsg(msg);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (onSuccess) {
        onSuccess(msg);
      }
      window.setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Password change failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dossier-backdrop" onClick={onClose}>
      <div
        className="change-password-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-pwd-title"
      >
        <div className="change-password-header">
          <div className="change-password-title-group">
            <span className="admin-kicker-pill mono">
              <KeyRound size={12} />
              <span>ACCOUNT SECURITY</span>
            </span>
            <h3 id="change-pwd-title">Change Password</h3>
            <p className="mono">{userEmail}</p>
          </div>
          <button
            type="button"
            className="player-icon-btn"
            onClick={onClose}
            aria-label="Close password modal"
          >
            <X size={18} />
          </button>
        </div>

        <form className="change-password-form" onSubmit={handleSubmit} noValidate>
          <div className="admin-field-block">
            <label htmlFor="cp-current">Current Password</label>
            <div className="admin-input-shell">
              <Lock size={15} />
              <input
                id="cp-current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <div className="admin-field-block">
            <label htmlFor="cp-new">New Password</label>
            <div className="admin-input-shell">
              <KeyRound size={15} />
              <input
                id="cp-new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 chars, upper/lower + number"
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <div className="admin-field-block">
            <label htmlFor="cp-confirm">Confirm New Password</label>
            <div className="admin-input-shell">
              <KeyRound size={15} />
              <input
                id="cp-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <div className="password-checklist-box">
            <div className="password-strength-bars">
              {[1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className={`pwd-bar-segment ${checks.score >= step ? 'filled' : ''} score-${checks.score}`}
                />
              ))}
            </div>
            <ul className="password-rules-list">
              <li className={checks.minLength ? 'passed' : ''}>
                <Check size={12} />
                <span>8+ characters minimum</span>
              </li>
              <li className={checks.hasUpperAndLower ? 'passed' : ''}>
                <Check size={12} />
                <span>Uppercase &amp; lowercase letters</span>
              </li>
              <li className={checks.hasNumberOrSymbol ? 'passed' : ''}>
                <Check size={12} />
                <span>At least 1 number or symbol</span>
              </li>
              <li className={checks.matchesConfirm ? 'passed' : ''}>
                <Check size={12} />
                <span>Confirmation matches</span>
              </li>
            </ul>
          </div>

          {errorMsg && (
            <div className="admin-feedback-banner error">
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="admin-feedback-banner success">
              <CheckCircle2 size={15} />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="change-password-actions">
            <button
              type="button"
              className="glass-secondary-btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="neon-primary-btn"
              disabled={submitting}
            >
              <KeyRound size={15} />
              <span>{submitting ? 'Updating…' : 'Update Password'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface AdminDashboardViewProps {
  authToken: string;
  currentAdminId: number;
  onCurrentUserUpdated?: (updatedUser: AdminUserSummary) => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  authToken,
  currentAdminId,
  onCurrentUserUpdated,
}) => {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [diagnostics, setDiagnostics] = useState<DbStorageEfficiencyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalBanner, setGlobalBanner] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  // Auto-dismiss success/status cards after 5 seconds (5000ms)
  useEffect(() => {
    if (!globalBanner) return;
    const timer = window.setTimeout(() => {
      setGlobalBanner(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [globalBanner]);

  // Create New User Validated Form State
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createConfirmPassword, setCreateConfirmPassword] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('user');
  const [createColor, setCreateColor] = useState('#2563EB');
  const [createTouched, setCreateTouched] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);

  // Directory Filter & Row Action State
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [activeRowModal, setActiveRowModal] = useState<{
    userId: number;
    mode: 'edit' | 'password' | 'addons';
  } | null>(null);

  // Inline Edit User State
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('user');
  const [editColor, setEditColor] = useState('#E11D48');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');
  const [rowSaving, setRowSaving] = useState(false);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = (await resp.json()) as {
        users?: AdminUserSummary[];
        diagnostics?: DbStorageEfficiencyReport;
        error?: string;
      };
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to load admin console');
      }
      if (Array.isArray(data.users)) {
        setUsers(data.users);
      }
      if (data.diagnostics) {
        setDiagnostics(data.diagnostics);
      }
    } catch (err) {
      setGlobalBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to fetch admin data.',
      });
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  // Live form validations for Create User
  const nameError = useMemo(
    () => (createTouched || createName ? validateDisplayNameFormat(createName) : null),
    [createName, createTouched],
  );
  const emailError = useMemo(
    () => (createTouched || createEmail ? validateEmailFormat(createEmail) : null),
    [createEmail, createTouched],
  );
  const createPwdChecks = useMemo(
    () => evaluatePasswordChecks(createPassword, createConfirmPassword),
    [createPassword, createConfirmPassword],
  );

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateTouched(true);
    setGlobalBanner(null);

    const nErr = validateDisplayNameFormat(createName);
    const eErr = validateEmailFormat(createEmail);
    if (nErr) {
      setGlobalBanner({ kind: 'error', text: nErr });
      return;
    }
    if (eErr) {
      setGlobalBanner({ kind: 'error', text: eErr });
      return;
    }
    if (!createPwdChecks.isValid) {
      setGlobalBanner({
        kind: 'error',
        text: 'Password must be at least 8 characters, include uppercase & lowercase letters, a number/symbol, and match confirmation.',
      });
      return;
    }

    setCreatingUser(true);
    try {
      const resp = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          displayName: createName.trim(),
          email: createEmail.trim().toLowerCase(),
          password: createPassword,
          role: createRole,
          avatarColor: createColor,
        }),
      });
      const data = (await resp.json()) as {
        user?: AdminUserSummary;
        users?: AdminUserSummary[];
        error?: string;
      };
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to provision user');
      }
      if (Array.isArray(data.users)) {
        setUsers(data.users);
      }
      setCreateName('');
      setCreateEmail('');
      setCreatePassword('');
      setCreateConfirmPassword('');
      setCreateRole('user');
      setCreateTouched(false);
      setGlobalBanner({
        kind: 'success',
        text: `Provisioned ${data.user?.displayName || 'user'} (${data.user?.email}) and synced to database.`,
      });
    } catch (err) {
      setGlobalBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to create user.',
      });
    } finally {
      setCreatingUser(false);
    }
  };

  const openRowAction = (user: AdminUserSummary, mode: 'edit' | 'password' | 'addons') => {
    if (activeRowModal?.userId === user.id && activeRowModal.mode === mode) {
      setActiveRowModal(null);
      return;
    }
    setEditName(user.displayName);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditColor(user.avatarColor);
    setEditNewPassword('');
    setEditConfirmPassword('');
    setActiveRowModal({ userId: user.id, mode });
  };

  const handleSaveUserEdit = async (targetUser: AdminUserSummary, e: React.FormEvent) => {
    e.preventDefault();
    setGlobalBanner(null);

    const nErr = validateDisplayNameFormat(editName);
    const eErr = validateEmailFormat(editEmail);
    if (nErr || eErr) {
      setGlobalBanner({ kind: 'error', text: (nErr || eErr)! });
      return;
    }

    setRowSaving(true);
    try {
      const resp = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          targetUserId: targetUser.id,
          displayName: editName.trim(),
          email: editEmail.trim().toLowerCase(),
          role: editRole,
          avatarColor: editColor,
        }),
      });
      const data = (await resp.json()) as {
        users?: AdminUserSummary[];
        error?: string;
      };
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to update user');
      }
      if (Array.isArray(data.users)) {
        setUsers(data.users);
      }
      setActiveRowModal(null);
      setGlobalBanner({
        kind: 'success',
        text: `Updated profile for ${editName.trim()}.`,
      });
      if (targetUser.id === currentAdminId && onCurrentUserUpdated) {
        const selfUpdated = Array.isArray(data.users)
          ? data.users.find((u) => u.id === currentAdminId)
          : undefined;
        if (selfUpdated) {
          onCurrentUserUpdated(selfUpdated);
        }
      }
    } catch (err) {
      setGlobalBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to update user.',
      });
    } finally {
      setRowSaving(false);
    }
  };

  const handleSaveUserPassword = async (targetUser: AdminUserSummary, e: React.FormEvent) => {
    e.preventDefault();
    setGlobalBanner(null);

    const pwdChecks = evaluatePasswordChecks(editNewPassword, editConfirmPassword);
    if (!pwdChecks.isValid) {
      setGlobalBanner({
        kind: 'error',
        text: 'New password must be 8+ chars with uppercase, lowercase, number/symbol, and matching confirmation.',
      });
      return;
    }

    setRowSaving(true);
    try {
      const resp = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          targetUserId: targetUser.id,
          newPassword: editNewPassword,
        }),
      });
      const data = (await resp.json()) as {
        users?: AdminUserSummary[];
        error?: string;
      };
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to change user password');
      }
      if (Array.isArray(data.users)) {
        setUsers(data.users);
      }
      setActiveRowModal(null);
      setGlobalBanner({
        kind: 'success',
        text: `Changed password for ${targetUser.displayName} (${targetUser.email}).`,
      });
    } catch (err) {
      setGlobalBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to change password.',
      });
    } finally {
      setRowSaving(false);
    }
  };

  const handleUpdateTargetUserProviders = async (
    targetUser: AdminUserSummary,
    nextProviders: DbProviderRecord[],
  ) => {
    setRowSaving(true);
    try {
      const resp = await fetch('/api/admin/user-providers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          targetUserId: targetUser.id,
          providers: nextProviders,
        }),
      });
      const data = (await resp.json()) as {
        users?: AdminUserSummary[];
        error?: string;
      };
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to update user addons');
      }
      if (Array.isArray(data.users)) {
        setUsers(data.users);
      }
      setGlobalBanner({
        kind: 'success',
        text: `Updated addons for ${targetUser.displayName} (${targetUser.email}).`,
      });
    } catch (err) {
      setGlobalBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to update addons.',
      });
    } finally {
      setRowSaving(false);
    }
  };

  const handleDeleteUser = async (targetUser: AdminUserSummary) => {
    if (targetUser.id === currentAdminId) return;
    setGlobalBanner(null);
    setRowSaving(true);
    try {
      const resp = await fetch(`/api/admin/users?id=${targetUser.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = (await resp.json()) as {
        users?: AdminUserSummary[];
        error?: string;
      };
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }
      if (Array.isArray(data.users)) {
        setUsers(data.users);
      }
      setGlobalBanner({
        kind: 'success',
        text: `Deleted user ${targetUser.displayName} (${targetUser.email}).`,
      });
    } catch (err) {
      setGlobalBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete user.',
      });
    } finally {
      setRowSaving(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, roleFilter]);

  const adminCount = useMemo(
    () => users.filter((u) => u.role === 'admin').length,
    [users],
  );

  return (
    <div className="spatial-scroll-flow padded-top">
      <section className="admin-console-section">
        {/* Top Command Header */}
        <div className="admin-console-header">
          <div>
            <span className="admin-kicker-pill mono">
              <ShieldCheck size={13} />
              <span>ADMIN DASHBOARD</span>
            </span>
            <h2>User &amp; Account Management</h2>
            <p>
              Create new user accounts, update passwords, manage roles, and customize user
              addons.
            </p>
          </div>
          <button
            type="button"
            className="glass-secondary-btn"
            onClick={loadAdminData}
            disabled={loading}
          >
            <RefreshCw size={14} />
            <span>{loading ? 'Refreshing…' : 'Refresh List'}</span>
          </button>
        </div>

        {globalBanner && (
          <div className={`admin-feedback-banner ${globalBanner.kind}`}>
            {globalBanner.kind === 'error' ? (
              <AlertCircle size={16} />
            ) : (
              <CheckCircle2 size={16} />
            )}
            <span>{globalBanner.text}</span>
            <button
              type="button"
              className="admin-banner-dismiss"
              onClick={() => setGlobalBanner(null)}
              aria-label="Dismiss notice"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Section 1: Summary Cards */}
        <div className="admin-kpi-grid">
          <article className="admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label mono">TOTAL USERS</span>
              <Users size={15} />
            </div>
            <div className="admin-kpi-value mono">{users.length}</div>
            <span className="admin-kpi-meta">
              {adminCount} Admin · {Math.max(0, users.length - adminCount)} Standard
            </span>
          </article>

          <article className="admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label mono">CLOUD SYNC</span>
              <Database size={15} />
            </div>
            <div className="admin-kpi-value mono" style={{ fontSize: 18 }}>
              {diagnostics?.cloudProviderConfigured ? 'CONNECTED' : 'LOCAL STORAGE'}
            </div>
            <span className="admin-kpi-meta">
              {diagnostics?.cloudProviderConfigured
                ? 'All changes saved to cloud automatically'
                : 'Saved on local server'}
            </span>
          </article>

          <article className="admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label mono">ACTIVE ADDONS</span>
              <Layers size={15} />
            </div>
            <div className="admin-kpi-value mono">
              {diagnostics?.counts.deduplicatedProviders ?? 0}
            </div>
            <span className="admin-kpi-meta">
              Shared Sources · {diagnostics?.counts.deduplicatedMediaCatalog ?? 0} Saved Titles
            </span>
          </article>

          <article className="admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label mono">STORAGE PER USER</span>
              <HardDrive size={15} />
            </div>
            <div className="admin-kpi-value mono">
              {diagnostics?.estimatedActiveUserTotalBytes ?? 378} B
            </div>
            <span className="admin-kpi-meta">
              Lightweight &amp; fast account sync
            </span>
          </article>
        </div>

        {/* Section 2: Create New User (Admin-Only Validated Form) */}
        <div className="admin-panel-card">
          <div className="admin-panel-head">
            <div>
              <h3>
                <UserPlus size={17} />
                <span>Create New User Account</span>
              </h3>
              <p>
                Fill in the details below to create a new account for a family member or friend.
              </p>
            </div>
          </div>

          <form
            className="admin-create-user-form"
            onSubmit={handleCreateUserSubmit}
            noValidate
          >
            <div className="admin-create-grid">
              <div className="admin-field-block">
                <label htmlFor="admin-create-name">Full Name *</label>
                <div className={`admin-input-shell ${nameError ? 'invalid' : ''}`}>
                  <User size={15} />
                  <input
                    id="admin-create-name"
                    type="text"
                    placeholder="e.g. Rohan Sharma"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    required
                  />
                </div>
                {nameError && <span className="admin-field-error">{nameError}</span>}
              </div>

              <div className="admin-field-block">
                <label htmlFor="admin-create-email">Email Address *</label>
                <div className={`admin-input-shell ${emailError ? 'invalid' : ''}`}>
                  <Mail size={15} />
                  <input
                    id="admin-create-email"
                    type="email"
                    placeholder="user@fablearc.com"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    required
                  />
                </div>
                {emailError && <span className="admin-field-error">{emailError}</span>}
              </div>

              <div className="admin-field-block">
                <label htmlFor="admin-create-role">Access Role *</label>
                <select
                  id="admin-create-role"
                  className="admin-select-input"
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value as UserRole)}
                >
                  <option value="user">Standard User (Streaming &amp; Personal Addons)</option>
                  <option value="admin">Administrator (Full Console &amp; User Provisioning)</option>
                </select>
              </div>

              <div className="admin-field-block">
                <label htmlFor="admin-create-pwd">Initial Password *</label>
                <div className="admin-input-shell">
                  <Lock size={15} />
                  <input
                    id="admin-create-pwd"
                    type="password"
                    placeholder="Min 8 chars, Upper+Lower+Num"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="admin-field-block">
                <label htmlFor="admin-create-confirm">Confirm Password *</label>
                <div className="admin-input-shell">
                  <KeyRound size={15} />
                  <input
                    id="admin-create-confirm"
                    type="password"
                    placeholder="Repeat password"
                    value={createConfirmPassword}
                    onChange={(e) => setCreateConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="admin-field-block">
                <label>Avatar Color</label>
                <div className="auth-color-swatches" style={{ paddingTop: 4 }}>
                  {AVATAR_SWATCHES.map((sw) => (
                    <button
                      key={sw.hex}
                      type="button"
                      className={`auth-swatch-btn ${createColor === sw.hex ? 'selected' : ''}`}
                      style={{ backgroundColor: sw.hex }}
                      onClick={() => setCreateColor(sw.hex)}
                      title={sw.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="admin-create-footer">
              <div className="password-checklist-inline">
                <span className={`rule-chip ${createPwdChecks.minLength ? 'ok' : ''}`}>
                  <Check size={11} /> 8+ chars
                </span>
                <span className={`rule-chip ${createPwdChecks.hasUpperAndLower ? 'ok' : ''}`}>
                  <Check size={11} /> Upper &amp; Lower
                </span>
                <span className={`rule-chip ${createPwdChecks.hasNumberOrSymbol ? 'ok' : ''}`}>
                  <Check size={11} /> Number / Symbol
                </span>
                <span className={`rule-chip ${createPwdChecks.matchesConfirm ? 'ok' : ''}`}>
                  <Check size={11} /> Passwords Match
                </span>
              </div>

              <button
                type="submit"
                className="admin-provision-submit-btn"
                disabled={creatingUser}
              >
                <span className="admin-provision-btn-icon">
                  <UserPlus size={15} />
                </span>
                <span>{creatingUser ? 'Creating User…' : 'Create User'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Section 3: Complete User Directory & Access Control Table */}
        <div className="admin-panel-card">
          <div className="admin-directory-toolbar">
            <div>
              <h3>
                <Shield size={17} />
                <span>All Users ({filteredUsers.length})</span>
              </h3>
              <p>
                Manage user profiles, change passwords, or customize any user&apos;s addons.
              </p>
            </div>

            <div className="admin-directory-filters">
              <div className="admin-search-input">
                <Search size={14} />
                <input
                  type="search"
                  placeholder="Filter by name or email…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>

              <div className="admin-role-pills">
                {(['all', 'admin', 'user'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`admin-filter-pill ${roleFilter === r ? 'active' : ''}`}
                    onClick={() => setRoleFilter(r)}
                  >
                    {r === 'all' ? 'All' : r === 'admin' ? 'Admins' : 'Users'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="admin-users-list">
            {filteredUsers.map((u) => {
              const isSelf = u.id === currentAdminId;
              const isEditOpen =
                activeRowModal?.userId === u.id && activeRowModal.mode === 'edit';
              const isPwdOpen =
                activeRowModal?.userId === u.id && activeRowModal.mode === 'password';
              const isAddonsOpen =
                activeRowModal?.userId === u.id && activeRowModal.mode === 'addons';
              const rowPwdChecks = evaluatePasswordChecks(
                editNewPassword,
                editConfirmPassword,
              );

              return (
                <article key={u.id} className="admin-user-row-card">
                  <div className="admin-user-row-main">
                    <div className="admin-user-identity">
                      <span
                        className="admin-user-avatar"
                        style={{ backgroundColor: u.avatarColor }}
                      >
                        {u.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <div className="admin-user-title-line">
                          <strong>{u.displayName}</strong>
                          <span
                            className={`admin-role-badge mono ${u.role === 'admin' ? 'admin' : 'user'}`}
                          >
                            {u.role.toUpperCase()}
                          </span>
                          {isSelf && <span className="tech-badge safe-tag">YOU</span>}
                          <span className="mono tech-badge">ID #{u.id}</span>
                        </div>
                        <div className="admin-user-subline mono">
                          <span>{u.email}</span>
                          <span>·</span>
                          <span>{u.providerCount} Addons</span>
                          <span>·</span>
                          <span>{u.watchHistoryCount} Watched</span>
                          <span>·</span>
                          <span>{u.watchlistCount} Watchlist</span>
                        </div>
                        <div className="admin-password-hash-line mono">
                          <span className="hash-label">Security:</span>
                          <code>
                            {u.passwordHash ? 'Password Encrypted (scrypt)' : 'Protected'}
                          </code>
                        </div>
                      </div>
                    </div>

                    <div className="admin-user-actions">
                      <button
                        type="button"
                        className={`glass-secondary-btn compact-btn ${isEditOpen ? 'active' : ''}`}
                        onClick={() => openRowAction(u, 'edit')}
                      >
                        <Pencil size={13} />
                        <span>Edit User</span>
                      </button>

                      <button
                        type="button"
                        className={`glass-secondary-btn compact-btn ${isPwdOpen ? 'active' : ''}`}
                        onClick={() => openRowAction(u, 'password')}
                      >
                        <KeyRound size={13} />
                        <span>Change Password</span>
                      </button>

                      <button
                        type="button"
                        className={`glass-secondary-btn compact-btn ${isAddonsOpen ? 'active' : ''}`}
                        onClick={() => openRowAction(u, 'addons')}
                      >
                        <Layers size={13} />
                        <span>Addons ({u.providerCount})</span>
                      </button>

                      {!isSelf && (
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => handleDeleteUser(u)}
                          disabled={rowSaving}
                          title="Delete user account"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Drawer 1: Edit Profile & Role */}
                  {isEditOpen && (
                    <form
                      className="admin-row-drawer"
                      onSubmit={(e) => handleSaveUserEdit(u, e)}
                    >
                      <div className="admin-create-grid">
                        <div className="admin-field-block">
                          <label>Display Name</label>
                          <div className="admin-input-shell">
                            <User size={14} />
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div className="admin-field-block">
                          <label>Email Address</label>
                          <div className="admin-input-shell">
                            <Mail size={14} />
                            <input
                              type="email"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div className="admin-field-block">
                          <label>Role</label>
                          <select
                            className="admin-select-input"
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value as UserRole)}
                            disabled={isSelf}
                          >
                            <option value="user">Standard User</option>
                            <option value="admin">Administrator</option>
                          </select>
                        </div>
                      </div>

                      <div className="addon-edit-btn-row" style={{ marginTop: 10 }}>
                        <button
                          type="submit"
                          className="neon-primary-btn compact-btn"
                          disabled={rowSaving}
                        >
                          <Check size={14} />
                          <span>{rowSaving ? 'Saving…' : 'Save Profile'}</span>
                        </button>
                        <button
                          type="button"
                          className="glass-secondary-btn compact-btn"
                          onClick={() => setActiveRowModal(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Drawer 2: Change User Password */}
                  {isPwdOpen && (
                    <form
                      className="admin-row-drawer"
                      onSubmit={(e) => handleSaveUserPassword(u, e)}
                    >
                      <div className="admin-create-grid">
                        <div className="admin-field-block">
                          <label>New Password for {u.displayName}</label>
                          <div className="admin-input-shell">
                            <KeyRound size={14} />
                            <input
                              type="password"
                              placeholder="Min 8 chars, Upper+Lower+Number"
                              value={editNewPassword}
                              onChange={(e) => setEditNewPassword(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div className="admin-field-block">
                          <label>Confirm New Password</label>
                          <div className="admin-input-shell">
                            <Lock size={14} />
                            <input
                              type="password"
                              placeholder="Confirm new password"
                              value={editConfirmPassword}
                              onChange={(e) => setEditConfirmPassword(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                      </div>

                      <div className="admin-create-footer" style={{ marginTop: 10 }}>
                        <div className="password-checklist-inline">
                          <span className={`rule-chip ${rowPwdChecks.minLength ? 'ok' : ''}`}>
                            <Check size={11} /> 8+ chars
                          </span>
                          <span
                            className={`rule-chip ${rowPwdChecks.hasUpperAndLower ? 'ok' : ''}`}
                          >
                            <Check size={11} /> Upper &amp; Lower
                          </span>
                          <span
                            className={`rule-chip ${rowPwdChecks.hasNumberOrSymbol ? 'ok' : ''}`}
                          >
                            <Check size={11} /> Number / Symbol
                          </span>
                          <span
                            className={`rule-chip ${rowPwdChecks.matchesConfirm ? 'ok' : ''}`}
                          >
                            <Check size={11} /> Matches
                          </span>
                        </div>

                        <div className="addon-edit-btn-row">
                          <button
                            type="submit"
                            className="neon-primary-btn compact-btn"
                            disabled={rowSaving}
                          >
                            <KeyRound size={14} />
                            <span>{rowSaving ? 'Updating…' : 'Change Password'}</span>
                          </button>
                          <button
                            type="button"
                            className="glass-secondary-btn compact-btn"
                            onClick={() => setActiveRowModal(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  {/* Drawer 3: Inspect & Manage User's Isolated Addons */}
                  {isAddonsOpen && (
                    <div className="admin-row-drawer">
                      <div className="admin-addons-drawer-head">
                        <strong>
                          {u.displayName}&apos;s Installed Addons ({u.providers.length})
                        </strong>
                        <span className="mono" style={{ fontSize: 11 }}>
                          Changes here apply only to {u.email}
                        </span>
                      </div>
                      {u.providers.length === 0 ? (
                        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
                          This user has not initialized their addon list yet (defaults will
                          auto-provision on their next login).
                        </p>
                      ) : (
                        <div className="admin-user-addons-grid">
                          {u.providers.map((p, idx) => {
                            const mName =
                              typeof p.manifest?.name === 'string'
                                ? p.manifest.name
                                : 'Addon';
                            return (
                              <div key={`${p.manifestUrl}-${idx}`} className="admin-addon-mini-card">
                                <div className="admin-addon-mini-copy">
                                  <strong>{mName}</strong>
                                  <code className="mono">{p.manifestUrl}</code>
                                </div>
                                <div className="admin-addon-mini-actions">
                                  <label className="inline-checkbox">
                                    <input
                                      type="checkbox"
                                      checked={p.enabled}
                                      onChange={(e) => {
                                        const updated = u.providers.map((item, i) =>
                                          i === idx
                                            ? { ...item, enabled: e.target.checked }
                                            : item,
                                        );
                                        handleUpdateTargetUserProviders(u, updated);
                                      }}
                                    />
                                    <span>Enabled</span>
                                  </label>
                                  <button
                                    type="button"
                                    className="danger-btn"
                                    onClick={() => {
                                      const updated = u.providers.filter((_, i) => i !== idx);
                                      handleUpdateTargetUserProviders(u, updated);
                                    }}
                                    title="Remove addon from this user"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};
