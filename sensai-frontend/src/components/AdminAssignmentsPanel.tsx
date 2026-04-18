"use client";

import { useState, useEffect, useCallback } from "react";
import {
    ClipboardList, Plus, X, Loader2, TriangleAlert,
    Link2, Copy, Check, Trash2, ChevronDown, ChevronUp, Users
} from "lucide-react";

interface PracticeAssignment {
    id: number;
    course_id: number;
    title: string;
    description: string;
    input_format: string;
    expected_output: string;
    invite_token?: string;
    created_at?: string;
}

interface AdminAssignmentsPanelProps {
    orgId: number | string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer
                       border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
            title="Copy invite link"
        >
            {copied ? <><Check className="w-3.5 h-3.5 text-green-400" /><span className="text-green-400">Copied!</span></> : <><Copy className="w-3.5 h-3.5" />Copy Link</>}
        </button>
    );
}

function AssignmentRow({ assignment, onDeleted }: { assignment: PracticeAssignment; onDeleted: () => void }) {
    const [expanded, setExpanded] = useState(false);
    const [subCount, setSubCount] = useState<number | null>(null);
    const inviteUrl = assignment.invite_token
        ? `${APP_URL}/assignment/${assignment.invite_token}`
        : null;

    useEffect(() => {
        if (expanded) {
            fetch(`${BACKEND_URL}/assignments/${assignment.id}/submissions`)
                .then(r => r.json())
                .then(data => setSubCount(Array.isArray(data) ? data.length : 0))
                .catch(() => setSubCount(0));
        }
    }, [expanded, assignment.id]);

    return (
        <div className="rounded-xl border border-gray-800 bg-[#111] overflow-hidden">
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center justify-between p-4 text-left cursor-pointer group"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <ClipboardList className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    <span className="font-medium text-sm text-white truncate">{assignment.title}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="hidden sm:block text-xs text-gray-500">
                        {new Date(assignment.created_at || "").toLocaleDateString()}
                    </span>
                    {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
                </div>
            </button>

            {expanded && (
                <div className="px-4 pb-5 border-t border-gray-800 pt-4 space-y-4">
                    <p className="text-sm text-gray-300 leading-relaxed">{assignment.description}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Input Format</p>
                            <pre className="text-xs p-3 rounded-lg font-mono bg-[#0a0a0a] text-gray-400 border border-gray-800 whitespace-pre-wrap">{assignment.input_format}</pre>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Expected Output</p>
                            <pre className="text-xs p-3 rounded-lg font-mono bg-[#0a0a0a] text-gray-400 border border-gray-800 whitespace-pre-wrap">{assignment.expected_output}</pre>
                        </div>
                    </div>

                    {/* Invite link */}
                    {inviteUrl && (
                        <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/20">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2 flex items-center gap-1.5">
                                <Link2 className="w-3 h-3" /> Learner Invite Link
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                                <code className="text-xs text-indigo-300 bg-[#0d0d0d] border border-gray-800 px-3 py-1.5 rounded-lg flex-1 truncate min-w-0">
                                    {inviteUrl}
                                </code>
                                <CopyButton text={inviteUrl} />
                            </div>
                            <p className="mt-2 text-xs text-gray-500">
                                Share this link with learners. Anyone with this link can access and submit this assignment.
                            </p>
                        </div>
                    )}

                    {/* Submission count */}
                    {subCount !== null && (
                        <p className="text-xs text-gray-500 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" />
                            {subCount === 0 ? "No submissions yet" : `${subCount} submission${subCount !== 1 ? "s" : ""} received`}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

export default function AdminAssignmentsPanel({ orgId }: AdminAssignmentsPanelProps) {
    const [courses, setCourses] = useState<{ id: number; name: string }[]>([]);
    const [assignments, setAssignments] = useState<PracticeAssignment[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [form, setForm] = useState({ title: "", description: "", input_format: "", expected_output: "", language: "python", input_type: "code" });

    // Fetch courses for this org
    useEffect(() => {
        fetch(`${BACKEND_URL}/courses/?org_id=${orgId}`)
            .then(r => r.json())
            .then(data => {
                setCourses(data);
                if (data.length > 0) setSelectedCourseId(data[0].id);
            })
            .catch(() => { });
    }, [orgId]);

    const fetchAssignments = useCallback(async () => {
        if (!selectedCourseId) return;
        setLoading(true);
        try {
            const r = await fetch(`${BACKEND_URL}/assignments?course_id=${selectedCourseId}`);
            setAssignments(await r.json());
        } catch { }
        finally { setLoading(false); }
    }, [selectedCourseId]);

    useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

    const resetForm = () => { setForm({ title: "", description: "", input_format: "", expected_output: "", language: "python", input_type: "code" }); setFormError(null); };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title.trim() || !form.description.trim() || !form.input_format.trim() || !form.expected_output.trim()) {
            setFormError("All fields are required.");
            return;
        }
        if (!selectedCourseId) { setFormError("Select a course first."); return; }
        setSubmitting(true); setFormError(null);
        try {
            const res = await fetch(`${BACKEND_URL}/assignments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, course_id: selectedCourseId }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Error ${res.status}`);
            const created = await res.json();
            setAssignments(prev => [...prev, created]);
            resetForm(); setShowForm(false);
        } catch (e: any) {
            setFormError(e.message || "Failed to create.");
        } finally { setSubmitting(false); }
    };

    return (
        <div className="w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600/20 ring-1 ring-indigo-500/30 flex items-center justify-center">
                        <ClipboardList className="w-5 h-5 text-indigo-400" />
                    </div>
                    <h2 className="text-base font-bold text-white">Assignments</h2>
                </div>
                <button
                    id="admin-create-assignment-btn"
                    onClick={() => { setShowForm(true); setFormError(null); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold
                               bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/40
                               transition-all cursor-pointer active:scale-95"
                >
                    <Plus className="w-4 h-4" /> Create Assignment
                </button>
            </div>

            {/* Course filter */}
            {courses.length > 1 && (
                <div className="mb-5 flex gap-2 flex-wrap">
                    {courses.map(c => (
                        <button
                            key={c.id}
                            onClick={() => setSelectedCourseId(c.id)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer border
                                ${selectedCourseId === c.id
                                    ? "bg-indigo-600 text-white border-indigo-600"
                                    : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"}`}
                        >
                            {c.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Create Form Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                    onClick={e => { if (e.target === e.currentTarget) { setShowForm(false); resetForm(); } }}>
                    <div className="w-full max-w-lg rounded-2xl p-6 bg-[#111] border border-gray-800 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-base font-bold text-white">New Assignment</h3>
                            <button onClick={() => { setShowForm(false); resetForm(); }}
                                className="p-1.5 rounded-full hover:bg-gray-800 text-gray-500 cursor-pointer transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {formError && (
                            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg text-sm bg-red-900/20 text-red-400 border border-red-800">
                                <TriangleAlert className="w-4 h-4 mt-0.5 flex-shrink-0" /> {formError}
                            </div>
                        )}

                        <form onSubmit={handleCreate} className="space-y-4">
                            {courses.length > 0 && (
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5 text-gray-400">Course <span className="text-red-400">*</span></label>
                                    <select
                                        value={selectedCourseId ?? ""}
                                        onChange={e => setSelectedCourseId(Number(e.target.value))}
                                        className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none bg-[#0d0d0d] text-white border-gray-800 focus:border-indigo-500 cursor-pointer"
                                    >
                                        {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5 text-gray-400">Programming Language</label>
                                    <select
                                        value={form.language}
                                        onChange={e => setForm({ ...form, language: e.target.value })}
                                        className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none bg-[#0d0d0d] text-white border-gray-800 focus:border-indigo-500 cursor-pointer"
                                    >
                                        <option value="python">Python</option>
                                        <option value="cpp">C++</option>
                                        <option value="java">Java</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5 text-gray-400">Input Type</label>
                                    <select
                                        value={form.input_type}
                                        onChange={e => setForm({ ...form, input_type: e.target.value })}
                                        className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none bg-[#0d0d0d] text-white border-gray-800 focus:border-indigo-500 cursor-pointer"
                                    >
                                        <option value="code">Code Input</option>
                                        <option value="text">Text Input</option>
                                        <option value="math">Math Input</option>
                                    </select>
                                </div>
                            </div>

                            {[
                                { id: "title", label: "Title", placeholder: "e.g. Find Two Sum", type: "input", key: "title" },
                                { id: "description", label: "Description", placeholder: "Describe the problem learners need to solve…", type: "textarea", rows: 3, key: "description" },
                                { id: "input-format", label: "Input Format", placeholder: "e.g. First line: integer N, Second line: N numbers", type: "textarea", rows: 2, key: "input_format", mono: true },
                                { id: "expected-output", label: "Expected Output", placeholder: "e.g. Print the sum of the two numbers", type: "textarea", rows: 2, key: "expected_output", mono: true },
                            ].map(f => (
                                <div key={f.id}>
                                    <label className="block text-xs font-semibold mb-1.5 text-gray-400">{f.label} <span className="text-red-400">*</span></label>
                                    {f.type === "input" ? (
                                        <input id={`admin-assignment-${f.id}`} type="text" placeholder={f.placeholder}
                                            value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                                            className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none bg-[#0d0d0d] text-white border-gray-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 placeholder:text-gray-600" />
                                    ) : (
                                        <textarea id={`admin-assignment-${f.id}`} rows={(f as any).rows} placeholder={f.placeholder}
                                            value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                                            className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none resize-none bg-[#0d0d0d] text-white border-gray-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 placeholder:text-gray-600 ${(f as any).mono ? "font-mono" : ""}`} />
                                    )}
                                </div>
                            ))}
                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-700 text-gray-400 hover:bg-gray-800 transition-all cursor-pointer">Cancel</button>
                                <button type="submit" disabled={submitting} id="admin-submit-assignment-btn"
                                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60 flex items-center justify-center gap-2 transition-all cursor-pointer">
                                    {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Creating…</> : "Create & Get Link"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* List */}
            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-indigo-500" /></div>
            ) : assignments.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gray-900 ring-1 ring-gray-800 flex items-center justify-center">
                        <ClipboardList className="w-7 h-7 text-gray-600" />
                    </div>
                    <div>
                        <p className="font-semibold text-white">No assignments yet</p>
                        <p className="mt-1 text-sm text-gray-500">Create an assignment and share the invite link with your learners.</p>
                    </div>
                    <button onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer">
                        <Plus className="w-4 h-4" /> Create Assignment
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {assignments.map(a => (
                        <AssignmentRow key={a.id} assignment={a} onDeleted={fetchAssignments} />
                    ))}
                </div>
            )}
        </div>
    );
}
