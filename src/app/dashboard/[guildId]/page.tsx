"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
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
  Eye, EyeOff, Edit3, Plus, Trash2,
  GripVertical, X, Terminal, Play
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/guilds/${guildId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.guild) {
          setGuild(data.guild);
          if (!data.guild.bot_installed) setBotMissing(true);
        }
        setVersions(data.versions || []);
      })
      .catch(() => toast.error("Failed to load guild data"));
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

    setLoading(true);
    setPlan(null);
    setLogs([]);
    setWarnings([]);
    setProgress(20);

    try {
      addLog("sync", "Sending prompt to AI...");
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      setProgress(60);
      const data = await res.json();

      if (!res.ok) {
        addLog("error", data.error || "Generation failed");
        toast.error(data.error || "Failed to generate plan");
        setLoading(false);
        return;
      }

      setPlan(data.plan);
      if (data.warnings?.length) {
        setWarnings(data.warnings);
        data.warnings.forEach((w: string) => addLog("error", `Warning: ${w}`));
      }
      addLog("ok", "Server plan generated successfully");
      setProgress(100);
      toast.success("Server plan created!");
    } catch (err) {
      addLog("error", "Failed to generate plan");
      toast.error("Network error during generation");
    } finally {
      setLoading(false);
    }
  }, [prompt]);

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

  const inviteBotUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands&guild_id=${guildId}`;

  if (!guild) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-white">{guild.name}</h1>
            <p className="text-xs text-zinc-500">Server Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {botMissing && (
            <a href={inviteBotUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-400">
                <Bot className="w-4 h-4 mr-2" />
                Invite Bot
              </Button>
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0" style={{ height: "calc(100vh - 61px)" }}>
        <div className="border-r border-zinc-800 p-4 flex flex-col">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Prompt Engine
          </h2>
          <Textarea
            placeholder="Describe your Discord server..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="bg-zinc-900/50 border-zinc-700 text-white min-h-[120px] resize-none mb-4"
          />
          <div className="flex flex-wrap gap-2 mb-4">
            {TEMPLATES.map((t) => (
              <Badge
                key={t.id}
                variant="outline"
                className="cursor-pointer hover:bg-zinc-800 text-xs py-1 px-3 border-zinc-700"
                onClick={() => handleTemplate(t.id)}
              >
                {t.label}
              </Badge>
            ))}
          </div>
          <Button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white mb-2"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {loading ? "Generating..." : "Generate Server Plan"}
          </Button>

          <Separator className="my-4 bg-zinc-800" />

          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Version History
          </h3>
          <ScrollArea className="flex-1">
            <div className="space-y-2">
              {versions.length === 0 ? (
                <p className="text-xs text-zinc-600">No versions yet</p>
              ) : (
                versions.map((v) => (
                  <Card
                    key={v.id}
                    className="bg-zinc-900/30 border-zinc-800 p-3 cursor-pointer hover:border-blue-500/30 transition-colors"
                    onClick={() => handleRestore(v)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-white">{v.version_name}</p>
                        <p className="text-[10px] text-zinc-600 font-mono">
                          {new Date(v.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPlan(v.plan_json);
                          }}
                        >
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            const blob = new Blob([JSON.stringify(v.plan_json, null, 2)], { type: "application/json" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `${v.version_name}.json`;
                            a.click();
                          }}
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="border-r border-zinc-800 p-4 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Server Plan
            </h2>
            {plan && (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(!editing)}
                  className="text-xs text-zinc-400"
                >
                  {editing ? <EyeOff className="w-3 h-3 mr-1" /> : <Edit3 className="w-3 h-3 mr-1" />}
                  {editing ? "View" : "Edit"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveVersion}
                  className="text-xs text-zinc-400"
                >
                  <Save className="w-3 h-3 mr-1" />
                  Save
                </Button>
              </div>
            )}
          </div>

          <ScrollArea className="flex-1">
            {!plan ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-20">
                <Sparkles className="w-12 h-12 text-zinc-700 mb-4" />
                <p className="text-zinc-600 text-sm mb-2">No plan generated yet</p>
                <p className="text-zinc-700 text-xs">Describe your server and click generate</p>
              </div>
            ) : (
              <div className="space-y-6 pr-2">
                <div>
                  <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Bot className="w-3 h-3" />
                    Roles ({plan.roles.length})
                  </h3>
                  <div className="space-y-2">
                    {plan.roles.map((role, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3"
                      >
                        {editing ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <GripVertical className="w-3 h-3 text-zinc-600 cursor-move" />
                              <input
                                value={role.name}
                                onChange={(e) => updateRole(i, "name", e.target.value)}
                                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white flex-1"
                              />
                            </div>
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
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: role.color || "#5865F2" }}
                              />
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
            )}
          </ScrollArea>

          {plan && (
            <div className="pt-4 border-t border-zinc-800 mt-4">
              <Button
                onClick={() => setShowConfirm(true)}
                disabled={executing || botMissing}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                <Play className="w-4 h-4 mr-2" />
                {executing ? "Applying..." : "Apply to Server"}
              </Button>
            </div>
          )}
        </div>

        <div className="p-4 flex flex-col bg-zinc-950/50">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            Execution Log
          </h2>

          {executing && (
            <Progress value={progress} className="mb-4 h-1 bg-zinc-800 [&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-purple-500" />
          )}

          <ScrollArea className="flex-1">
            <div className="font-mono text-xs space-y-1">
              {logs.length === 0 ? (
                <p className="text-zinc-700">Awaiting execution...</p>
              ) : (
                logs.map((log, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex items-start gap-2 ${
                      log.type === "error" ? "text-red-400" :
                      log.type === "ok" ? "text-green-400" :
                      log.type === "sync" ? "text-cyan-400" :
                      "text-zinc-400"
                    }`}
                  >
                    <span className="shrink-0">
                      {log.type === "ok" && <CheckCircle2 className="w-3 h-3 mt-0.5" />}
                      {log.type === "error" && <AlertCircle className="w-3 h-3 mt-0.5" />}
                      {log.type === "sync" && <Bot className="w-3 h-3 mt-0.5" />}
                      {log.type === "done" && <CheckCircle2 className="w-3 h-3 mt-0.5" />}
                    </span>
                    <span>{log.message}</span>
                  </motion.div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </ScrollArea>
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
