"use client";

import { useState, useEffect } from "react";
import {
    ClipboardList, Loader2, TriangleAlert, Send, CheckCircle2,
    XCircle, AlertCircle, Trophy, RotateCcw, Code2, BookOpen,
    Sparkles, Lightbulb, Clock3, ArrowRight,
    MessageSquareText
} from "lucide-react";
import MentorChat from "./MentorChat";

// Frontend types for AI Mentor Mode (matching backend models)
interface MentorChatMessage {
    role: "user" | "ai";
    content: string;
    timestamp: string; // Using string for simplicity, can be Date object
}

interface MentorChatRequest {
    assignment_id: number;
    user_id: string; // Changed from number to string
    solution_code: string;
    previous_feedback?: SmartFeedback | null;
    user_question: string;
    chat_history?: MentorChatMessage[];
}

interface MentorChatResponse {
    reply: string;
    chat_history: MentorChatMessage[];
}

interface PracticeAssignment {
    id: number;
    title: string;
    description: string;
    input_format: string;
    expected_output: string;
    invite_token?: string;
}

interface EvaluationResult {
    score: number;
    status: "pass" | "fail" | "invalid";
    feedback: string[];
}

interface SmartFeedback {
    detailedFeedback: string[];
    suggestions: string[];
}

interface SubmissionResponse {
    id: number;
    assignment_id: number;
    solution_code: string;
    user_identifier?: string;
    evaluation: EvaluationResult;
    smart_feedback?: SmartFeedback | null;
    submitted_at?: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";

function formatTimestamp(value?: string) {
    if (!value) return "Unknown";
    try {
        return new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(new Date(value));
    } catch {
        return value;
    }
}

function createLearnerId() {
    if (typeof window === "undefined") return "learner-anonymous";
    const stored = window.localStorage.getItem("sensai-learner-id");
    if (stored) return stored;
    const generated = `learner-${crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem("sensai-learner-id", generated);
    return generated;
}

// ─── Score Card ──────────────────────────────────────────

function ScoreCard({ score, status }: { score: number; status: string }) {
    const isPass = status === "pass";
    const bg = isPass ? "bg-green-500/10" : "bg-red-500/10";
    const color = isPass ? "text-green-400" : "text-red-400";
    return (
        <div className={`p-6 rounded-xl border border-white/5 flex flex-col items-center justify-center text-center w-full max-w-[200px] ${bg}`}>
            <span className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-1">Score Card</span>
            <div className={`text-4xl font-bold ${color}`}>
                Score: {score}/100
            </div>
            <div className={`mt-3 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${isPass ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                {isPass ? 'PASS' : 'FAIL'}
            </div>
        </div>
    );
}

// ─── Result Panel ─────────────────────────────────────────

function ResultPanel({ result, onRetry, onAskMentor }: { result: SubmissionResponse; onRetry: () => void; onAskMentor: () => void }) {
    const ev = result.evaluation;
    const smart = result.smart_feedback;
    const isPass = ev.status === "pass";
    const isInvalid = ev.status === "invalid";
    const cfg = isInvalid
        ? { label: "Invalid Submission", Icon: AlertCircle, border: "border-amber-500/30", bg: "bg-amber-500/8", color: "text-amber-400" }
        : isPass
            ? { label: "Evaluation Complete", Icon: CheckCircle2, border: "border-green-500/30", bg: "bg-green-500/8", color: "text-green-400" }
            : { label: "Evaluation Complete", Icon: XCircle, border: "border-red-500/30", bg: "bg-red-500/8", color: "text-red-400" };

    return (
        <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} overflow-hidden animate-in slide-in-from-right-4 duration-400`}>
            <div className={`flex items-center justify-between px-6 py-4 border-b border-white/5`}>
                <div className="flex items-center gap-2">
                    <cfg.Icon className={`w-5 h-5 ${cfg.color}`} />
                    <span className={`font-semibold ${cfg.color}`}>{cfg.label}</span>
                </div>
                <div className="flex items-center gap-2">
                    {smart && (
                        <button onClick={onAskMentor}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:text-white hover:bg-indigo-500 hover:border-indigo-500 text-xs font-medium transition-all cursor-pointer shadow-lg shadow-indigo-900/20">
                            <Sparkles className="w-3 h-3" /> Ask AI Mentor
                        </button>
                    )}
                    <button onClick={onRetry}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-xs font-medium transition-all cursor-pointer">
                        <RotateCcw className="w-3 h-3" /> Re-evaluate
                    </button>
                </div>
            </div>
            <div className="px-6 py-6 flex flex-col gap-8">
                <div className="flex flex-col items-center justify-center">
                    <ScoreCard score={ev.score} status={ev.status} />
                </div>
                <div className="flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">Evaluation Feedback</p>
                    <ul className="space-y-2.5">
                        {ev.feedback.map((line, i) => {
                            const clean = line.replace(/^[✅❌⚠️🎉💡•]\s*/, "");
                            const icon = line.startsWith("✅") ? "✅" : line.startsWith("❌") ? "❌" : line.startsWith("⚠️") ? "⚠️" : line.startsWith("🎉") ? "🎉" : "💡";
                            return (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-300 leading-relaxed">
                                    <span className="mt-0.5 flex-shrink-0">{icon}</span>
                                    <span>{clean}</span>
                                </li>
                            );
                        })}
                    </ul>
                    {smart && ( 
                        <div className="mt-6 p-5 rounded-2xl bg-[#111] border border-slate-800">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-sky-400" />
                                    <span className="text-xs uppercase tracking-widest font-semibold text-sky-300">AI Feedback</span>
                                </div>
                                <span className="text-[11px] text-gray-400">Mentor-style guidance</span>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-3">
                                    <div className="text-xs uppercase tracking-[0.24em] font-semibold text-gray-500">Detailed issues</div>
                                    <ul className="space-y-2 text-sm text-gray-300">
                                        {smart.detailedFeedback.map((item, index) => (
                                            <li key={index} className="rounded-xl border border-red-500/15 bg-red-500/5 px-4 py-3 flex gap-3 items-start">
                                                <span className="mt-0.5 text-red-400">●</span>
                                                <span>{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="space-y-3">
                                    <div className="text-xs uppercase tracking-[0.24em] font-semibold text-gray-500">Suggestions</div>
                                    <ul className="space-y-2 text-sm text-gray-300">
                                        {smart.suggestions.map((item, index) => (
                                            <li key={index} className="rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-4 py-3 flex gap-3 items-start">
                                                <span className="mt-0.5 text-cyan-300">➤</span>
                                                <span>{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                    {isPass && (
                        <div className="mt-5 flex items-center gap-2 text-sm text-green-400 font-medium bg-green-500/10 p-4 rounded-xl border border-green-500/20">
                            <Trophy className="w-5 h-5 flex-shrink-0" />
                            <span>Excellent work! Your solution passed all evaluation criteria successfully.</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function HistoryTimeline({ history, loading }: { history: SubmissionResponse[]; loading: boolean }) {
    if (loading) {
        return (
            <div className="rounded-2xl border border-gray-800 bg-[#111] p-6 animate-pulse">
                <div className="h-5 w-32 rounded-full bg-slate-700 mb-4"></div>
                <div className="space-y-3">
                    {[...Array(3)].map((_, idx) => (
                        <div key={idx} className="h-16 rounded-2xl bg-slate-900" />
                    ))}
                </div>
            </div>
        );
    }

    if (!history.length) {
        return (
            <div className="rounded-2xl border border-dashed border-gray-700 bg-[#111]/70 p-6 text-center">
                <div className="text-sm font-semibold text-gray-300">No submission history yet.</div>
                <p className="mt-2 text-xs text-gray-500">Submit your first attempt to start tracking progress.</p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-gray-800 bg-[#111] p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <div className="text-xs uppercase tracking-[0.24em] font-semibold text-gray-500">Submission History</div>
                    <p className="mt-1 text-sm text-gray-300">Monitor progress over time, from first attempt to current iteration.</p>
                </div>
                <div className="text-xs text-gray-500">{history.length} attempts</div>
            </div>
            <div className="relative pl-8">
                <div className="absolute left-4 top-5 bottom-0 w-px bg-white/10" />
                {history.map((item, index) => {
                    const isLatest = index === history.length - 1;
                    return (
                        <div key={item.id} className="relative mb-6 last:mb-0">
                            <span className={`absolute left-0 top-4 h-3.5 w-3.5 rounded-full ${isLatest ? 'bg-sky-400' : 'bg-gray-500'}`} />
                            <div className="border border-gray-800 rounded-3xl bg-[#0d0d0d] p-4 overflow-hidden shadow-sm shadow-slate-950/40">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div>
                                        <div className="text-sm font-semibold text-white">Attempt {index + 1}</div>
                                        <div className="text-xs text-gray-500">{formatTimestamp(item.submitted_at)}</div>
                                    </div>
                                    <div className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${item.evaluation.status === 'pass' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20' : item.evaluation.status === 'invalid' ? 'bg-amber-500/10 text-amber-200 border border-amber-500/20' : 'bg-red-500/10 text-red-200 border border-red-500/20'}`}>
                                        {item.evaluation.status.toUpperCase()}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 text-sm text-gray-300">
                                    <div className="text-sm text-white font-medium">Score: {item.evaluation.score}/100</div>
                                    <p className="text-xs text-gray-400">{item.evaluation.feedback[0] || 'No detailed evaluation provided.'}</p>
                                </div>
                                {item.smart_feedback?.suggestions?.length ? (
                                    <div className="mt-4 rounded-2xl bg-slate-950/80 border border-slate-800 p-3 text-sm text-cyan-200">
                                        <div className="font-semibold text-sky-300 mb-2">AI Tips</div>
                                        <ul className="space-y-2">
                                            {item.smart_feedback.suggestions.slice(0, 2).map((suggestion, idx) => (
                                                <li key={idx} className="flex gap-2 items-start">
                                                    <ArrowRight className="w-3 h-3 text-sky-400 mt-1" />
                                                    <span>{suggestion}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Main Learner Page ────────────────────────────────────

export default function LearnerAssignmentPage({ token }: { token: string }) {
    const [assignment, setAssignment] = useState<PracticeAssignment | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const [code, setCode] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [result, setResult] = useState<SubmissionResponse | null>(null);
    const [history, setHistory] = useState<SubmissionResponse[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [learnerId, setLearnerId] = useState<string>("");
    const [isMentorChatOpen, setIsMentorChatOpen] = useState(false);

    const fetchHistory = async (assignmentToken: string, userIdentifier: string) => {
        setHistoryLoading(true);
        try {
            const historyRes = await fetch(
                `${BACKEND_URL}/assignments/view/${assignmentToken}/submissions/${encodeURIComponent(userIdentifier)}`
            );
            if (!historyRes.ok) {
                throw new Error((await historyRes.json().catch(() => ({}))).detail || `History request failed: ${historyRes.status}`);
            }
            setHistory(await historyRes.json());
        } catch (e: any) {
            console.warn("Failed to load submission history:", e.message || e);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleEvaluation = async () => {
        if (!code.trim()) {
            setSubmitError("Write your solution before submitting.");
            return;
        }
        if (!assignment) {
            setSubmitError("Assignment data is not available.");
            return;
        }

        setSubmitting(true);
        setSubmitError(null);
        try {
            const res = await fetch(`${BACKEND_URL}/assignments/view/${token}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ solution_code: code, user_identifier: learnerId || "learner" }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Error ${res.status}`);
            const submission = await res.json();
            setResult(submission);
            await fetchHistory(token, learnerId || "learner");
        } catch (e: any) {
            setSubmitError(e.message || "Submission failed. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    useEffect(() => {
        if (!learnerId) {
            setLearnerId(createLearnerId());
        }
    }, [learnerId]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setFetchError(null);
            try {
                const res = await fetch(`${BACKEND_URL}/assignments/view/${token}`);
                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Assignment not found.");
                setAssignment(await res.json());
            } catch (e: any) {
                setFetchError(e.message || "Failed to load the assignment.");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [token]);

    useEffect(() => {
        if (assignment?.id && learnerId) {
            fetchHistory(token, learnerId);
        }
    }, [assignment?.id, learnerId, token]);

    const handleSubmit = handleEvaluation;

    // ── Loading state ──
    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            </div>
        );
    }

    // ── Error state ──
    if (fetchError || !assignment) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
                <div className="max-w-sm w-full text-center">
                    <div className="w-16 h-16 rounded-2xl bg-red-900/20 ring-1 ring-red-500/30 flex items-center justify-center mx-auto mb-4">
                        <TriangleAlert className="w-8 h-8 text-red-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-white mb-2">Assignment Not Found</h2>
                    <p className="text-sm text-gray-400">{fetchError || "This link may be invalid or expired."}</p>
                </div>
            </div>
        );
    }

    // ── Main assignment view ──
    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white">
            {/* Top bar */}
            <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 ring-1 ring-indigo-500/30 flex items-center justify-center">
                    <ClipboardList className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                    <p className="text-xs text-gray-500 font-medium">Practice Assignment</p>
                    <p className="text-sm font-semibold text-white leading-tight">{assignment.title}</p>
                </div>
            </header>

            <main className="max-w-[1800px] w-full mx-auto px-4 sm:px-6 py-6 flex flex-col h-auto min-h-[calc(100vh-80px)]">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 items-start">
                    
                    {/* Column 1: Problem Details */}
                    <section className="space-y-5 rounded-2xl border border-gray-800/50 p-6 bg-[#0d0d0d] h-full flex flex-col">
                        <h1 className="text-2xl font-bold text-white">{assignment.title}</h1>

                        <div className="p-5 rounded-2xl bg-[#111] border border-gray-800 flex-1">
                            <div className="flex items-center gap-2 mb-3">
                                <BookOpen className="w-4 h-4 text-indigo-400" />
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Problem Statement</span>
                            </div>
                            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{assignment.description}</p>
                        </div>

                        <div className="space-y-4">
                            <div className="p-4 rounded-2xl bg-[#111] border border-gray-800">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Input Format</p>
                                <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap leading-relaxed">{assignment.input_format}</pre>
                            </div>
                            <div className="p-4 rounded-2xl bg-[#111] border border-gray-800">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Expected Output</p>
                                <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap leading-relaxed">{assignment.expected_output}</pre>
                            </div>
                        </div>
                    </section>

                    {/* Column 2: Solution Editor */}
                    <section className="rounded-2xl border border-gray-800/50 p-6 bg-[#0d0d0d] h-full flex flex-col">
                        <div className="flex items-center gap-2 mb-4">
                            <Code2 className="w-4 h-4 text-gray-400" />
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Your Solution</span>
                        </div>
                        <div className="flex-1 flex flex-col">
                            <textarea
                                value={code}
                                onChange={e => setCode(e.target.value)}
                                placeholder={`# Write your code here\n# Input: ${assignment.input_format}\n# Expected: ${assignment.expected_output}`}
                                className="w-full flex-1 min-h-[300px] px-4 py-4 rounded-2xl text-sm font-mono leading-relaxed resize-y
                                           bg-[#111] text-gray-100 border border-gray-800 outline-none
                                           focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20
                                           placeholder:text-gray-600 transition-all"
                            />
                        </div>
                        {submitError && (
                            <p className="mt-3 text-xs text-red-400 flex items-center gap-1.5">
                                <TriangleAlert className="w-3.5 h-3.5" /> {submitError}
                            </p>
                        )}
                        <button
                            id="learner-submit-btn"
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="mt-4 w-full py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2
                                       bg-indigo-600 hover:bg-indigo-500 active:scale-[.98] text-white transition-all
                                       disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/30 cursor-pointer"
                        >
                            {submitting
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Evaluating your solution…</>
                                : <><Send className="w-4 h-4" /> Submit Solution</>
                            }
                        </button>
                    </section>

                    {/* Column 3: Evaluation Result */}
                    <section className="h-full flex flex-col">
                        {result ? (
                            <ResultPanel 
                                result={result} 
                                onRetry={() => { setResult(null); setSubmitError(null); setCode(""); }} 
                                onAskMentor={() => setIsMentorChatOpen(true)}
                            />
                        ) : (
                            <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-8 rounded-2xl border border-dashed border-gray-800 bg-[#111]/30">
                                <div className="w-16 h-16 rounded-full bg-gray-900/50 border border-gray-800 flex items-center justify-center mb-4">
                                    <ClipboardList className="w-6 h-6 text-gray-600" />
                                </div>
                                <h3 className="text-gray-400 font-medium mb-1">Awaiting Submission</h3>
                                <p className="text-sm text-gray-600 text-center max-w-[250px]">Submit your code on the left to see your evaluation results here.</p>
                            </div>
                        )}
                    </section>

                </div>

                <div className="pt-8 pb-2 mt-auto">
                    <p className="text-center text-xs text-gray-600">Powered by SensAI Assessment Platform</p>
                </div>
            </main>

            {/* AI Mentor Chat Panel */}
            {assignment && (
                <MentorChat 
                    isOpen={isMentorChatOpen}
                    onClose={() => setIsMentorChatOpen(false)}
                    assignmentId={assignment.id}
                    userIdentifier={learnerId || "learner"}
                    solutionCode={code}
                    previousFeedback={result?.smart_feedback || null}
                />
            )}
        </div>
    );
}
