"use client";

import { useState, useEffect, useCallback } from "react";
import {
    ClipboardList, Plus, X, ChevronDown, ChevronUp,
    Loader2, TriangleAlert, Send, CheckCircle2, XCircle,
    AlertCircle, Trophy, RotateCcw, Code2
} from "lucide-react";

// ─── Types ───────────────────────────────────

interface PracticeAssignment {
    id: number;
    course_id: number;
    title: string;
    description: string;
    input_format: string;
    expected_output: string;
    created_at?: string;
}

interface EvaluationResult {
    score: number;
    status: "pass" | "fail" | "invalid";
    feedback: string[];
}

interface SubmissionResponse {
    id: number;
    assignment_id: number;
    solution_code: string;
    user_identifier: string;
    evaluation: EvaluationResult;
    submitted_at?: string;
}

interface AssignmentsViewProps {
    courseId: number;
    courseName?: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";

// ─── Score ring ──────────────────────────────

function ScoreRing({ score, status }: { score: number; status: string }) {
    const radius = 36;
    const circ = 2 * Math.PI * radius;
    const offset = circ - (score / 100) * circ;
    const color = status === "pass" ? "#22c55e" : status === "invalid" ? "#f59e0b" : "#ef4444";

    return (
        <div className="relative inline-flex items-center justify-center w-24 h-24">
            <svg className="absolute inset-0 -rotate-90" width="96" height="96" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r={radius} fill="none" stroke="currentColor"
                    className="text-gray-200 dark:text-gray-800" strokeWidth="7" />
                <circle cx="48" cy="48" r={radius} fill="none" stroke={color}
                    strokeWidth="7" strokeLinecap="round"
                    strokeDasharray={circ} strokeDashoffset={offset}
                    style={{ transition: "stroke-dashoffset 0.8s ease" }} />
            </svg>
            <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        </div>
    );
}

// ─── Feedback Result Panel ───────────────────

function EvaluationPanel({ result, onRetry }: { result: SubmissionResponse; onRetry: () => void }) {
    const { evaluation } = result;
    const isPass = evaluation.status === "pass";
    const isInvalid = evaluation.status === "invalid";

    const statusConfig = isInvalid
        ? { label: "Invalid", icon: AlertCircle, bg: "bg-amber-500/10 dark:bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-500" }
        : isPass
            ? { label: "Passed", icon: CheckCircle2, bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-500" }
            : { label: "Failed", icon: XCircle, bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-500" };

    const StatusIcon = statusConfig.icon;

    return (
        <div className={`mt-5 rounded-xl border ${statusConfig.border} ${statusConfig.bg} overflow-hidden
                        animate-in slide-in-from-bottom-3 duration-300`}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <StatusIcon className={`w-5 h-5 ${statusConfig.text}`} />
                    <span className={`font-semibold text-sm ${statusConfig.text}`}>
                        Evaluation Result — {statusConfig.label}
                    </span>
                </div>
                <button
                    onClick={onRetry}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full
                               border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500
                               transition-all cursor-pointer"
                >
                    <RotateCcw className="w-3 h-3" /> Try Again
                </button>
            </div>

            {/* Score + Feedback body */}
            <div className="px-5 py-5 flex flex-col sm:flex-row gap-6">
                {/* Score ring */}
                <div className="flex flex-col items-center justify-center gap-1 min-w-[100px]">
                    <ScoreRing score={evaluation.score} status={evaluation.status} />
                    <span className="text-xs text-gray-400 font-medium">Score / 100</span>
                </div>

                {/* Feedback list */}
                <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                        Evaluation Feedback
                    </p>
                    <ul className="space-y-2">
                        {evaluation.feedback.map((line, i) => (
                            <li key={i} className="text-sm text-gray-300 flex items-start gap-2 leading-relaxed">
                                <span className="mt-0.5 flex-shrink-0">{line.startsWith("✅") ? "✅" : line.startsWith("❌") ? "❌" : line.startsWith("⚠️") ? "⚠️" : line.startsWith("🎉") ? "🎉" : line.startsWith("💡") ? "💡" : "•"}</span>
                                <span>{line.replace(/^[✅❌⚠️🎉💡•]\s*/, "")}</span>
                            </li>
                        ))}
                    </ul>

                    {isPass && (
                        <div className="mt-4 flex items-center gap-2 text-sm text-green-400 font-medium">
                            <Trophy className="w-4 h-4" />
                            Keep it up! Your solution passed the evaluation.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Solution Submission Editor ──────────────

function SolutionEditor({
    assignment,
    onSuccess,
}: {
    assignment: PracticeAssignment;
    onSuccess: (result: SubmissionResponse) => void;
}) {
    const [code, setCode] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<SubmissionResponse | null>(null);

    const handleSubmit = async () => {
        if (!code.trim()) {
            setError("Please write your solution before submitting.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`${BACKEND_URL}/assignments/${assignment.id}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    solution_code: code,
                    user_identifier: "learner",
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || `Error ${res.status}`);
            }
            const data: SubmissionResponse = await res.json();
            setResult(data);
            onSuccess(data);
        } catch (e: any) {
            setError(e.message || "Submission failed. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleRetry = () => {
        setResult(null);
        setError(null);
    };

    return (
        <div className="mt-5">
            <div className="flex items-center gap-2 mb-2">
                <Code2 className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Your Solution
                </span>
            </div>

            {/* Code textarea */}
            {!result && (
                <div className="relative">
                    <textarea
                        rows={8}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder={`# Write your solution here\n# Input: ${assignment.input_format}\n# Expected output: ${assignment.expected_output}`}
                        className="w-full px-4 py-3 rounded-xl text-sm font-mono leading-relaxed resize-y
                                   bg-[#0d0d0d] dark:bg-[#0d0d0d] text-gray-100
                                   border border-gray-800 outline-none
                                   focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20
                                   placeholder:text-gray-600 transition-all"
                    />
                    {error && (
                        <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
                            <TriangleAlert className="w-3.5 h-3.5" /> {error}
                        </p>
                    )}
                    <button
                        id={`submit-btn-${assignment.id}`}
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold
                                   bg-indigo-600 hover:bg-indigo-500 active:scale-[.98] text-white
                                   disabled:opacity-60 disabled:cursor-not-allowed
                                   transition-all cursor-pointer shadow-lg shadow-indigo-900/30"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Evaluating…
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4" />
                                Submit Solution
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* Result panel */}
            {result && <EvaluationPanel result={result} onRetry={handleRetry} />}
        </div>
    );
}

// ─── Assignment Card ─────────────────────────

function AssignmentCard({
    assignment,
    index,
    expanded,
    onToggle,
}: {
    assignment: PracticeAssignment;
    index: number;
    expanded: boolean;
    onToggle: () => void;
}) {
    const [latestResult, setLatestResult] = useState<SubmissionResponse | null>(null);

    return (
        <div
            className={`rounded-2xl border transition-all overflow-hidden
                       border-gray-800 bg-[#111]
                       ${expanded ? "ring-1 ring-indigo-500/30" : "hover:border-gray-700"}`}
        >
            {/* Header row */}
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between p-4 sm:p-5 text-left cursor-pointer group"
                id={`assignment-card-${assignment.id}`}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                                     bg-indigo-600/20 text-indigo-400 ring-1 ring-indigo-500/30">
                        {index + 1}
                    </span>
                    <div className="min-w-0">
                        <p className="font-semibold text-sm sm:text-base truncate text-white">{assignment.title}</p>
                        {latestResult && (
                            <span className={`text-xs font-medium ${latestResult.evaluation.status === "pass" ? "text-green-400" : "text-red-400"}`}>
                                Last attempt: {latestResult.evaluation.score}/100 · {latestResult.evaluation.status === "pass" ? "Passed" : "Failed"}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {latestResult && (
                        <span className={`hidden sm:inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium
                                         ${latestResult.evaluation.status === "pass"
                                ? "bg-green-500/15 text-green-400 ring-1 ring-green-500/30"
                                : "bg-red-500/15 text-red-400 ring-1 ring-red-500/30"}`}>
                            {latestResult.evaluation.status === "pass" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {latestResult.evaluation.status === "pass" ? "Passed" : "Failed"}
                        </span>
                    )}
                    {expanded
                        ? <ChevronUp className="w-4 h-4 text-gray-500" />
                        : <ChevronDown className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                    }
                </div>
            </button>

            {/* Expanded body */}
            {expanded && (
                <div className="px-5 pb-6 space-y-5 border-t border-gray-800 pt-5">
                    {/* Description */}
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Problem Statement</p>
                        <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{assignment.description}</p>
                    </div>

                    {/* Input / Output */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Input Format</p>
                            <pre className="text-xs p-3.5 rounded-xl font-mono leading-relaxed whitespace-pre-wrap
                                            bg-[#0a0a0a] text-gray-300 border border-gray-800">
                                {assignment.input_format}
                            </pre>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Expected Output</p>
                            <pre className="text-xs p-3.5 rounded-xl font-mono leading-relaxed whitespace-pre-wrap
                                            bg-[#0a0a0a] text-gray-300 border border-gray-800">
                                {assignment.expected_output}
                            </pre>
                        </div>
                    </div>

                    {/* Solution Editor */}
                    <SolutionEditor
                        assignment={assignment}
                        onSuccess={(r) => setLatestResult(r)}
                    />
                </div>
            )}
        </div>
    );
}

// ─── Main View ───────────────────────────────

export default function AssignmentsView({ courseId, courseName }: AssignmentsViewProps) {
    const [assignments, setAssignments] = useState<PracticeAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const [form, setForm] = useState({
        title: "",
        description: "",
        input_format: "",
        expected_output: "",
    });

    const fetchAssignments = useCallback(async () => {
        if (!courseId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${BACKEND_URL}/assignments?course_id=${courseId}`);
            if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
            setAssignments(await res.json());
        } catch (e: any) {
            setError(e.message || "Failed to load assignments.");
        } finally {
            setLoading(false);
        }
    }, [courseId]);

    useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

    const resetForm = () => {
        setForm({ title: "", description: "", input_format: "", expected_output: "" });
        setFormError(null);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title.trim() || !form.description.trim() || !form.input_format.trim() || !form.expected_output.trim()) {
            setFormError("All fields are required.");
            return;
        }
        setSubmitting(true);
        setFormError(null);
        try {
            const res = await fetch(`${BACKEND_URL}/assignments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, course_id: courseId }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || `Error ${res.status}`);
            }
            const created: PracticeAssignment = await res.json();
            setAssignments((prev) => [...prev, created]);
            resetForm();
            setShowForm(false);
            setExpandedId(created.id);
        } catch (e: any) {
            setFormError(e.message || "Failed to create assignment.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="w-full animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-7">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-600/20 ring-1 ring-indigo-500/30">
                        <ClipboardList className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-white leading-tight">Assignments</h2>
                        {courseName && <p className="text-xs text-gray-500">{courseName}</p>}
                    </div>
                </div>
                <button
                    id="create-assignment-btn"
                    onClick={() => { setShowForm(true); setFormError(null); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold
                               bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white
                               shadow-lg shadow-indigo-900/40 transition-all cursor-pointer"
                >
                    <Plus className="w-4 h-4" /> Create Assignment
                </button>
            </div>

            {/* Create Form Modal */}
            {showForm && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                    onClick={(e) => { if (e.target === e.currentTarget) { setShowForm(false); resetForm(); } }}
                >
                    <div className="w-full max-w-lg rounded-2xl shadow-2xl p-6
                                    bg-[#111] border border-gray-800
                                    animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-base font-bold text-white">New Assignment</h3>
                            <button onClick={() => { setShowForm(false); resetForm(); }}
                                className="p-1.5 rounded-full hover:bg-gray-800 text-gray-500 transition-colors cursor-pointer">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {formError && (
                            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg text-sm
                                            bg-red-900/20 text-red-400 border border-red-800">
                                <TriangleAlert className="w-4 h-4 mt-0.5 flex-shrink-0" /> {formError}
                            </div>
                        )}

                        <form onSubmit={handleCreate} className="space-y-4">
                            {[
                                { id: "title", label: "Title", placeholder: "e.g. Reverse a Linked List", type: "input", key: "title" },
                                { id: "description", label: "Description", placeholder: "Describe the problem…", type: "textarea", rows: 3, key: "description" },
                                { id: "input-format", label: "Input Format", placeholder: "e.g. First line: integer N", type: "textarea", rows: 2, key: "input_format", mono: true },
                                { id: "expected-output", label: "Expected Output", placeholder: "e.g. Print the result", type: "textarea", rows: 2, key: "expected_output", mono: true },
                            ].map((f) => (
                                <div key={f.id}>
                                    <label className="block text-xs font-semibold mb-1.5 text-gray-400">
                                        {f.label} <span className="text-red-400">*</span>
                                    </label>
                                    {f.type === "input" ? (
                                        <input
                                            id={`assignment-${f.id}`}
                                            type="text"
                                            placeholder={f.placeholder}
                                            value={(form as any)[f.key]}
                                            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                                            className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-all
                                                       bg-[#0d0d0d] text-white border-gray-800
                                                       focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20
                                                       placeholder:text-gray-600"
                                        />
                                    ) : (
                                        <textarea
                                            id={`assignment-${f.id}`}
                                            rows={(f as any).rows || 3}
                                            placeholder={f.placeholder}
                                            value={(form as any)[f.key]}
                                            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                                            className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-all resize-none
                                                        bg-[#0d0d0d] text-white border-gray-800
                                                        focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20
                                                        placeholder:text-gray-600
                                                        ${(f as any).mono ? "font-mono" : ""}`}
                                        />
                                    )}
                                </div>
                            ))}

                            <div className="flex gap-3 pt-1">
                                <button type="button"
                                    onClick={() => { setShowForm(false); resetForm(); }}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-700
                                               text-gray-400 hover:bg-gray-800 transition-all cursor-pointer">
                                    Cancel
                                </button>
                                <button type="submit" disabled={submitting} id="submit-assignment-btn"
                                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600
                                               hover:bg-indigo-500 text-white disabled:opacity-60 flex items-center
                                               justify-center gap-2 transition-all cursor-pointer">
                                    {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : "Create Assignment"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
            ) : error ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <TriangleAlert className="w-8 h-8 text-red-400" />
                    <p className="text-sm text-gray-500">{error}</p>
                    <button onClick={fetchAssignments} className="text-sm text-indigo-400 hover:underline cursor-pointer">Retry</button>
                </div>
            ) : assignments.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gray-900 ring-1 ring-gray-800">
                        <ClipboardList className="w-8 h-8 text-gray-600" />
                    </div>
                    <div>
                        <p className="font-semibold text-white">No assignments yet</p>
                        <p className="mt-1 text-sm text-gray-500">Create the first assignment for this course.</p>
                    </div>
                    <button onClick={() => setShowForm(true)}
                        className="mt-1 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold
                                   bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer">
                        <Plus className="w-4 h-4" /> Create Assignment
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {assignments.map((a, idx) => (
                        <AssignmentCard
                            key={a.id}
                            assignment={a}
                            index={idx}
                            expanded={expandedId === a.id}
                            onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
