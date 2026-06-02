"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft, Bot, AlertCircle, CheckCircle2, 
  Sparkles, Save, RotateCcw, Download, 
  Eye, EyeOff, Edit3, Terminal, Play,
  ChevronDown, ChevronRight, GripVertical, X
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ServerPlan, LogEntry, ServerVersion, DiscordGuild } from "@/types";

const TEMPLATES = [
  { id: "gaming", label: "Gaming Server" },
  { id: "smp", label: "SMP Server" },
  { id: "community", label: "Community Hub" },
  { id: "coding", label: "Coding Server" },
  { id: "esports", label: "Esports Team" },
];

export default function GuildDashboard() {
  const params = useParams();
  const router = useRouter();
  const guildId = params.guildId as string;

  const [guild, setGuild] = useState<DiscordGuild | null>(null);
  const [versions, setVersions] = useState<ServerVersion[]>([]);
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<ServerPlan | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [botMissing, setBotMissing] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pollingStatus, setPollingStatus] = useState<"idle" | "polling" | "detected">("idle");

  const [chatHistory, setChatHistory] = useState<{ prompt: string; plan: ServerPlan; timestamp: number }[]>([]);
  const [conversation, setConversation] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [expandedChanges, setExpandedChanges] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"plan" | "build">("build");
  const [model, setModel] = useState("llama-70b");

  function timeAgo(ts: number) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  function toggleExpanded(id: string) {
    setExpandedChanges((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    const saved = localStorage.getItem(`chat_history_${guildId}`);
    if (saved) {
      try { setChatHistory(JSON.parse(saved)); } catch {}
    }
  }, [guildId]);

  useEffect(() => {
    if (chatHistory.length > 0) {
      localStorage.setItem(`chat_history_${guildId}`, JSON.stringify(chatHistory));
    }
  }, [chatHistory, guildId]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "44px";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 300)}px`;
    }
  }, [prompt]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    fetch(`/api/guilds/${guildId}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.guild) {
          setGuild(data.guild);
          if (!data.guild.bot_installed) {
            setBotMissing(true);
            setTimeout(() => setShowInviteDialog(true), 500);
          }
        }
        setVersions(data.versions || []);
        setPageLoading(false);
      })
      .catch(() => {
        toast.error("Failed to load guild data");
        setPageLoading(false);
      })
      .finally(() => clearTimeout(timeout));
  }, [guildId]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  function startPolling() {
    setPollingStatus("polling");
    setShowInviteDialog(true);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/bot/guild-check?guildId=${guildId}`);
        const data = await res.json();
        if (data.installed) {
          setPollingStatus("detected");
          if (pollRef.current) clearInterval(pollRef.current);
          setTimeout(() => {
            setShowInviteDialog(false);
            setBotMissing(false);
            setPageLoading(true);
            fetch(`/api/guilds/${guildId}`)
              .then((r) => r.json())
              .then((data) => {
                if (data.guild) setGuild(data.guild);
                setPageLoading(false);
              })
              .catch(() => setPageLoading(false));
          }, 1000);
        }
      } catch {}
    }, 5000);
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (type: LogEntry["type"], message: string) => {
    setLogs((prev) => [...prev, { type, message, timestamp: new Date().toISOString() }]);
  };

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error("Please describe your server");
      return;
    }

    const userMsg = prompt.trim();
    setPrompt("");
    const updatedConv: { role: "user" | "assistant"; content: string }[] = [...conversation, { role: "user", content: userMsg }];
    setConversation(updatedConv);
    setLoading(true);
    setLogs([]);
    setWarnings([]);
    setProgress(30);

    try {
      addLog("sync", "Sending to AI...");
      const messages = updatedConv.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, mode, model }),
      });

      setProgress(70);
      const data = await res.json();

      if (!res.ok) {
        addLog("error", data.error || "Generation failed");
        toast.error(data.error || "Failed to generate plan");
        setLoading(false);
        return;
      }

      if (mode === "plan") {
        setConversation((prev) => [...prev, { role: "assistant", content: data.content }]);
        addLog("ok", "AI responded");
        setProgress(100);
      } else if (data.type === "clarify") {
        const questions = data.questions as string[];
        const qText = questions.join("\n");
        setConversation((prev) => [...prev, { role: "assistant", content: qText }]);
        addLog("ok", `AI asked ${questions.length} question(s)`);
        toast.info("Answer the questions and send again");
        setProgress(100);
      } else if (data.type === "plan") {
        setPlan(data.plan);
        setConversation([]);
        setChatHistory((prev) => [{ prompt: userMsg, plan: data.plan, timestamp: Date.now() }, ...prev]);
        if (data.warnings?.length) {
          setWarnings(data.warnings);
          data.warnings.forEach((w: string) => addLog("error", `Warning: ${w}`));
        }
        addLog("ok", "Server plan generated successfully");
        toast.success("Server plan created!");
        setProgress(100);
      }
    } catch (err) {
      addLog("error", "Failed to generate plan");
      toast.error("Network error during generation");
    } finally {
      setLoading(false);
    }
  }, [prompt, conversation, mode, model]);

  const handleTemplate = (templateId: string) => {
    const templates: Record<string, string> = {
      gaming: "A competitive gaming community with ranks for different games, matchmaking, voice channels per game, and leaderboards.",
      smp: "A Minecraft Survival Multiplayer server with player ranks, building competitions, resource sharing, and events.",
      community: "A general community hub with introductions, interest categories, events, and support system.",
      coding: "A programming community with language channels, project showcase, code review, and collaboration spaces.",
      esports: "An esports team server with team roles, scrim scheduling, strategy discussion, and tournament org.",
    };
    setPrompt(templates[templateId] || "");
  };

  const handleSaveVersion = async () => {
    if (!plan) return;
    const res = await fetch("/api/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guild_id: guildId, plan_json: plan }),
    });
    if (res.ok) {
      const data = await res.json();
      setVersions((prev) => [data.version, ...prev]);
      toast.success("Version saved!");
    } else {
      toast.error("Failed to save version");
    }
  };

  const handleExecute = async () => {
    if (!plan) return;
    setShowConfirm(false);
    setExecuting(true);
    setLogs([]);
    setProgress(10);

    try {
      addLog("sync", "Starting execution...");
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guild_id: guildId, plan_json: plan }),
      });

      const data = await res.json();

      if (data.logs) {
        setLogs(data.logs);
      }

      if (data.success) {
        setProgress(100);
        addLog("done", "Server structure applied successfully!");
        toast.success("Server updated!");
        fetch(`/api/guilds/${guildId}`).then(r => r.json()).then(d => {
          if (d.versions) setVersions(d.versions);
        });
      } else {
        setProgress(0);
        addLog("error", data.error || "Execution failed");
        toast.error(data.error || "Failed to apply changes");
      }
    } catch (err) {
      addLog("error", "Execution failed");
      toast.error("Execution failed");
    } finally {
      setExecuting(false);
    }
  };

  const handleRestore = async (version: ServerVersion) => {
    setPlan(version.plan_json);
    setLogs([]);
    setWarnings([]);
    setExecuting(true);
    setProgress(10);

    try {
      addLog("sync", "Reverting to version...");
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guild_id: guildId, plan_json: version.plan_json }),
      });

      const data = await res.json();

      if (data.logs) setLogs(data.logs);

      if (data.success) {
        setProgress(100);
        addLog("done", "Reverted to version successfully!");
        toast.success("Reverted to version!");
        fetch(`/api/guilds/${guildId}`).then(r => r.json()).then(d => {
          if (d.versions) setVersions(d.versions);
        });
      } else {
        setProgress(0);
        addLog("error", data.error || "Revert failed");
        toast.error(data.error || "Failed to revert");
      }
    } catch (err) {
      addLog("error", "Revert failed");
      toast.error("Revert failed");
    } finally {
      setExecuting(false);
    }
  };

  const updateRole = (index: number, field: string, value: string | string[]) => {
    if (!plan) return;
    const newPlan = { ...plan };
    newPlan.roles = [...newPlan.roles];
    newPlan.roles[index] = { ...newPlan.roles[index], [field]: value };
    setPlan(newPlan);
  };

  const updateChannel = (type: "text" | "voice", index: number, value: string) => {
    if (!plan) return;
    const newPlan = { ...plan };
    newPlan.channels = { ...newPlan.channels };
    newPlan.channels[type] = [...newPlan.channels[type]];
    newPlan.channels[type][index] = value;
    setPlan(newPlan);
  };

  const inviteBotUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands&guild_id=${guildId}`;

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!guild) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-zinc-500">Could not load server data</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden relative">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-zinc-300">{guild.name}</span>
        </div>
        {botMissing && (
          <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-400 h-7 text-xs" onClick={startPolling}>
            <Bot className="w-3 h-3 mr-1" />
            Invite Bot
          </Button>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-950/40 shrink-0">
          <div className="p-3 border-b border-zinc-800 shrink-0">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Changes</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {plan && (
              <div className="bg-zinc-900/60 border border-blue-500/20 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleExpanded("pending")}
                  className="w-full flex items-center justify-between p-3 hover:bg-zinc-800/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {expandedChanges.has("pending") ? <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" /> : <ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-blue-300 truncate">Pending Plan</p>
                      <p className="text-[10px] text-zinc-500">just now</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-zinc-600 shrink-0 ml-2">{plan.roles.length} roles · {plan.channels.text.length + plan.channels.voice.length} ch</span>
                </button>
                {expandedChanges.has("pending") && (
                  <div className="px-3 pb-3 space-y-2">
                    <div className="border-t border-zinc-800 pt-2 space-y-1.5">
                      {plan.roles.map((r, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.color || "#5865F2" }} />
                          <span className="truncate">{r.name}</span>
                        </div>
                      ))}
                      {plan.channels.text.map((ch, i) => (
                        <div key={i} className="text-[11px] text-zinc-500 pl-3"># {ch}</div>
                      ))}
                      {plan.channels.voice.map((ch, i) => (
                        <div key={i} className="text-[11px] text-zinc-500 pl-3">🔊 {ch}</div>
                      ))}
                    </div>
                    <div className="flex gap-1.5 pt-1">
                      <Button variant="outline" size="sm" onClick={() => setEditing(!editing)} className="text-[10px] h-7 text-zinc-400 border-zinc-700 flex-1">
                        {editing ? <EyeOff className="w-3 h-3 mr-1" /> : <Edit3 className="w-3 h-3 mr-1" />}
                        {editing ? "View" : "Edit"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleSaveVersion} className="text-[10px] h-7 text-zinc-400 border-zinc-700 flex-1">
                        <Save className="w-3 h-3 mr-1" />Save
                      </Button>
                    </div>
                    <Button
                      onClick={() => setShowConfirm(true)}
                      disabled={executing || botMissing}
                      className="w-full bg-green-600 hover:bg-green-700 text-white h-8 text-xs"
                    >
                      <Play className="w-3 h-3 mr-1" />
                      {executing ? "Applying..." : "Apply to Server"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {versions.length > 0 && (
              <div className="space-y-2">
                {plan && <div className="border-t border-zinc-800 pt-1" />}
                {versions.map((v) => (
                  <div key={v.id} className="bg-zinc-900/30 border border-zinc-800 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleExpanded(v.id)}
                      className="w-full flex items-center justify-between p-3 hover:bg-zinc-800/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {expandedChanges.has(v.id) ? <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" /> : <ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-300 truncate">{v.version_name}</p>
                          <p className="text-[10px] text-zinc-600">{timeAgo(new Date(v.created_at).getTime())}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-[10px] text-zinc-600">{v.plan_json.roles.length} roles</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRestore(v); }}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-500 hover:text-blue-400 transition-colors"
                          title="Reroll"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      </div>
                    </button>
                    {expandedChanges.has(v.id) && (
                      <div className="px-3 pb-3 space-y-1.5 border-t border-zinc-800 pt-2">
                        {v.plan_json.roles.map((r, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.color || "#5865F2" }} />
                            <span className="truncate">{r.name}</span>
                          </div>
                        ))}
                        {v.plan_json.channels.text.map((ch, i) => (
                          <div key={i} className="text-[11px] text-zinc-500 pl-3"># {ch}</div>
                        ))}
                        {v.plan_json.channels.voice.map((ch, i) => (
                          <div key={i} className="text-[11px] text-zinc-500 pl-3">🔊 {ch}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!plan && versions.length === 0 && (
              <div className="flex items-center justify-center h-32">
                <p className="text-[11px] text-zinc-700 text-center">No changes yet<br />Generate a plan first</p>
              </div>
            )}
            {plan && botMissing && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
                <p className="text-[11px] text-amber-400 font-medium mb-1">Bot not invited</p>
                <p className="text-[10px] text-zinc-500 mb-2">Invite the bot to apply changes</p>
                <Button
                  size="sm"
                  onClick={() => setShowInviteDialog(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] h-7"
                >Invite Bot</Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {conversation.length === 0 && !plan && (
              <div className="text-center py-16">
                <p className="text-zinc-600 text-sm">Describe your server below</p>
                <p className="text-zinc-700 text-xs mt-1">The AI will ask questions if it needs more info</p>
              </div>
            )}
            {conversation.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`rounded-2xl px-4 py-2.5 text-sm max-w-[80%] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-200"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-2.5 bg-zinc-800">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-zinc-800/50 px-4 py-3 shrink-0">
            {chatHistory.length > 0 && conversation.length === 0 && !plan && (
              <div className="mb-2">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Recent</p>
                <div className="flex flex-wrap gap-1.5">
                  {chatHistory.slice(0, 5).map((item, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="cursor-pointer text-[10px] border-zinc-700 text-zinc-400 hover:border-zinc-500"
                      onClick={() => { setPlan(item.plan); setPrompt(item.prompt); toast.success("Restored from history"); }}
                    >
                      {item.prompt.slice(0, 30)}...
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <textarea
                  ref={inputRef}
                  placeholder={mode === "plan" ? "Ask about server ideas..." : "Describe your server..."}
                  value={prompt}
                  maxLength={8064}
                  onChange={(e) => {
                    if (e.target.value.length <= 8064) {
                      setPrompt(e.target.value);
                      e.currentTarget.style.height = "44px";
                      e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 300)}px`;
                    }
                  }}
                  className="bg-zinc-900 border border-zinc-700 text-white min-h-[44px] max-h-[300px] resize-none text-sm w-full rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500/50 placeholder-zinc-600 overflow-y-auto"
                  rows={1}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
                />
                <span className="absolute bottom-1.5 right-2 text-[10px] text-zinc-600">{prompt.length}/8064</span>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white h-[44px] px-5 shrink-0"
              >
                {loading ? "..." : "Commit"}
              </Button>
            </div>
            <div className="flex gap-2 mt-2">
              <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
                <button
                  onClick={() => setMode("plan")}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${mode === "plan" ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                >Plan</button>
                <button
                  onClick={() => setMode("build")}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${mode === "build" ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                >Build</button>
              </div>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500/50"
              >
                <option value="llama-70b">Llama 3.3 70B</option>
                <option value="llama-8b">Llama 3.1 8B</option>
                <option value="mixtral">Mixtral 8x7B</option>
              </select>
            </div>
            <p className="text-[10px] text-zinc-700 mt-1 text-center">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>

        <div className="w-72 border-l border-zinc-800 p-4 bg-zinc-950/40 flex flex-col shrink-0 overflow-hidden">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5 shrink-0">
            <Terminal className="w-3 h-3 text-cyan-400" />
            Logs
          </h3>
          {executing && (
            <Progress value={progress} className="mb-3 h-1 bg-zinc-800 shrink-0 [&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-purple-500" />
          )}
          <div className="flex-1 overflow-y-auto">
            <div className="font-mono text-[10px] space-y-1">
              {logs.length === 0 ? (
                <p className="text-zinc-700">No activity yet</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`flex items-start gap-1.5 ${
                    log.type === "error" ? "text-red-400" :
                    log.type === "ok" ? "text-green-400" :
                    log.type === "sync" ? "text-cyan-400" : "text-zinc-400"
                  }`}>
                    <span className="shrink-0 mt-0.5">
                      {log.type === "ok" && <CheckCircle2 className="w-2.5 h-2.5" />}
                      {log.type === "error" && <AlertCircle className="w-2.5 h-2.5" />}
                      {log.type === "sync" && <Bot className="w-2.5 h-2.5" />}
                      {log.type === "done" && <CheckCircle2 className="w-2.5 h-2.5" />}
                    </span>
                    <span>{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Apply Server Plan?</DialogTitle>
            <DialogDescription className="text-zinc-400">
              This will create/update roles, channels, and permissions in{" "}
              <strong className="text-white">{guild.name}</strong>.
              This action cannot be undone automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-zinc-900 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between text-zinc-400">
              <span>Roles to create</span>
              <span className="text-white font-bold">{plan?.roles.length || 0}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Text channels</span>
              <span className="text-white font-bold">{plan?.channels.text.length || 0}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Voice channels</span>
              <span className="text-white font-bold">{plan?.channels.voice.length || 0}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Categories</span>
              <span className="text-white font-bold">{plan?.category_structure.length || 0}</span>
            </div>
          </div>
          <DialogFooter>
            {botMissing && <p className="text-[11px] text-amber-400 text-center w-full">Bot needs to be invited first</p>}
            <Button variant="ghost" onClick={() => setShowConfirm(false)} className="text-zinc-400">
              Cancel
            </Button>
            <Button onClick={handleExecute} disabled={botMissing} className="bg-green-600 hover:bg-green-700 text-white">
              Yes, Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInviteDialog} onOpenChange={(open) => { if (!open && pollingStatus !== "polling") setShowInviteDialog(false); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Invite Bot to Server</DialogTitle>
            <DialogDescription className="text-zinc-400">
              The bot needs to be invited to <strong className="text-white">{guild?.name}</strong> before it can make changes.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-zinc-900 rounded-lg p-4 space-y-2 text-sm">
            <p className="text-zinc-300 text-sm mb-2">The bot requires these permissions:</p>
            <ul className="text-xs text-zinc-400 space-y-1 list-disc list-inside">
              <li>Administrator (recommended)</li>
              <li>Manage Roles</li>
              <li>Manage Channels</li>
              <li>Send Messages</li>
              <li>View Channels</li>
            </ul>
            {pollingStatus === "polling" && (
              <div className="flex items-center gap-2 mt-3 text-blue-400 text-xs">
                <div className="animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full" />
                Checking for bot...
              </div>
            )}
            {pollingStatus === "detected" && (
              <div className="flex items-center gap-2 mt-3 text-green-400 text-xs">
                <CheckCircle2 className="w-3 h-3" />
                Bot detected! Loading server...
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            {pollingStatus !== "polling" && (
              <Button variant="ghost" onClick={() => setShowInviteDialog(false)} className="text-zinc-400">
                Cancel
              </Button>
            )}
            <a href={inviteBotUrl} target="_blank" rel="noopener noreferrer" onClick={startPolling}>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                {pollingStatus === "polling" ? "Re-open Discord" : "Open Discord Invite"}
              </Button>
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {botMissing && (
        <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-8 max-w-md mx-4 text-center space-y-4">
            <Bot className="w-12 h-12 text-amber-400 mx-auto" />
            <h2 className="text-lg font-semibold text-white">Bot Not Installed</h2>
            <p className="text-sm text-zinc-400">
              The bot needs to be invited to <strong className="text-white">{guild?.name}</strong> before you can manage it.
            </p>
            {pollingStatus === "polling" && (
              <div className="flex items-center justify-center gap-2 text-blue-400 text-sm">
                <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                Waiting for bot invitation...
              </div>
            )}
            <Button onClick={startPolling} className="bg-amber-600 hover:bg-amber-700 text-white w-full">
              Invite Bot
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
