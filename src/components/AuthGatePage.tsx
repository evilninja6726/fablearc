import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Lock, Mail, Moon, ShieldCheck, Sun, X } from 'lucide-react';
import { PopcornBrandLogo } from './PlatformLogoEmblem';
import { buildApiUrl } from '../addons/stremioProtocol';
import type { UserStatePayload } from '../server/streamzDb';

interface AuthGatePageProps {
  onAuthenticated: (token: string, state: UserStatePayload) => void;
  onClose?: () => void;
  onTamperDetected?: () => void;
  themeMode?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const AuthGatePage: React.FC<AuthGatePageProps> = ({
  onAuthenticated,
  onClose,
  onTamperDetected,
  themeMode = 'dark',
  onToggleTheme,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const shellRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Anti-Tamper DevTools / Inspect Element Guard:
  // Prevents hiding, restyling, or removing the login gate via browser DevTools.
  useEffect(() => {
    let disposed = false;

    const enforceIntegrity = () => {
      if (disposed) return;
      const shell = shellRef.current;
      const card = cardRef.current;

      if (!shell || !card || !document.body.contains(shell) || !shell.contains(card)) {
        if (onTamperDetected) {
          onTamperDetected();
        }
        return;
      }

      shell.removeAttribute('hidden');
      shell.removeAttribute('inert');
      card.removeAttribute('hidden');
      card.removeAttribute('inert');

      const requiredShellStyles: Array<[string, string]> = [
        ['display', 'flex'],
        ['visibility', 'visible'],
        ['opacity', '1'],
        ['pointer-events', 'auto'],
        ['position', 'fixed'],
        ['inset', '0px'],
        ['width', '100vw'],
        ['height', '100vh'],
        ['z-index', '2147483647'],
        ['transform', 'none'],
      ];
      for (const [prop, val] of requiredShellStyles) {
        if (
          shell.style.getPropertyValue(prop) !== val ||
          shell.style.getPropertyPriority(prop) !== 'important'
        ) {
          shell.style.setProperty(prop, val, 'important');
        }
      }

      const requiredCardStyles: Array<[string, string]> = [
        ['display', 'flex'],
        ['visibility', 'visible'],
        ['opacity', '1'],
        ['pointer-events', 'auto'],
        ['transform', 'none'],
      ];
      for (const [prop, val] of requiredCardStyles) {
        if (
          card.style.getPropertyValue(prop) !== val ||
          card.style.getPropertyPriority(prop) !== 'important'
        ) {
          card.style.setProperty(prop, val, 'important');
        }
      }
    };

    enforceIntegrity();

    const observer = new MutationObserver(() => {
      enforceIntegrity();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'inert'],
    });

    const intervalId = window.setInterval(enforceIntegrity, 250);

    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(intervalId);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onTamperDetected, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setErrorMsg('Please enter a valid email address (e.g. name@domain.com).');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('Please enter your account password (minimum 6 characters).');
      return;
    }

    setLoading(true);

    try {
      const resp = await fetch(buildApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password,
        }),
      });

      const rawText = await resp.text();
      let data: {
        token?: string;
        state?: UserStatePayload;
        error?: string;
      } = {};
      if (rawText.trim()) {
        try {
          data = JSON.parse(rawText) as typeof data;
        } catch {
          throw new Error(
            resp.status >= 500
              ? 'Backend server is waking up. Please try again in a few seconds.'
              : 'Unable to sign in right now. Please try again.',
          );
        }
      } else if (!resp.ok) {
        throw new Error(
          resp.status >= 500
            ? 'Backend server is waking up. Please try again in a few seconds.'
            : 'Invalid email or password.',
        );
      }

      if (!resp.ok || !data.token || !data.state) {
        throw new Error(data.error || 'Invalid email or password.');
      }

      onAuthenticated(data.token, data.state);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={shellRef}
      className="auth-gate-shell"
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (onClose) onClose();
      }}
    >
      <div className="auth-backdrop-vignette" />

      <div className="auth-centered-stage" onClick={(e) => e.stopPropagation()}>
        <div ref={cardRef} className="auth-card-panel">
          <div className="auth-card-top-actions">
            {onToggleTheme && (
              <button
                type="button"
                className="auth-theme-toggle-btn"
                onClick={onToggleTheme}
                title={
                  themeMode === 'dark'
                    ? 'Switch to Light Mode'
                    : 'Switch to Dark Mode'
                }
                aria-label="Toggle color theme"
              >
                {themeMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </button>
            )}
            {onClose && (
              <button
                type="button"
                className="auth-close-btn"
                onClick={onClose}
                aria-label="Close sign in"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Brand Header */}
          <div className="auth-header-block">
            <div className="auth-brand-mark">
              <PopcornBrandLogo />
              <div className="auth-brand-text">
                <span className="auth-brand-name">FABLEARC</span>
                <span className="auth-brand-tagline">Stories in Every Frame.</span>
              </div>
            </div>

            <h1 className="auth-title">Sign in to your account</h1>
            <p className="auth-subtitle">
              Sign in to watch movies &amp; series, manage your watchlist, and access all platform features.
            </p>
            <div className="auth-admin-only-notice">
              <ShieldCheck size={14} />
              <span>Invite-Only · Contact your admin if you need an account</span>
            </div>
          </div>

          {/* Sign In Form (No self-signup & no demo quick profiles) */}
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label htmlFor="auth-email">Email Address</label>
              <div className="auth-input-wrap">
                <Mail size={16} />
                <input
                  id="auth-email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <div className="auth-input-wrap">
                <Lock size={16} />
                <input
                  id="auth-password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  minLength={6}
                  required
                />
              </div>
            </div>

            {errorMsg && <div className="auth-error-banner">{errorMsg}</div>}

            <button
              type="submit"
              className="auth-primary-submit"
              disabled={loading}
            >
              <span>{loading ? 'Signing in…' : 'Sign In'}</span>
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
