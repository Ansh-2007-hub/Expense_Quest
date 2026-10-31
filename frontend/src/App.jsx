import { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  CloudUpload,
  FileText,
  Flame,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Printer,
  Receipt,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Upload,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import TransactionManager from './TransactionManager.jsx';
import './extra.css';
import {
  analyzeMappedCsv,
  buildCanonicalCsv,
  inferColumnMapping,
  parseCsv,
} from './csvPreview.mjs';

const CATEGORIES = [
  'Food',
  'Shopping',
  'Travel',
  'Bills',
  'Entertainment',
  'Healthcare',
  'Education',
  'Other',
];
const PRODUCTION_API_BASE = 'https://expense-quest-api.onrender.com';
const isLocalApiBase = (value) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(
    value || '',
  );
const configuredApiBase =
  import.meta.env.VITE_API_URL?.trim() || PRODUCTION_API_BASE;
const safeConfiguredApiBase =
  import.meta.env.PROD && isLocalApiBase(configuredApiBase)
    ? PRODUCTION_API_BASE
    : configuredApiBase;
const savedApiBase = localStorage.getItem('expenseQuestApi')?.trim();
let apiBase =
  savedApiBase && !(import.meta.env.PROD && isLocalApiBase(savedApiBase))
    ? savedApiBase.replace(/\/+$/, '')
    : safeConfiguredApiBase.replace(/\/+$/, '');
if (!savedApiBase || (import.meta.env.PROD && isLocalApiBase(savedApiBase)))
  localStorage.setItem('expenseQuestApi', apiBase);
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBase}/api${path}`, options);
  } catch {
    throw new Error(
      `Could not reach the backend at ${apiBase}. Check the API URL and make sure this site is allowed by backend CORS.`,
    );
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      body.error || `Request failed (${response.status})`,
    );
    error.status = response.status;
    throw error;
  }
  return body;
}
const money = (value, currency) => {
  const amount = Number(value) || 0;
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
      }).format(amount);
    } catch {
      return `${currency} ${new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)}`;
    }
  }
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export default function App() {
  const [page, setPage] = useState('home');
  const [quest, setQuest] = useState(null);
  const [player, setPlayer] = useState({ xp: 0, level: 1, questsCompleted: 0 });
  const [transactions, setTransactions] = useState([]);
  const [current, setCurrent] = useState(null);
  const [report, setReport] = useState(null);
  const [budgetInfo, setBudgetInfo] = useState(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [skipped, setSkipped] = useState([]);
  const [file, setFile] = useState(null);
  const [parsedCsv, setParsedCsv] = useState(null);
  const [columnMapping, setColumnMapping] = useState({
    date: null,
    description: null,
    amount: null,
    debit: null,
    credit: null,
    currency: null,
    category: null,
    direction: null,
  });
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [negativeAmountMeans, setNegativeAmountMeans] = useState('credit');
  const [confirmedQuestImport, setConfirmedQuestImport] = useState(false);
  const [excludeInvalidRows, setExcludeInvalidRows] = useState(false);
  const [excludeDuplicateRows, setExcludeDuplicateRows] = useState(false);
  const [serverPreview, setServerPreview] = useState(null);
  const [canonicalCsv, setCanonicalCsv] = useState('');
  const [savingCategoryId, setSavingCategoryId] = useState(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [apiDialog, setApiDialog] = useState(false);
  const [apiInput, setApiInput] = useState(apiBase);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [undoId, setUndoId] = useState(null);
  const [category, setCategory] = useState('Other');
  const [combatHit, setCombatHit] = useState(false);

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };
  async function loadPlayer() {
    try {
      const result = await api('/player');
      setPlayer(result.player || { xp: 0, level: 1, questsCompleted: 0 });
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      const savedQuestId = localStorage.getItem('expenseQuestId');
      try {
        const playerRequest = api('/player').catch((cause) => ({
          error: cause,
        }));
        const questRequest = savedQuestId
          ? Promise.all([
              api(`/quests/${encodeURIComponent(savedQuestId)}`),
              api(`/quests/${encodeURIComponent(savedQuestId)}/transactions`),
            ]).catch((cause) => ({ error: cause }))
          : Promise.resolve(null);
        const [playerResult, questResult] = await Promise.all([
          playerRequest,
          questRequest,
        ]);
        if (cancelled) return;
        if (playerResult.error) setError(playerResult.error.message);
        else
          setPlayer(
            playerResult.player || {
              xp: 0,
              level: 1,
              questsCompleted: 0,
              achievements: [],
            },
          );
        if (questResult?.error) {
          if (questResult.error.status === 404)
            localStorage.removeItem('expenseQuestId');
          else setError(questResult.error.message);
        } else if (questResult) {
          const restoredQuest = questResult[0].quest;
          const items = questResult[1].transactions;
          setQuest(restoredQuest);
          setTransactions(items);
          setSkipped(
            items.filter((item) => item.skipped).map((item) => item.id),
          );
          setCurrent(
            items.find((item) => !item.reviewed && !item.skipped) || null,
          );
          if (
            restoredQuest.status === 'completed' ||
            restoredQuest.progress?.completed
          )
            setPage('victory');
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setRestoring(false);
      }
    }
    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);
  const openQuest = async () => {
    if (!quest) return;
    setBusy(true);
    setError('');
    try {
      const [q, list] = await Promise.all([
        api(`/quests/${quest.id}`),
        api(`/quests/${quest.id}/transactions`),
      ]);
      setQuest(q.quest);
      setTransactions(list.transactions);
      const skippedIds = list.transactions
        .filter((item) => item.skipped)
        .map((item) => item.id);
      setSkipped(skippedIds);
      setCurrent(
        list.transactions.find((item) => !item.reviewed && !item.skipped) ||
          null,
      );
      setPage('battle');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    setCategory(current?.category || current?.suggestedCategory || 'Other');
  }, [current?.id]);
  function selectExpenseFile(nextFile) {
    if (!nextFile) return;
    setError('');
    setServerPreview(null);
    setCanonicalCsv('');
    if (!/\.csv$/i.test(nextFile.name)) {
      setFile(null);
      setParsedCsv(null);
      setError('Choose a .csv file. Your original file has not been uploaded.');
      return;
    }
    if (nextFile.size > 5 * 1024 * 1024) {
      setFile(null);
      setParsedCsv(null);
      setError(
        'This CSV is larger than the 5 MB limit. Your file has not been uploaded.',
      );
      return;
    }
    setFile(nextFile);
    setParsedCsv(null);
    setColumnMapping({
      date: null,
      description: null,
      amount: null,
      debit: null,
      credit: null,
      currency: null,
      category: null,
      direction: null,
    });
    setSelectedCurrency('');
    setNegativeAmountMeans('credit');
    setConfirmedQuestImport(false);
    setExcludeInvalidRows(false);
    setExcludeDuplicateRows(false);
  }
  async function previewCsv() {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      const parsed = parseCsv(await file.text());
      setParsedCsv(parsed);
      setColumnMapping(inferColumnMapping(parsed.headers));
      setConfirmedQuestImport(false);
      setPage('preview');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function checkCsvWithBackend() {
    if (!parsedCsv || busy) return;
    setBusy(true);
    setError('');
    setServerPreview(null);
    setCanonicalCsv('');
    try {
      const built = buildCanonicalCsv(parsedCsv, columnMapping, {
        excludeInvalid: excludeInvalidRows,
        excludeDuplicates: excludeDuplicateRows,
        currency: selectedCurrency,
        negativeAmountMeans,
      });
      const form = new FormData();
      form.append(
        'file',
        new File([built.csv], 'expense-quest-preview.csv', {
          type: 'text/csv',
        }),
      );
      const result = await api('/quests/preview', {
        method: 'POST',
        body: form,
      });
      setCanonicalCsv(built.csv);
      setServerPreview({
        ...result,
        sourceRows: built.rows,
        removedInvalid: built.removedInvalid,
        removedDuplicates: built.removedDuplicates,
        totals: built.totals,
      });
      setConfirmedQuestImport(false);
      notify(
        `${result.preview.length} rows checked. No quest has been created yet.`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function createQuest() {
    if (
      !file ||
      !serverPreview ||
      !canonicalCsv ||
      busy ||
      serverPreview.duplicateImport ||
      !confirmedQuestImport
    )
      return;
    if (!/\.csv$/i.test(file.name)) {
      setError('Choose a .csv file to begin your quest.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append(
        'file',
        new File([canonicalCsv], 'expense-quest.csv', { type: 'text/csv' }),
      );
      const result = await api('/quests/upload', {
        method: 'POST',
        body: form,
      });
      localStorage.setItem('expenseQuestId', String(result.quest.id));
      const [freshQuest, freshTransactions] = await Promise.all([
        api(`/quests/${result.quest.id}`),
        api(`/quests/${result.quest.id}/transactions`),
      ]);
      setQuest(freshQuest.quest);
      const items = freshTransactions.transactions;
      setTransactions(items);
      setSkipped(items.filter((item) => item.skipped).map((item) => item.id));
      setCurrent(items.find((item) => !item.reviewed && !item.skipped) || null);
      setFile(null);
      setParsedCsv(null);
      setServerPreview(null);
      setCanonicalCsv('');
      setPage('battle');
      notify(
        `Quest created. ${result.quest.totalTransactions} expenses are ready to review.`,
      );
      await loadPlayer();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function advance() {
    const [list, q] = await Promise.all([
      api(`/quests/${quest.id}/transactions`),
      api(`/quests/${quest.id}`),
    ]);
    setTransactions(list.transactions);
    setSkipped(
      list.transactions.filter((item) => item.skipped).map((item) => item.id),
    );
    setCurrent(
      list.transactions.find((item) => !item.reviewed && !item.skipped) || null,
    );
    setQuest(q.quest);
  }
  async function review() {
    if (!current || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api(`/transactions/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      });
      setUndoId(current.id);
      const completed = Boolean(result.quest?.completed);
      const completedQuestCount =
        (player.questsCompleted || 0) + (completed ? 1 : 0);
      setPlayer({
        ...player,
        ...(result.player || {}),
        questsCompleted: result.player?.questsCompleted ?? completedQuestCount,
        achievements: result.player?.achievements || [],
      });
      setCombatHit(true);
      window.setTimeout(() => setCombatHit(false), 720);
      const nextTransactions = transactions.map((item) =>
        item.id === result.transaction.id ? result.transaction : item,
      );
      setTransactions(nextTransactions);
      setSkipped(
        nextTransactions.filter((item) => item.skipped).map((item) => item.id),
      );
      const nextQuest = {
        ...quest,
        status: completed ? 'completed' : 'active',
        reviewedTransactions: result.quest.reviewed,
        progress: {
          ...quest.progress,
          reviewed: result.quest.reviewed,
          total: result.quest.total,
          percent: result.quest.total
            ? Math.round((result.quest.reviewed / result.quest.total) * 100)
            : 100,
          bossHealth: result.quest.bossHealth,
          completed,
        },
      };
      setQuest(nextQuest);
      const next = nextTransactions.find(
        (item) => !item.reviewed && !item.skipped,
      );
      setCurrent(next || null);
      if (completed) {
        setPage('victory');
        notify('Quest complete. Progress verified by the server.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function skip() {
    if (!current || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api(`/transactions/${current.id}/skip`, {
        method: 'POST',
      });
      const nextTransactions = transactions.map((item) =>
        item.id === current.id ? result.transaction : item,
      );
      setTransactions(nextTransactions);
      setSkipped(
        nextTransactions.filter((item) => item.skipped).map((item) => item.id),
      );
      setCurrent(
        nextTransactions.find((item) => !item.reviewed && !item.skipped) ||
          null,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function undo() {
    if (!undoId || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api(`/transactions/${undoId}/undo`, {
        method: 'POST',
      });
      const updatedTransactions = transactions.map((item) =>
        item.id === undoId ? result.transaction : item,
      );
      setTransactions(updatedTransactions);
      setSkipped(
        updatedTransactions
          .filter((item) => item.skipped)
          .map((item) => item.id),
      );
      const completedQuestCount = Math.max(
        0,
        player.questsCompleted - (quest?.status === 'completed' ? 1 : 0),
      );
      setPlayer({
        ...player,
        ...result.player,
        questsCompleted: result.player?.questsCompleted ?? completedQuestCount,
        achievements: result.player?.achievements || [],
      });
      setQuest(result.quest);
      setCurrent(result.transaction);
      setPage('battle');
      setUndoId(null);
      notify('Most recent review undone');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function showReport() {
    if (!quest) return;
    setBusy(true);
    setError('');
    try {
      const result = await api(`/quests/${quest.id}/report`);
      setReport(result.report);
      if (quest.currency) {
        try {
          const budget = await api(`/budgets/${encodeURIComponent(quest.currency)}`);
          setBudgetInfo(budget);
          setBudgetInput(budget.budget?.monthlyAmount?.toString() || '');
        } catch (budgetError) {
          setBudgetInfo(null);
          setError(`Report loaded, but the monthly budget could not be loaded: ${budgetError.message}`);
        }
      } else {
        setBudgetInfo(null);
        setBudgetInput('');
      }
      setPage('report');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveMonthlyBudget(amount = budgetInput) {
    if (!quest?.currency || savingBudget) return;
    const monthlyAmount = amount === '' ? 0 : Number(amount);
    if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0) {
      setError('Enter a valid non-negative monthly budget.');
      return;
    }
    setSavingBudget(true);
    setError('');
    try {
      const result = await api(`/budgets/${encodeURIComponent(quest.currency)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyAmount }),
      });
      setBudgetInfo(result);
      setBudgetInput(result.budget?.monthlyAmount?.toString() || '');
      notify(result.budget ? 'Monthly budget saved.' : 'Monthly budget cleared.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSavingBudget(false);
    }
  }
  async function resumeTransaction(transaction) {
    setError('');
    try {
      const result = transaction.skipped
        ? await api(`/transactions/${transaction.id}/unskip`, {
            method: 'POST',
          })
        : { transaction };
      const updated = { ...result.transaction, skipped: false };
      const nextTransactions = transactions.map((item) =>
        item.id === updated.id ? updated : item,
      );
      setTransactions(nextTransactions);
      setSkipped(
        nextTransactions.filter((item) => item.skipped).map((item) => item.id),
      );
      setCurrent(updated);
      setPage('battle');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e.message);
    }
  }
  function focusTransaction(transaction) {
    if (transaction.skipped) {
      resumeTransaction(transaction);
      return;
    }
    setCurrent(transaction);
    setPage('battle');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function saveCategoryCorrection(transactionId, nextCategory) {
    setSavingCategoryId(transactionId);
    setError('');
    try {
      const result = await api(`/transactions/${transactionId}/category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: nextCategory }),
      });
      setTransactions((items) =>
        items.map((item) =>
          item.id === transactionId ? result.transaction : item,
        ),
      );
      if (current?.id === transactionId) {
        setCurrent(result.transaction);
        setCategory(nextCategory);
      }
      notify('Category corrected. XP and quest progress stayed the same.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingCategoryId(null);
    }
  }
  async function saveBulkCategoryCorrection(transactionIds, nextCategory) {
    setError('');
    const outcomes = [];
    for (let index = 0; index < transactionIds.length; index += 5) {
      const batch = transactionIds.slice(index, index + 5);
      outcomes.push(
        ...(await Promise.allSettled(
          batch.map((id) =>
            api(`/transactions/${id}/category`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ category: nextCategory }),
            }),
          ),
        )),
      );
    }
    const saved = outcomes.flatMap((outcome) =>
      outcome.status === 'fulfilled' ? [outcome.value.transaction] : [],
    );
    const failed = outcomes.filter((outcome) => outcome.status === 'rejected');
    if (saved.length) {
      const savedById = new Map(saved.map((transaction) => [transaction.id, transaction]));
      setTransactions((items) => items.map((item) => savedById.get(item.id) || item));
      setCurrent((item) => item && savedById.get(item.id) ? savedById.get(item.id) : item);
      notify(`${saved.length} transaction${saved.length === 1 ? '' : 's'} updated. XP and quest progress stayed the same.`);
    }
    if (failed.length) {
      const reason = failed[0].reason;
      setError(`${saved.length} of ${transactionIds.length} categories saved. ${reason?.message || 'Some updates failed; retry the remaining selection.'}`);
    }
    return saved.map((transaction) => transaction.id);
  }
  function saveApi() {
    apiBase = apiInput.trim().replace(/\/+$/, '') || PRODUCTION_API_BASE;
    localStorage.setItem('expenseQuestApi', apiBase);
    setApiInput(apiBase);
    setError('');
    setApiDialog(false);
    notify('Backend connection saved');
    loadPlayer();
  }
  const nav = [
    ['home', 'Overview', LayoutDashboard],
    ['battle', 'Review expenses', Target],
    ['transactions', 'Transactions', Receipt],
    ['report', 'Reports', BarChart3],
  ];
  const progress = quest?.progress || {
    reviewed: 0,
    total: quest?.totalTransactions || 0,
    percent: 0,
    bossHealth: 100,
  };
  const questSpend = transactions.reduce(
    (sum, item) =>
      sum + (item.direction === 'credit' ? 0 : Number(item.amount) || 0),
    0,
  );
  const questCredits = transactions.reduce(
    (sum, item) =>
      sum + (item.direction === 'credit' ? Number(item.amount) || 0 : 0),
    0,
  );
  const recentReviews = transactions
    .filter((item) => item.reviewed)
    .sort((a, b) =>
      String(b.reviewedAt || '').localeCompare(String(a.reviewedAt || '')),
    )
    .slice(0, 3);
  const csvAnalysis = parsedCsv
    ? analyzeMappedCsv(parsedCsv, columnMapping, {
        currency: selectedCurrency,
        negativeAmountMeans,
      })
    : null;
  useEffect(() => {
    if (!selectedCurrency && csvAnalysis?.currency)
      setSelectedCurrency(csvAnalysis.currency);
  }, [selectedCurrency, csvAnalysis?.currency]);
  const csvMappingError =
    csvAnalysis?.errors.find((item) => typeof item === 'string') || '';
  const invalidCsvRows =
    csvAnalysis?.errors.filter((item) => typeof item !== 'string') || [];
  const usableCsvRows =
    csvAnalysis?.rows.filter(
      (row) => !row.errors.length && !(excludeDuplicateRows && row.duplicateOf),
    ) || [];
  const csvIncludedTotals = usableCsvRows.reduce(
    (totals, row) => {
      if (row.direction === 'credit') totals.credits += row.amount;
      else totals.debits += row.amount;
      return totals;
    },
    { debits: 0, credits: 0 },
  );
  const detectedColumns = parsedCsv
    ? Object.entries(columnMapping)
        .filter(([, index]) => index != null)
        .map(([key, index]) => `${key}: ${parsedCsv.headers[index]}`)
    : [];
  const hasNegativeCsvAmounts = Boolean(
    csvAnalysis?.rows.some((row) => /^\s*(?:-|\().+/.test(row.rawAmount)),
  );

  function updateColumnMapping(key, value) {
    setColumnMapping((previous) => ({
      ...previous,
      [key]: value === '' ? null : Number(value),
    }));
    setServerPreview(null);
    setCanonicalCsv('');
    setConfirmedQuestImport(false);
  }

  useEffect(() => {
    if (page !== 'battle' || !current || apiDialog) return undefined;
    function handleKeyboardShortcut(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target?.isContentEditable ||
        /^(INPUT|SELECT|TEXTAREA)$/.test(target?.tagName || '')
      )
        return;
      if (target?.tagName === 'BUTTON' && event.key === 'Enter') return;
      if (/^[1-8]$/.test(event.key)) {
        event.preventDefault();
        setCategory(CATEGORIES[Number(event.key) - 1]);
      } else if (event.key === 'Enter' && !busy) {
        event.preventDefault();
        review();
      } else if (event.key.toLowerCase() === 's' && !busy) {
        event.preventDefault();
        skip();
      } else if (event.key.toLowerCase() === 'u' && undoId && !busy) {
        event.preventDefault();
        undo();
      }
    }
    window.addEventListener('keydown', handleKeyboardShortcut);
    return () => window.removeEventListener('keydown', handleKeyboardShortcut);
  }, [
    page,
    current?.id,
    apiDialog,
    busy,
    category,
    skipped,
    transactions,
    player,
    quest,
    undoId,
  ]);

  function startNewQuest() {
    localStorage.removeItem('expenseQuestId');
    setQuest(null);
    setTransactions([]);
    setCurrent(null);
    setSkipped([]);
    setFile(null);
    setParsedCsv(null);
    setServerPreview(null);
    setCanonicalCsv('');
    setConfirmedQuestImport(false);
    setSelectedCurrency('');
    setNegativeAmountMeans('credit');
    setExcludeInvalidRows(false);
    setExcludeDuplicateRows(false);
    setReport(null);
    setUndoId(null);
    setPage('home');
  }

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="hamb"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileOpen}
        >
          <Menu />
        </button>
        <button className="brand" type="button" onClick={() => setPage('home')}>
          <span className="brand-symbol">
            <Zap size={18} />
          </span>
          <span>
            EXPENSE<span className="brand-light">QUEST</span>
            <small>YOUR MONEY. YOUR MISSION.</small>
          </span>
        </button>
        <div className="top-center">
          <span className="avatar">{player.level}</span>
          <div className="level-meta">
            <b>LEVEL {player.level} · MONEY MAGE</b>
            <div className="xpbar">
              <i style={{ width: `${player.xp % 100}%` }} />
            </div>
          </div>
          <span className="xp-label" key={player.xp}>
            {player.xp} XP
          </span>
        </div>
        <div className="top-actions">
          <button
            className="settings-button"
            title="Advanced settings"
            aria-label="Advanced settings"
            onClick={() => setApiDialog(true)}
          >
            <Settings size={17} />
          </button>
        </div>
      </header>
      <div className="app-layout">
        <aside className={`sidebar ${mobileOpen ? 'show' : ''}`}>
          <div className="nav-caption">YOUR SPACE</div>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`nav-link ${page === id ? 'active' : ''}`}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => {
                setMobileOpen(false);
                if (id === 'report') showReport();
                else if (id === 'battle') openQuest();
                else setPage(id);
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </aside>
        <main className="main">
          {restoring && (
            <div className="session-loading" role="status">
              <LoaderCircle className="spin" size={15} /> Reconnecting to your
              saved quest…
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <CircleHelp size={17} />
              {error}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={15} />
              </button>
            </div>
          )}
          {page === 'home' && (
            <>
              <div className="welcome-row">
                <div>
                  <div className="overline">A FASTER WAY TO SORT EXPENSES</div>
                  <h1>
                    Know where your
                    <br />
                    <em>money went.</em>
                  </h1>
                  <p>
                    Preview a statement, confirm the categories, then export a
                    clean report.
                  </p>
                </div>
                <div className="welcome-emblem">
                  <div className="emblem-circle">
                    <Wallet size={31} />
                  </div>
                  <span>
                    YOUR NEXT
                    <br />
                    GREAT ADVENTURE
                  </span>
                </div>
              </div>
              <section className="dashboard-stats" aria-label="Quest overview">
                <div className="stat-card">
                  <span>
                    <Wallet size={15} /> QUEST SPENDING
                  </span>
                  <b>{quest ? money(questSpend, quest.currency) : '—'}</b>
                  <small>
                    {quest
                      ? questCredits > 0
                        ? `${money(questCredits, quest.currency)} in credits excluded`
                        : 'From uploaded transactions'
                      : 'Upload a CSV to see your total'}
                  </small>
                </div>
                <div className="stat-card">
                  <span>
                    <Receipt size={15} /> REVIEWED
                  </span>
                  <b>
                    {quest ? `${progress.reviewed} / ${progress.total}` : '—'}
                  </b>
                  <small>
                    {quest
                      ? `${Math.max(progress.total - progress.reviewed, 0)} left to sort`
                      : 'No quest in progress'}
                  </small>
                </div>
                <div className="stat-card">
                  <span>
                    <Zap size={15} /> PLAYER XP
                  </span>
                  <b>{player.xp}</b>
                  <small>{player.xp % 100} / 100 to next level</small>
                </div>
                <div className="stat-card">
                  <span>
                    <Trophy size={15} /> QUESTS CLEARED
                  </span>
                  <b>{player.questsCompleted}</b>
                  <small>Complete a review run to earn XP</small>
                </div>
              </section>
              <div className="dashboard-grid">
                <section className="upload-panel">
                  <div className="panel-title">
                    <div>
                      <span className="step-tag">START HERE · 1 MINUTE</span>
                      <h2>Upload your expense CSV</h2>
                      <p>
                        We’ll check the columns and show every row before it
                        becomes a quest.
                      </p>
                    </div>
                    <div className="upload-icon">
                      <CloudUpload size={21} />
                    </div>
                  </div>
                  <label
                    className={`dropzone ${drag ? 'dragging' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDrag(true);
                    }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDrag(false);
                      if (e.dataTransfer.files[0])
                        selectExpenseFile(e.dataTransfer.files[0]);
                    }}
                  >
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      aria-label="Choose an expense CSV"
                      onChange={(e) =>
                        selectExpenseFile(e.target.files?.[0] || null)
                      }
                    />
                    <div className="upload-cloud">
                      <Upload size={20} />
                    </div>
                    <b>{file?.name || 'Choose a CSV or drag it here'}</b>
                    <span>
                      {file
                        ? `${(file.size / 1024).toFixed(0)} KB · ready to upload`
                        : 'Date (optional) · Description or Merchant · Amount'}
                    </span>
                    <small>CSV ONLY · UP TO 5 MB</small>
                  </label>
                  <div
                    className="upload-footer"
                    style={{
                      justifyContent: 'flex-end',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      className="button-primary"
                      onClick={previewCsv}
                      disabled={!file || busy}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <Sparkles size={16} />
                      )}{' '}
                      {busy ? 'Checking file…' : 'Preview my CSV'}{' '}
                      <ArrowRight size={15} />
                    </button>
                    <a
                      className="sample-download"
                      href="/sample-expenses.csv"
                      download
                      aria-label="Download sample expense CSV"
                    >
                      <ArrowDownToLine size={14} /> Download sample CSV
                    </a>
                  </div>
                </section>
                <aside className="insight-column">
                  <section
                    className="achievement-panel"
                    aria-label="Achievements"
                  >
                    <div className="lower-card-heading">
                      <span>
                        <Trophy size={15} /> MILESTONES
                      </span>
                      <small>{player.achievements?.length || 0} earned</small>
                    </div>
                    {player.achievements?.length ? (
                      <div className="achievement-list">
                        {player.achievements.map((achievement) => (
                          <span className="achievement-chip" key={achievement}>
                            <Check size={13} /> {achievement}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="achievement-empty">
                        Your first badge unlocks after a confirmed review.
                      </p>
                    )}
                  </section>
                  <section className="active-card">
                    <div className="active-header">
                      <span>ACTIVE QUEST</span>
                      <span className="live-dot" />
                      <small>{quest ? 'IN PROGRESS' : 'NOT STARTED'}</small>
                    </div>
                    <div className="boss-visual">
                      <div className="boss-art">
                        <Flame size={55} />
                        <Sparkles className="spark" size={15} />
                      </div>
                      <div className="boss-copy">
                        <span>THE FIRST ENCOUNTER</span>
                        <h3>
                          Expense
                          <br />
                          <em>Dragon</em>
                        </h3>
                      </div>
                    </div>
                    <div className="active-meta">
                      <span>
                        <Receipt size={14} />
                        {quest
                          ? `${quest.totalTransactions} transactions`
                          : 'No quest yet'}
                      </span>
                      <span>
                        <Zap size={14} />
                        10 XP each
                      </span>
                    </div>
                    <button
                      className="button-primary full"
                      onClick={openQuest}
                      disabled={!quest || busy}
                    >
                      {quest ? 'Return to the battle' : 'Upload a CSV to begin'}{' '}
                      <ArrowRight size={16} />
                    </button>
                  </section>
                </aside>
              </div>
              <section className="dashboard-lower">
                <div className="activity-card">
                  <div className="lower-card-heading">
                    <span>
                      <Sparkles size={15} /> RECENT QUEST ACTIVITY
                    </span>
                    {quest && <small>{progress.reviewed} reviews saved</small>}
                  </div>
                  {recentReviews.length ? (
                    <div className="activity-list">
                      {recentReviews.map((item) => (
                        <div className="activity-item" key={item.id}>
                          <span className="activity-check">
                            <Check size={13} />
                          </span>
                          <span>
                            <b>{item.description}</b>
                            <small>
                              {item.category ||
                                item.suggestedCategory ||
                                'Other'}{' '}
                              ·{' '}
                              {item.reviewedAt
                                ? new Date(item.reviewedAt).toLocaleDateString()
                                : 'Reviewed'}
                            </small>
                          </span>
                          <strong>+10 XP</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="activity-empty">
                      <span className="activity-empty-icon">
                        <Receipt size={17} />
                      </span>
                      <span>
                        <b>Your victories will show up here</b>
                        <small>
                          {quest
                            ? 'Confirm a transaction to record your first win.'
                            : 'Start a quest to record your first confirmed review.'}
                        </small>
                      </span>
                    </div>
                  )}
                </div>
                <div className="field-note">
                  <div className="field-note-icon">
                    <ShieldCheck size={17} />
                  </div>
                  <div>
                    <span>YOUR DATA, CLEARLY EXPLAINED</span>
                    <b>Only confirmed rows are saved.</b>
                    <p>
                      The original CSV stays in your browser. Confirmed
                      transaction details and quest progress are sent to the
                      Expense Quest backend and stored in its MongoDB database.
                    </p>
                  </div>
                </div>
              </section>
              <section className="how-row">
                <span>THREE QUICK STEPS</span>
                <div>
                  <b>
                    <i>1</i> Upload
                  </b>
                  <ChevronRight size={14} />
                  <b>
                    <i>2</i> Review categories
                  </b>
                  <ChevronRight size={14} />
                  <b>
                    <i>3</i> Export your report
                  </b>
                </div>
              </section>
            </>
          )}
          {page === 'preview' && parsedCsv && csvAnalysis && (
            <section
              className="csv-preview-page"
              aria-labelledby="csv-preview-title"
            >
              <button
                className="back-link"
                type="button"
                onClick={() => setPage('home')}
              >
                <ArrowLeft size={14} /> Back to upload
              </button>
              <div className="preview-heading">
                <div>
                  <span className="overline">
                    STEP 2 · CHECK BEFORE IMPORTING
                  </span>
                  <h1 id="csv-preview-title">
                    Preview your <em>expenses.</em>
                  </h1>
                  <p>
                    {file?.name} · {parsedCsv.rows.length} rows found · Nothing
                    is saved until you create the quest.
                  </p>
                </div>
                <span className="preview-safe">
                  <ShieldCheck size={15} /> Preview only
                </span>
              </div>

              <section
                className="mapping-panel"
                aria-labelledby="mapping-title"
              >
                <div className="mapping-title">
                  <div>
                    <span className="step-tag">MATCH YOUR COLUMNS</span>
                    <h2 id="mapping-title">
                      Where is each piece of information?
                    </h2>
                  </div>
                  <span>
                    We detected the closest matches. Change them if needed.
                  </span>
                </div>
                <p className="mapping-help">
                  Match a description and either an amount column or debit and
                  credit columns. Blank rows are ignored; rows with missing
                  values stay visible for you to fix or exclude.
                </p>
                <div className="mapping-fields">
                  {[
                    ['date', 'Date', true],
                    ['description', 'Description / merchant', false],
                    ['amount', 'Amount', true],
                    ['debit', 'Debit', true],
                    ['credit', 'Credit', true],
                  ].map(([key, label, optional]) => (
                    <label key={key}>
                      <span>
                        {label}
                        {optional && <small>{key === 'date' ? 'Optional' : 'Use if present'}</small>}
                      </span>
                      <select
                        aria-label={label}
                        value={
                          columnMapping[key] == null
                            ? ''
                            : String(columnMapping[key])
                        }
                        onChange={(event) => updateColumnMapping(key, event.target.value)}
                      >
                        {optional && <option value="">No {label.toLowerCase()} column</option>}
                        {!optional && <option value="">Choose a column</option>}
                        {parsedCsv.headers.map((header, index) => (
                          <option
                            key={`${header}-${index}`}
                            value={String(index)}
                          >
                            {header || `Column ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <details className="optional-mappings">
                  <summary>Optional category, currency, and direction columns</summary>
                  <div className="mapping-fields optional-mapping-fields">
                    {[
                      ['category', 'Category from file'],
                      ['currency', 'Currency from file'],
                      ['direction', 'Transaction direction'],
                    ].map(([key, label]) => (
                      <label key={key}>
                        <span>{label}<small>Optional</small></span>
                        <select
                          aria-label={label}
                          value={columnMapping[key] == null ? '' : String(columnMapping[key])}
                          onChange={(event) => updateColumnMapping(key, event.target.value)}
                        >
                          <option value="">No {label.toLowerCase()} column</option>
                          {parsedCsv.headers.map((header, index) => (
                            <option key={`${header}-${index}`} value={String(index)}>
                              {header || `Column ${index + 1}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </details>
                <div className="csv-import-options">
                  <label className="currency-choice">
                    <span>Currency for this statement</span>
                    <input
                      aria-label="Currency code"
                      list="expense-quest-currency-codes"
                      maxLength={3}
                      value={selectedCurrency || csvAnalysis.currency || ''}
                      placeholder="Choose a code, e.g. USD or INR"
                      onChange={(event) => {
                        setSelectedCurrency(event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3));
                        setServerPreview(null);
                        setCanonicalCsv('');
                        setConfirmedQuestImport(false);
                      }}
                    />
                    <datalist id="expense-quest-currency-codes">
                      {['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'JPY', 'SGD', 'CHF', 'AED', 'ZAR'].map((code) => (
                        <option key={code} value={code} />
                      ))}
                    </datalist>
                    <small>Currency symbols like $ and ¥ are shared, so check the code used by your statement.</small>
                  </label>
                  {hasNegativeCsvAmounts && (
                    <label className="negative-amount-choice">
                      <span>How should negative amounts be treated?</span>
                      <select
                        aria-label="How to interpret negative amounts"
                        value={negativeAmountMeans}
                        onChange={(event) => {
                          setNegativeAmountMeans(event.target.value);
                          setServerPreview(null);
                          setCanonicalCsv('');
                          setConfirmedQuestImport(false);
                        }}
                      >
                        <option value="credit">As a credit or refund</option>
                        <option value="debit">As an expense</option>
                      </select>
                    </label>
                  )}
                </div>
                <div className="detected-columns" aria-label="Detected columns">
                  <b>Detected:</b>{' '}
                  {detectedColumns.length
                    ? detectedColumns.map((item) => <span key={item}>{item}</span>)
                    : 'No columns matched yet'}
                  {parsedCsv.emptyRowsSkipped > 0 && (
                    <small>{parsedCsv.emptyRowsSkipped} completely blank row{parsedCsv.emptyRowsSkipped === 1 ? '' : 's'} ignored.</small>
                  )}
                </div>
                {csvMappingError && (
                  <p className="preview-inline-error" role="alert">
                    {csvMappingError}
                  </p>
                )}
              </section>

              <section className="preview-summary" aria-label="Import summary">
                <div><span>ROWS READY</span><b>{usableCsvRows.length}</b></div>
                <div><span>DEBITS</span><b>{money(csvIncludedTotals.debits, csvAnalysis.currency || selectedCurrency || undefined)}</b></div>
                <div><span>CREDITS</span><b>{money(csvIncludedTotals.credits, csvAnalysis.currency || selectedCurrency || undefined)}</b></div>
                <div><span>DATE RANGE</span><b>{csvAnalysis.dateRange ? `${csvAnalysis.dateRange.from} – ${csvAnalysis.dateRange.to}` : 'Dates not provided'}</b></div>
              </section>

              <section
                className="mapping-panel preview-rows-panel"
                aria-labelledby="rows-title"
              >
                <div className="mapping-title">
                  <div>
                    <span className="step-tag">ROW CHECK</span>
                    <h2 id="rows-title">Review the imported data</h2>
                  </div>
                  <span>{csvAnalysis.rows.length} expense rows</span>
                </div>
                {invalidCsvRows.length > 0 && (
                  <div className="preview-warning" role="status">
                    <CircleHelp size={17} />
                    <span>
                      <b>
                        {invalidCsvRows.length} row
                        {invalidCsvRows.length === 1 ? '' : 's'} need attention.
                      </b>{' '}
                      Fix the source file or explicitly exclude them below.
                    </span>
                  </div>
                )}
                {csvAnalysis.duplicates.length > 0 && (
                  <div
                    className="preview-warning duplicate-warning"
                    role="status"
                  >
                    <CircleHelp size={17} />
                    <span>
                      <b>
                        {csvAnalysis.duplicates.length} possible duplicate
                        {csvAnalysis.duplicates.length === 1 ? '' : 's'} found.
                      </b>{' '}
                      These rows have the same date, description and amount.
                      Check before excluding.
                    </span>
                  </div>
                )}
                {!csvMappingError && (
                  <div className="preview-table-wrap">
                    <table className="preview-table">
                      <thead>
                        <tr>
                          <th scope="col">Row</th>
                          <th scope="col">Date</th>
                          <th scope="col">Description</th>
                          <th scope="col">Amount</th>
                          <th scope="col">Category</th>
                          <th scope="col">Check</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvAnalysis.rows.map((row) => (
                          <tr
                            key={row.rowNumber}
                            className={
                              row.errors.length
                                ? 'row-invalid'
                                : row.duplicateOf
                                  ? 'row-duplicate'
                                  : ''
                            }
                          >
                            <td data-label="Row">{row.rowNumber}</td>
                            <td data-label="Date">{row.date || '—'}</td>
                            <td data-label="Description">
                              {row.description || '—'}
                            </td>
                            <td data-label="Amount">{row.rawAmount || '—'}</td>
                            <td data-label="Category">
                              {row.category || 'Suggested after server check'}
                            </td>
                            <td data-label="Check">
                              {row.errors.length
                                ? row.errors.join(' ')
                                : row.duplicateOf
                                  ? `Possible duplicate of row ${row.duplicateOf}.`
                                  : 'Ready'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {invalidCsvRows.length > 0 && (
                  <label className="preview-optout">
                    <input
                      type="checkbox"
                      checked={excludeInvalidRows}
                      onChange={(event) => {
                        setExcludeInvalidRows(event.target.checked);
                        setServerPreview(null);
                        setCanonicalCsv('');
                        setConfirmedQuestImport(false);
                      }}
                    />{' '}
                    Exclude {invalidCsvRows.length} invalid row
                    {invalidCsvRows.length === 1 ? '' : 's'} from this quest
                  </label>
                )}
                {csvAnalysis.duplicates.length > 0 && (
                  <label className="preview-optout">
                    <input
                      type="checkbox"
                      checked={excludeDuplicateRows}
                      onChange={(event) => {
                        setExcludeDuplicateRows(event.target.checked);
                        setServerPreview(null);
                        setCanonicalCsv('');
                        setConfirmedQuestImport(false);
                      }}
                    />{' '}
                    Exclude {csvAnalysis.duplicates.length} likely duplicate row
                    {csvAnalysis.duplicates.length === 1 ? '' : 's'}
                  </label>
                )}
              </section>

              {serverPreview && (
                <section
                  className="mapping-panel server-preview-panel"
                  aria-live="polite"
                >
                  <div className="mapping-title">
                    <div>
                      <span className="step-tag">BACKEND CHECK COMPLETE</span>
                      <h2>Categories are ready to review</h2>
                    </div>
                    <span>
                      {serverPreview.preview.length} rows will be included
                    </span>
                  </div>
                  <div className="preview-confirm-summary">
                    <span>{serverPreview.totals.totalTransactions} rows</span>
                    <span>Debits {money(serverPreview.totals.totalDebits, serverPreview.totals.currency || quest?.currency || undefined)}</span>
                    <span>Credits {money(serverPreview.totals.totalCredits, serverPreview.totals.currency || quest?.currency || undefined)}</span>
                    <span>{serverPreview.totals.dateRange ? `${serverPreview.totals.dateRange.from} – ${serverPreview.totals.dateRange.to}` : 'Dates not provided'}</span>
                  </div>
                  {serverPreview.duplicateImport && (
                    <div className="preview-warning duplicate-warning" role="alert">
                      <CircleHelp size={17} />
                      <span>
                        <b>This statement was already imported.</b>{' '}
                        {serverPreview.duplicateQuestId
                          ? `It matches quest ${serverPreview.duplicateQuestId}.`
                          : 'The same transactions are already saved.'}{' '}
                        Duplicate imports are blocked to prevent duplicate transactions and rewards.
                      </span>
                    </div>
                  )}
                  {serverPreview.removedInvalid > 0 && (
                    <p className="preview-removal-note">
                      {serverPreview.removedInvalid} invalid row
                      {serverPreview.removedInvalid === 1 ? '' : 's'} excluded
                      by your choice.
                    </p>
                  )}
                  {serverPreview.removedDuplicates > 0 && (
                    <p className="preview-removal-note">
                      {serverPreview.removedDuplicates} possible duplicate row
                      {serverPreview.removedDuplicates === 1 ? '' : 's'}{' '}
                      excluded by your choice.
                    </p>
                  )}
                  <div className="suggestion-preview-list">
                    {serverPreview.preview.slice(0, 8).map((item, index) => (
                      <div key={`${index}-${item.description}`}>
                        <span>
                          <b>{item.description}</b>
                          <small>
                            {item.date || 'Date not provided'} ·{' '}
                            {item.direction === 'credit' ? 'Credit · ' : ''}{money(item.amount, item.currency || serverPreview.totals.currency || undefined)}
                          </small>
                        </span>
                        <span className="suggestion-pill">
                          {item.category || item.suggestedCategory}
                          <small>{item.suggestionReason}</small>
                        </span>
                      </div>
                    ))}
                    {serverPreview.preview.length > 8 && (
                      <p>
                        Plus {serverPreview.preview.length - 8} more expenses.
                      </p>
                    )}
                  </div>
                  <label className="preview-optout quest-confirmation">
                    <input
                      type="checkbox"
                      checked={confirmedQuestImport}
                      onChange={(event) => setConfirmedQuestImport(event.target.checked)}
                      disabled={serverPreview.duplicateImport}
                    />{' '}
                    I reviewed the totals and categories. Create this quest with {serverPreview.preview.length} transactions.
                  </label>
                  <div className="preview-actions">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={checkCsvWithBackend}
                      disabled={busy}
                    >
                      <ArrowUpDown size={15} /> Recheck categories
                    </button>
                    <button
                      type="button"
                      className="button-primary"
                      onClick={createQuest}
                      disabled={busy || !serverPreview.preview.length || !confirmedQuestImport || serverPreview.duplicateImport}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={15} />
                      ) : (
                        <Check size={15} />
                      )}
                      {busy
                        ? 'Creating quest…'
                        : serverPreview.duplicateImport
                          ? 'Already imported'
                          : `Create quest · ${serverPreview.preview.length} transactions`}
                    </button>
                  </div>
                </section>
              )}
              {!serverPreview && (
                <div className="preview-actions preview-check-action">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setPage('home')}
                  >
                    <ArrowLeft size={15} /> Choose another file
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={checkCsvWithBackend}
                    disabled={
                      busy ||
                      Boolean(csvMappingError) ||
                      usableCsvRows.length === 0 ||
                      (invalidCsvRows.length > 0 && !excludeInvalidRows) ||
                      !/^[A-Z]{3}$/.test(selectedCurrency || csvAnalysis.currency || '')
                    }
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <ShieldCheck size={15} />
                    )}
                    {busy
                      ? 'Checking categories…'
                      : 'Check categories and duplicate import'}
                  </button>
                </div>
              )}
            </section>
          )}
          {page === 'battle' && (
            <>
              <div className="battle-topline">
                <div>
                  <button className="back-link" onClick={() => setPage('home')}>
                    <ArrowLeft size={14} /> Overview
                  </button>
                  <div className="overline">QUEST 01 · EXPENSE DRAGON</div>
                  <h1>
                    The daily <em>spend.</em>
                  </h1>
                </div>
              </div>
              {quest && (
                <div className="quest-stats-row">
                  <div className={`boss-banner ${combatHit ? 'is-hit' : ''}`}>
                    <div className="boss-face">
                      <Flame size={30} />
                    </div>
                    <div>
                      <span>THE BOSS</span>
                      <b>Expense Dragon</b>
                      <small>
                        {Math.max(progress.total - progress.reviewed, 0)}{' '}
                        transactions left
                      </small>
                    </div>
                    <div className="boss-health-wide">
                      <span>
                        {progress.bossHealth === 0
                          ? 'DEFEATED'
                          : progress.bossHealth > 66
                            ? 'HEALTH'
                            : progress.bossHealth > 33
                              ? 'WOUNDED'
                              : 'NEARLY DEFEATED'}{' '}
                        <b>{progress.bossHealth}%</b>
                      </span>
                      <div
                        className="health-meter"
                        role="progressbar"
                        aria-label="Expense Dragon health"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress.bossHealth}
                      >
                        <i style={{ width: `${progress.bossHealth}%` }} />
                      </div>
                      <small className="boss-explainer">
                        Each confirmed review clears one part of the statement.
                      </small>
                    </div>
                    {combatHit && (
                      <span className="damage-float" aria-live="polite">
                        −10 HP · +10 XP
                      </span>
                    )}
                  </div>
                  <div className="battle-metrics">
                    <div>
                      <span>REWARD</span>
                      <b className="gold-text">
                        <Zap size={14} />
                        10 XP
                      </b>
                    </div>
                    <div>
                      <span>PLAYER LEVEL</span>
                      <b>
                        <Trophy size={14} />
                        {player.level}
                      </b>
                    </div>
                  </div>
                </div>
              )}
              {!quest && (
                <div className="empty-quest">
                  <Target size={30} />
                  <h2>No active quest yet</h2>
                  <p>Upload an expense CSV to summon your first boss.</p>
                  <button
                    className="button-primary"
                    onClick={() => setPage('home')}
                  >
                    Go to overview <ArrowRight size={15} />
                  </button>
                </div>
              )}
              {quest && current && (
                <div className="review-layout">
                  <section className="transaction-stage">
                    <div className="stage-header">
                      <span>
                        <Sparkles size={15} /> TRANSACTION TO REVIEW
                      </span>
                      <span>
                        {
                          transactions.filter(
                            (item) => !item.reviewed && !item.skipped,
                          ).length
                        }{' '}
                        to review · {skipped.length} skipped
                      </span>
                    </div>
                    <div className="receipt-card">
                      <div className="receipt-top">
                        <span className="receipt-chip">
                          {current.date || 'DATE NOT PROVIDED'}
                        </span>
                        <Receipt size={16} />
                      </div>
                      <div className="merchant-icon">
                        <Receipt size={24} />
                      </div>
                      <div className="merchant-name">{current.description}</div>
                      <div className="amount">
                        {current.direction === 'credit' ? '+ ' : ''}
                        {money(current.amount, current.currency || quest.currency)}
                      </div>
                      <div className="receipt-separator" />
                      <div className="receipt-detail">
                        <span>DATE</span>
                        <b>{current.date || 'Not provided'}</b>
                      </div>
                      <div className="receipt-detail">
                        <span>DESCRIPTION</span>
                        <b>{current.description}</b>
                      </div>
                      <div className="suggested">
                        <Sparkles size={14} />
                        <span>RULE SUGGESTION</span>
                        <b>
                          {current.suggestedCategory ||
                            current.suggested_category ||
                            'Other'}
                        </b>
                        <small>
                          {current.suggestionReason ||
                            'Based on a merchant matching rule. Confirm or choose another category.'}
                        </small>
                      </div>
                    </div>
                  </section>
                  <section className="decision-panel">
                    <div className="decision-heading">
                      <span className="step-tag">YOUR TURN</span>
                      <h2>
                        Where does this
                        <br />
                        <em>expense belong?</em>
                      </h2>
                      <p>
                        Choose the category that fits. Your decision is saved to
                        your quest.
                      </p>
                    </div>
                    {undoId && (
                      <button
                        className="undo-review-link"
                        type="button"
                        onClick={undo}
                        disabled={busy}
                      >
                        Undo last review <span>U</span>
                      </button>
                    )}
                    <div className="category-grid">
                      {CATEGORIES.map((value, index) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={category === value}
                          className={`category-choice ${category === value ? 'chosen' : ''}`}
                          onClick={() => setCategory(value)}
                        >
                          <span className="category-glyph">
                            {
                              ['🍜', '🛍️', '🚆', '🏠', '🎟️', '✚', '📚', '✧'][
                                index
                              ]
                            }
                          </span>
                          {value}
                          {category === value && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                    <p className="keyboard-hint">
                      Shortcuts: <kbd>1–8</kbd> choose category ·{' '}
                      <kbd>Enter</kbd> confirm · <kbd>S</kbd> skip
                      {undoId && (
                        <>
                          {' '}
                          · <kbd>U</kbd> undo
                        </>
                      )}
                    </p>
                    <div className="decision-footer">
                      <button
                        className="skip-button"
                        onClick={skip}
                        disabled={busy}
                      >
                        <ArrowRight size={14} /> Skip for now
                      </button>
                      <button
                        className="button-primary"
                        onClick={review}
                        disabled={busy}
                      >
                        {busy ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : (
                          <Check size={15} />
                        )}{' '}
                        {busy ? 'Saving review…' : 'Confirm & earn 10 XP'}
                      </button>
                    </div>
                  </section>
                </div>
              )}
              {quest && !current && (
                <div className="empty-quest victory-inline">
                  <div className="victory-check">
                    <Trophy size={28} />
                  </div>
                  <span className="overline">
                    {progress.reviewed === progress.total
                      ? 'ALL CLEAR'
                      : 'PAUSED FOR LATER'}
                  </span>
                  <h2>
                    {progress.reviewed === progress.total
                      ? 'Every transaction reviewed.'
                      : 'The rest can wait.'}
                  </h2>
                  <p>
                    {progress.reviewed === progress.total
                      ? 'Your expenses are organized and your progress is verified.'
                      : `${skipped.length} transaction${skipped.length === 1 ? '' : 's'} skipped. Review them whenever you’re ready.`}
                  </p>
                  <div className="empty-actions">
                    {progress.reviewed === progress.total ? (
                      <>
                        <button className="button-primary" onClick={showReport}>
                          View spending report <ArrowRight size={15} />
                        </button>
                        <a
                          className="button-secondary"
                          href={`${apiBase}/api/quests/${quest.id}/export`}
                        >
                          <ArrowDownToLine size={15} /> Download CSV
                        </a>
                      </>
                    ) : (
                      <button
                        className="button-primary"
                        onClick={() => setPage('transactions')}
                      >
                        Find skipped transactions <ArrowRight size={15} />
                      </button>
                    )}
                    {undoId && (
                      <button className="skip-button" onClick={undo}>
                        Undo last review
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          {page === 'transactions' && (
            quest ? (
              <TransactionManager
                transactions={transactions}
                currency={quest.currency}
                onSaveCategory={saveCategoryCorrection}
                onBulkSaveCategory={saveBulkCategoryCorrection}
                onReview={focusTransaction}
                savingCategoryId={savingCategoryId}
              />
            ) : (
              <div className="empty-quest">
                <Receipt />
                <h2>No transactions yet</h2>
                <p>Upload a CSV to create a quest and manage its transactions here.</p>
                <button className="button-primary" type="button" onClick={() => setPage('home')}>
                  Upload expenses <ArrowRight size={15} />
                </button>
              </div>
            )
          )}
          {page === 'report' && (
            <Report
              quest={quest}
              report={report}
              showReport={showReport}
              budgetInfo={budgetInfo}
              budgetInput={budgetInput}
              setBudgetInput={setBudgetInput}
              onSaveBudget={saveMonthlyBudget}
              savingBudget={savingBudget}
            />
          )}
          {page === 'victory' && (
            <div className="victory-screen">
              <div className="victory-orbit">
                <div>
                  <Trophy size={35} />
                </div>
              </div>
              <span className="overline">
                QUEST VERIFIED · ALL TRANSACTIONS REVIEWED
              </span>
              <h1>
                Dragon <em>down.</em>
              </h1>
              <p>
                Your rewards are based on completed reviews and actual
                transaction data.
              </p>
              <div className="victory-rewards">
                <div>
                  <span>TRANSACTIONS REVIEWED</span>
                  <b>{progress.reviewed}</b>
                </div>
                <div>
                  <span>QUEST XP</span>
                  <b>{progress.reviewed * 10}</b>
                </div>
                <div>
                  <span>LIFETIME XP</span>
                  <b>{player.xp}</b>
                </div>
                <div>
                  <span>QUEST STATUS</span>
                  <b>
                    Complete <Check size={15} />
                  </b>
                </div>
              </div>
              <div className="empty-actions">
                <button className="button-primary" onClick={showReport}>
                  See my spending report <ArrowRight size={15} />
                </button>
                <button
                  className="button-secondary"
                  onClick={() => setPage('home')}
                >
                  Back to overview
                </button>
                <button className="button-secondary" onClick={startNewQuest}>
                  Start a new quest
                </button>
                {undoId && (
                  <button className="skip-button" onClick={undo}>
                    Undo last review
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
      {apiDialog && (
        <div className="modal-scrim" onClick={() => setApiDialog(false)}>
          <div
            className="api-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="api-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close connection settings"
              onClick={() => setApiDialog(false)}
            >
              <X size={17} />
            </button>
            <span className="step-tag">ADVANCED SETTINGS</span>
            <h2 id="api-dialog-title">Backend connection</h2>
            <p>
              Most people can leave this unchanged. Set a public Expense Quest
              backend URL only when you have been given a different server. This
              setting is stored in this browser. Leave blank to restore the
              production connection.
            </p>
            <label>
              BACKEND BASE URL
              <input
                value={apiInput}
                onChange={(event) => setApiInput(event.target.value)}
                placeholder={PRODUCTION_API_BASE}
              />
            </label>
            <button className="button-primary" onClick={saveApi}>
              Save connection <Check size={15} />
            </button>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Report({
  quest,
  report,
  showReport,
  budgetInfo,
  budgetInput,
  setBudgetInput,
  onSaveBudget,
  savingBudget,
}) {
  if (!quest)
    return (
      <div className="empty-quest">
        <BarChart3 />
        <h2>No report to show</h2>
        <p>Start a quest to organize your actual expenses.</p>
      </div>
    );
  if (!report)
    return (
      <div className="empty-quest">
        <button className="button-primary" onClick={showReport}>
          Load spending report
        </button>
      </div>
    );
  const categorySpending = Array.isArray(report.categorySpending)
    ? report.categorySpending
    : [];
  const monthlySpending = Array.isArray(report.monthlySpending)
    ? report.monthlySpending
    : [];
  const max = Math.max(
    ...categorySpending.map((item) => Number(item.spending) || 0),
    1,
  );
  const positiveCategories = categorySpending.filter(
    (item) => Number(item.spending) > 0,
  );
  const colors = [
    '#b49aff',
    '#efc879',
    '#79cbb6',
    '#f18f8f',
    '#8fbdff',
    '#dc93cb',
    '#a7c96f',
    '#c2a888',
  ];
  let stop = 0;
  const donutSegments = positiveCategories.map((item, index) => {
    const start = stop;
    stop +=
      (Number(item.spending) / Math.max(Number(report.totalExpenses), 1)) * 100;
    return `${colors[index % colors.length]} ${start}% ${stop}%`;
  });
  return (
    <>
      <div className="report-heading">
        <div>
          <span className="overline">
            YOUR REAL SPENDING · QUEST {quest.id}
          </span>
          <h1>
            The money <em>map.</em>
          </h1>
          <p>Every number is calculated from your uploaded expenses.</p>
        </div>
        <div className="report-actions">
          <a
            className="button-primary"
            href={`${apiBase}/api/quests/${quest.id}/export`}
          >
            <ArrowDownToLine size={15} /> Download categorized CSV
          </a>
          <button className="button-secondary" type="button" onClick={() => window.print()}>
            <Printer size={15} /> Print / Save as PDF
          </button>
        </div>
      </div>
      <section className="report-card budget-panel" aria-labelledby="budget-title">
        <div className="report-card-title">
          <Wallet />
          <div>
            <h2 id="budget-title">Monthly budget</h2>
            <p>Compare your budget with real debit transactions for {budgetInfo?.month || 'this month'}.</p>
          </div>
        </div>
        {quest.currency ? (
          <>
            <form
              className="budget-form"
              onSubmit={(event) => {
                event.preventDefault();
                onSaveBudget();
              }}
            >
              <label>
                <span>Budget amount ({quest.currency})</span>
                <input
                  type="number"
                  min="0"
                  max="1000000000"
                  step="0.01"
                  inputMode="decimal"
                  value={budgetInput}
                  onChange={(event) => setBudgetInput(event.target.value)}
                  placeholder="Set a monthly limit"
                  aria-label={`Monthly budget in ${quest.currency}`}
                />
              </label>
              <button className="button-primary" type="submit" disabled={savingBudget || !budgetInput}>
                {savingBudget ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
                {savingBudget ? 'Saving…' : 'Save budget'}
              </button>
              {budgetInfo?.budget && (
                <button className="button-secondary" type="button" onClick={() => onSaveBudget('')} disabled={savingBudget}>
                  Clear budget
                </button>
              )}
            </form>
            {budgetInfo?.budget ? (
              <>
                <div className="budget-summary">
                  <div><span>MONTHLY BUDGET</span><b>{money(budgetInfo.budget.monthlyAmount, quest.currency)}</b></div>
                  <div><span>SPENT THIS MONTH</span><b>{money(budgetInfo.currentMonthSpending, quest.currency)}</b></div>
                  <div><span>REMAINING</span><b>{money(budgetInfo.remaining, quest.currency)}</b></div>
                  <div><span>USED</span><b>{budgetInfo.percentUsed}%</b></div>
                </div>
                <div
                  className={`budget-meter ${budgetInfo.overBudget ? 'over' : budgetInfo.nearLimit ? 'near' : ''}`}
                  role="img"
                  aria-label={`${budgetInfo.percentUsed}% of monthly budget used`}
                >
                  <i style={{ width: `${Math.min(budgetInfo.percentUsed, 100)}%` }} />
                </div>
                {(budgetInfo.nearLimit || budgetInfo.overBudget) && (
                  <p className={`budget-warning ${budgetInfo.overBudget ? 'over' : ''}`} role="status">
                    {budgetInfo.overBudget
                      ? `You are ${money(Math.abs(budgetInfo.remaining), quest.currency)} over this month's budget.`
                      : `You have used ${budgetInfo.percentUsed}% of this month's budget.`}
                  </p>
                )}
              </>
            ) : (
              <p className="budget-empty">Set a monthly limit to see spending, remaining balance, and an 80% heads-up. Totals include debit transactions saved in {quest.currency} across your quests.</p>
            )}
          </>
        ) : (
          <p className="budget-empty">This older quest has no saved currency code. Upload a statement with a currency selected to use budget tracking.</p>
        )}
      </section>
      <div className="report-kpis">
        <div>
          <span>TOTAL SPENDING</span>
          <b>{money(report.totalExpenses, report.currency || quest.currency)}</b>
          <small>
            {report.totalTransactions} transactions · {money(report.totalCredits, report.currency || quest.currency)} credits · Net {money(report.netSpend, report.currency || quest.currency)}
          </small>
        </div>
        <div>
          <span>AVERAGE TRANSACTION</span>
          <b>{money(report.averageTransactionAmount, report.currency || quest.currency)}</b>
          <small>Across this quest</small>
        </div>
        <div>
          <span>TOP CATEGORY</span>
          <b>{report.highestSpendingCategory || '—'}</b>
          <small>By total amount</small>
        </div>
        <div>
          <span>TOP MERCHANT</span>
          <b>{report.topMerchants?.[0]?.merchant || '—'}</b>
          <small>
            {report.topMerchants?.[0]
              ? `${money(report.topMerchants[0].spending, report.currency || quest.currency)} across ${report.topMerchants[0].count} transactions`
              : 'No merchant totals yet'}
          </small>
        </div>
      </div>
      <div className="report-grid">
        <section className="report-card">
          <div className="report-card-title">
            <BarChart3 />
            <div>
              <h2>Where it went</h2>
              <p>Spending by category</p>
            </div>
          </div>
          {categorySpending.map((item, index) => (
            <div className="category-bar" key={item.category}>
              <div>
                <span>
                  <i className={`legend-dot dot-${index % 6}`} />
                  {item.category}
                </span>
                <b>{money(item.spending, report.currency || quest.currency)}</b>
              </div>
              <div className="thin-meter">
                <i
                  style={{ width: `${(Number(item.spending) / max) * 100}%` }}
                />
              </div>
              <small>
                {item.count} transactions ·{' '}
                {Math.round(
                  (Number(item.spending) /
                    Math.max(Number(report.totalExpenses), 1)) *
                    100,
                )}
                % of total
              </small>
            </div>
          ))}
        </section>
        <section className="report-card distribution-card">
          <div className="report-card-title">
            <Target />
            <div>
              <h2>Spending mix</h2>
              <p>Share of your total</p>
            </div>
          </div>
          {positiveCategories.length ? (
            <div className="donut-layout">
              <div
                className="spending-donut"
                role="img"
                aria-label={`Category distribution of ${money(report.totalExpenses, report.currency || quest.currency)} total spending`}
                style={{
                  background: `conic-gradient(${donutSegments.join(', ')})`,
                }}
              >
                <span>
                  <small>TOTAL</small>
                  <b>{money(report.totalExpenses, report.currency || quest.currency)}</b>
                </span>
              </div>
              <div className="donut-legend">
                {positiveCategories.map((item, index) => (
                  <div key={item.category}>
                    <i style={{ background: colors[index % colors.length] }} />
                    <span>{item.category}</span>
                    <b>
                      {Math.round(
                        (Number(item.spending) /
                          Math.max(Number(report.totalExpenses), 1)) *
                          100,
                      )}
                      %
                    </b>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-month">
              <FileText size={20} />
              <p>
                Category distribution will appear when this quest has spending.
              </p>
            </div>
          )}
        </section>
        <section className="report-card">
          <div className="report-card-title">
            <TrendingUp />
            <div>
              <h2>Monthly spending</h2>
              <p>Based on dates in your CSV</p>
            </div>
          </div>
          {monthlySpending.length >= 2 &&
            (() => {
              const previous = monthlySpending[monthlySpending.length - 2];
              const latest = monthlySpending[monthlySpending.length - 1];
              if (Number(previous.spending) <= 0)
                return (
                  <p className="month-comparison">
                    {latest.month} has spending data. There’s no spend in{' '}
                    {previous.month} to calculate a percentage change.
                  </p>
                );
              const change =
                ((Number(latest.spending) - Number(previous.spending)) /
                  Number(previous.spending)) *
                100;
              return (
                <p className="month-comparison">
                  {latest.month} is{' '}
                  <b>
                    {Math.abs(Math.round(change))}%{' '}
                    {change > 0 ? 'higher' : change < 0 ? 'lower' : 'unchanged'}
                  </b>{' '}
                  than {previous.month}.
                </p>
              );
            })()}
          {monthlySpending.length === 1 && (
            <p className="month-comparison">
              Add another month of expenses to see a monthly comparison.
            </p>
          )}
          {monthlySpending.length ? (
            monthlySpending.map((item) => (
              <div className="month-row" key={item.month}>
                <span>{item.month}</span>
                <div className="thin-meter">
                  <i
                    style={{
                      width: `${(item.spending / Math.max(...monthlySpending.map((row) => row.spending), 1)) * 100}%`,
                    }}
                  />
                </div>
                <b>{money(item.spending, report.currency || quest.currency)}</b>
              </div>
            ))
          ) : (
            <div className="empty-month">
              <FileText size={20} />
              <p>No usable dates were included in this CSV.</p>
            </div>
          )}
        </section>
        <section className="report-card">
          <div className="report-card-title">
            <Receipt />
            <div>
              <h2>Top merchants</h2>
              <p>Grouped by the exact description in your CSV</p>
            </div>
          </div>
          {report.topMerchants?.length ? (
            <ol className="insight-list">
              {report.topMerchants.map((item, index) => (
                <li key={`${item.merchant}-${index}`}>
                  <span className="insight-rank">{index + 1}</span>
                  <span className="insight-detail">
                    <b>{item.merchant}</b>
                    <small>
                      {item.count} transaction{item.count === 1 ? '' : 's'} ·{' '}
                      {Math.round(
                        (Number(item.spending) /
                          Math.max(Number(report.totalExpenses), 1)) *
                          100,
                      )}
                      % of total
                    </small>
                  </span>
                  <strong>{money(item.spending, report.currency || quest.currency)}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-month">
              <FileText size={20} />
              <p>Merchant totals appear when your quest has transactions.</p>
            </div>
          )}
        </section>
        <section className="report-card">
          <div className="report-card-title">
            <Wallet />
            <div>
              <h2>Five highest expenses</h2>
              <p>Largest transactions in this quest</p>
            </div>
          </div>
          {report.topTransactions?.length ? (
            <ol className="insight-list">
              {report.topTransactions.map((item, index) => (
                <li key={`${item.description}-${item.date}-${index}`}>
                  <span className="insight-rank">{index + 1}</span>
                  <span className="insight-detail">
                    <b>{item.description}</b>
                    <small>
                      {item.date || 'Date not provided'} ·{' '}
                      {item.category || 'Uncategorized'}
                    </small>
                  </span>
                  <strong>{money(item.amount, item.currency || report.currency || quest.currency)}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-month">
              <FileText size={20} />
              <p>Your largest transactions will appear here.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
