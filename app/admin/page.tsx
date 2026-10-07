"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Question = {
  section: "aptitude" | "sql";
  question_text: string;
  options: string[];
  correct_option: number;
};

const newQuestion = (index: number): Question => ({
  section: index > 20 ? "sql" : "aptitude",
  question_text: "",
  options: ["", "", "", ""],
  correct_option: 0,
});

export default function Admin() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [day, setDay] = useState(1);
  const [title, setTitle] = useState("Daily Placement Test");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function checkAdmin() {
      const client = supabase();
      const { data: { user } } = await client.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await client
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "admin") {
        setMessage("Admin access required.");
        return;
      }

      setAllowed(true);

      const { data } = await client
        .from("tests")
        .select("day_number")
        .order("day_number", { ascending: false })
        .limit(1);

      if (data?.[0]) {
        setDay(data[0].day_number + 1);
      }
    }

    checkAdmin();
  }, [router]);

  function addQuestion() {
    setQuestions((current) => [...current, newQuestion(current.length + 1)]);
  }

  function updateQuestion(index: number, field: string, value: unknown) {
    setQuestions((current) =>
      current.map((question, i) =>
        i === index ? { ...question, [field]: value } : question
      )
    );
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    setQuestions((current) =>
      current.map((question, i) => {
        if (i !== questionIndex) return question;
        const options = [...question.options];
        options[optionIndex] = value;
        return { ...question, options };
      })
    );
  }

  async function publish() {
    const aptitudeCount = questions.filter((q) => q.section === "aptitude").length;
    const sqlCount = questions.filter((q) => q.section === "sql").length;

    if (questions.length !== 22 || aptitudeCount !== 20 || sqlCount !== 2) {
      setMessage("Add exactly 20 aptitude questions and 2 SQL questions.");
      return;
    }

    const client = supabase();

    const { data: test, error: testError } = await client
      .from("tests")
      .insert({
        day_number: day,
        title,
        duration_minutes: 40,
        status: "published",
        published_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (testError || !test) {
      setMessage(testError?.message ?? "Could not create test.");
      return;
    }

    const { error: questionError } = await client.from("questions").insert(
      questions.map((q, index) => ({
        test_id: test.id,
        question_number: index + 1,
        section: q.section,
        question_text: q.question_text,
        options: q.section === "aptitude" ? q.options : null,
        correct_option: q.section === "aptitude" ? q.correct_option : null,
      }))
    );

    if (questionError) {
      setMessage(questionError.message);
      return;
    }

    setMessage(`Day ${day} published successfully.`);
    setQuestions([]);
    setDay(day + 1);
  }

  if (!allowed) {
    return (
      <main className="center">
        <div className="card">
          <h1>Admin</h1>
          <p>{message || "Checking access..."}</p>
          {message && <a className="button" href="/login">Sign in</a>}
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <small>ADMIN</small>
      <h1>Create daily test</h1>

      <div className="grid2">
        <input
          type="number"
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          placeholder="Day"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Test title"
        />
      </div>

      <div className="row">
        <h2>Questions {questions.length}/22</h2>
        <button className="secondary" onClick={addQuestion}>
          + Add question
        </button>
      </div>

      {questions.map((question, index) => (
        <div className="card q" key={index}>
          <b>{index + 1}. {question.section.toUpperCase()}</b>

          <select
            value={question.section}
            onChange={(e) => updateQuestion(index, "section", e.target.value)}
          >
            <option value="aptitude">Aptitude</option>
            <option value="sql">SQL</option>
          </select>

          <textarea
            value={question.question_text}
            onChange={(e) => updateQuestion(index, "question_text", e.target.value)}
            placeholder="Question"
          />

          {question.section === "aptitude" && (
            <>
              <div className="grid2">
                {question.options.map((option, optionIndex) => (
                  <input
                    key={optionIndex}
                    value={option}
                    onChange={(e) =>
                      updateOption(index, optionIndex, e.target.value)
                    }
                    placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`}
                  />
                ))}
              </div>

              <select
                value={question.correct_option}
                onChange={(e) =>
                  updateQuestion(index, "correct_option", Number(e.target.value))
                }
              >
                <option value={0}>Correct A</option>
                <option value={1}>Correct B</option>
                <option value={2}>Correct C</option>
                <option value={3}>Correct D</option>
              </select>
            </>
          )}
        </div>
      ))}

      <button
        className="button"
        disabled={questions.length !== 22}
        onClick={publish}
      >
        Publish Day {day}
      </button>

      {message && <p className="notice">{message}</p>}
    </main>
  );
}
