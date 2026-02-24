"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when it detects a recovery token in the URL hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleReset() {
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setSubmitting(false);
    } else {
      router.replace("/expenses");
    }
  }

  return (
    <main style={{
      padding: 24,
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <img
            src="/pidou.png"
            alt="953 Columbus Logo"
            style={{ width: 80, height: 80, objectFit: "contain" }}
          />
        </div>
        <h1 style={{
          fontSize: 28,
          fontWeight: 600,
          color: "var(--text-primary)",
          marginBottom: 32,
          textAlign: "center"
        }}>
          Set new password
        </h1>

        {!ready ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>
            Verifying reset link…
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <input
              placeholder="New password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              placeholder="Confirm new password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={{
                padding: 12,
                fontSize: 16,
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "white",
                color: "var(--text-primary)"
              }}
            />
            <button
              onClick={handleReset}
              disabled={submitting}
              className="cursor-pointer"
              style={{
                padding: 14,
                fontSize: 16,
                fontWeight: 600,
                background: submitting ? "var(--text-secondary)" : "var(--accent-orange)",
                color: "white",
                border: "none",
                borderRadius: 6,
                marginTop: 8
              }}
            >
              {submitting ? "Updating…" : "Update password"}
            </button>
            {error && (
              <p style={{
                color: "#d32f2f",
                fontWeight: 600,
                textAlign: "center",
                padding: 12,
                background: "#ffebee",
                borderRadius: 8
              }}>
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
