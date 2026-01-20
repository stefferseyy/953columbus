// login page

"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  // function to sign in
  async function signIn() {
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });
    setSent(true);
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>953 Columbus</h1>

      {sent ? (
        <p>Check your email for the login link.</p>
      ) : (
        <>
          <input
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <button onClick={signIn}>Send magic link</button>
        </>
      )}
    </main>
  );
}