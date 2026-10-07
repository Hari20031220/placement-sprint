"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

type Detail = {
  question_number: number;
  section: "aptitude" | "sql";
  question_text: string;
  options: string[] | null;
  correct_option: number | null;
  sql_expected_result: any;
  selected_option: number | null;
  sql_answer: string | null;
  is_correct: boolean;
};

export default function Dashboard() {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState("Candidate");
  const [details, setDetails] = useState<Record<number, Detail[]>>({});
  const [open, setOpen] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const s = supabase();
      const { data: { user } } = await s.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: p } = await s.from("profiles").select("full_name").eq("id", user.id).single();
      setName(p?.full_name || "Candidate");

      const { data } = await s.from("submissions").select("*,tests(day_number,title)")
        .eq("user_id", user.id).not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false });
      setRows(data || []);
    })();
  }, [router]);

  async function loadDetails(submissionId: number) {
    if (details[submissionId]) {
      setOpen(open === submissionId ? null : submissionId);
      return;
    }

    const s = supabase();
    const { data } = await s.from("answers").select(
      "question_id,selected_option,sql_answer,is_correct,questions(question_number,section,question_text,options,correct_option,sql_expected_result)"
    ).eq("submission_id", submissionId).order("question_id");

    const mapped: Detail[] = (data || []).map((a: any) => ({
      question_number: a.questions?.question_number,
      section: a.questions?.section,
      question_text: a.questions?.question_text,
      options: a.questions?.options,
      correct_option: a.questions?.correct_option,
      sql_expected_result: a.questions?.sql_expected_result,
      selected_option: a.selected_option,
      sql_answer: a.sql_answer,
      is_correct: a.is_correct === true,
    }));

    setDetails((current) => ({ ...current, [submissionId]: mapped }));
    setOpen(submissionId);
  }

  async function logout() {
    await supabase().auth.signOut();
    router.push("/login");
  }

  const completedRows = rows.filter((r) => r.submitted_at);

  return (
    <main className="shell">
      <div className="hero">
        <div>
          <small>CANDIDATE DASHBOARD</small>
          <h1>Hi, {name}</h1>
          <p className="muted">Your placement-test history.</p>
        </div>
        <div>
          <a className="button" href="/test">Today's test</a>{" "}
          <button className="secondary inline" onClick={logout}>Sign out</button>
        </div>
      </div>

      <div className="stats">
        <div><b>{completedRows.length}</b><span>Tests completed</span></div>
        <div><b>{completedRows.length ? Math.round(completedRows.reduce((a,r)=>a+r.aptitude_score,0)/completedRows.length*10)/10 : 0}/20</b><span>Average aptitude</span></div>
        <div><b>{completedRows.length ? Math.max(...completedRows.map(r=>r.aptitude_score)) : 0}/20</b><span>Best aptitude</span></div>
      </div>

      <h2>History</h2>
      <table>
        <thead><tr><th>Day</th><th>Aptitude</th><th>SQL</th><th>Submitted</th><th>Review</th></tr></thead>
        <tbody>
          {completedRows.map(r => (
            <tr key={r.id}>
              <td>Day {r.tests?.day_number}</td>
              <td>{r.aptitude_score}/20</td>
              <td>{r.sql_reviewed ? String(r.sql_score)+"/2" : "Pending"}</td>
              <td>{new Date(r.submitted_at).toLocaleString()}</td>
              <td><button className="secondary inline" onClick={() => void loadDetails(r.id)}>{open === r.id ? "Hide" : "View"}</button></td>
            </tr>
          ))}
          {!completedRows.length && <tr><td colSpan={5}>No completed tests yet.</td></tr>}
        </tbody>
      </table>

      {open !== null && details[open] && (
        <section>
          <h2>Question-by-question review</h2>
          {details[open].map((d) => (
            <div className="card q" key={d.question_number}>
              <div><b>Q{d.question_number} · {d.section.toUpperCase()}</b>{" "}<strong>{d.is_correct ? "✅ Correct" : "❌ Wrong"}</strong></div>
              <p><b>{d.question_text}</b></p>
              {d.section === "aptitude" ? (
                <>
                  <p>Your answer: {d.selected_option === null ? "Not answered" : String.fromCharCode(65 + d.selected_option) + ". " + (d.options?.[d.selected_option] ?? "")}</p>
                  <p>Correct answer: {d.correct_option === null ? "—" : String.fromCharCode(65 + d.correct_option) + ". " + (d.options?.[d.correct_option] ?? "")}</p>
                </>
              ) : (
                <>
                  <p><b>Your SQL:</b></p>
                  <pre>{d.sql_answer || "Not answered"}</pre>
                  <p><b>Expected result:</b></p>
                  <pre>{JSON.stringify(d.sql_expected_result, null, 2)}</pre>
                </>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
