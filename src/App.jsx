import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Home, Receipt, PieChart as PieChartIcon, CreditCard, Settings, Plus, X,
  Flag, ChevronRight, Trash2, Check, LogOut, Copy
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "./supabaseClient";

const CHART_COLORS = ["#1c1917", "#78716c", "#a8a29e", "#d6d3d1", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const sendLink = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-medium mb-1">Finanzas</h1>
        <p className="text-sm text-stone-500 mb-6">Inicia sesión con tu correo para continuar.</p>
        {sent ? (
          <div className="bg-emerald-50 text-emerald-800 text-sm rounded-xl p-4">
            Te enviamos un enlace a <strong>{email}</strong>. Ábrelo desde tu correo en este mismo dispositivo para entrar.
          </div>
        ) : (
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
              onClick={sendLink}
              disabled={loading}
              className="w-full bg-stone-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar enlace mágico"}
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

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [cats, accs, txs, buds, dts, pays, hh] = await Promise.all([
      supabase.from("categories").select("*").order("created_at"),
      supabase.from("accounts").select("*").order("created_at"),
      supabase.from("transactions").select("*").order("date", { ascending: false }),
      supabase.from("budgets").select("*").eq("month", mk),
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
  }, [mk]);

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
    if (!error) setTransactions(prev => [data, ...prev]);
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
      const { data } = await supabase.from("budgets").insert({ category_id: categoryId, month: mk, amount, user_id: userId }).select().single();
      if (data) setBudgets(prev => [...prev, data]);
    }
  };

  const addDebt = async (debt) => {
    const { data } = await supabase.from("debts").insert({ ...debt, balance: debt.original_amount, user_id: userId }).select().single();
    if (data) setDebts(prev => [data, ...prev]);
  };

  const deleteTx = async (id) => {
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
          <DebtsView debts={debts} addDebt={addDebt} addDebtPayment={addDebtPayment} accounts={accounts} />
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
        <div className="grid grid-cols-2 gap-3 mb-5">
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

function ExpensePieChart({ categoryStats, totalExpense }) {
  const data = categoryStats.filter(c => c.spent > 0).map(c => ({ name: c.cat, value: c.spent }));
  if (data.length === 0) return null;
  return (
    <div className="mb-6">
      <p className="font-medium mb-3">Gastos por categoría</p>
      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {data.map((entry, i) => <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="text-stone-600 truncate">{d.name}</span>
              <span className="text-stone-400 ml-auto">{totalExpense > 0 ? Math.round((d.value / totalExpense) * 100) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TransactionsView({ transactions, categories, accounts, deleteTx }) {
  const catName = (id) => categories.find(c => c.id === id)?.name;
  const accName = (id) => accounts.find(a => a.id === id)?.name;
  return (
    <div>
      <p className="font-medium mb-3">Transacciones</p>
      {transactions.length === 0 && <p className="text-sm text-stone-400">Sin transacciones todavía.</p>}
      <div className="space-y-2">
        {transactions.map(t => (
          <div key={t.id} className="bg-white border border-stone-200 rounded-xl px-4 py-3 flex justify-between items-center">
            <div>
              <p className="text-sm font-medium">
                {catName(t.category_id) || t.note || (t.type === "income" ? "Ingreso" : "Pago de deuda")}
                {t.vendor ? ` · ${t.vendor}` : ""}
              </p>
              <p className="text-xs text-stone-500">{t.date} · {accName(t.account_id) || ""}{t.note && t.category_id ? ` · ${t.note}` : ""}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-medium ${t.type === "income" ? "text-emerald-700" : "text-red-700"}`}>
                {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
              </span>
              <button onClick={() => deleteTx(t.id)} className="text-stone-300 hover:text-red-500">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BudgetsView({ categoryStats, setBudget }) {
  const [edits, setEdits] = useState({});
  return (
    <div>
      <p className="font-medium mb-3">Presupuesto de este mes</p>
      <div className="space-y-3">
        {categoryStats.map(c => (
          <div key={c.id} className="bg-white border border-stone-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{c.cat}</p>
              <p className="text-xs text-stone-500">Gastado: {fmt(c.spent)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-stone-400 text-sm">$</span>
              <input
                type="number"
                defaultValue={c.budget || ""}
                placeholder="0"
                className="w-20 border border-stone-200 rounded-lg px-2 py-1 text-sm text-right"
                onChange={(e) => setEdits(prev => ({ ...prev, [c.id]: e.target.value }))}
              />
              <button
                onClick={() => setBudget(c.id, parseFloat(edits[c.id] ?? c.budget ?? 0) || 0)}
                className="text-stone-500 hover:text-stone-900"
              >
                <Check size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DebtsView({ debts, addDebt, addDebtPayment, accounts }) {
  const [showForm, setShowForm] = useState(false);
  const [payDebtId, setPayDebtId] = useState(null);
  const [form, setForm] = useState({ name: "", original_amount: "", rate: "", min_payment: "" });
  const [payForm, setPayForm] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), account_id: accounts[0]?.id || "" });

  const submitDebt = async () => {
    if (!form.name || !form.original_amount) return;
    await addDebt({
      name: form.name,
      original_amount: parseFloat(form.original_amount),
      rate: parseFloat(form.rate) || 0,
      min_payment: parseFloat(form.min_payment) || 0,
    });
    setForm({ name: "", original_amount: "", rate: "", min_payment: "" });
    setShowForm(false);
  };

  const submitPayment = async () => {
    if (!payForm.amount || !payDebtId) return;
    await addDebtPayment(payDebtId, parseFloat(payForm.amount), payForm.date, payForm.account_id);
    setPayForm({ amount: "", date: new Date().toISOString().slice(0, 10), account_id: accounts[0]?.id || "" });
    setPayDebtId(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="font-medium">Deudas</p>
        <button onClick={() => setShowForm(!showForm)} className="text-sm text-stone-600 flex items-center gap-1">
          <Plus size={14} /> Nueva deuda
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-stone-200 rounded-xl p-4 mb-4 space-y-2">
          <input placeholder="Nombre (ej. Tarjeta Visa)" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
            value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Monto original" type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
            value={form.original_amount} onChange={e => setForm({ ...form, original_amount: e.target.value })} />
          <div className="flex gap-2">
            <input placeholder="Tasa % anual" type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
              value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} />
            <input placeholder="Pago mínimo" type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
              value={form.min_payment} onChange={e => setForm({ ...form, min_payment: e.target.value })} />
          </div>
          <button onClick={submitDebt} className="w-full bg-stone-900 text-white rounded-lg py-2 text-sm font-medium">Guardar deuda</button>
        </div>
      )}

      <div className="space-y-3">
        {debts.map(d => {
          const paid = d.original_amount - d.balance;
          const pct = d.original_amount > 0 ? Math.round((paid / d.original_amount) * 100) : 0;
          return (
            <div key={d.id} className="bg-white border border-stone-200 rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-stone-500">{d.rate}% anual · mínimo {fmt(d.min_payment)}</p>
                </div>
                <p className="text-lg font-medium">{fmt(d.balance)}</p>
              </div>
              <div className="h-1.5 bg-stone-200 rounded-full mb-3">
                <div className="h-1.5 bg-stone-900 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              {payDebtId === d.id ? (
                <div className="space-y-2 pt-2 border-t border-stone-100">
                  <input placeholder="Monto del pago" type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
                    value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} />
                  <div className="flex gap-2">
                    <button onClick={submitPayment} className="flex-1 bg-stone-900 text-white rounded-lg py-2 text-sm font-medium">Registrar pago</button>
                    <button onClick={() => setPayDebtId(null)} className="px-3 text-sm text-stone-500">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setPayDebtId(d.id)} className="text-sm text-stone-600 font-medium">Registrar pago</button>
              )}
            </div>
          );
        })}
        {debts.length === 0 && !showForm && <p className="text-sm text-stone-400">No tienes deudas registradas.</p>}
      </div>
    </div>
  );
}

function SettingsView({ categories, addCategory, removeCategory, accounts, addAccount, removeAccount, householdCode, joinHousehold }) {
  const [newCat, setNewCat] = useState("");
  const [newAcc, setNewAcc] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinMsg, setJoinMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const submitJoin = async () => {
    setJoinMsg("");
    const error = await joinHousehold(joinCode.trim());
    if (error) setJoinMsg(error.message || "No se pudo vincular");
    else setJoinMsg("¡Vinculado! La vista combinada ya debería reflejarlo.");
  };

  const copyCode = () => {
    navigator.clipboard.writeText(householdCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-medium mb-2">Vincular con tu pareja</p>
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-xs text-stone-500 mb-1">Tu código de invitación</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg tracking-wider">{householdCode}</span>
              <button onClick={copyCode} className="text-stone-400"><Copy size={14} /></button>
              {copied && <span className="text-xs text-emerald-600">Copiado</span>}
            </div>
          </div>
          <div>
            <p className="text-xs text-stone-500 mb-1">O ingresa el código de tu pareja para vincularte</p>
            <div className="flex gap-2">
              <input className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm" value={joinCode} onChange={e => setJoinCode(e.target.value)} />
              <button onClick={submitJoin} className="bg-stone-900 text-white rounded-lg px-3 text-sm">Unirse</button>
            </div>
            {joinMsg && <p className="text-xs text-stone-500 mt-1">{joinMsg}</p>}
          </div>
        </div>
      </div>

      <div>
        <p className="font-medium mb-2">Categorías</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {categories.map(c => (
            <span key={c.id} className="bg-stone-100 rounded-full px-3 py-1.5 text-sm flex items-center gap-1.5">
              {c.name} <button onClick={() => removeCategory(c.id)}><X size={12} className="text-stone-400" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input placeholder="Nueva categoría" className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm"
            value={newCat} onChange={e => setNewCat(e.target.value)} />
          <button onClick={() => { addCategory(newCat.trim()); setNewCat(""); }} className="bg-stone-900 text-white rounded-lg px-3 text-sm">Añadir</button>
        </div>
      </div>
      <div>
        <p className="font-medium mb-2">Cuentas</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {accounts.map(a => (
            <span key={a.id} className="bg-stone-100 rounded-full px-3 py-1.5 text-sm flex items-center gap-1.5">
              {a.name} <button onClick={() => removeAccount(a.id)}><X size={12} className="text-stone-400" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input placeholder="Nueva cuenta" className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm"
            value={newAcc} onChange={e => setNewAcc(e.target.value)} />
          <button onClick={() => { addAccount(newAcc.trim()); setNewAcc(""); }} className="bg-stone-900 text-white rounded-lg px-3 text-sm">Añadir</button>
        </div>
      </div>
    </div>
  );
}

function AddModal({ onClose, categories, accounts, debts, transactions, onSave, onDebtPayment }) {
  const [tab, setTab] = useState("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [vendor, setVendor] = useState("");
  const [source, setSource] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [debtId, setDebtId] = useState(debts[0]?.id || "");
  const [error, setError] = useState("");

  const vendorSuggestions = useMemo(() => {
    const set = new Set(
      transactions.filter(t => t.type === "expense" && t.category_id === categoryId && t.vendor).map(t => t.vendor)
    );
    return Array.from(set);
  }, [transactions, categoryId]);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Ingresa un monto válido"); return; }
    if (tab === "debt" && !debtId) { setError("Selecciona una deuda"); return; }
    if (tab === "debt") {
      await onDebtPayment(debtId, amt, date, accountId);
    } else {
      await onSave({
        type: tab,
        amount: amt,
        account_id: accountId,
        category_id: tab === "expense" ? categoryId : null,
        vendor: tab === "expense" ? vendor.trim() : null,
        note: tab === "income" ? source : note,
        date,
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/45 flex items-end justify-center z-50" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <span className="font-medium">Agregar</span>
          <button onClick={onClose}><X size={18} className="text-stone-500" /></button>
        </div>

        <div className="flex border-b border-stone-200 mb-4 text-sm">
          {[["expense", "Gasto"], ["income", "Ingreso"], ["debt", "Pago deuda"]].map(([id, label]) => (
            <button key={id} onClick={() => { setTab(id); setError(""); }}
              className={`flex-1 text-center py-2 font-medium border-b-2 ${tab === id ? "border-stone-900 text-stone-900" : "border-transparent text-stone-400"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Monto</label>
            <input type="number" placeholder="0.00" className="w-full text-xl border border-stone-200 rounded-lg px-3 py-2"
              value={amount} onChange={e => setAmount(e.target.value)} />
          </div>

          {tab === "debt" ? (
            <div>
              <label className="text-xs text-stone-500 block mb-1">Deuda</label>
              <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm" value={debtId} onChange={e => setDebtId(e.target.value)}>
                {debts.map(d => <option key={d.id} value={d.id}>{d.name} · saldo {fmt(d.balance)}</option>)}
              </select>
            </div>
          ) : tab === "expense" ? (
            <>
              <div>
                <label className="text-xs text-stone-500 block mb-1">Categoría</label>
                <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1">Vendedor / lugar</label>
                <input
                  list="vendor-suggestions"
                  placeholder="Riba Smith, Super 99..."
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
                  value={vendor}
                  onChange={e => setVendor(e.target.value)}
                />
                <datalist id="vendor-suggestions">
                  {vendorSuggestions.map(v => <option key={v} value={v} />)}
                </datalist>
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs text-stone-500 block mb-1">Fuente del ingreso</label>
              <input placeholder="Salario, freelance..." className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
                value={source} onChange={e => setSource(e.target.value)} />
            </div>
          )}

          <div>
            <label className="text-xs text-stone-500 block mb-1">Cuenta</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm" value={accountId} onChange={e => setAccountId(e.target.value)}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-stone-500 block mb-1">Fecha</label>
            <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {tab === "expense" && (
            <div>
              <label className="text-xs text-stone-500 block mb-1">Nota</label>
              <textarea placeholder="Opcional" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm min-h-[44px]"
                value={note} onChange={e => setNote(e.target.value)} />
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button onClick={submit} className="w-full bg-stone-900 text-white rounded-lg py-2.5 text-sm font-medium mt-2">
            Guardar {tab === "expense" ? "gasto" : tab === "income" ? "ingreso" : "pago"}
          </button>
        </div>
      </div>
    </div>
  );
}
