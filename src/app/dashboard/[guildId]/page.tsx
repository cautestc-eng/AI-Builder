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
  MessageSquare, History, ChevronRight, GripVertical, X
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
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [chatHistory, setChatHistory] = useState<{ prompt: string; plan: ServerPlan; timestamp: number }[]>([]);
  const [conversation, setConversation] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

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
          if (!data.guild.bot_installed) setBotMissing(true);
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
        body: JSON.stringify({ messages }),
      });

      setProgress(70);
      const data = await res.json();

      if (!res.ok) {
        addLog("error", data.error || "Generation failed");
        toast.error(data.error || "Failed to generate plan");
        setLoading(false);
        return;
      }

      if (data.type === "clarify") {
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
  }, [prompt, conversation]);

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
    toast.success("Plan restored from version");
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

  const [activeView, setActiveView] = useState<"chat" | "review">("chat");
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
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-zinc-300">{guild.name}</span>
        </div>
        <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
          {["Build", "DeepSeek", "Default"].map((m) => (
            <button
              key={m}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                activeView === "chat" && m === "Build"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              onClick={() => setActiveView("chat")}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {plan && (
            <button
              onClick={() => setActiveView(activeView === "review" ? "chat" : "review")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                activeView === "review" ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Review
            </button>
          )}
          {botMissing && (
            <a href={inviteBotUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-400 h-7 text-xs">
                <Bot className="w-3 h-3 mr-1" />
                Invite Bot
              </Button>
            </a>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {activeView === "chat" && (
          <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4">
            <div className="flex-1 overflow-y-auto py-4 space-y-3">
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

            <div className="pb-4 pt-2">
              {chatHistory.length > 0 && conversation.length === 0 && !plan && (
                <div className="mb-3">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Recent</p>
                  <div className="flex flex-wrap gap-1.5">
                    {chatHistory.slice(0, 5).map((item, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="cursor-pointer text-[10px] border-zinc-700 text-zinc-400 hover:border-zinc-500"
                        onClick={() => {
                          setPlan(item.plan);
                          setPrompt(item.prompt);
                          toast.success("Restored from history");
                        }}
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
                    placeholder="Describe your server..."
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                  />
                  <span className="absolute bottom-1.5 right-2 text-[10px] text-zinc-600">{prompt.length}/8064</span>
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={loading || !prompt.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white h-[44px] px-5"
                >
                  {loading ? "..." : "Commit"}
                </Button>
              </div>
              <p className="text-[10px] text-zinc-700 mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
            </div>
          </div>
        )}

        {activeView === "review" && plan && (
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-semibold text-zinc-300">Review Plan</h2>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(!editing)}
                    className="text-xs text-zinc-400 h-7"
                  >
                    {editing ? <EyeOff className="w-3 h-3 mr-1" /> : <Edit3 className="w-3 h-3 mr-1" />}
                    {editing ? "View" : "Edit"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSaveVersion}
                    className="text-xs text-zinc-400 h-7"
                  >
                    <Save className="w-3 h-3 mr-1" />
                    Save
                  </Button>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">
                    Roles ({plan.roles.length})
                  </h3>
                  <div className="space-y-2">
                    {plan.roles.map((role, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3"
                      >
                        {editing ? (
                          <div className="space-y-2">
                            <input
                              value={role.name}
                              onChange={(e) => updateRole(i, "name", e.target.value)}
                              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white w-full"
                            />
                            <div className="flex flex-wrap gap-1">
                              {role.permissions.map((perm, j) => (
                                <Badge key={j} variant="secondary" className="text-[10px] bg-zinc-800">
                                  {perm}
                                  <button
                                    onClick={() => {
                                      const newPerms = role.permissions.filter((_, idx) => idx !== j);
                                      updateRole(i, "permissions", newPerms);
                                    }}
                                    className="ml-1 text-zinc-500 hover:text-red-400"
                                  >
                                    <X className="w-2 h-2" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color || "#5865F2" }} />
                              <span className="text-sm text-white font-medium">{role.name}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {role.permissions.slice(0, 3).map((perm, j) => (
                                <Badge key={j} variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
                                  {perm}
                                </Badge>
                              ))}
                              {role.permissions.length > 3 && (
                                <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500">
                                  +{role.permissions.length - 3}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">
                    Text Channels ({plan.channels.text.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {plan.channels.text.map((ch, i) => (
                      editing ? (
                        <input
                          key={i}
                          value={ch}
                          onChange={(e) => updateChannel("text", i, e.target.value)}
                          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                        />
                      ) : (
                        <Badge key={i} className="bg-zinc-900 border border-zinc-700 text-zinc-300">
                          #{ch}
                        </Badge>
                      )
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3">
                    Voice Channels ({plan.channels.voice.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {plan.channels.voice.map((ch, i) => (
                      editing ? (
                        <input
                          key={i}
                          value={ch}
                          onChange={(e) => updateChannel("voice", i, e.target.value)}
                          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                        />
                      ) : (
                        <Badge key={i} className="bg-zinc-900 border border-zinc-700 text-zinc-300">
                          🔊 {ch}
                        </Badge>
                      )
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-3">
                    Categories ({plan.category_structure.length})
                  </h3>
                  <div className="space-y-2">
                    {plan.category_structure.map((cat, i) => (
                      <div key={i} className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-3">
                        <p className="text-sm font-medium text-white mb-2">{cat.name}</p>
                        <div className="flex flex-wrap gap-1">
                          {cat.channels.map((ch, j) => (
                            <Badge key={j} variant="outline" className="text-[10px] border-zinc-700 text-zinc-500">
                              #{ch}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {warnings.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                    <p className="text-xs text-amber-400 font-medium mb-1">Warnings</p>
                    {warnings.map((w, i) => (
                      <p key={i} className="text-xs text-zinc-500">{w}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-8 pt-4 border-t border-zinc-800">
                <Button
                  onClick={() => setShowConfirm(true)}
                  disabled={executing || botMissing}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {executing ? "Applying..." : "Apply to Server"}
                </Button>
              </div>
            </div>

            <div className="w-72 border-l border-zinc-800 p-4 bg-zinc-950/50 flex flex-col">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Terminal className="w-3 h-3 text-cyan-400" />
                Log
              </h3>
              {executing && (
                <Progress value={progress} className="mb-3 h-1 bg-zinc-800 [&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-purple-500" />
              )}
              <ScrollArea className="flex-1">
                <div className="font-mono text-[10px] space-y-1">
                  {logs.length === 0 ? (
                    <p className="text-zinc-700">No activity yet</p>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className={`flex items-start gap-1.5 ${
                        log.type === "error" ? "text-red-400" :
                        log.type === "ok" ? "text-green-400" :
                        log.type === "sync" ? "text-cyan-400" :
                        "text-zinc-400"
                      }`}>
                        <span className="shrink-0">
                          {log.type === "ok" && <CheckCircle2 className="w-2.5 h-2.5 mt-0.5" />}
                          {log.type === "error" && <AlertCircle className="w-2.5 h-2.5 mt-0.5" />}
                          {log.type === "sync" && <Bot className="w-2.5 h-2.5 mt-0.5" />}
                          {log.type === "done" && <CheckCircle2 className="w-2.5 h-2.5 mt-0.5" />}
                        </span>
                        <span>{log.message}</span>
                      </div>
                    ))
                  )}
                  <div ref={logEndRef} />
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
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
            <Button variant="ghost" onClick={() => setShowConfirm(false)} className="text-zinc-400">
              Cancel
            </Button>
            <Button onClick={handleExecute} className="bg-green-600 hover:bg-green-700 text-white">
              Yes, Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
