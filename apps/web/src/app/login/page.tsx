"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const router = useRouter();

  async function signIn() {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setError(error.message);
    router.replace("/expenses");
  }

  async function signUp() {
    setError(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return setError(error.message);
    router.replace("/expenses");
  }

  async function sendReset() {
    setError(null);
    if (!email) return setError("Enter your email address first");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/auth/reset",
    });
    if (error) return setError(error.message);
    setResetSent(true);
  }

  return (
    <main style={{
      padding: 24,
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <div style={{
        width: "100%",
        maxWidth: 400
      }}>
        <div style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: 16
        }}>
          <img
            src="/pidou.png"
            alt="953 Columbus Logo"
            style={{
              width: 80,
              height: 80,
              objectFit: "contain"
            }}
          />
        </div>
        <h1 style={{
          fontSize: 28,
          fontWeight: 600,
          color: "var(--text-primary)",
          marginBottom: 32,
          textAlign: "center"
        }}>
          953 Columbus
        </h1>

        {forgotMode ? (
          <div style={{ display: "grid", gap: 12 }}>
            {resetSent ? (
              <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 15 }}>
                Check your email for a reset link.
              </p>
            ) : (
              <>
                <input
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoCapitalize="none"
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
                  onClick={sendReset}
                  className="cursor-pointer"
                  style={{
                    padding: 14,
                    fontSize: 16,
                    fontWeight: 600,
                    background: "var(--accent-orange)",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    marginTop: 8
                  }}
                >
                  Send reset link
                </button>
              </>
            )}
            <button
              onClick={() => { setForgotMode(false); setResetSent(false); setError(null); }}
              className="cursor-pointer"
              style={{
                padding: 14,
                fontSize: 16,
                fontWeight: 500,
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                borderRadius: 6
              }}
            >
              Back to sign in
            </button>
            {error && <p style={{
              color: "#d32f2f",
              fontWeight: 600,
              textAlign: "center",
              padding: 12,
              background: "#ffebee",
              borderRadius: 8
            }}>{error}</p>}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <input
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="none"
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
              placeholder="Password"
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

            <button
              onClick={signIn}
              className="cursor-pointer"
              style={{
                padding: 14,
                fontSize: 16,
                fontWeight: 600,
                background: "var(--accent-orange)",
                color: "white",
                border: "none",
                borderRadius: 6,
                marginTop: 8
              }}
            >
              Sign in
            </button>

            <button
              onClick={signUp}
              className="cursor-pointer"
              style={{
                padding: 14,
                fontSize: 16,
                fontWeight: 500,
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                borderRadius: 6
              }}
            >
              Sign up
            </button>

            <button
              onClick={() => { setForgotMode(true); setError(null); }}
              className="cursor-pointer"
              style={{
                padding: 8,
                fontSize: 14,
                background: "transparent",
                color: "var(--text-secondary)",
                border: "none",
                cursor: "pointer"
              }}
            >
              Forgot password?
            </button>

            {error && <p style={{
              color: "#d32f2f",
              fontWeight: 600,
              textAlign: "center",
              marginTop: 8,
              padding: 12,
              background: "#ffebee",
              borderRadius: 8
            }}>
              {error}
            </p>}
          </div>
        )}
      </div>
    </main>
  );
}