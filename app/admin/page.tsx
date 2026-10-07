"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Question = {
  section: "aptitude" | "sql";
  question_text: string;
  options: string[];
  correct_option: number;
  sql_expected_result?: string;
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
  const [bulkText, setBulkText] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function checkAdmin() {
      const client = supabase();
      const { data: { user } } = await client.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: adminCheck, error: adminError } = await client.rpc("is_admin");

      if (adminError || adminCheck !== true) {
        setMessage(adminError?.message || "Admin access required.");
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

  function importBulkQuestions() {
    const blocks = bulkText
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean);

    const imported: Question[] = [];

    for (const block of blocks) {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const get = (prefix: string) =>
        lines.find((line) => line.toUpperCase().startsWith(prefix))
          ?.slice(prefix.length)
          .trim() ?? "";

      const type = get("TYPE:").toLowerCase();
      const question_text = get("QUESTION:");
      const answer = get("ANSWER:").toUpperCase();

      if (!question_text) continue;

      if (type === "aptitude") {
        const options = ["A:", "B:", "C:", "D:"].map((prefix) => get(prefix));
        const correct_option = ["A", "B", "C", "D"].indexOf(answer);
        if (options.some((option) => !option) || correct_option < 0) {
          setMessage("Bulk import error: every aptitude question needs A, B, C, D and ANSWER.");
          return;
        }
        imported.push({
          section: "aptitude",
          question_text,
          options,
          correct_option,
          sql_expected_result: "",
        });
      } else if (type === "sql") {
        imported.push({
          section: "sql",
          question_text,
          options: ["", "", "", ""],
          correct_option: 0,
          sql_expected_result: get("EXPECTED:"),
        });
      } else {
        setMessage("Bulk import error: TYPE must be APTITUDE or SQL.");
        return;
      }
    }

    if (imported.length !== 22) {
      setMessage(`Bulk import found ${imported.length} questions. You need exactly 22: 20 aptitude + 2 SQL.`);
      return;
    }

    const aptitudeCount = imported.filter((q) => q.section === "aptitude").length;
    const sqlCount = imported.filter((q) => q.section === "sql").length;

    if (aptitudeCount !== 20 || sqlCount !== 2) {
      setMessage("Bulk import needs exactly 20 aptitude and 2 SQL questions.");
      return;
    }

    setQuestions(imported);
    setBulkText("");
    setMessage("22 questions imported successfully. Review them below, then publish.");
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
        options: q.options,
        correct_option: q.section === "aptitude" ? q.correct_option : null,
        sql_expected_result:
          q.section === "sql" && q.sql_expected_result
            ? JSON.parse(q.sql_expected_result)
            : null,
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

      <div className="card">
        <h2>⚡ Bulk import 22 questions</h2>
        <p className="muted">
          Paste 22 questions at once. Separate each question with a blank line.
          Use TYPE, QUESTION, A-D and ANSWER for aptitude; SQL only needs TYPE and QUESTION.
        </p>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          rows={14}
          placeholder={`TYPE: APTITUDE
QUESTION: If a train travels 120 km in 2 hours, what is its speed?
A: 40 km/h
B: 50 km/h
C: 60 km/h
D: 80 km/h
ANSWER: C

TYPE: SQL
QUESTION: Write a query to find the second highest salary from an Employee table.
EXPECTED: {"mode":"scalar","value":60000}

TYPE: APTITUDE
QUESTION: ...
A: ...
B: ...
C: ...
D: ...
ANSWER: A`}
        />
        <button className="secondary" onClick={importBulkQuestions} disabled={!bulkText.trim()}>
          Import 22 Questions
        </button>
      </div>

      <div className="row">
        <h2>Questions {questions.length}/22</h2>
        <button className="secondary" onClick={addQuestion}>
          + Add question manually
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
