"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Question = {
  id: number;
  question_number: number;
  section: "aptitude" | "sql";
  question_text: string;
  options: string[] | null;
};

export default function Test() {
  const router = useRouter();
  const [test, setTest] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [seconds, setSeconds] = useState(0);
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadTest() {
      const client = supabase();
      const { data: { user } } = await client.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: currentTest, error: testError } = await client
        .from("tests")
        .select("id,day_number,title,duration_minutes")
        .eq("status", "published")
        .order("day_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (testError || !currentTest) {
        setMessage("No published test yet.");
        return;
      }

      const { data: currentQuestions, error: questionError } = await client
        .from("questions")
        .select("id,test_id,question_number,section,question_text,options")
        .eq("test_id", currentTest.id)
        .order("question_number");

      if (questionError) {
        setMessage(questionError.message);
        return;
      }

      const { data: existing } = await client
        .from("submissions")
        .select("id,submitted_at,started_at")
        .eq("test_id", currentTest.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing?.submitted_at) {
        setMessage("You already completed today's test.");
        return;
      }

      setTest(currentTest);
      setQuestions(currentQuestions ?? []);

      if (existing) {
        const draftKey = `placement-sprint-draft-${currentTest.id}`;
        try {
          const saved = window.localStorage.getItem(draftKey);
          if (saved) setAnswers(JSON.parse(saved));
        } catch {
          // Ignore invalid local draft.
        }

        const remaining = Math.max(
          0,
          currentTest.duration_minutes * 60 -
            Math.floor((Date.now() - new Date(existing.started_at).getTime()) / 1000)
        );
        setSubmissionId(existing.id);
        setSeconds(remaining);
        // Do not resume automatically; wait for the candidate to press Resume Test.
      }
    }

    loadTest();
  }, [router]);

  useEffect(() => {
    if (!test || submissionId === null) return;

    try {
      window.localStorage.setItem(
        `placement-sprint-draft-${test.id}`,
        JSON.stringify(answers)
      );
    } catch {
      // Ignore storage errors.
    }
  }, [answers, test, submissionId]);

  useEffect(() => {
    if (!test || !started || done || submissionId === null) return;

    const timer = setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          clearInterval(timer);
          void submit(true);
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [test, started, done, submissionId]);

  async function startTest() {
    if (!test || starting || started) return;
    setMessage("");

    // Existing unfinished attempt: resume only after an explicit click.
    if (submissionId !== null) {
      setStarted(true);
      return;
    }

    setStarting(true);
    const { data: startedSubmission, error } = await supabase().rpc("start_test", {
      p_test_id: test.id,
    });
    setStarting(false);
    if (error || !startedSubmission) {
      setMessage(error?.message || "Could not start the test. Please try again.");
      return;
    }
    setSubmissionId(startedSubmission.id);
    setSeconds(test.duration_minutes * 60);
    setStarted(true);
  }

  async function submit(auto = false) {
    if (done || submissionId === null) return;

    const sqlQuestions = questions.filter((q) => q.section === "sql");
    const unansweredSql = sqlQuestions.filter(
      (q) => !String(answers[q.id] ?? "").trim()
    );

    if (!auto && unansweredSql.length > 0) {
      setMessage(
        `Please enter SQL for Q${unansweredSql.map((q) => q.question_number).join(" and Q")} before submitting.`
      );
      return;
    }

    if (!auto && !window.confirm("Submit the test now?")) return;

    setDone(true);

    const payload: Record<string, any> = {};

    questions.forEach((question) => {
      payload[question.id] =
        question.section === "aptitude"
          ? {
              selected_option:
                answers[question.id] === undefined
                  ? null
                  : Number(answers[question.id]),
            }
          : {
              sql_answer: String(answers[question.id] ?? "").trim(),
            };
    });

    const { error } = await supabase().rpc("submit_test", {
      p_submission_id: submissionId,
      p_answers: payload,
    });

    if (error) {
      setMessage(error.message);
      setDone(false);
      return;
    }

    try {
      window.localStorage.removeItem(`placement-sprint-draft-${test.id}`);
    } catch {
      // Ignore storage errors.
    }

    setMessage(
      auto
        ? "Time is up — your test was submitted."
        : "Test submitted successfully."
    );
  }

  if (!test) {
    return (
      <main className="center">
        <div className="card">
          <h1>{message || "Loading..."}</h1>
          <a className="button" href="/dashboard">Dashboard</a>
        </div>
      </main>
    );
  }

  if (!started && test) {
    return (
      <main className="center">
        <div className="card">
          <small>DAY {test.day_number}</small>
          <h1>{test.title}</h1>
          <p>Ready to begin?</p>
          <p className="muted">20 aptitude questions + 2 SQL questions · {test.duration_minutes} minutes.</p>
          <p className="muted">The timer starts only when you press the button below.</p>
          {message && <p className="notice">{message}</p>}
          <button className="button" disabled={starting} onClick={() => void startTest()}>
            {starting ? "Starting..." : submissionId !== null ? "Resume Test" : "Start Test"}
          </button>
          <p><a href="/dashboard">Back to dashboard</a></p>
        </div>
      </main>
    );
  }

  const answered = questions.filter(
    (q) => answers[q.id] !== undefined && String(answers[q.id]).trim() !== ""
  ).length;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return (
    <main className="shell">
      <div className="hero">
        <div>
          <small>DAY {test.day_number}</small>
          <h1>{test.title}</h1>
          <p className="muted">
            20 aptitude + 2 SQL · 40 minutes · {answered}/{questions.length} answered
          </p>
        </div>
        <div className="card">
          <b>
            {String(minutes).padStart(2, "0")}:
            {String(remainingSeconds).padStart(2, "0")}
          </b>
        </div>
      </div>

      {(["aptitude", "sql"] as const).map((section) => (
        <section key={section}>
          <h2>{section === "aptitude" ? "Aptitude" : "SQL"}</h2>

          {questions
            .filter((question) => question.section === section)
            .map((question) => (
              <div className="card q" key={question.id}>
                <b>{question.question_number}. {question.question_text}</b>

                {section === "aptitude" ? (
                  question.options?.map((option, index) => (
                    <label key={index} className="opt">
                      <input
                        type="radio"
                        checked={Number(answers[question.id]) === index}
                        onChange={() =>
                          setAnswers((current) => ({
                            ...current,
                            [question.id]: index,
                          }))
                        }
                      />
                      {String.fromCharCode(65 + index)}. {option}
                    </label>
                  ))
                ) : (
                  <textarea
                    value={answers[question.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: e.target.value,
                      }))
                    }
                    placeholder="Write SQL here..."
                  />
                )}
              </div>
            ))}
        </section>
      ))}

      {message && !done && <div className="card"><b>{message}</b></div>}

      <button
        className="button"
        disabled={done}
        onClick={() => void submit(false)}
      >
        Submit Test
      </button>

      {done && (
        <div className="card">
          <h2>{message}</h2>
          <a className="button" href="/dashboard">Go to dashboard</a>
        </div>
      )}
    </main>
  );
}
