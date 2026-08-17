import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Home, Receipt, PieChart as PieChartIcon, CreditCard, Settings, Plus, X,
  Flag, ChevronRight, Trash2, Check, LogOut, Copy, Pencil
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "./supabaseClient";

const CHART_COLORS = ["#1c1917", "#78716c", "#a8a29e", "#d6d3d1", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];
const BUDGET_KEY = "current";

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-PA", { month: "long", year: "numeric" });
};
const fmt = (n) => `$${(Math.round((n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesión

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-400 text-sm">Cargando...</div>;
  }
  if (!session) return <LoginScreen />;
  return <FinanceApp session={session} />;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  const verifyCode = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setLoading(false);
    if (error) setError("Código incorrecto o expirado. Intenta de nuevo.");
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-medium mb-1">Finanzas</h1>
        <p className="text-sm text-stone-500 mb-6">
          {sent ? "Ingresa el código que te enviamos por correo." : "Inicia sesión con tu correo para continuar."}
        </p>
        {!sent ? (
          <div className="space-y-3">
            <input
              type="email"
              placeholder="tu@correo.com"
              className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={sendCode}
              disabled={loading}
              className="w-full bg-stone-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar código"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              placeholder="123456"
              maxLength={6}
              className="w-full text-center text-2xl tracking-[0.5em] border border-stone-200 rounded-lg px-3 py-2.5"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={verifyCode}
              disabled={loading}
              className="w-full bg-stone-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Verificando..." : "Confirmar código"}
            </button>
            <button
              onClick={() => { setSent(false); setCode(""); setError(""); }}
              className="w-full text-xs text-stone-400"
            >
              Usar otro correo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FinanceApp({ session }) {
  const userId = session.user.id;
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dashboard");
  const [combined, setCombined] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [debts, setDebts] = useState([]);
  const [debtPayments, setDebtPayments] = useState([]);
  const [householdCode, setHouseholdCode] = useState("");
  const [combinedTotals, setCombinedTotals] = useState({ income: 0, expense: 0 });

  const mk = monthKey();

  useEffect(() => {
    window.scrollTo(0, 0);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }, [view]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [cats, accs, txs, buds, dts, pays, hh] = await Promise.all([
      supabase.from("categories").select("*").order("created_at"),
      supabase.from("accounts").select("*").order("created_at"),
      supabase.from("transactions").select("*").order("date", { ascending: false }),
      supabase.from("budgets").select("*").eq("month", BUDGET_KEY),
      supabase.from("debts").select("*").order("created_at", { ascending: false }),
      supabase.from("debt_payments").select("*"),
      supabase.from("households").select("invite_code").single(),
    ]);
    setCategories(cats.data || []);
    setAccounts(accs.data || []);
    setTransactions(txs.data || []);
    setBudgets(buds.data || []);
    setDebts(dts.data || []);
    setDebtPayments(pays.data || []);
    setHouseholdCode(hh.data?.invite_code || "");
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!combined) return;
    supabase.rpc("get_household_totals", { target_month: mk }).then(({ data, error }) => {
      if (!error && data?.[0]) setCombinedTotals(data[0]);
    });
  }, [combined, mk]);

  const monthTx = useMemo(() => transactions.filter(t => t.date.startsWith(mk)), [transactions, mk]);
  const income = useMemo(() => monthTx.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0), [monthTx]);
  const expense = useMemo(() => monthTx.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0), [monthTx]);

  const prevMk = useMemo(() => {
    const [y, m] = mk.split("-").map(Number);
    return monthKey(new Date(y, m - 2, 1));
  }, [mk]);
  const prevTx = useMemo(() => transactions.filter(t => t.date.startsWith(prevMk) && t.type === "expense"), [transactions, prevMk]);

  const categoryStats = useMemo(() => {
    return categories.map(cat => {
      const spent = monthTx.filter(t => t.type === "expense" && t.category_id === cat.id).reduce((s, t) => s + Number(t.amount), 0);
      const prevSpent = prevTx.filter(t => t.category_id === cat.id).reduce((s, t) => s + Number(t.amount), 0);
      const budgetRow = budgets.find(b => b.category_id === cat.id);
      const budget = budgetRow ? Number(budgetRow.amount) : 0;
      const flagged = prevSpent > 0 && spent > prevSpent * 1.15;
      const pctChange = prevSpent > 0 ? Math.round(((spent - prevSpent) / prevSpent) * 100) : null;
      return { id: cat.id, cat: cat.name, spent, budget, flagged, pctChange };
    });
  }, [categories, monthTx, prevTx, budgets]);

  const flaggedCats = categoryStats.filter(c => c.flagged);
  const totalDebt = useMemo(() => debts.reduce((s, d) => s + Number(d.balance), 0), [debts]);

  const addTransaction = async (tx) => {
    const { data, error } = await supabase.from("transactions").insert({ ...tx, user_id: userId }).select().single();
    if (!error) {
      setTransactions(prev => [data, ...prev]);
      if (tx.type === "expense" && tx.account_id) {
        const linkedDebt = debts.find(d => d.type === "credit_card" && d.account_id === tx.account_id);
        if (linkedDebt) {
          const newBalance = Number(linkedDebt.balance) + Number(tx.amount);
          await supabase.from("debts").update({ balance: newBalance }).eq("id", linkedDebt.id);
          setDebts(prev => prev.map(d => d.id === linkedDebt.id ? { ...d, balance: newBalance } : d));
        }
      }
    }
    return { data, error };
  };

  const addDebtPayment = async (debtId, amount, date, accountId) => {
    const debt = debts.find(d => d.id === debtId);
    const newBalance = Math.max(0, Number(debt.balance) - amount);
    await supabase.from("debts").update({ balance: newBalance }).eq("id", debtId);
    setDebts(prev => prev.map(d => d.id === debtId ? { ...d, balance: newBalance } : d));
    const { data: pay } = await supabase.from("debt_payments").insert({ debt_id: debtId, amount, date, user_id: userId }).select().single();
    if (pay) setDebtPayments(prev => [pay, ...prev]);
    await addTransaction({ type: "debt_payment", account_id: accountId, amount, date, debt_id: debtId, note: `Pago a ${debt.name}` });
  };

  const setBudget = async (categoryId, amount) => {
    const existing = budgets.find(b => b.category_id === categoryId);
    if (existing) {
      await supabase.from("budgets").update({ amount }).eq("id", existing.id);
      setBudgets(prev => prev.map(b => b.id === existing.id ? { ...b, amount } : b));
    } else {
      const { data } = await supabase.from("budgets").insert({ category_id: categoryId, month: BUDGET_KEY, amount, user_id: userId }).select().single();
      if (data) setBudgets(prev => [...prev, data]);
    }
  };

  const addDebt = async (debt) => {
    const startingBalance = debt.type === "credit_card" ? Number(debt.current_balance || 0) : Number(debt.original_amount || 0);
    const payload = {
      name: debt.name,
      type: debt.type,
      rate: debt.rate,
      min_payment: debt.min_payment,
      original_amount: debt.type === "credit_card" ? null : Number(debt.original_amount),
      account_id: debt.type === "credit_card" ? debt.account_id : null,
      balance: startingBalance,
      user_id: userId,
    };
    const { data } = await supabase.from("debts").insert(payload).select().single();
    if (data) setDebts(prev => [data, ...prev]);
  };

  const updateDebt = async (debtId, changes) => {
    await supabase.from("debts").update(changes).eq("id", debtId);
    setDebts(prev => prev.map(d => d.id === debtId ? { ...d, ...changes } : d));
  };

  const deleteDebt = async (debtId) => {
    await supabase.from("debt_payments").delete().eq("debt_id", debtId);
    await supabase.from("transactions").update({ debt_id: null }).eq("debt_id", debtId);
    await supabase.from("debts").delete().eq("id", debtId);
    setDebtPayments(prev => prev.filter(p => p.debt_id !== debtId));
    setDebts(prev => prev.filter(d => d.id !== debtId));
  };

  const deleteTx = async (id) => {
    const tx = transactions.find(t => t.id === id);
    if (tx && tx.type === "debt_payment" && tx.debt_id) {
      const debt = debts.find(d => d.id === tx.debt_id);
      if (debt) {
        const newBalance = Number(debt.balance) + Number(tx.amount);
        await supabase.from("debts").update({ balance: newBalance }).eq("id", debt.id);
        setDebts(prev => prev.map(d => d.id === debt.id ? { ...d, balance: newBalance } : d));
        const pay = debtPayments.find(p => p.debt_id === debt.id && Number(p.amount) === Number(tx.amount) && p.date === tx.date);
        if (pay) {
          await supabase.from("debt_payments").delete().eq("id", pay.id);
          setDebtPayments(prev => prev.filter(p => p.id !== pay.id));
        }
      }
    } else if (tx && tx.type === "expense" && tx.account_id) {
      const linkedDebt = debts.find(d => d.type === "credit_card" && d.account_id === tx.account_id);
      if (linkedDebt) {
        const newBalance = Math.max(0, Number(linkedDebt.balance) - Number(tx.amount));
        await supabase.from("debts").update({ balance: newBalance }).eq("id", linkedDebt.id);
        setDebts(prev => prev.map(d => d.id === linkedDebt.id ? { ...d, balance: newBalance } : d));
      }
    }
    await supabase.from("transactions").delete().eq("id", id);
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  const addCategory = async (name) => {
    const { data } = await supabase.from("categories").insert({ name, user_id: userId }).select().single();
    if (data) setCategories(prev => [...prev, data]);
  };
  const removeCategory = async (id) => {
    await supabase.from("categories").delete().eq("id", id);
    setCategories(prev => prev.filter(c => c.id !== id));
  };
  const addAccount = async (name) => {
    const { data } = await supabase.from("accounts").insert({ name, user_id: userId }).select().single();
    if (data) setAccounts(prev => [...prev, data]);
  };
  const removeAccount = async (id) => {
    await supabase.from("accounts").delete().eq("id", id);
    setAccounts(prev => prev.filter(a => a.id !== id));
  };
  const joinHousehold = async (code) => {
    const { error } = await supabase.rpc("join_household", { code });
    return error;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-400 text-sm">Cargando...</div>;
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans pb-24">
      <div className="max-w-md mx-auto px-4 pt-5">
        <Header email={session.user.email} />
        {view === "dashboard" && (
          <Dashboard
            combined={combined} setCombined={setCombined}
            mk={mk} income={income} expense={expense}
            combinedTotals={combinedTotals}
            categoryStats={categoryStats} flaggedCats={flaggedCats}
            totalDebt={totalDebt} setView={setView}
          />
        )}
        {view === "transactions" && (
          <TransactionsView transactions={transactions} categories={categories} accounts={accounts} deleteTx={deleteTx} />
        )}
        {view === "budgets" && (
          <BudgetsView categoryStats={categoryStats} setBudget={setBudget} />
        )}
        {view === "debts" && (
          <DebtsView debts={debts} addDebt={addDebt} addDebtPayment={addDebtPayment}
            updateDebt={updateDebt} deleteDebt={deleteDebt} accounts={accounts} />
        )}
        {view === "settings" && (
          <SettingsView
            categories={categories} addCategory={addCategory} removeCategory={removeCategory}
            accounts={accounts} addAccount={addAccount} removeAccount={removeAccount}
            householdCode={householdCode} joinHousehold={joinHousehold}
          />
        )}
      </div>

      <button
        onClick={() => setModalOpen(true)}
        className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-stone-900 text-white rounded-full px-6 py-3 flex items-center gap-2 shadow-lg text-sm font-medium"
      >
        <Plus size={18} /> Agregar
      </button>

      <BottomNav view={view} setView={setView} />

      {modalOpen && (
        <AddModal
          onClose={() => setModalOpen(false)}
          categories={categories}
          accounts={accounts}
          debts={debts}
          transactions={transactions}
          onSave={addTransaction}
          onDebtPayment={addDebtPayment}
        />
      )}
    </div>
  );
}

function Header({ email }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <span className="text-lg font-medium">Finanzas</span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-stone-400 truncate max-w-[120px]">{email}</span>
        <button onClick={() => supabase.auth.signOut()} className="text-stone-400">
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}

function BottomNav({ view, setView }) {
  const items = [
    { id: "dashboard", icon: Home, label: "Inicio" },
    { id: "transactions", icon: Receipt, label: "Gastos" },
    { id: "budgets", icon: PieChartIcon, label: "Budget" },
    { id: "debts", icon: CreditCard, label: "Deudas" },
    { id: "settings", icon: Settings, label: "Ajustes" },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200">
      <div className="max-w-md mx-auto flex">
        {items.map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setView(id)}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs ${view === id ? "text-stone-900" : "text-stone-400"}`}>
            <Icon size={20} strokeWidth={view === id ? 2.2 : 1.8} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Dashboard({ combined, setCombined, mk, income, expense, combinedTotals, categoryStats, flaggedCats, totalDebt, setView }) {
  return (
    <div>
      <div className="flex bg-stone-200 rounded-lg p-0.5 mb-4 text-sm">
        <button onClick={() => setCombined(false)} className={`flex-1 py-1.5 rounded-md font-medium transition ${!combined ? "bg-white shadow-sm" : "text-stone-500"}`}>Mi vista</button>
        <button onClick={() => setCombined(true)} className={`flex-1 py-1.5 rounded-md font-medium transition ${combined ? "bg-white shadow-sm" : "text-stone-500"}`}>Vista combinada</button>
      </div>
      <p className="text-sm text-stone-500 mb-2 capitalize">{monthLabel(mk)}</p>

      {!combined ? (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <MetricCard label="Ingresos" value={fmt(income)} positive />
          <MetricCard label="Gastos" value={fmt(expense)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-white border border-stone-200 rounded-xl p-3">
            <p className="text-xs text-stone-500 mb-2">Tú</p>
            <p className="text-sm">Ingresos <span className="font-medium text-emerald-700">{fmt(income)}</span></p>
            <p className="text-sm">Gastos <span className="font-medium text-red-700">{fmt(expense)}</span></p>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl p-3">
            <p className="text-xs text-stone-500 mb-2">Tu hogar</p>
            <p className="text-sm">Ingresos <span className="font-medium text-emerald-700">{fmt(combinedTotals.income)}</span></p>
            <p className="text-sm">Gastos <span className="font-medium text-red-700">{fmt(combinedTotals.expense)}</span></p>
          </div>
        </div>
      )}

      {!combined && (
        <div className="bg-stone-900 text-white rounded-xl p-4 mb-5 flex justify-between items-center">
          <span className="text-sm text-stone-300">Disponible</span>
          <span className="text-xl font-medium">{fmt(income - expense)}</span>
        </div>
      )}

      {flaggedCats.length > 0 && (
        <div className="space-y-2 mb-5">
          {flaggedCats.map(c => (
            <div key={c.id} className="bg-amber-50 rounded-lg px-3 py-2.5 flex items-center gap-2 text-sm text-amber-800">
              <Flag size={16} />
              {c.cat} subió {c.pctChange}% vs. mes anterior
            </div>
          ))}
        </div>
      )}

      <ExpensePieChart categoryStats={categoryStats} totalExpense={expense} />

      <p className="font-medium mb-3">Presupuesto por categoría</p>
      <div className="space-y-3 mb-6">
        {categoryStats.filter(c => c.budget > 0 || c.spent > 0).map(c => {
          const pct = c.budget > 0 ? Math.min(100, Math.round((c.spent / c.budget) * 100)) : 0;
          const over = c.budget > 0 && c.spent > c.budget;
          return (
            <div key={c.id}>
              <div className="flex justify-between text-sm mb-1">
                <span>{c.cat}</span>
                <span className={over ? "text-red-600" : "text-stone-500"}>{fmt(c.spent)}{c.budget > 0 ? ` / ${fmt(c.budget)}` : ""}</span>
              </div>
              <div className="h-1.5 bg-stone-200 rounded-full">
                <div className={`h-1.5 rounded-full ${over ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${c.budget > 0 ? pct : (c.spent > 0 ? 100 : 0)}%` }} />
              </div>
            </div>
          );
        })}
        {categoryStats.every(c => c.budget === 0 && c.spent === 0) && (
          <p className="text-sm text-stone-400">Aún no hay gastos ni presupuestos este mes.</p>
        )}
      </div>

      <p className="font-medium mb-3">Deudas</p>
      <button onClick={() => setView("debts")} className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 flex justify-between items-center">
        <div className="text-left">
          <p className="text-xs text-stone-500">Saldo total adeudado</p>
          <p className="text-lg font-medium">{fmt(totalDebt)}</p>
        </div>
        <ChevronRight size={18} className="text-stone-400" />
      </button>
    </div>
  );
}

function MetricCard({ label, value, positive }) {
  return (
    <div className="bg-stone-100 rounded-xl p-4">
      <p className="text-xs text-stone-500 mb-1">{label}</p>
      <p className={`text-2xl font-medium ${positive ? "text-emerald-700" : "text-red-700"}`}>{value}</p>
    </div>
  );
}