import { useEffect, useState } from 'react';
import { ArrowRight, KeyRound, LoaderCircle, LockKeyhole, Mail, RefreshCw, Settings2, Sparkles, Zap } from 'lucide-react';

const messages = [
  'Entering the Realm of Expenses…',
  'Summoning the Expense Dragon…',
  'Preparing Your Quest…',
  'Counting Your Gold… Wait, Your Expenses!',
  'Sharpening Your Financial Skills…',
  'Your Next Adventure Awaits…',
];

export default function StartupScreen({ status, completed, total, error, notice, onRetry, onOpenSettings, onAuthenticate }) {
  const [visible, setVisible] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 140);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status !== 'loading' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => setMessageIndex((index) => (index + 1) % messages.length), 2800);
    return () => window.clearInterval(timer);
  }, [status]);

  async function submit(event) {
    event.preventDefault();
    setAuthError('');
    setBusy(true);
    try {
      await onAuthenticate(mode, email, password);
    } catch (cause) {
      setAuthError(cause.message || 'We could not sign you in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`startup-screen ${visible ? 'is-visible' : ''}`} role="dialog" aria-modal="true" aria-labelledby="startup-title" aria-describedby="startup-description">
      <div className="startup-stars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
      <div className="startup-frame">
        <div className="startup-brand"><span className="startup-brand-icon"><Zap size={17} fill="currentColor" /></span><span>EXPENSE<span> QUEST</span><small>YOUR MONEY. YOUR MISSION.</small></span></div>
        <div className="startup-dragon" aria-hidden="true">
          <div className="dragon-aura" />
          <svg viewBox="0 0 240 200" role="presentation">
            <defs><linearGradient id="dragonMetal" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#d8c1ff"/><stop offset=".45" stopColor="#8960d8"/><stop offset="1" stopColor="#51328e"/></linearGradient><linearGradient id="dragonGold" x1="0" x2="1"><stop stopColor="#ffda88"/><stop offset="1" stopColor="#b7792d"/></linearGradient></defs>
            <path d="M53 142 22 159l28-2-13 20 37-14M177 142l42 17-31-1 16 20-44-16" fill="url(#dragonMetal)" stroke="#d7c6ff" strokeWidth="2" strokeLinejoin="round"/>
            <path d="m83 119-30-57 56 27 12-12 7 12 29-27-8 51-16 30-53 1z" fill="url(#dragonMetal)" stroke="#d9c8ff" strokeWidth="2" strokeLinejoin="round"/>
            <path d="m84 79-14-42 37 31M151 75l25-39-5 48" fill="url(#dragonGold)" stroke="#ffe4ac" strokeWidth="2" strokeLinejoin="round"/>
            <path d="M95 85c14-12 34-12 47 0l14 35-34 32-35-29z" fill="#352254" stroke="#cbb2ff" strokeWidth="2"/>
            <path d="M107 101h8m14 0h8" stroke="#ffe29b" strokeWidth="5" strokeLinecap="round"/><path d="m119 110-6 9 8 3" fill="none" stroke="#d4b2ff" strokeWidth="2" strokeLinecap="round"/>
            <path d="m83 116-30 13 22 7m82-20 28 13-21 8" fill="none" stroke="#cbb2ff" strokeWidth="3" strokeLinecap="round"/>
            <path d="m104 143 4 25 13-15 12 15 5-25" fill="url(#dragonGold)" stroke="#ffe2a0" strokeWidth="2" strokeLinejoin="round"/>
            <path d="M120 157v25" stroke="#f1c36c" strokeWidth="3" strokeLinecap="round"/>
          </svg>
          <span className="dragon-rune rune-one">✦</span><span className="dragon-rune rune-two">✧</span><span className="dragon-rune rune-three">✦</span>
        </div>
        <div className="startup-copy">
          <span className="startup-eyebrow"><Sparkles size={12} /> THE REALM IS STIRRING</span>
          <h1 id="startup-title">Expense <em>Quest</em></h1>
          <p id="startup-description">A clearer view of your spending, one quest at a time.</p>
        </div>

        {status === 'loading' && <div className="startup-loading" role="status" aria-live="polite">
          <div className="startup-message"><LoaderCircle size={15} className="startup-spinner" />{messages[messageIndex]}</div>
          <div className="startup-progress-track" role="progressbar" aria-label="Application setup" aria-valuemin="0" aria-valuemax={Math.max(total, 1)} aria-valuenow={completed}><i style={{ width: `${total ? Math.min(100, Math.round(completed / total * 100)) : 0}%` }} /></div>
          <small>Connecting your account and restoring your adventure</small>
        </div>}

        {status === 'error' && <div className="startup-state" role="alert">
          <span className="startup-state-icon"><RefreshCw size={17} /></span><h2>Couldn’t reach the realm</h2>
          <p>{error || 'Expense Quest could not finish connecting to the backend. Your saved progress is still safe.'}</p>
          <div className="startup-actions"><button className="startup-primary" onClick={onRetry}><RefreshCw size={15} /> Retry connection</button><button className="startup-secondary" onClick={onOpenSettings}><Settings2 size={15} /> Connection settings</button></div>
        </div>}

        {status === 'auth' && <form className="startup-auth" onSubmit={submit}>
          <div className="startup-auth-heading"><LockKeyhole size={16} /><span>{mode === 'login' ? 'WELCOME BACK, ADVENTURER' : 'CREATE YOUR ADVENTURER ACCOUNT'}</span></div>
          {notice && <p className="startup-auth-notice" role="status">{notice}</p>}
          <label><span>Email address</span><span className="startup-input"><Mail size={15} /><input type="email" autoComplete="email" required maxLength="254" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></span></label>
          <label><span>Password</span><span className="startup-input"><KeyRound size={15} /><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength="10" maxLength="128" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 10 characters" /></span></label>
          {authError && <p className="startup-auth-error" role="alert">{authError}</p>}
          <button className="startup-primary startup-auth-submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="startup-spinner" /> : <ArrowRight size={15} />}{busy ? 'Opening the portal…' : mode === 'login' ? 'Enter the realm' : 'Create account'}</button>
          <button className="startup-auth-toggle" type="button" onClick={() => { setMode((value) => value === 'login' ? 'register' : 'login'); setAuthError(''); }}>{mode === 'login' ? 'New to Expense Quest? Create an account' : 'Already have an account? Sign in'}</button>
        </form>}

        <footer className="startup-footnote"><span><i /> PERSONAL PROGRESS, SAVED SECURELY</span><span>BUILT FOR REAL-WORLD FINANCES</span></footer>
      </div>
    </section>
  );
}
