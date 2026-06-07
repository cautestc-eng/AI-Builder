"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  ArrowLeft, Bot, AlertCircle, CheckCircle2,
  Save, RotateCcw, Terminal, Play, X, Trash2,
  Hash, Volume2, Users, Layers
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ServerPlan, LogEntry, ServerVersion, DiscordGuild } from "@/types";

const TEMPLATES = [
  { id: "gaming", label: "Gaming" },
  { id: "smp", label: "Minecraft SMP" },
  { id: "community", label: "Community" },
  { id: "coding", label: "Coding" },
  { id: "esports", label: "Esports" },
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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [deletePreview, setDeletePreview] = useState<{
    channels: string[]; roles: string[];
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [jsonExpanded, setJsonExpanded] = useState(false);

  function timeAgo(ts: number) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "now";
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "44px";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 360)}px`;
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
      .catch(() => { toast.error("Failed to load"); setPageLoading(false); })
      .finally(() => clearTimeout(timeout));
  }, [guildId]);

  useEffect(() => {
    return () => { if (pollRef.current) { clearInterval(pollRef.current); } };
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
              .then((r) => r.json()).then((data) => {
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
    if (!prompt.trim()) return;

    const userMsg = prompt.trim();
    setPrompt("");
    if (inputRef.current) { inputRef.current.style.height = "44px"; }
    const newMessages: ChatMessage[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);
    setShowLogs(false);

    try {
      const apiMessages = newMessages.filter(m => !m.plan).map(m => ({ role: m.role, content: m.content }));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 290000);
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, mode: "build", model: "llama-8b" }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.error || "Failed" }]);
        setLoading(false);
        return;
      }
      if (data.type === "message") {
        setMessages((prev) => [...prev, { role: "assistant", content: data.content as string }]);
      } else if (data.type === "clarify") {
        setMessages((prev) => [...prev, { role: "assistant", content: (data.questions as string[]).join("\n") }]);
      } else if (data.type === "reject") {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reason as string }]);
      } else if (data.type === "plan") {
        setMessages((prev) => [...prev, { role: "assistant", content: "", plan: data.plan as ServerPlan }]);
        if (data.warnings?.length) data.warnings.forEach((w: string) => addLog("error", `Warning: ${w}`));
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setMessages((prev) => [...prev, { role: "assistant", content: "Request timed out — the AI took too long. Try a simpler prompt." }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: "Network error — check your connection and try again." }]);
      }
    } finally { setLoading(false); }
  }, [prompt, messages]);

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
      toast.success("Saved!");
    } else { toast.error("Save failed"); }
  };

  const handleApply = useCallback(async (plan: ServerPlan) => {
    setConfirmPlan(plan);
    setDeletePreview(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/channels`);
      const data = await res.json();
      // Use channel_details names if available, else fall back to old format
      const planNames = new Set([
        ...(plan.channel_details || []).map((c: any) => c.name.toLowerCase()),
        ...plan.channels.text.map((n: string) => n.toLowerCase()),
        ...plan.channels.voice.map((n: string) => n.toLowerCase()),
        ...plan.category_structure.flatMap((c: any) => c.channels.map((n: string) => n.toLowerCase())),
        ...plan.category_structure.map((c: any) => c.name.toLowerCase()),
      ]);
      const planRoleNames = new Set(plan.roles.map((r: any) => r.name.toLowerCase()));
      const channelsToDelete = data.channels
        .filter((c: any) => !c.managed && !planNames.has(c.name.toLowerCase()))
        .map((c: any) => `#${c.name}`);
      const rolesToDelete = data.roles
        .filter((r: any) => !r.managed && r.name !== "@everyone" && !planRoleNames.has(r.name.toLowerCase()))
        .map((r: any) => r.name);
      setDeletePreview({ channels: channelsToDelete, roles: rolesToDelete });
    } catch { setDeletePreview(null); }
    setPreviewLoading(false);
  }, [guildId]);

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
        body: JSON.stringify({ guild_id: guildId, plan_json: plan, version_name: `Before ${new Date().toLocaleString()}` }),
      }).then(r => r.ok && r.json()).then(d => { if (d?.version) setVersions(prev => [d.version, ...prev]); });

      addLog("sync", "Applying...");
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guild_id: guildId, plan_json: plan }),
      });
      const data = await res.json();
      if (data.logs) setLogs(data.logs);
      if (data.success) {
        setProgress(100);
        addLog("done", "Done!");
        toast.success("Server updated!");
        fetch(`/api/guilds/${guildId}`).then(r => r.json()).then(d => {
          if (d.versions) setVersions(d.versions);
        });
      } else {
        setProgress(0);
        addLog("error", data.error || "Failed");
        toast.error("Apply failed");
      }
    } catch {
      addLog("error", "Execution failed");
    } finally { setExecuting(false); }
  };

  const handleRestore = (version: ServerVersion) => {
    setMessages([{ role: "assistant", content: "", plan: version.plan_json }]);
    setShowSaved(false);
    toast.success("Plan loaded");
  };

  const handleDeleteVersion = async (versionId: string) => {
    const res = await fetch(`/api/versions/${versionId}`, { method: "DELETE" });
    if (res.ok) {
      setVersions((prev) => prev.filter((v) => v.id !== versionId));
      toast.success("Deleted");
    } else { toast.error("Delete failed"); }
  };

  const handleClearPlan = (planToClear?: ServerPlan) => {
    setMessages((prev) => prev.filter(m => m.plan !== planToClear));
    toast.success("Discarded");
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
        <p className="text-zinc-500">Could not load server</p>
      </div>
    );
  }

  return (
    <div className="h-dvh bg-black flex flex-col overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="w-8 h-8 shrink-0" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-zinc-300 truncate max-w-[140px]">{guild.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {botMissing && (
            <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-400 h-7 text-xs px-2" onClick={startPolling}>
              <Bot className="w-3 h-3 mr-1" />Invite
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-200 h-7 text-xs gap-1 px-2" onClick={() => setShowSaved(true)}>
            <Bookmark className="w-3.5 h-3.5" /><span className="hidden sm:inline">Saved</span> ({versions.length})
          </Button>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="max-w-2xl mx-auto space-y-3">
          {messages.length === 0 && (
            <div className="py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-600/20 flex items-center justify-center mx-auto mb-3">
                <Bot className="w-7 h-7 text-blue-400" />
              </div>
              <h2 className="text-base font-medium text-zinc-300 mb-1">Design Your Server</h2>
              <p className="text-xs text-zinc-500 mb-5">What kind of server do you want?</p>
              <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
                {TEMPLATES.map((t) => (
                  <button key={t.id} onClick={() => handleTemplate(t.id)}
                    className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition-colors"
                  >{t.label}</button>
                ))}
              </div>
              {versions.length > 0 && (
                <div className="mt-6 pt-5 border-t border-zinc-800">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Saved plans</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {versions.map((v) => (
                      <button key={v.id} onClick={() => handleRestore(v)}
                        className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-400 hover:border-blue-500/50 hover:text-blue-300 transition-colors flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span className="truncate max-w-[80px]">{v.version_name}</span>
                        <span className="text-zinc-600">{timeAgo(new Date(v.created_at).getTime())}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" ? (
                <div className="flex justify-end">
                  <div className="rounded-2xl px-3 py-2 text-sm max-w-[85%] leading-relaxed bg-blue-600 text-white">{msg.content}</div>
                </div>
              ) : msg.plan ? (
                <PlanCard
                  plan={msg.plan}
                  onApply={() => handleApply(msg.plan!)}
                  onSave={() => handleSaveVersion(msg.plan!)}
                  onDiscard={() => handleClearPlan(msg.plan)}
                  botMissing={botMissing}
                />
              ) : (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-3 py-2 text-sm max-w-[85%] leading-relaxed bg-zinc-800 text-zinc-200 whitespace-pre-wrap">{msg.content}</div>
                </div>
              )}
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
      </div>

      {/* Input area */}
      <div className="border-t border-zinc-800/50 px-3 py-2.5 shrink-0">
        <div className="max-w-2xl mx-auto">
          {jsonExpanded && (
            <div className="mb-2 p-2 bg-zinc-900/50 border border-zinc-800 rounded-lg">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Paste JSON plan</p>
              <textarea
                value={jsonInput}
                onChange={(e) => { setJsonInput(e.target.value); setJsonError(""); }}
                placeholder='{"roles":[{"name":"@everyone","permissions":["VIEW_CHANNEL"],"color":"#99AAB5"}],"channels":{"text":["general"],"voice":["General"]},"category_structure":[{"name":"General","channels":["general"]}]}'
                className="bg-black/50 border border-zinc-700 text-white text-xs min-h-[120px] max-h-[250px] font-mono w-full rounded px-2.5 py-2 resize-y focus:outline-none focus:border-blue-500/50"
              />
              {jsonError && <p className="text-red-400 text-[10px] mt-1">{jsonError}</p>}
              <div className="flex gap-2 mt-1.5">
                <Button onClick={() => {
                  try {
                    const parsed = JSON.parse(jsonInput);
                    if (!parsed.roles || !parsed.channels || !parsed.category_structure || !Array.isArray(parsed.channels.text) || !Array.isArray(parsed.channels.voice)) {
                      setJsonError("Invalid plan: missing required fields (roles, channels.text, channels.voice, category_structure)");
                      return;
                    }
                    setMessages(prev => [...prev, { role: "assistant", content: "", plan: parsed as ServerPlan }]);
                    setJsonExpanded(false);
                    setJsonInput("");
                    setJsonError("");
                  } catch (e) {
                    setJsonError("Invalid JSON: " + (e instanceof Error ? e.message : "parse error"));
                  }
                }} disabled={!jsonInput.trim()}
                  className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-3"
                >Load Plan</Button>
                <Button variant="ghost" onClick={() => { setJsonExpanded(false); setJsonError(""); }}
                  className="text-zinc-400 h-7 text-xs px-2"
                >Cancel</Button>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              placeholder={messages.length === 0 ? "Describe your server or pick a template" : "Ask a change..."}
              value={prompt}
              maxLength={8064}
              onChange={(e) => {
                setPrompt(e.target.value);
                e.currentTarget.style.height = "44px";
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 360)}px`;
              }}
              className="bg-zinc-900 border border-zinc-700 text-white min-h-[44px] max-h-[360px] resize-none text-sm w-full rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500/50 placeholder-zinc-600 overflow-y-auto"
              rows={1}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
            />
            <Button onClick={handleGenerate} disabled={loading || !prompt.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white h-[44px] px-4 shrink-0 text-sm"
            >{loading ? "..." : "Send"}</Button>
            <Button variant="outline" size="sm" onClick={() => setJsonExpanded(!jsonExpanded)}
              className="text-xs h-[44px] text-zinc-400 border-zinc-700 shrink-0 px-2"
              title="Import JSON plan"
            ><Terminal className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>

      {/* Logs overlay */}
      <AnimatePresence>
        {showLogs && (
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 z-40 flex flex-col" style={{ maxHeight: "45vh" }}
          >
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 shrink-0">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="w-3 h-3 text-cyan-400" />Logs
              </h3>
              <Button variant="ghost" size="sm" className="w-6 h-6 text-zinc-600" onClick={() => setShowLogs(false)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
            <Progress value={progress} className="mx-3 mb-2 h-1 bg-zinc-800 shrink-0 [&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-purple-500" />
            <div className="flex-1 overflow-y-auto px-3 pb-2 font-mono text-[10px] space-y-1">
              {logs.map((log, i) => (
                <div key={i} className={`flex items-start gap-1.5 ${
                  log.type === "error" ? "text-red-400" : log.type === "ok" ? "text-green-400" :
                  log.type === "sync" ? "text-cyan-400" : log.type === "warn" ? "text-amber-400" : "text-zinc-400"
                }`}>
                  <span className="shrink-0 mt-0.5">
                    {["ok", "done"].includes(log.type) && <CheckCircle2 className="w-2.5 h-2.5" />}
                    {log.type === "error" && <AlertCircle className="w-2.5 h-2.5" />}
                    {log.type === "sync" && <Bot className="w-2.5 h-2.5" />}
                    {log.type === "warn" && <AlertCircle className="w-2.5 h-2.5 text-amber-400" />}
                  </span>
                  <span>{log.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm dialog */}
      <Dialog open={!!confirmPlan} onOpenChange={(o) => { if (!o) setConfirmPlan(null); }}>
          <DialogContent className="bg-zinc-950 border-zinc-800 max-w-[92vw] sm:max-w-md rounded-xl">
            <DialogHeader>
              <DialogTitle className="text-white text-sm">Apply to {guild.name}?</DialogTitle>
              <DialogDescription className="text-zinc-400 text-xs">
                Creates/updates roles and channels. Removes anything not in the plan.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-zinc-900 rounded-lg p-3 space-y-1.5 text-sm">
              {[
                ["Roles", confirmPlan?.roles.length],
                ["Text channels", confirmPlan?.channel_details?.filter(c => c.type !== "voice").length ?? confirmPlan?.channels.text.length],
                ["Voice channels", confirmPlan?.channel_details?.filter(c => c.type === "voice").length ?? confirmPlan?.channels.voice.length],
                ["Categories", confirmPlan?.category_structure.length],
              ].map(([label, count]) => (
                <div key={label as string} className="flex justify-between text-zinc-400">
                  <span>{label as string}</span>
                  <span className="text-white font-bold">{count as number}</span>
                </div>
              ))}
              {(deletePreview?.channels.length || deletePreview?.roles.length) ? (
                <div className="border-t border-zinc-800 pt-2 mt-2">
                  <p className="text-amber-400 text-xs font-medium mb-1">Will be removed:</p>
                  {deletePreview!.channels.length > 0 && (
                    <p className="text-red-400 text-xs">{deletePreview!.channels.length} channel(s): {deletePreview!.channels.join(", ")}</p>
                  )}
                  {deletePreview!.roles.length > 0 && (
                    <p className="text-red-400 text-xs">{deletePreview!.roles.length} role(s): {deletePreview!.roles.join(", ")}</p>
                  )}
                </div>
              ) : previewLoading ? (
                <p className="text-zinc-500 text-xs animate-pulse">Checking current server state...</p>
              ) : null}
            </div>
          <DialogFooter className="gap-2">
            {botMissing && <p className="text-xs text-amber-400 text-center w-full">Invite bot first</p>}
            <Button variant="ghost" onClick={() => setConfirmPlan(null)} className="text-zinc-400 text-xs">Cancel</Button>
            <Button onClick={() => handleExecute(confirmPlan!)} disabled={botMissing || !confirmPlan}
              className="bg-green-600 hover:bg-green-700 text-white text-xs"
            >Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Saved drawer */}
      <Sheet open={showSaved} onOpenChange={setShowSaved}>
        <SheetContent side="right" className="w-[85vw] sm:w-80 bg-zinc-950 border-zinc-800 p-0">
          <SheetHeader className="p-3 border-b border-zinc-800">
            <SheetTitle className="text-xs font-semibold text-zinc-500 uppercase">Saved Plans</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto p-3 space-y-2">
            {versions.length === 0 ? (
              <p className="text-xs text-zinc-700 text-center py-8">No saved plans yet</p>
            ) : (
              versions.map((v) => (
                <div key={v.id} className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-300 truncate">{v.version_name}</p>
                      <p className="text-[10px] text-zinc-600">{timeAgo(new Date(v.created_at).getTime())}</p>
                    </div>
                    <span className="text-[10px] text-zinc-600 shrink-0">{v.plan_json.roles.length}r</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => handleRestore(v)}
                      className="text-xs h-7 text-blue-400 border-blue-700/50 hover:bg-blue-950/30 flex-1"
                    ><RotateCcw className="w-3 h-3 mr-1" />Load</Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeleteVersion(v.id)}
                      className="text-xs h-7 text-red-400 border-red-700/50 hover:bg-red-950/30"
                    ><Trash2 className="w-3 h-3" /></Button>
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
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 max-w-sm mx-4 text-center space-y-3">
            <Bot className="w-10 h-10 text-amber-400 mx-auto" />
            <h2 className="text-base font-semibold text-white">Bot Not Installed</h2>
            <p className="text-xs text-zinc-400">
              Invite the bot to <strong className="text-white">{guild.name}</strong> first.
            </p>
            {pollingStatus === "idle" && (
              <Button onClick={startPolling} className="bg-amber-600 hover:bg-amber-700 text-white w-full text-xs">Invite Bot</Button>
            )}
            {pollingStatus === "polling" && (
              <div className="text-xs text-blue-400 flex items-center justify-center gap-2">
                <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                Waiting...
              </div>
            )}
            {pollingStatus === "polling" ? (
              <a href={inviteBotUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="border-blue-500/50 text-blue-400 w-full text-xs">Re-open Discord</Button>
              </a>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, onApply, onSave, onDiscard, botMissing }: {
  plan: ServerPlan; onApply: () => void; onSave: () => void; onDiscard: () => void; botMissing: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const channelTypeIcon: Record<string, string> = { text: "#", voice: "🔊", announcement: "📢", forum: "🧵" };
  const channelTypeLabel: Record<string, string> = { text: "text", voice: "voice", announcement: "news", forum: "forum" };

  const allChannels = plan.channel_details || [];
  const hasDetails = allChannels.length > 0;
  const textChannels = hasDetails ? allChannels.filter(c => c.type === "text" || c.type === "announcement" || c.type === "forum") : plan.channels.text.map(n => ({ name: n, type: "text" as const }));
  const voiceChannels = hasDetails ? allChannels.filter(c => c.type === "voice") : plan.channels.voice.map(n => ({ name: n, type: "voice" as const }));

  return (
    <div className="bg-zinc-900/60 border border-blue-500/20 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-sm font-medium text-blue-300">Server Plan</span>
          {plan.mode === "replace" && <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">REPLACE</span>}
          {plan.mode === "add" && <span className="text-[9px] font-bold text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">ADD</span>}
        </div>
        <span className="text-xs text-zinc-600 shrink-0 ml-2">{plan.roles.length}r · {(hasDetails ? allChannels.length : plan.channels.text.length + plan.channels.voice.length)}c</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2.5">
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1"><Users className="w-3 h-3 inline mr-1" />{plan.roles.length} Roles</p>
            <div className="flex flex-wrap gap-1.5">
              {plan.roles.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800/80 rounded text-xs text-zinc-300">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.color || "#5865F2" }} />
                  {r.name}
                  {r.hoist && <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1 rounded">hoist</span>}
                </span>
              ))}
            </div>
          </div>

          {hasDetails ? (
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1"><Hash className="w-3 h-3 inline mr-1" />{allChannels.length} Channels</p>
              <div className="flex flex-wrap gap-1.5">
                {allChannels.filter(c => c.type === "text" || c.type === "announcement" || c.type === "forum").map((ch, i) => (
                  <span key={i} title={ch.topic || ch.type} className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800/50 rounded text-xs text-zinc-400">
                    {channelTypeIcon[ch.type] || "#"} {ch.name}
                    {ch.type !== "text" && <span className="text-[9px] text-cyan-400 bg-cyan-500/10 px-1 rounded">{channelTypeLabel[ch.type]}</span>}
                    {ch.nsfw && <span className="text-[9px] text-pink-400 bg-pink-500/10 px-1 rounded">NSFW</span>}
                    {ch.slowmode && ch.slowmode > 0 && <span className="text-[9px] text-yellow-400 bg-yellow-500/10 px-1 rounded">{ch.slowmode}s</span>}
                    {ch.permission_overwrites && ch.permission_overwrites.length > 0 && <span className="text-[9px] text-purple-400 bg-purple-500/10 px-1 rounded">restricted</span>}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1"><Hash className="w-3 h-3 inline mr-1" />{plan.channels.text.length} Text</p>
                <div className="flex flex-wrap gap-1.5">
                  {plan.channels.text.map((ch, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800/50 rounded text-xs text-zinc-400">
                      # {ch}
                      {plan.nsfw_channels?.includes(ch) && <span className="text-[9px] text-pink-400 bg-pink-500/10 px-1 rounded">NSFW</span>}
                    </span>
                  ))}
                </div>
              </div>
              {plan.channels.voice.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1"><Volume2 className="w-3 h-3 inline mr-1" />{plan.channels.voice.length} Voice</p>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.channels.voice.map((ch, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800/50 rounded text-xs text-zinc-400">🔊 {ch}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {plan.auto_mod && plan.auto_mod.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1"><AlertCircle className="w-3 h-3 inline mr-1" />Auto-Mod</p>
              <div className="flex flex-wrap gap-1.5">
                {plan.auto_mod.filter(r => r.enabled).map((r, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/5 border border-amber-500/20 rounded text-xs text-amber-300">
                    {r.type}{r.limit ? ` (${r.limit})` : ""}
                    {r.channel_exceptions && r.channel_exceptions.length > 0 && <span className="text-[9px] text-zinc-400">ex: {r.channel_exceptions.join(",")}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {plan.recommended_bots && plan.recommended_bots.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1"><Bot className="w-3 h-3 inline mr-1" />Recommended Bots</p>
              <div className="flex flex-wrap gap-1.5">
                {plan.recommended_bots.map((b, i) => (
                  <span key={i} className="px-2 py-0.5 bg-indigo-500/5 border border-indigo-500/20 rounded text-xs text-indigo-300">{b}</span>
                ))}
              </div>
            </div>
          )}

          {plan.guild_settings && (
            <div className="text-[10px] text-zinc-500 space-y-0.5 border-t border-zinc-800 pt-2">
              {plan.guild_settings.verification_level && <p>Verification: {plan.guild_settings.verification_level}</p>}
              {plan.guild_settings.default_message_notifications && <p>Notifications: {plan.guild_settings.default_message_notifications}</p>}
              {plan.guild_settings.explicit_content_filter && <p>Content filter: {plan.guild_settings.explicit_content_filter}</p>}
              {plan.guild_settings.system_channel && <p>System channel: #{plan.guild_settings.system_channel}</p>}
              {plan.guild_settings.afk_channel && <p>AFK channel: {plan.guild_settings.afk_channel}</p>}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button onClick={onApply} disabled={botMissing}
              className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs flex-1"
            ><Play className="w-3 h-3 mr-1" />Apply</Button>
            <Button variant="outline" size="sm" onClick={onSave}
              className="text-xs h-8 text-zinc-400 border-zinc-700 min-w-0 px-2"
            ><Save className="w-3 h-3" /><span className="hidden sm:inline ml-1">Save</span></Button>
            <Button variant="outline" size="sm" onClick={onDiscard}
              className="text-xs h-8 text-red-400 border-red-700/50 hover:bg-red-950/30 min-w-0 px-2"
            ><Trash2 className="w-3 h-3" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Bookmark(props: any) { return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M6 3h12a2 2 0 0 1 2 2v16l-8-4-8 4V5a2 2 0 0 1 2-2z"/></svg>; }
