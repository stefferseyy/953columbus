// makes the page run in the browser, to read auth session
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter(); // what is this? 

  // asks supabase if has a logged in user - sends to login if no, expenses if yes
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser(); // getUser is the method to check logged in user
      if (data.user) {
        router.replace("/expenses");
      } else {
        router.replace("/login");
      }
    })();
  }, [router]);

  return (
    <main style={{ padding: 24 }}>
      <h1>953 Columbus</h1>
      <p>steph &amp; sam&apos;s shared expenses</p>
      <p style={{ opacity: 0.7 }}>Loading…</p>
    </main>
  );
}