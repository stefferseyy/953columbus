"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type Expense = {
  id: string;
  created_by: string;
  paid_by: string;
  description: string;
  amount_cents: number;
  expense_date: string;
  created_at: string;
  category: 'Food' | 'Gas & Electric' | 'WiFi' | 'Household' | 'Fun' | 'Misc';
  split_type: '50/50' | 'custom';
  steph_owes_cents: number;
  sam_owes_cents: number;
  reimbursed: boolean;
  reimbursed_date: string | null;
};

// User mapping - we'll fetch this from Supabase auth
type User = {
  id: string;
  email: string;
  displayName: string;
};

export default function ExpensesPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [users, setUsers] = useState<User[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState<Expense["category"]>("Misc");
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formPaidBy, setFormPaidBy] = useState("");
  const [formSplitType, setFormSplitType] = useState<"50/50" | "custom">("50/50");
  const [formStephOwes, setFormStephOwes] = useState("");
  const [formSamOwes, setFormSamOwes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterReimbursed, setFilterReimbursed] = useState("all");
  const [dateRangePreset, setDateRangePreset] = useState("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Sort state
  const [sortOption, setSortOption] = useState("date-desc");

  // Batch selection state
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());

  // Charts state
  const [showCharts, setShowCharts] = useState(false);

  // Helper to get user email from ID
  const getUserEmail = (userId: string): string => {
    const user = users.find(u => u.id === userId);
    return user ? user.email : userId;
  };

  // 1) Auth gate: if no user, bounce to /login
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setEmail(data.user.email ?? "");
      setCurrentUserId(data.user.id);

      // Fetch all profiles from the profiles table
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, display_name");

      if (!profilesError && profilesData) {
        const userList: User[] = profilesData.map(profile => ({
          id: profile.id,
          email: profile.email ?? '',
          displayName: profile.display_name ?? profile.email ?? 'Unknown'
        }));
        setUsers(userList);
      }

      await loadExpenses();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // 2a) Real-time subscription: reload whenever any expense changes
  useEffect(() => {
    const channel = supabase
      .channel("expenses-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses" },
        () => {
          loadExpenses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Read from Supabase
  async function loadExpenses() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setExpenses([]);
    } else {
      setExpenses((data as Expense[]) ?? []);
    }

    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleAddOrUpdateExpense() {
    setError(null);
    setSubmitting(true);

    // Validation
    if (!formDescription.trim()) {
      setError("Description is required");
      setSubmitting(false);
      return;
    }

    const amountCents = Math.round(parseFloat(formAmount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      setError("Valid amount is required");
      setSubmitting(false);
      return;
    }

    if (!formPaidBy) {
      setError("Please select who paid");
      setSubmitting(false);
      return;
    }

    // Calculate split amounts
    let stephOwesCents = 0;
    let samOwesCents = 0;

    if (formSplitType === "50/50") {
      const half = Math.round(amountCents / 2);
      stephOwesCents = half;
      samOwesCents = amountCents - half; // handle odd cents
    } else {
      stephOwesCents = Math.round(parseFloat(formStephOwes) * 100);
      samOwesCents = Math.round(parseFloat(formSamOwes) * 100);

      if (isNaN(stephOwesCents) || isNaN(samOwesCents)) {
        setError("Invalid custom split amounts");
        setSubmitting(false);
        return;
      }

      // Validation: split should roughly equal total (allow 2 cent tolerance)
      if (Math.abs((stephOwesCents + samOwesCents) - amountCents) > 2) {
        setError("Split amounts should add up to total");
        setSubmitting(false);
        return;
      }
    }

    if (editingExpenseId) {
      // UPDATE existing expense
      const { error: updateError } = await supabase
        .from("expenses")
        .update({
          paid_by: formPaidBy,
          description: formDescription,
          amount_cents: amountCents,
          expense_date: formDate,
          category: formCategory,
          split_type: formSplitType,
          steph_owes_cents: stephOwesCents,
          sam_owes_cents: samOwesCents,
        })
        .eq("id", editingExpenseId);

      if (updateError) {
        setError(updateError.message);
      } else {
        setEditingExpenseId(null);
        // Clear form
        setFormDescription("");
        setFormAmount("");
        setFormCategory("Misc");
        setFormDate(new Date().toISOString().split('T')[0]);
        setFormPaidBy("");
        setFormSplitType("50/50");
        setFormStephOwes("");
        setFormSamOwes("");

        // Reload expenses list
        await loadExpenses();
      }
    } else {
      // INSERT new expense
      const { error: insertError } = await supabase
        .from("expenses")
        .insert({
          created_by: currentUserId,
          paid_by: formPaidBy,
          description: formDescription,
          amount_cents: amountCents,
          expense_date: formDate,
          category: formCategory,
          split_type: formSplitType,
          steph_owes_cents: stephOwesCents,
          sam_owes_cents: samOwesCents,
          reimbursed: false,
          reimbursed_date: null,
        });

      if (insertError) {
        setError(insertError.message);
      } else {
        // Clear form
        setFormDescription("");
        setFormAmount("");
        setFormCategory("Misc");
        setFormDate(new Date().toISOString().split('T')[0]);
        setFormPaidBy("");
        setFormSplitType("50/50");
        setFormStephOwes("");
        setFormSamOwes("");

        // Reload expenses list
        await loadExpenses();
      }
    }

    setSubmitting(false);
  }

  async function handleMarkReimbursed(expenseId: string) {
    const { error } = await supabase
      .from("expenses")
      .update({
        reimbursed: true,
        reimbursed_date: new Date().toISOString()
      })
      .eq("id", expenseId);

    if (error) {
      setError(error.message);
    } else {
      await loadExpenses();
    }
  }

  function handleEditExpense(expense: Expense) {
    setEditingExpenseId(expense.id);
    setFormDescription(expense.description);
    setFormAmount((expense.amount_cents / 100).toString());
    setFormCategory(expense.category);
    setFormDate(expense.expense_date);
    setFormPaidBy(expense.paid_by);
    setFormSplitType(expense.split_type);
    setFormStephOwes((expense.steph_owes_cents / 100).toString());
    setFormSamOwes((expense.sam_owes_cents / 100).toString());

    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleCancelEdit() {
    setEditingExpenseId(null);
    // Clear form
    setFormDescription("");
    setFormAmount("");
    setFormCategory("Misc");
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormPaidBy("");
    setFormSplitType("50/50");
    setFormStephOwes("");
    setFormSamOwes("");
  }

  async function handleDeleteExpense(expenseId: string) {
    if (!confirm("Delete this expense? This cannot be undone.")) {
      return;
    }

    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", expenseId);

    if (error) {
      setError(error.message);
    } else {
      await loadExpenses();
    }
  }

  function toggleExpenseSelection(expenseId: string) {
    const newSelection = new Set(selectedExpenseIds);
    if (newSelection.has(expenseId)) {
      newSelection.delete(expenseId);
    } else {
      newSelection.add(expenseId);
    }
    setSelectedExpenseIds(newSelection);
  }

  function selectAllUnpaid() {
    const unpaidExpenses = expenses.filter(e => !e.reimbursed);
    setSelectedExpenseIds(new Set(unpaidExpenses.map(e => e.id)));
  }

  function clearSelection() {
    setSelectedExpenseIds(new Set());
  }

  async function handleBatchMarkPaid() {
    if (selectedExpenseIds.size === 0) return;

    const idsArray = Array.from(selectedExpenseIds);
    const { error } = await supabase
      .from("expenses")
      .update({
        reimbursed: true,
        reimbursed_date: new Date().toISOString()
      })
      .in("id", idsArray);

    if (error) {
      setError(error.message);
    } else {
      setSelectedExpenseIds(new Set());
      await loadExpenses();
    }
  }

  // Calculate category totals for charts
  function getCategoryTotals(expenses: Expense[]): { category: string, amount: number, color: string }[] {
    const totals = new Map<string, number>();

    expenses.forEach(expense => {
      const current = totals.get(expense.category) || 0;
      totals.set(expense.category, current + expense.amount_cents);
    });

    const colors: Record<string, string> = {
      'Food': '#e07d4c',
      'Gas & Electric': '#f4a261',
      'WiFi': '#e9c46a',
      'Household': '#f1faee',
      'Fun': '#a8dadc',
      'Misc': '#d4a5a5'
    };

    return Array.from(totals.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        color: colors[category] || '#ccc'
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  // Calculate monthly totals for charts
  function getMonthlyTotals(expenses: Expense[]): { month: string, amount: number }[] {
    const totals = new Map<string, number>();

    expenses.forEach(expense => {
      const month = expense.expense_date.substring(0, 7); // "2026-02"
      const current = totals.get(month) || 0;
      totals.set(month, current + expense.amount_cents);
    });

    return Array.from(totals.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  // Sort expenses
  function sortExpenses(expenses: Expense[]): Expense[] {
    return [...expenses].sort((a, b) => {
      let comparison = 0;

      switch (sortOption) {
        case "date-desc":
          comparison = b.expense_date.localeCompare(a.expense_date);
          break;
        case "date-asc":
          comparison = a.expense_date.localeCompare(b.expense_date);
          break;
        case "amount-desc":
          comparison = b.amount_cents - a.amount_cents;
          break;
        case "amount-asc":
          comparison = a.amount_cents - b.amount_cents;
          break;
        case "category-asc":
          comparison = a.category.localeCompare(b.category);
          break;
        case "category-desc":
          comparison = b.category.localeCompare(a.category);
          break;
        default:
          comparison = 0;
      }

      return comparison;
    });
  }

  // Get date range based on preset or custom selection
  function getDateRange(): { start: string | null, end: string | null } {
    const today = new Date();

    switch (dateRangePreset) {
      case "this-month": {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0]
        };
      }
      case "last-30": {
        const start = new Date(today);
        start.setDate(start.getDate() - 30);
        return {
          start: start.toISOString().split('T')[0],
          end: today.toISOString().split('T')[0]
        };
      }
      case "custom": {
        return { start: customStartDate, end: customEndDate };
      }
      case "all":
      default:
        return { start: null, end: null };
    }
  }

  // Calculate running balance
  function calculateBalance(): { person: string, owes: string, amount: number } {
    let stephOwes = 0;
    let samOwes = 0;

    expenses.filter(e => !e.reimbursed).forEach(expense => {
      const paidByUser = users.find(u => u.id === expense.paid_by);
      const paidBySteph = paidByUser?.displayName.toLowerCase().includes("steph");

      if (paidBySteph) {
        samOwes += expense.sam_owes_cents;
      } else {
        stephOwes += expense.steph_owes_cents;
      }
    });

    const netBalance = stephOwes - samOwes;
    if (Math.abs(netBalance) < 1) {
      return { person: "All settled up!", owes: "", amount: 0 };
    } else if (netBalance > 0) {
      return { person: "Steph", owes: "Sam", amount: netBalance };
    } else {
      return { person: "Sam", owes: "Steph", amount: Math.abs(netBalance) };
    }
  }

  return (
    <main style={{ padding: 16, maxWidth: 720, margin: "0 auto", minHeight: "100vh" }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        marginBottom: 32,
        paddingBottom: 16,
        borderBottom: "1px solid var(--border)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <a
            href="/expenses"
            style={{
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              flexShrink: 0
            }}
          >
            <img
              src="/pidou.png"
              alt="953 Columbus Logo"
              style={{
                width: 50,
                height: 50,
                objectFit: "contain"
              }}
            />
          </a>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 700,
              color: "var(--accent-orange)",
              letterSpacing: "-0.5px"
            }}>
              953 Columbus
            </h1>
            <p style={{
              marginTop: 4,
              color: "var(--text-secondary)",
              fontSize: 14,
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}>
              {email}
            </p>
          </div>
        </div>

        <button
          className="cursor-pointer"
          onClick={logout}
          style={{
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: 500,
            whiteSpace: "nowrap",
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 6
          }}
        >
          Sign out
        </button>
      </div>

      {/* Nav tabs */}
      <nav style={{
        display: "flex",
        gap: 4,
        marginBottom: 24,
        borderBottom: "2px solid var(--border)"
      }}>
        <a
          href="/expenses"
          style={{
            padding: "10px 20px",
            fontSize: 15,
            fontWeight: 600,
            color: "var(--accent-orange)",
            borderBottom: "2px solid var(--accent-orange)",
            marginBottom: -2,
            textDecoration: "none"
          }}
        >
          Expenses
        </a>
        <a
          href="/photos"
          style={{
            padding: "10px 20px",
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text-secondary)",
            borderBottom: "2px solid transparent",
            marginBottom: -2,
            textDecoration: "none"
          }}
        >
          Photos
        </a>
      </nav>

      {/* Running Balance Summary */}
      {(() => {
        const balance = calculateBalance();
        return (
          <div style={{
            marginBottom: 32,
            padding: 20,
            background: "var(--bg-secondary)",
            borderRadius: 6,
            textAlign: "center"
          }}>
            {balance.amount === 0 ? (
              <div style={{
                fontSize: 24,
                fontWeight: 600,
                color: "var(--accent-orange)"
              }}>
                {balance.person}
              </div>
            ) : (
              <>
                <div style={{
                  fontSize: 16,
                  color: "var(--text-secondary)",
                  marginBottom: 8
                }}>
                  {balance.person} owes {balance.owes}
                </div>
                <div style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: "var(--accent-orange)"
                }}>
                  ${(balance.amount / 100).toFixed(2)}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Add Expense Form */}
      <div style={{
        marginBottom: 40,
        paddingBottom: 32,
        borderBottom: "1px solid var(--border)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{
            fontSize: 20,
            margin: 0,
            fontWeight: 600,
            color: "var(--text-primary)"
          }}>
            {editingExpenseId ? "Update Expense" : "Add Expense"}
          </h2>
          {editingExpenseId && (
            <button
              onClick={handleCancelEdit}
              className="cursor-pointer"
              style={{
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                borderRadius: 6
              }}
            >
              Cancel
            </button>
          )}
        </div>
        <div style={{ display: "grid", gap: 12, maxWidth: "100%" }}>
          <input
            placeholder="Description (e.g., Groceries)"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            style={{
              padding: 12,
              fontSize: 16,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "white",
              color: "var(--text-primary)"
            }}
          />

          <div style={{
            display: "flex",
            alignItems: "center",
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: "white",
            paddingLeft: 12
          }}>
            <span style={{ fontSize: 16, color: "var(--text-secondary)" }}>$</span>
            <input
              placeholder="0.00"
              type="number"
              step="0.01"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              style={{
                flex: 1,
                padding: 12,
                paddingLeft: 6,
                fontSize: 16,
                border: "none",
                background: "transparent",
                color: "var(--text-primary)",
                outline: "none"
              }}
            />
          </div>

          <select
            value={formCategory}
            onChange={(e) => setFormCategory(e.target.value as Expense["category"])}
            style={{
              padding: 12,
              fontSize: 16,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "white",
              color: "var(--text-primary)"
            }}
          >
            <option value="Food">Food</option>
            <option value="Gas & Electric">Gas & Electric</option>
            <option value="WiFi">WiFi</option>
            <option value="Household">Household</option>
            <option value="Fun">Fun</option>
            <option value="Misc">Misc</option>
          </select>

          <input
            type="date"
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
            style={{
              padding: 12,
              fontSize: 16,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "white",
              color: "var(--text-primary)"
            }}
          />

          <select
            value={formPaidBy}
            onChange={(e) => setFormPaidBy(e.target.value)}
            style={{
              padding: 12,
              fontSize: 16,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "white",
              color: "var(--text-primary)"
            }}
          >
            <option value="">Who paid?</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.displayName}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="radio"
                value="50/50"
                checked={formSplitType === "50/50"}
                onChange={() => setFormSplitType("50/50")}
              />
              50/50 Split
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="radio"
                value="custom"
                checked={formSplitType === "custom"}
                onChange={() => setFormSplitType("custom")}
              />
              Custom Split
            </label>
          </div>

          {formSplitType === "custom" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <input
                placeholder="Steph owes ($)"
                type="number"
                step="0.01"
                value={formStephOwes}
                onChange={(e) => setFormStephOwes(e.target.value)}
                style={{
                  padding: 12,
                  fontSize: 16,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "white",
                  color: "var(--text-primary)"
                }}
              />
              <input
                placeholder="Sam owes ($)"
                type="number"
                step="0.01"
                value={formSamOwes}
                onChange={(e) => setFormSamOwes(e.target.value)}
                style={{
                  padding: 12,
                  fontSize: 16,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "white",
                  color: "var(--text-primary)"
                }}
              />
            </div>
          )}

          <button
            onClick={handleAddOrUpdateExpense}
            disabled={submitting}
            className="cursor-pointer"
            style={{
              padding: 14,
              fontSize: 16,
              fontWeight: 600,
              backgroundColor: submitting ? "var(--text-secondary)" : "var(--accent-orange)",
              color: "white",
              border: "none",
              borderRadius: 6
            }}
          >
            {submitting ? (editingExpenseId ? "Updating..." : "Adding...") : (editingExpenseId ? "Update Expense" : "Add Expense")}
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 600,
            color: "var(--text-primary)"
          }}>
            History
          </h2>
          <button
            className="cursor-pointer"
            onClick={loadExpenses}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 6,
              background: "transparent",
              color: "var(--accent-orange)",
              border: "1px solid var(--border)"
            }}
          >
            Refresh
          </button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <input
            placeholder="Search descriptions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: 12,
              fontSize: 16,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "white",
              color: "var(--text-primary)"
            }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              style={{
                padding: 12,
                fontSize: 16,
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "white",
                color: "var(--text-primary)"
              }}
            >
              <option value="all">All Categories</option>
              <option value="Food">Food</option>
              <option value="Gas & Electric">Gas & Electric</option>
              <option value="WiFi">WiFi</option>
              <option value="Household">Household</option>
              <option value="Fun">Fun</option>
              <option value="Misc">Misc</option>
            </select>

            <select
              value={filterReimbursed}
              onChange={(e) => setFilterReimbursed(e.target.value)}
              style={{
                padding: 12,
                fontSize: 16,
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "white",
                color: "var(--text-primary)"
              }}
            >
              <option value="all">All Expenses</option>
              <option value="unpaid">Unpaid Only</option>
              <option value="paid">Paid Only</option>
            </select>
          </div>

          <select
            value={dateRangePreset}
            onChange={(e) => setDateRangePreset(e.target.value)}
            style={{
              padding: 12,
              fontSize: 16,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "white",
              color: "var(--text-primary)"
            }}
          >
            <option value="all">All Time</option>
            <option value="this-month">This Month</option>
            <option value="last-30">Last 30 Days</option>
            <option value="custom">Custom Range</option>
          </select>

          {dateRangePreset === "custom" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                placeholder="Start date"
                style={{
                  padding: 12,
                  fontSize: 16,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "white",
                  color: "var(--text-primary)"
                }}
              />
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                placeholder="End date"
                style={{
                  padding: 12,
                  fontSize: 16,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "white",
                  color: "var(--text-primary)"
                }}
              />
            </div>
          )}

          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            style={{
              padding: 12,
              fontSize: 16,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "white",
              color: "var(--text-primary)"
            }}
          >
            <option value="date-desc">Date (Newest First)</option>
            <option value="date-asc">Date (Oldest First)</option>
            <option value="amount-desc">Amount (High to Low)</option>
            <option value="amount-asc">Amount (Low to High)</option>
            <option value="category-asc">Category (A-Z)</option>
            <option value="category-desc">Category (Z-A)</option>
          </select>
        </div>

        {/* Charts Toggle */}
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setShowCharts(!showCharts)}
            className="cursor-pointer"
            style={{
              padding: "10px 16px",
              fontSize: 14,
              fontWeight: 500,
              background: showCharts ? "var(--accent-orange)" : "transparent",
              color: showCharts ? "white" : "var(--accent-orange)",
              border: "1px solid var(--border)",
              borderRadius: 6
            }}
          >
            {showCharts ? "Hide Charts" : "Show Charts"}
          </button>
        </div>

        {/* Charts Section */}
        {showCharts && (() => {
          const categoryData = getCategoryTotals(expenses);
          const monthlyData = getMonthlyTotals(expenses);

          return (
            <div style={{
              marginTop: 24,
              padding: 20,
              background: "var(--bg-card)",
              borderRadius: 6,
              border: "1px solid var(--border)"
            }}>
              <h3 style={{
                fontSize: 18,
                fontWeight: 600,
                marginBottom: 16,
                color: "var(--text-primary)"
              }}>
                Spending Analysis
              </h3>

              {/* Category Chart */}
              <div style={{ marginBottom: 32 }}>
                <h4 style={{
                  fontSize: 15,
                  fontWeight: 500,
                  marginBottom: 12,
                  color: "var(--text-secondary)"
                }}>
                  By Category
                </h4>
                {categoryData.length > 0 ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {categoryData.map(item => {
                      const maxAmount = Math.max(...categoryData.map(d => d.amount));
                      return (
                        <div key={item.category}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                            <span>{item.category}</span>
                            <span>${(item.amount / 100).toFixed(2)}</span>
                          </div>
                          <div style={{
                            width: '100%',
                            height: 24,
                            backgroundColor: 'var(--bg-secondary)',
                            borderRadius: 4,
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${(item.amount / maxAmount) * 100}%`,
                              height: '100%',
                              backgroundColor: item.color,
                              transition: 'width 0.3s ease'
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>No data available</p>
                )}
              </div>

              {/* Monthly Chart */}
              <div>
                <h4 style={{
                  fontSize: 15,
                  fontWeight: 500,
                  marginBottom: 12,
                  color: "var(--text-secondary)"
                }}>
                  Monthly Spending
                </h4>
                {monthlyData.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 200, overflowX: 'auto' }}>
                    {monthlyData.map(item => {
                      const maxAmount = Math.max(...monthlyData.map(d => d.amount));
                      return (
                        <div key={item.month} style={{ flex: '0 0 60px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{
                            width: '100%',
                            height: `${(item.amount / maxAmount) * 160}px`,
                            backgroundColor: 'var(--accent-orange)',
                            borderRadius: '4px 4px 0 0',
                            minHeight: 4
                          }} />
                          <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-secondary)' }}>
                            {item.month.substring(5)}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                            ${(item.amount / 100).toFixed(0)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>No data available</p>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {/* Batch Action Bar */}
      {selectedExpenseIds.size > 0 && (
        <div style={{
          marginBottom: 16,
          padding: 12,
          background: "var(--bg-secondary)",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap"
        }}>
          <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            {selectedExpenseIds.size} selected
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleBatchMarkPaid}
              className="cursor-pointer"
              style={{
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: "var(--accent-orange)",
                color: "white",
                border: "none",
                borderRadius: 6
              }}
            >
              Mark All as Paid
            </button>
            <button
              onClick={clearSelection}
              className="cursor-pointer"
              style={{
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                borderRadius: 6
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : (() => {
        // Filter expenses
        const filteredExpenses = expenses.filter((expense) => {
          const matchesSearch = searchQuery.trim() === "" ||
            expense.description.toLowerCase().includes(searchQuery.toLowerCase());
          const matchesCategory = filterCategory === "all" || expense.category === filterCategory;
          const matchesReimbursed =
            filterReimbursed === "all" ||
            (filterReimbursed === "paid" && expense.reimbursed) ||
            (filterReimbursed === "unpaid" && !expense.reimbursed);

          const dateRange = getDateRange();
          const matchesDateRange =
            !dateRange.start || !dateRange.end ||
            (expense.expense_date >= dateRange.start && expense.expense_date <= dateRange.end);

          return matchesSearch && matchesCategory && matchesReimbursed && matchesDateRange;
        });

        // Sort filtered expenses
        const sortedExpenses = sortExpenses(filteredExpenses);

        if (sortedExpenses.length === 0) {
          return <p>No expenses found.</p>;
        }

        return (
          <ul style={{ paddingLeft: 0, listStyle: "none" }}>
            {sortedExpenses.map((expense) => {
              // Get user info for display
              const paidByUser = users.find(u => u.id === expense.paid_by);
              const paidByEmail = getUserEmail(expense.paid_by);
              const paidByName = paidByUser?.displayName || paidByEmail;

              // Calculate who owes whom
              const paidBySteph = paidByName.toLowerCase().includes("steph");
              let debtDisplay = "";
              let debtAmount = 0;

              if (paidBySteph && expense.sam_owes_cents > 0) {
                debtDisplay = `Sam owes: $${(expense.sam_owes_cents / 100).toFixed(2)}`;
                debtAmount = expense.sam_owes_cents;
              } else if (!paidBySteph && expense.steph_owes_cents > 0) {
                debtDisplay = `Steph owes: $${(expense.steph_owes_cents / 100).toFixed(2)}`;
                debtAmount = expense.steph_owes_cents;
              }

              return (
                <li
                  key={expense.id}
                  style={{
                    marginBottom: 16,
                    paddingBottom: 16,
                    borderBottom: "1px solid var(--border)",
                    background: selectedExpenseIds.has(expense.id) ? "var(--bg-secondary)" : "transparent",
                    padding: selectedExpenseIds.has(expense.id) ? 12 : 0,
                    borderRadius: selectedExpenseIds.has(expense.id) ? 6 : 0
                  }}
                >
                  {/* Checkbox for unpaid expenses */}
                  {!expense.reimbursed && (
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={selectedExpenseIds.has(expense.id)}
                          onChange={() => toggleExpenseSelection(expense.id)}
                          style={{ cursor: "pointer" }}
                        />
                        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                          Select for batch payment
                        </span>
                      </label>
                    </div>
                  )}

                  {/* Header: Amount and Category */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong style={{
                      fontSize: 20,
                      fontWeight: 600,
                      color: "var(--text-primary)"
                    }}>
                      ${(expense.amount_cents / 100).toFixed(2)}
                    </strong>
                    <span
                      style={{
                        padding: "4px 10px",
                        backgroundColor: "var(--bg-secondary)",
                        color: "var(--text-secondary)",
                        borderRadius: 4,
                        fontSize: 13
                      }}
                    >
                      {expense.category}
                    </span>
                  </div>

                  {/* Description */}
                  <div style={{
                    marginBottom: 6,
                    fontSize: 15,
                    color: "var(--text-primary)"
                  }}>
                    {expense.description || "(no description)"}
                  </div>

                  {/* Date and Who Paid */}
                  <div style={{
                    color: "var(--text-secondary)",
                    fontSize: 13,
                    marginBottom: 8
                  }}>
                    {expense.expense_date} • Paid by {paidByName}
                  </div>

                  {/* Split Information */}
                  {debtDisplay && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 10,
                        backgroundColor: expense.reimbursed ? "#e8f5e9" : "#fff3e0",
                        borderRadius: 6,
                        fontSize: 14,
                        color: "var(--text-primary)"
                      }}
                    >
                      {debtDisplay}
                      {expense.reimbursed && (
                        <span style={{
                          marginLeft: 8,
                          color: "#388e3c"
                        }}>
                          ✓ Paid
                        </span>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {!expense.reimbursed && debtAmount > 0 && (
                      <button
                        onClick={() => handleMarkReimbursed(expense.id)}
                        style={{
                          padding: "10px 16px",
                          fontSize: 14,
                          fontWeight: 500,
                          backgroundColor: "var(--accent-orange)",
                          color: "white",
                          border: "none",
                          borderRadius: 6
                        }}
                        className="cursor-pointer"
                      >
                        Mark as Paid
                      </button>
                    )}
                    <button
                      onClick={() => handleEditExpense(expense)}
                      style={{
                        padding: "10px 16px",
                        fontSize: 14,
                        fontWeight: 500,
                        background: "transparent",
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border)",
                        borderRadius: 6
                      }}
                      className="cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteExpense(expense.id)}
                      style={{
                        padding: "10px 16px",
                        fontSize: 14,
                        fontWeight: 500,
                        background: "transparent",
                        color: "#d32f2f",
                        border: "1px solid var(--border)",
                        borderRadius: 6
                      }}
                      className="cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        );
      })()}
    </main>
  );
}