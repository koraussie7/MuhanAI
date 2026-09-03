import { useState } from "react";
import type { FormEvent } from "react";

interface CastResponse { answer?: { answer: string; confidence: number }; results?: { agentId: string; answer: string }[]; }
export function AgentCast() {
  const [question, setQuestion] = useState(""); const [response, setResponse] = useState<CastResponse>(); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setLoading(true); try { const res = await fetch("/api/cast", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, agents: ["mock"] }) }); setResponse(await res.json()); } finally { setLoading(false); } }
  return <section className="panel"><form onSubmit={submit}><label htmlFor="question">Your question</label><textarea id="question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What should the mesh solve?" /><button type="submit" disabled={loading || !question.trim()}>{loading ? "Consulting…" : "Run Agent Cast"}</button></form>{response?.answer && <article><span className="eyebrow">CONSENSUS · {Math.round(response.answer.confidence * 100)}%</span><p>{response.answer["answer"]}</p></article>}</section>;
}
