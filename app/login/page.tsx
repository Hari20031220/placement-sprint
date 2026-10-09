"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function Login() {
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const { data: { user } } = await supabase().auth.getUser();
      if (!active) return;

      if (user) {
        router.replace("/dashboard");
      } else {
        setCheckingSession(false);
      }
    }

    void checkSession();
    return () => {
      active = false;
    };
  }, [router]);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const s = supabase();

    if (signup) {
      const { error } = await s.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      setMsg(error?.message || "Account created. Check email confirmation if enabled, then sign in.");
    } else {
      const { error } = await s.auth.signInWithPassword({ email, password });
      if (error) {
        setMsg(error.message);
      } else {
        // Supabase persists the session in this browser; go straight to the profile dashboard.
        router.replace("/dashboard");
      }
    }
  }

  if (checkingSession) {
    return (
      <main className="center">
        <div className="card login"><p>Checking your session...</p></div>
      </main>
    );
  }

  return (
    <main className="center">
      <div className="card login">
        <h1>{signup ? "Create account" : "Sign in"}</h1>
        <p className="muted">Daily 40-minute placement test.</p>
        <form onSubmit={go}>
          {signup && (
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" required />
          )}
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" minLength={6} required />
          <button>{signup ? "Create account" : "Sign in"}</button>
        </form>
        {msg && <p className="notice">{msg}</p>}
        <button className="secondary" onClick={() => setSignup(!signup)}>
          {signup ? "Already have an account?" : "New candidate? Create account"}
        </button>
      </div>
    </main>
  );
}
