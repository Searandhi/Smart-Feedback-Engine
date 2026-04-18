"use client";

import { useState, useEffect, useRef } from "react";
import { 
    X, Send, Sparkles, MessageSquareText, 
    Bot, User, Loader2, ChevronRight,
    HelpCircle, Lightbulb, Zap
} from "lucide-react";

interface MentorChatMessage {
    role: "user" | "ai";
    content: string;
    timestamp: string;
}

interface CriteriaEvidence {
    line_number: number | null;
    quoted_text: string;
    issue: string;
}

interface CriteriaFeedback {
    criterion: string;
    score: number;
    has_issue: boolean;
    socratic_question: string;
    evidence: CriteriaEvidence;
    explanation: string;
    suggestion: string;
    confidence: "high" | "medium" | "low";
}

interface SmartFeedback {
    overall_score: number;
    pass_status: boolean;
    overall_summary: string;
    criteria_feedback: CriteriaFeedback[];
    socratic_nudge: string;
    learning_gaps: string[];
    next_steps: string[];
    delta_from_previous?: Record<string, any> | null;
}

interface MentorChatProps {
    isOpen: boolean;
    onClose: () => void;
    assignmentId: number;
    userIdentifier: string;
    solutionCode: string;
    previousFeedback: SmartFeedback | null;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function MentorChat({ 
    isOpen, 
    onClose, 
    assignmentId, 
    userIdentifier, 
    solutionCode, 
    previousFeedback 
}: MentorChatProps) {
    const [messages, setMessages] = useState<MentorChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isThinking]);

    const handleSend = async (question?: string) => {
        const text = question || input;
        if (!text.trim() || isThinking) return;

        const userMsg: MentorChatMessage = {
            role: "user",
            content: text,
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsThinking(true);

        try {
            const res = await fetch(`${BACKEND_URL}/mentor/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    assignment_id: assignmentId,
                    user_id: userIdentifier,
                    solution_code: solutionCode,
                    previous_feedback: previousFeedback,
                    user_question: text,
                    chat_history: messages
                }),
            });

            if (!res.ok) throw new Error("Mentor is busy. Please try again.");
            
            const data = await res.json();
            setMessages(data.chat_history);
        } catch (e: any) {
            const errorMsg: MentorChatMessage = {
                role: "ai",
                content: e.message || "I'm sorry, I couldn't process that. Please try again.",
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsThinking(false);
        }
    };

    const quickActions = [
        { label: "Why is my code wrong?", icon: HelpCircle, text: "Can you explain why my current implementation is failing?" },
        { label: "Give me a hint", icon: Lightbulb, text: "I'm stuck. Can you give me a small hint on what to do next?" },
        { label: "How to optimize?", icon: Zap, text: "My code works, but how can I make it more efficient?" }
    ];

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-[#0d0d0d] border-l border-white/10 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center border border-indigo-500/30">
                        <Sparkles className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white tracking-tight">AI Programming Mentor</h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">SensAI Online</span>
                        </div>
                    </div>
                </div>
                <button 
                    onClick={onClose}
                    className="p-2 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Chat Area */}
            <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide"
            >
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-10">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                            <MessageSquareText className="w-8 h-8 text-gray-500" />
                        </div>
                        <div>
                            <h4 className="text-gray-300 font-semibold">Start a conversation</h4>
                            <p className="text-xs text-gray-500 max-w-[250px] mx-auto mt-1 leading-relaxed">
                                Ask about your mistakes, request a hint, or explore ways to optimize your solution.
                            </p>
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div 
                        key={i} 
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                    >
                        <div className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                            <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center border ${
                                msg.role === "user" ? "bg-indigo-600/20 border-indigo-500/30 text-indigo-400" : "bg-white/5 border-white/10 text-gray-400"
                            }`}>
                                {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                            </div>
                            <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                                msg.role === "user" 
                                    ? "bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-900/20" 
                                    : "bg-[#1a1a1a] text-gray-200 border border-white/5 rounded-tl-none"
                            }`}>
                                {msg.content}
                            </div>
                        </div>
                    </div>
                ))}

                {isThinking && (
                    <div className="flex justify-start animate-pulse">
                        <div className="flex gap-3 max-w-[85%]">
                            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400">
                                <Bot className="w-4 h-4" />
                            </div>
                            <div className="bg-[#1a1a1a] text-gray-400 border border-white/5 p-4 rounded-2xl rounded-tl-none flex items-center gap-2">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span className="text-xs font-medium uppercase tracking-widest">Mentor is thinking...</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            {messages.length < 5 && (
                <div className="px-6 py-2 flex flex-wrap gap-2 overflow-x-auto scrollbar-hide border-t border-white/5 bg-black/10">
                    {quickActions.map((action, i) => (
                        <button
                            key={i}
                            onClick={() => handleSend(action.text)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-gray-400 hover:text-white hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all cursor-pointer whitespace-nowrap"
                        >
                            <action.icon className="w-3 h-3" />
                            {action.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Input Area */}
            <div className="p-6 border-t border-white/5 bg-black/40">
                <form 
                    onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                    className="relative flex items-center"
                >
                    <input 
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about your mistake..."
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3.5 pr-12 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 transition-all shadow-inner"
                    />
                    <button 
                        type="submit"
                        disabled={!input.trim() || isThinking}
                        className="absolute right-2 p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all cursor-pointer"
                    >
                        {isThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                </form>
                <p className="mt-3 text-[10px] text-gray-600 text-center uppercase tracking-widest font-medium">
                    Mentoring by SensAI AI Engine
                </p>
            </div>
        </div>
    );
}
