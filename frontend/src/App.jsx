import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, BarChart3, Check, ChevronRight, CircleHelp, CloudUpload, Coins, FileText, Flame, LayoutDashboard, LoaderCircle, LockKeyhole, Menu, Receipt, RefreshCw, Settings, ShieldCheck, Sparkles, Target, TrendingUp, Trophy, Upload, Wallet, X, Zap } from 'lucide-react';
import './extra.css';

const CATEGORIES = ['Food', 'Shopping', 'Travel', 'Bills', 'Entertainment', 'Healthcare', 'Education', 'Other'];
let apiBase = localStorage.getItem('expenseQuestApi') || import.meta.env.VITE_API_URL || '';
async function api(path, options = {}) {
  const response = await fetch(`${apiBase}/api${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
const money = value => new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);

export default function App() {
  const [page, setPage] = useState('home');
  const [quest, setQuest] = useState(null);
  const [player, setPlayer] = useState({ xp: 0, level: 1, questsCompleted: 0 });
  const [transactions, setTransactions] = useState([]);
  const [current, setCurrent] = useState(null);
  const [report, setReport] = useState(null);
  const [skipped, setSkipped] = useState([]);
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [apiDialog, setApiDialog] = useState(false);
  const [apiInput, setApiInput] = useState(apiBase);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [undoId, setUndoId] = useState(null);
  const [category, setCategory] = useState('Other');

  const notify = message => { setToast(message); window.setTimeout(() => setToast(''), 3200); };
  async function loadPlayer() { try { const result = await api('/player'); setPlayer(result.player || { xp: 0, level: 1, questsCompleted: 0 }); } catch {} }
  useEffect(() => { loadPlayer(); }, []);
  const openQuest = async () => {
    if (!quest) return;
    setBusy(true); setError('');
    try {
      const [q, list] = await Promise.all([api(`/quests/${quest.id}`), api(`/quests/${quest.id}/transactions`)]);
      setQuest(q.quest); setTransactions(list.transactions); setSkipped([]);
      setCurrent(list.transactions.find(item => !item.reviewed) || null); setPage('battle');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  useEffect(() => { setCategory(current?.category || current?.suggestedCategory || 'Other'); }, [current?.id]);
  async function upload() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.append('file', file);
      const result = await api('/quests/upload', { method: 'POST', body: form });
      const [freshQuest, freshTransactions] = await Promise.all([api(`/quests/${result.quest.id}`), api(`/quests/${result.quest.id}/transactions`)]);
      setQuest(freshQuest.quest);
      const items = freshTransactions.transactions;
      setTransactions(items); setCurrent(items[0] || null); setSkipped([]); setFile(null); setPage('battle');
      notify(`${result.quest.totalTransactions} expenses ready to review`); await loadPlayer();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function advance(excluded = skipped) {
    const list = await api(`/quests/${quest.id}/transactions`);
    setTransactions(list.transactions); setCurrent(list.transactions.find(item => !item.reviewed && !excluded.includes(item.id)) || null);
    const q = await api(`/quests/${quest.id}`); setQuest(q.quest);
  }
  async function review() {
    if (!current) return;
    setBusy(true); setError('');
    try {
      const result = await api(`/transactions/${current.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category }) });
      setUndoId(current.id); setPlayer(result.player || { xp: player.xp || 0, level: player.level || 1, questsCompleted: player.questsCompleted || 0 });
      const nextQuest = await api(`/quests/${quest.id}`); setQuest(nextQuest.quest);
      await advance(skipped);
      const list = await api(`/quests/${quest.id}/transactions`); setTransactions(list.transactions);
      const next = list.transactions.find(item => !item.reviewed && !skipped.includes(item.id));
      setCurrent(next || null);
      if (!next) { setPage('victory'); notify('Quest complete. Progress verified by the server.'); }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function skip() {
    if (!current) return;
    setBusy(true); setError('');
    try { await api(`/transactions/${current.id}/skip`, { method: 'POST' }); const nextSkipped = [...skipped, current.id]; setSkipped(nextSkipped); await advance(nextSkipped); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function undo() {
    if (!undoId) return;
    setBusy(true); setError('');
    try { const result = await api(`/transactions/${undoId}/undo`, { method: 'POST' }); setPlayer(result.player); setPage('battle'); await openQuest(); setUndoId(null); notify('Most recent review undone'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function showReport() {
    if (!quest) return;
    setBusy(true); setError('');
    try { const result = await api(`/quests/${quest.id}/report`); setReport(result.report); setPage('report'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function saveApi() {
    apiBase = apiInput.trim().replace(/\/$/, ''); localStorage.setItem('expenseQuestApi', apiBase);
    setApiDialog(false); notify('Backend connection saved'); loadPlayer();
  }
  const nav = [['home', 'Overview', LayoutDashboard], ['battle', 'Quest board', Target], ['report', 'Spending report', BarChart3]];
  const progress = quest?.progress || { reviewed: 0, total: quest?.totalTransactions || 0, percent: 0, bossHealth: 100 };

  return <div className="app">
    <header className="topbar">
      <button className="hamb" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Open menu"><Menu /></button>
      <div className="brand" onClick={() => setPage('home')}><span className="brand-symbol"><Zap size={18} /></span><span>EXPENSE<span className="brand-light">QUEST</span><small>YOUR MONEY. YOUR MISSION.</small></span></div>
      <div className="top-center"><span className="avatar">{player.level}</span><div className="level-meta"><b>LEVEL {player.level} · MONEY MAGE</b><div className="xpbar"><i style={{ width: `${player.xp % 100}%` }} /></div></div><span className="xp-label" key={player.xp}>{player.xp} XP</span></div>
      <div className="top-actions"><span className="coin-pill"><Coins size={15} />{Math.floor(player.xp / 10)} <small>COINS</small></span><button className="settings-button" title="API connection" onClick={() => setApiDialog(true)}><Settings size={17} /></button></div>
    </header>
    <div className="app-layout">
      <aside className={`sidebar ${mobileOpen ? 'show' : ''}`}>
        <div className="nav-caption">YOUR SPACE</div>
        {nav.map(([id, label, Icon]) => <button key={id} className={`nav-link ${page === id ? 'active' : ''}`} onClick={() => { setMobileOpen(false); if (id === 'report') showReport(); else if (id === 'battle') openQuest(); else setPage(id); }}><Icon size={18} />{label}</button>)}
        <div className="nav-divider" /><div className="nav-caption">YOUR QUEST</div>
        {quest ? <button className="quest-shortcut" onClick={openQuest}><span className="small-boss"><Flame size={15} /></span><span><b>Expense Dragon</b><small>{progress.reviewed} / {progress.total} reviewed</small></span><ChevronRight size={14} /></button> : <div className="empty-shortcut"><LockKeyhole size={15} /> Upload a CSV to unlock</div>}
        <div className="sidebar-bottom"><div className="secure-card"><ShieldCheck size={17} /><span><b>Private by design</b><small>Use your own backend URL.</small></span></div><button className="nav-link" onClick={() => setApiDialog(true)}><Settings size={17} />Preferences</button></div>
      </aside>
      <main className="main">
        {error && <div className="error-banner" role="alert"><CircleHelp size={17} />{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={15} /></button></div>}
        {page === 'home' && <>
          <div className="welcome-row"><div><div className="overline">YOUR FINANCES ARE WAITING</div><h1>Make money<br /><em>make sense.</em></h1><p>Turn your expense pile into a quest you can actually finish.</p></div><div className="welcome-emblem"><div className="emblem-circle"><Wallet size={31} /></div><span>YOUR NEXT<br />GREAT ADVENTURE</span></div></div>
          <div className="dashboard-grid"><section className="upload-panel"><div className="panel-title"><div><span className="step-tag">01 / BEGIN QUEST</span><h2>Drop in your expenses</h2><p>Upload a bank or card statement CSV. We’ll sort the real transactions into a reviewable quest.</p></div><div className="upload-icon"><CloudUpload size={21} /></div></div>
            <label className={`dropzone ${drag ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}><input type="file" accept=".csv,text/csv" onChange={e => setFile(e.target.files?.[0] || null)} /><div className="upload-cloud"><Upload size={20} /></div><b>{file?.name || 'Choose a CSV or drag it here'}</b><span>{file ? `${(file.size / 1024).toFixed(0)} KB · ready to upload` : 'Date · Description or Merchant · Amount'}</span><small>CSV ONLY · UP TO 5 MB</small></label>
            <div className="upload-footer"><a href="/sample-expenses.csv" download><FileText size={14} /> Get a sample CSV</a><button className="button-primary" onClick={upload} disabled={!file || busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} Create my quest <ArrowRight size={15} /></button></div>
          </section><aside className="insight-column"><section className="streak-panel"><div className="fire-icon"><Flame size={19} /></div><div><small>QUESTS CLEARED</small><b>{player.questsCompleted} complete</b></div><div className="streak-dots"><i /><i /><i /><i /><i /><i /><i /></div></section>
            <section className="active-card"><div className="active-header"><span>ACTIVE QUEST</span><span className="live-dot" /><small>{quest ? 'IN PROGRESS' : 'NOT STARTED'}</small></div><div className="boss-visual"><div className="boss-art"><Flame size={55} /><Sparkles className="spark" size={15} /></div><div className="boss-copy"><span>THE FIRST ENCOUNTER</span><h3>Expense<br /><em>Dragon</em></h3></div></div><div className="boss-health"><div><span>BOSS HEALTH</span><b>{quest ? `${progress.bossHealth}%` : '—'}</b></div><div className="health-meter"><i style={{ width: `${progress.bossHealth}%` }} /></div></div><div className="active-meta"><span><Receipt size={14} />{quest ? `${quest.totalTransactions} transactions` : 'No quest yet'}</span><span><Zap size={14} />10 XP each</span></div><button className="button-primary full" onClick={openQuest} disabled={!quest || busy}>{quest ? 'Return to the battle' : 'Upload a CSV to begin'} <ArrowRight size={16} /></button></section>
            <div className="privacy-note"><ShieldCheck size={15} /><span>Expense data is kept in your connected API.<br /><button onClick={() => setApiDialog(true)}>Configure API connection</button></span></div></aside></div>
          <section className="how-row"><span>HOW IT WORKS</span><div><b><i>1</i> Upload</b><ChevronRight size={14} /><b><i>2</i> Review</b><ChevronRight size={14} /><b><i>3</i> Level up</b><ChevronRight size={14} /><b><i>4</i> See the big picture</b></div></section>
        </>}
        {page === 'battle' && <>
          <div className="battle-topline"><div><button className="back-link" onClick={() => setPage('home')}><ArrowLeft size={14} /> Overview</button><div className="overline">QUEST 01 · EXPENSE DRAGON</div><h1>The daily <em>spend.</em></h1></div><button className="button-secondary" onClick={showReport}><BarChart3 size={15} /> Report</button></div>
          {quest && <div className="quest-stats-row"><div className="boss-banner"><div className="boss-face"><Flame size={30} /></div><div><span>THE BOSS</span><b>Expense Dragon</b><small>{Math.max(progress.total - progress.reviewed, 0)} transactions left</small></div><div className="boss-health-wide"><span>BOSS HEALTH <b>{progress.bossHealth}%</b></span><div className="health-meter"><i style={{ width: `${progress.bossHealth}%` }} /></div></div></div><div className="battle-metrics"><div><span>QUEST PROGRESS</span><b>{progress.reviewed}<small> / {progress.total}</small></b><div className="thin-meter"><i style={{ width: `${progress.percent}%` }} /></div></div><div><span>REWARD</span><b className="gold-text"><Zap size={14} />10 XP</b></div><div><span>PLAYER LEVEL</span><b><Trophy size={14} />{player.level}</b></div></div></div>}
          {!quest && <div className="empty-quest"><Target size={30} /><h2>No active quest yet</h2><p>Upload an expense CSV to summon your first boss.</p><button className="button-primary" onClick={() => setPage('home')}>Go to overview <ArrowRight size={15} /></button></div>}
          {quest && current && <div className="review-layout"><section className="transaction-stage"><div className="stage-header"><span><Sparkles size={15} /> TRANSACTION TO REVIEW</span><span>{transactions.filter(item => !item.reviewed).length} in queue</span></div><div className="receipt-card"><div className="receipt-top"><span className="receipt-chip">{current.date || 'DATE NOT PROVIDED'}</span><Receipt size={16} /></div><div className="merchant-icon"><Receipt size={24} /></div><div className="merchant-name">{current.description}</div><div className="amount">{money(current.amount)}</div><div className="receipt-separator" /><div className="receipt-detail"><span>DATE</span><b>{current.date || 'Not provided'}</b></div><div className="receipt-detail"><span>DESCRIPTION</span><b>{current.description}</b></div><div className="suggested"><Sparkles size={14} /><span>RULE SUGGESTION</span><b>{current.suggestedCategory || current.suggested_category || 'Other'}</b></div></div></section><section className="decision-panel"><div className="decision-heading"><span className="step-tag">YOUR TURN</span><h2>Where does this<br /><em>expense belong?</em></h2><p>Choose the category that fits. Your decision is saved to your quest.</p></div><div className="category-grid">{CATEGORIES.map((value, index) => <button key={value} className={`category-choice ${category === value ? 'chosen' : ''}`} onClick={() => setCategory(value)}><span className="category-glyph">{['🍜', '🛍️', '🚆', '🏠', '🎟️', '✚', '📚', '✧'][index]}</span>{value}{category === value && <Check size={14} />}</button>)}</div><div className="decision-footer"><button className="skip-button" onClick={skip} disabled={busy}><ArrowRight size={14} /> Skip for now</button><button className="button-primary" onClick={review} disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Confirm & earn 10 XP</button></div></section></div>}
          {quest && !current && <div className="empty-quest victory-inline"><div className="victory-check"><Trophy size={28} /></div><span className="overline">{progress.reviewed === progress.total ? 'ALL CLEAR' : 'PAUSED FOR LATER'}</span><h2>{progress.reviewed === progress.total ? 'Every transaction reviewed.' : 'The rest can wait.'}</h2><p>{progress.reviewed === progress.total ? 'Your expenses are organized and your progress is verified.' : `${skipped.length} transaction${skipped.length === 1 ? '' : 's'} skipped. Review them whenever you’re ready.`}</p><div className="empty-actions">{progress.reviewed === progress.total ? <><button className="button-primary" onClick={showReport}>View spending report <ArrowRight size={15} /></button><a className="button-secondary" href={`${apiBase}/api/quests/${quest.id}/export`}><ArrowDownToLine size={15} /> Download CSV</a></> : <button className="button-primary" onClick={() => { setSkipped([]); openQuest(); }}>Review skipped transactions <ArrowRight size={15} /></button>}{undoId && <button className="skip-button" onClick={undo}>Undo last review</button>}</div></div>}
        </>}
        {page === 'report' && <Report quest={quest} report={report} showReport={showReport} />}
        {page === 'victory' && <div className="victory-screen"><div className="victory-orbit"><div><Trophy size={35} /></div></div><span className="overline">QUEST VERIFIED · ALL TRANSACTIONS REVIEWED</span><h1>Dragon <em>down.</em></h1><p>Your rewards are based on completed reviews and actual transaction data.</p><div className="victory-rewards"><div><span>TRANSACTIONS REVIEWED</span><b>{progress.reviewed}</b></div><div><span>TOTAL XP</span><b>{player.xp}</b></div><div><span>QUEST STATUS</span><b>Complete <Check size={15} /></b></div></div><div className="empty-actions"><button className="button-primary" onClick={showReport}>See my spending report <ArrowRight size={15} /></button><button className="button-secondary" onClick={() => setPage('home')}>Back to overview</button>{undoId && <button className="skip-button" onClick={undo}>Undo last review</button>}</div></div>}
      </main>
    </div>
    {apiDialog && <div className="modal-scrim" onClick={() => setApiDialog(false)}><div className="api-modal" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={() => setApiDialog(false)}><X size={17} /></button><span className="step-tag">CONNECTION SETTINGS</span><h2>Connect your quest API</h2><p>Enter the public URL of your Expense Quest backend. Leave blank to use this site’s origin.</p><label>BACKEND BASE URL<input value={apiInput} onChange={event => setApiInput(event.target.value)} placeholder="https://your-api.example.com" /></label><button className="button-primary" onClick={saveApi}>Save connection <Check size={15} /></button></div></div>}
    {toast && <div className="toast" role="status" aria-live="polite"><Check size={16} />{toast}</div>}
  </div>;
}

function Report({ quest, report, showReport }) {
  if (!quest) return <div className="empty-quest"><BarChart3 /><h2>No report to show</h2><p>Start a quest to organize your actual expenses.</p></div>;
  if (!report) return <div className="empty-quest"><button className="button-primary" onClick={showReport}>Load spending report</button></div>;
  const max = Math.max(...report.categorySpending.map(item => item.spending), 1);
  return <><div className="report-heading"><div><span className="overline">YOUR REAL SPENDING · QUEST {quest.id}</span><h1>The money <em>map.</em></h1><p>Every number is calculated from your uploaded expenses.</p></div><a className="button-primary" href={`${apiBase}/api/quests/${quest.id}/export`}><ArrowDownToLine size={15} /> Download categorized CSV</a></div><div className="report-kpis"><div><span>TOTAL SPENDING</span><b>{money(report.totalExpenses)}</b><small>{report.totalTransactions} transactions</small></div><div><span>AVERAGE TRANSACTION</span><b>{money(report.averageTransactionAmount)}</b><small>Across this quest</small></div><div><span>TOP CATEGORY</span><b>{report.highestSpendingCategory || '—'}</b><small>By total amount</small></div><div><span>LARGEST PURCHASE</span><b>{money(report.largestTransaction?.amount)}</b><small>{report.largestTransaction?.description || '—'}</small></div></div><div className="report-grid"><section className="report-card"><div className="report-card-title"><BarChart3 /><div><h2>Where it went</h2><p>Spending by category</p></div></div>{report.categorySpending.map((item, index) => <div className="category-bar" key={item.category}><div><span><i className={`legend-dot dot-${index % 6}`} />{item.category}</span><b>{money(item.spending)}</b></div><div className="thin-meter"><i style={{ width: `${item.spending / max * 100}%` }} /></div><small>{item.count} transactions</small></div>)}</section><section className="report-card"><div className="report-card-title"><TrendingUp /><div><h2>Monthly rhythm</h2><p>Based on dates in your CSV</p></div></div>{report.monthlySpending.length ? report.monthlySpending.map(item => <div className="month-row" key={item.month}><span>{item.month}</span><div className="thin-meter"><i style={{ width: `${item.spending / Math.max(...report.monthlySpending.map(row => row.spending), 1) * 100}%` }} /></div><b>{money(item.spending)}</b></div>) : <div className="empty-month"><FileText size={20} /><p>No usable dates were included in this CSV.</p></div>}</section></div></>;
}
