"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  ArrowLeft, Bot, AlertCircle, CheckCircle2,
  Save, RotateCcw, Download,
  Terminal, Play, X, Trash2, Bookmark,
  Hash, Volume2, Users, Layers
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ServerPlan, LogEntry, ServerVersion, DiscordGuild } from "@/types";

const TEMPLATES = [
  { id: "gaming", label: "Gaming Server" },
  { id: "smp", label: "SMP Server" },
  { id: "community", label: "Community Hub" },
  { id: "coding", label: "Coding Server" },
  { id: "esports", label: "Esports Team" },
];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  plan?: ServerPlan;
}

export default function GuildDashboard() {
  const params = useParams();
  const router = useRouter();
  const guildId = params.guildId as string;

  const [guild, setGuild] = useState<DiscordGuild | null>(null);
  const [versions, setVersions] = useState<ServerVersion[]>([]);
  const [prompt, setPrompt] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [confirmPlan, setConfirmPlan] = useState<ServerPlan | null>(null);
  const [botMissing, setBotMissing] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pollingStatus, setPollingStatus] = useState<"idle" | "polling" | "detected">("idle");
  const [showSaved, setShowSaved] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [chatHistory, setChatHistory] = useState<{ prompt: string; plan: ServerPlan; timestamp: number }[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [model, setModel] = useState("llama-70b");
  const [notifBar, setNotifBar] = useState<string | null>(null);
  const notifTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function showNotif(msg: string) {
    setNotifBar(msg);
    if (notifTimer.current) clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(() => setNotifBar(null), 4000);
  }

  function timeAgo(ts: number) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  useEffect(() => {
    const saved = localStorage.getItem(`chat_history_${guildId}`);
    if (saved) { try { setChatHistory(JSON.parse(saved)); } catch {} }
  }, [guildId]);

  useEffect(() => {
    if (chatHistory.length > 0) {
      localStorage.setItem(`chat_history_${guildId}`, JSON.stringify(chatHistory));
    }
  }, [chatHistory, guildId]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "44px";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 160)}px`;
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
          if (!data.guild.bot_installed) setBotMissing(true);
        }
        setVersions(data.versions || []);
        setPageLoading(false);
      })
      .catch(() => { toast.error("Failed to load guild data"); setPageLoading(false); })
      .finally(() => clearTimeout(timeout));
  }, [guildId]);

  useEffect(() => {
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, []);

  function startPolling() {
    setPollingStatus("polling");
    if (pollRef.current) clearInterval(pollRef.current);
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/bot/guild-check?guildId=${guildId}`);
        const data = await res.json();
        if (data.installed && pollRef.current === id) {
          setPollingStatus("detected");
          clearInterval(id);
          pollRef.current = null;
          setTimeout(() => {
            setBotMissing(false);
            setPageLoading(true);
            fetch(`/api/guilds/${guildId}`)
              .then((r) => r.json())
              .then((data) => {
                if (data.guild) setGuild(data.guild);
                setPageLoading(false);
              }).catch(() => setPageLoading(false));
          }, 1000);
        }
      } catch {}
    }, 5000);
    pollRef.current = id;
  }

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const addLog = (type: LogEntry["type"], message: string) => {
    setLogs((prev) => [...prev, { type, message, timestamp: new Date().toISOString() }]);
    setShowLogs(true);
  };

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) { toast.error("Please describe your server"); return; }

    const userMsg = prompt.trim();
    setPrompt("");
    const newMessages: ChatMessage[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);
    setShowLogs(false);

    try {
      const apiMessages = newMessages.filter(m => !m.plan).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, mode: "build", model }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.error || "Generation failed" }]);
        toast.error(data.error || "Failed to generate plan");
        setLoading(false);
        return;
      }

      if (data.type === "clarify") {
        setMessages((prev) => [...prev, { role: "assistant", content: (data.questions as string[]).join("\n") }]);
        toast.info("Answer the questions and send again");
      } else if (data.type === "plan") {
        setMessages((prev) => [...prev, { role: "assistant", content: "Here's your server plan!", plan: data.plan as ServerPlan }]);
        setChatHistory((prev) => [{ prompt: userMsg, plan: data.plan, timestamp: Date.now() }, ...prev]);
        if (data.warnings?.length) data.warnings.forEach((w: string) => addLog("error", `Warning: ${w}`));
        showNotif("New plan generated");
        toast.success("Server plan created!");
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Network error during generation" }]);
      toast.error("Network error");
    } finally { setLoading(false); }
  }, [prompt, messages, model]);

  const handleTemplate = (templateId: string) => {
    const t: Record<string, string> = {
      gaming: "A competitive gaming community with ranks for different games, matchmaking, voice channels per game, and leaderboards.",
      smp: "A Minecraft Survival Multiplayer server with player ranks, building competitions, resource sharing, and events.",
      community: "A general community hub with introductions, interest categories, events, and support system.",
      coding: "A programming community with language channels, project showcase, code review, and collaboration spaces.",
      esports: "An esports team server with team roles, scrim scheduling, strategy discussion, and tournament org.",
    };
    setPrompt(t[templateId] || "");
    inputRef.current?.focus();
  };

  const handleSaveVersion = async (plan: ServerPlan) => {
    const res = await fetch("/api/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guild_id: guildId, plan_json: plan }),
    });
    if (res.ok) {
      const data = await res.json();
      setVersions((prev) => [data.version, ...prev]);
      showNotif("Version saved");
      toast.success("Version saved!");
    } else { toast.error("Failed to save version"); }
  };

  const handleExecute = async (plan: ServerPlan) => {
    setConfirmPlan(null);
    setExecuting(true);
    setLogs([]);
    setProgress(10);
    setShowLogs(true);

    try {
      await fetch("/api/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guild_id: guildId, plan_json: plan, version_name: `Before apply ${new Date().toLocaleString()}` }),
      }).then(r => r.ok && r.json()).then(d => { if (d?.version) setVersions(prev => [d.version, ...prev]); });

      addLog("sync", "Starting execution...");
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guild_id: guildId, plan_json: plan }),
      });
      const data = await res.json();
      if (data.logs) setLogs(data.logs);
      if (data.success) {
        setProgress(100);
        addLog("done", "Server structure applied successfully!");
        showNotif("Changes applied");
        toast.success("Server updated!");
        fetch(`/api/guilds/${guildId}`).then(r => r.json()).then(d => {
          if (d.versions) setVersions(d.versions);
        });
      } else {
        setProgress(0);
        addLog("error", data.error || "Execution failed");
        toast.error(data.error || "Failed to apply changes");
      }
    } catch {
      addLog("error", "Execution failed");
      toast.error("Execution failed");
    } finally { setExecuting(false); }
  };

  const handleRestore = (version: ServerVersion) => {
    setMessages([{ role: "assistant", content: "Loaded from saved version", plan: version.plan_json }]);
    setShowSaved(false);
    toast.success("Loaded version");
  };

  const handleDeleteVersion = async (versionId: string) => {
    const res = await fetch(`/api/versions/${versionId}`, { method: "DELETE" });
    if (res.ok) {
      setVersions((prev) => prev.filter((v) => v.id !== versionId));
      toast.success("Version deleted");
    } else { toast.error("Failed to delete version"); }
  };

  const handleDeleteChatHistory = (index: number) => {
    setChatHistory((prev) => {
      const next = prev.filter((_, i) => i !== index);
      localStorage.setItem(`chat_history_${guildId}`, JSON.stringify(next));
      return next;
    });
    toast.success("Request removed");
  };

  const handleClearPlan = (planToClear?: ServerPlan) => {
    setMessages((prev) => prev.filter(m => m.plan !== planToClear));
    if (!messages.find(m => m.plan && m.plan !== planToClear)) setShowLogs(false);
    toast.success("Plan discarded");
  };

  const handleExportJson = (plan: ServerPlan, name: string) => {
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_plan.json`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Exported JSON");
  };

  const inviteBotUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands&guild_id=${guildId}`;

  if (pageLoading) {
    return (
      <div className="h-dvh bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!guild) {
    return (
      <div className="h-dvh bg-black flex items-center justify-center">
        <p className="text-zinc-500">Could not load server data</p>
      </div>
    );
  }

  return (
    <div className="h-dvh bg-black flex flex-col overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="w-8 h-8 shrink-0" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-zinc-300 truncate max-w-[120px] sm:max-w-xs">{guild.name}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {botMissing && (
            <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-400 h-7 text-[10px] sm:text-xs px-2 sm:px-2.5" onClick={startPolling}>
              <Bot className="w-3 h-3 mr-1" />Bot
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-200 h-8 text-[10px] sm:text-xs gap-1 px-2 sm:px-2.5" onClick={() => setShowSaved(true)}>
            <Bookmark className="w-3.5 h-3.5 shrink-0" /><span className="hidden sm:inline">Saved</span> ({versions.length})
          </Button>
          <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-200 h-8 sm:hidden px-1.5" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <Layers className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Mobile quick menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 bg-zinc-900 border-b border-zinc-800 overflow-hidden"
          >
            <div className="px-3 py-2 flex gap-2 overflow-x-auto">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500/50 shrink-0"
              >
                <option value="llama-70b">Llama 3.3 70B</option>
                <option value="llama-8b">Llama 3.1 8B</option>
                <option value="mixtral">Mixtral 8x7B</option>
              </select>
              {versions.length > 0 && (
                <Button variant="outline" size="sm" className="text-[10px] h-7 text-blue-400 border-blue-700/50 shrink-0" onClick={() => { setShowSaved(true); setMobileMenuOpen(false); }}>
                  <RotateCcw className="w-3 h-3 mr-1" />Revert
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notifBar && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 bg-blue-600/20 border-b border-blue-500/20 px-4 py-1.5 text-xs text-blue-300 text-center"
          >
            {notifBar}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main chat area */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 sm:py-4">
        <div className="max-w-3xl mx-auto space-y-3 sm:space-y-4">
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="py-10 sm:py-16 text-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-blue-600/20 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <Bot className="w-7 h-7 sm:w-8 sm:h-8 text-blue-400" />
              </div>
              <h2 className="text-base sm:text-lg font-medium text-zinc-300 mb-1.5 sm:mb-2">Design Your Server</h2>
              <p className="text-xs sm:text-sm text-zinc-500 mb-4 sm:mb-6 max-w-md mx-auto px-4">
                Tell the AI what kind of server you want.
              </p>
              <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto px-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTemplate(t.id)}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs sm:text-sm text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {versions.length > 0 && (
                <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-zinc-800">
                  <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider mb-2 sm:mb-3">Saved Plans</p>
                  <div className="overflow-x-auto pb-1">
                    <div className="flex gap-2 justify-center min-w-max px-2">
                      {versions.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => handleRestore(v)}
                          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-400 hover:border-blue-500/50 hover:text-blue-300 transition-colors flex items-center gap-2 whitespace-nowrap"
                        >
                          <RotateCcw className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[80px] sm:max-w-[120px]">{v.version_name}</span>
                          <span className="text-[10px] text-zinc-600 shrink-0">{timeAgo(new Date(v.created_at).getTime())}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" ? (
                <div className="flex justify-end">
                  <div className="rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm max-w-[85%] sm:max-w-[75%] leading-relaxed bg-blue-600 text-white">
                    {msg.content}
                  </div>
                </div>
              ) : msg.plan ? (
                <PlanCard
                  plan={msg.plan}
                  onApply={() => setConfirmPlan(msg.plan!)}
                  onSave={() => handleSaveVersion(msg.plan!)}
                  onDiscard={() => handleClearPlan(msg.plan)}
                  onExport={() => handleExportJson(msg.plan!, `plan_${i}`)}
                  botMissing={botMissing}
                />
              ) : (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm max-w-[85%] sm:max-w-[75%] leading-relaxed bg-zinc-800 text-zinc-200 whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Loading dots */}
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
      </div>

      {/* Input area */}
      <div className="border-t border-zinc-800/50 px-3 sm:px-4 py-2.5 sm:py-3 shrink-0">
        <div className="max-w-3xl mx-auto">
          {/* Template chips when empty */}
          {messages.length === 0 && (
            <div className="mb-2 overflow-x-auto -mx-1 px-1">
              <div className="flex gap-1.5 min-w-max">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTemplate(t.id)}
                    className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-[10px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300 transition-colors whitespace-nowrap"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent history */}
          {chatHistory.length > 0 && messages.length === 0 && (
            <div className="mb-2 overflow-x-auto -mx-1 px-1">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Recent</p>
              <div className="flex gap-1.5 min-w-max pb-0.5">
                {chatHistory.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center bg-zinc-900 border border-zinc-700 rounded-full pr-0.5 hover:border-zinc-500 transition-colors group shrink-0">
                    <button
                      className="text-[10px] text-zinc-400 px-2.5 py-1 whitespace-nowrap"
                      onClick={() => { setMessages([{ role: "assistant", content: "Restored from history", plan: item.plan }]); setPrompt(item.prompt); toast.success("Restored from history"); }}
                    >
                      {item.prompt.slice(0, 20)}...
                    </button>
                    <button
                      onClick={() => handleDeleteChatHistory(i)}
                      className="w-5 h-5 flex items-center justify-center rounded-full text-zinc-600 hover:text-red-400 hover:bg-red-950/30 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
              <textarea
                ref={inputRef}
                placeholder="Describe your server..."
                value={prompt}
                maxLength={8064}
                onChange={(e) => {
                  if (e.target.value.length <= 8064) {
                    setPrompt(e.target.value);
                    e.currentTarget.style.height = "44px";
                    e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 160)}px`;
                  }
                }}
                className="bg-zinc-900 border border-zinc-700 text-white min-h-[44px] max-h-[160px] resize-none text-sm w-full rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500/50 placeholder-zinc-600 overflow-y-auto"
                rows={1}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
              />
              <span className="absolute bottom-1.5 right-2 text-[10px] text-zinc-600 hidden sm:block">{prompt.length}/8064</span>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white h-[44px] px-4 sm:px-5 shrink-0 text-sm"
            >
              {loading ? "..." : "Commit"}
            </Button>
          </div>
          <div className="flex items-center justify-between mt-1.5 sm:mt-2">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-zinc-500 text-[10px] sm:text-xs rounded-lg px-1.5 sm:px-2 py-1 focus:outline-none focus:border-blue-500/50 sm:block"
            >
              <option value="llama-70b">70B</option>
              <option value="llama-8b">8B</option>
              <option value="mixtral">Mixtral</option>
            </select>
            <p className="text-[10px] text-zinc-700 hidden sm:block">Enter to send · Shift+Enter for new line</p>
            <p className="text-[10px] text-zinc-700 sm:hidden">{prompt.length}/8064</p>
          </div>
        </div>
      </div>

      {/* Logs overlay during execution */}
      <AnimatePresence>
        {showLogs && executing && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 z-40 flex flex-col"
            style={{ maxHeight: "50vh" }}
          >
            <div className="flex items-center justify-between px-3 sm:px-4 pt-3 pb-2 shrink-0">
              <h3 className="text-[10px] sm:text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="w-3 h-3 text-cyan-400" />Logs
              </h3>
              <Button variant="ghost" size="sm" className="w-6 h-6 text-zinc-600" onClick={() => setShowLogs(false)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
            <Progress value={progress} className="mx-3 sm:mx-4 mb-3 h-1 bg-zinc-800 [&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-purple-500 shrink-0" />
            <div className="flex-1 overflow-y-auto px-3 sm:px-4 pb-3 font-mono text-[10px] space-y-1">
              {logs.length === 0 ? (
                <p className="text-zinc-700">Starting...</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`flex items-start gap-1.5 ${
                    log.type === "error" ? "text-red-400" :
                    log.type === "ok" ? "text-green-400" :
                    log.type === "sync" ? "text-cyan-400" : "text-zinc-400"
                  }`}>
                    <span className="shrink-0 mt-0.5">
                      {["ok", "done"].includes(log.type) && <CheckCircle2 className="w-2.5 h-2.5" />}
                      {log.type === "error" && <AlertCircle className="w-2.5 h-2.5" />}
                      {log.type === "sync" && <Bot className="w-2.5 h-2.5" />}
                    </span>
                    <span className="break-all">{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
            <div className="h-1 bg-zinc-900 shrink-0 rounded-full mx-3 sm:mx-4 mb-1 overflow-hidden">
              <div className="h-full bg-zinc-800 rounded-full" style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm dialog */}
      <Dialog open={!!confirmPlan} onOpenChange={(o) => { if (!o) setConfirmPlan(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-[92vw] sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-white text-sm sm:text-base">Apply Server Plan?</DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs sm:text-sm">
              This will create/update roles, channels, and permissions in{" "}
              <strong className="text-white">{guild.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-zinc-900 rounded-lg p-3 sm:p-4 space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between text-zinc-400">
              <span>Roles</span>
              <span className="text-white font-bold">{confirmPlan?.roles.length || 0}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Text channels</span>
              <span className="text-white font-bold">{confirmPlan?.channels.text.length || 0}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Voice channels</span>
              <span className="text-white font-bold">{confirmPlan?.channels.voice.length || 0}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Categories</span>
              <span className="text-white font-bold">{confirmPlan?.category_structure.length || 0}</span>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            {botMissing && <p className="text-[11px] text-amber-400 text-center w-full">Bot needs to be invited first</p>}
            <Button variant="ghost" onClick={() => setConfirmPlan(null)} className="text-zinc-400 text-xs sm:text-sm order-2 sm:order-1">Cancel</Button>
            <Button onClick={() => handleExecute(confirmPlan!)} disabled={botMissing || !confirmPlan} className="bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm order-1 sm:order-2 w-full sm:w-auto">
              Yes, Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Saved versions drawer */}
      <Sheet open={showSaved} onOpenChange={setShowSaved}>
        <SheetContent side="right" className="w-[85vw] sm:w-80 bg-zinc-950 border-zinc-800 p-0">
          <SheetHeader className="p-3 sm:p-4 border-b border-zinc-800">
            <SheetTitle className="text-[10px] sm:text-xs font-semibold text-zinc-500 uppercase tracking-wider">Saved Versions</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
            {versions.length === 0 ? (
              <p className="text-[11px] text-zinc-700 text-center py-8">No saved versions yet</p>
            ) : (
              versions.map((v) => (
                <div key={v.id} className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-300 truncate">{v.version_name}</p>
                      <p className="text-[10px] text-zinc-600">{timeAgo(new Date(v.created_at).getTime())}</p>
                    </div>
                    <span className="text-[10px] text-zinc-600 shrink-0">{v.plan_json.roles.length} roles</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => handleRestore(v)} className="text-[10px] h-7 text-blue-400 border-blue-700/50 hover:bg-blue-950/30 flex-1">
                      <RotateCcw className="w-3 h-3 mr-1" />Revert
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeleteVersion(v.id)} className="text-[10px] h-7 text-red-400 border-red-700/50 hover:bg-red-950/30">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Bot invite overlay */}
      {botMissing && (
        <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 sm:p-8 max-w-[90vw] sm:max-w-md mx-4 text-center space-y-3 sm:space-y-4">
            <Bot className="w-10 h-10 sm:w-12 sm:h-12 text-amber-400 mx-auto" />
            <h2 className="text-base sm:text-lg font-semibold text-white">Bot Not Installed</h2>
            <p className="text-xs sm:text-sm text-zinc-400">
              The bot needs to be invited to <strong className="text-white">{guild.name}</strong> before you can make changes.
            </p>
            {pollingStatus === "idle" && (
              <div className="bg-zinc-900 rounded-lg p-3 sm:p-4 text-left space-y-1.5">
                <p className="text-[10px] sm:text-xs text-zinc-300">Required permissions:</p>
                <ul className="text-[10px] sm:text-xs text-zinc-400 space-y-1 list-disc list-inside">
                  <li>Administrator (recommended)</li>
                  <li>Manage Roles · Manage Channels</li>
                  <li>Send Messages · View Channels</li>
                </ul>
              </div>
            )}
            {pollingStatus === "polling" && (
              <div className="flex items-center justify-center gap-2 text-blue-400 text-xs sm:text-sm">
                <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                Waiting for bot invitation...
              </div>
            )}
            {pollingStatus === "detected" && (
              <div className="flex items-center justify-center gap-2 text-green-400 text-xs sm:text-sm">
                <CheckCircle2 className="w-4 h-4" />Bot detected! Loading...
              </div>
            )}
            {pollingStatus === "polling" ? (
              <a href={inviteBotUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="border-blue-500/50 text-blue-400 w-full text-xs sm:text-sm">Re-open Discord</Button>
              </a>
            ) : (
              <Button onClick={startPolling} className="bg-amber-600 hover:bg-amber-700 text-white w-full text-xs sm:text-sm">Invite Bot</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, onApply, onSave, onDiscard, onExport, botMissing }: {
  plan: ServerPlan;
  onApply: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onExport: () => void;
  botMissing: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="bg-zinc-900/60 border border-blue-500/20 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-xs sm:text-sm font-medium text-blue-300 truncate">Server Plan</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-2">
          <span className="text-[10px] text-zinc-600">{plan.roles.length}r · {plan.channels.text.length + plan.channels.voice.length}c</span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 sm:space-y-3">
          {/* Roles */}
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
              <Users className="w-3 h-3" />{plan.roles.length} Roles
            </div>
            <div className="flex flex-wrap gap-1.5">
              {plan.roles.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 bg-zinc-800/80 rounded text-[10px] sm:text-[11px] text-zinc-300">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.color || "#5865F2" }} />
                  <span className="truncate max-w-[100px] sm:max-w-none">{r.name}</span>
                </span>
              ))}
            </div>
          </div>
          {/* Text channels */}
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
              <Hash className="w-3 h-3" />{plan.channels.text.length} Text
            </div>
            <div className="flex flex-wrap gap-1.5">
              {plan.channels.text.map((ch, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 bg-zinc-800/50 rounded text-[10px] sm:text-[11px] text-zinc-400">
                  # {ch}
                  {plan.nsfw_channels?.includes(ch) && (
                    <span className="text-[8px] sm:text-[9px] font-semibold text-pink-400 bg-pink-500/10 px-1 rounded">NSFW</span>
                  )}
                </span>
              ))}
            </div>
          </div>
          {/* Voice channels */}
          {plan.channels.voice.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
                <Volume2 className="w-3 h-3" />{plan.channels.voice.length} Voice
              </div>
              <div className="flex flex-wrap gap-1.5">
                {plan.channels.voice.map((ch, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 bg-zinc-800/50 rounded text-[10px] sm:text-[11px] text-zinc-400">
                    🔊 {ch}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Action buttons */}
          <div className="flex gap-1.5 sm:gap-2 pt-1">
            <Button onClick={onApply} disabled={botMissing} className="bg-green-600 hover:bg-green-700 text-white h-8 text-[10px] sm:text-xs flex-1 min-w-0 px-1.5 sm:px-3">
              <Play className="w-3 h-3 mr-1 shrink-0" /><span className="truncate">Apply</span>
            </Button>
            <Button variant="outline" size="sm" onClick={onSave} className="text-[10px] h-8 text-zinc-400 border-zinc-700 flex-1 min-w-0 px-1.5 sm:px-3">
              <Save className="w-3 h-3 mr-1 shrink-0" /><span className="hidden sm:inline">Save</span>
            </Button>
            <Button variant="outline" size="sm" onClick={onExport} className="text-[10px] h-8 text-zinc-400 border-zinc-700 min-w-0 px-1.5 sm:px-3" title="Export JSON">
              <Download className="w-3 h-3" /><span className="hidden sm:inline ml-1">JSON</span>
            </Button>
            <Button variant="outline" size="sm" onClick={onDiscard} className="text-[10px] h-8 text-red-400 border-red-700/50 hover:bg-red-950/30 min-w-0 px-1.5 sm:px-3">
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
