"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Server, Shield, History, Bot } from "lucide-react";

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      const messages: Record<string, string> = {
        missing_params: "Invalid OAuth response from Discord.",
        state_mismatch: "Security check failed. Please try again.",
        token_exchange_failed: "Failed to authenticate with Discord.",
        fetch_user_failed: "Could not retrieve your Discord profile.",
        fetch_guilds_failed: "Could not retrieve your Discord servers.",
        session_failed: "Login succeeded but session setup failed. Make sure Supabase is configured and the sessions & security_logs tables exist. Run the schema from supabase/schema.sql.",
      };
      setError(messages[err] || `Unknown error: ${err}`);
    }
  }, []);

  const loginUrl = `/api/auth/discord`;

  const features = [
    { icon: Bot, title: "AI-Powered Design", desc: "Describe your vision and let AI generate a complete server structure" },
    { icon: Shield, title: "Safe Execution", desc: "All changes are validated, previewed, and fully reversible" },
    { icon: History, title: "Version Control", desc: "Git-style version history with full rollback support" },
    { icon: Server, title: "One-Click Apply", desc: "Apply complex server structures with a single click" },
  ];

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-black">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 via-purple-600/5 to-transparent" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />

        <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <Server className="w-6 h-6 text-blue-400" />
            <span className="font-bold text-lg text-white">Discord Architect</span>
          </div>
          <a href={loginUrl}>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6">
              Login with Discord
            </Button>
          </a>
        </nav>

        <section className="relative z-10 max-w-6xl mx-auto px-6 pt-20 pb-32 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-8">
              <Bot className="w-4 h-4" />
              AI-Powered Discord Management
            </div>

            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent">
              Design Your Discord
              <br />
              Server with AI
            </h1>

            <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10">
              Describe your ideal Discord server and let AI generate the perfect structure — roles, channels, categories, and permissions.
            </p>

            {error && (
              <div className="mb-6 mx-auto max-w-lg bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <a href={loginUrl}>
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-8 py-6 text-lg">
                Get Started Free
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-20"
          >
            <div className="relative bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 rounded-2xl p-1">
              <div className="bg-zinc-950 rounded-xl p-4 flex items-center gap-4 border-b border-zinc-800">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <div className="text-zinc-500 text-sm font-mono">plan-preview.tsx</div>
              </div>
              <div className="grid grid-cols-3 gap-4 p-4">
                <div className="col-span-1 bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                  <div className="text-blue-400 text-sm font-mono mb-3">$ describe your server...</div>
                  <div className="space-y-2">
                    {["Gaming Community", "SMP Server", "Coding Hub"].map((t) => (
                      <div key={t} className="text-zinc-500 text-xs px-3 py-1.5 rounded bg-zinc-800/50 border border-zinc-700/50">
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-span-1 bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-green-400 text-xs font-mono">Server Plan</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-zinc-400 text-xs">
                      <Shield className="w-3 h-3 text-purple-400" />
                      <span>6 roles</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-400 text-xs">
                      <Server className="w-3 h-3 text-blue-400" />
                      <span>12 channels</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-400 text-xs">
                      <Bot className="w-3 h-3 text-cyan-400" />
                      <span>4 categories</span>
                    </div>
                  </div>
                </div>
                <div className="col-span-1 bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span className="text-cyan-400 text-xs font-mono">execution.log</span>
                  </div>
                  {["[OK] Creating role: Admin", "[OK] Creating channel: #rules", "[DONE] Complete"].map((log, i) => (
                    <div key={i} className="text-xs font-mono text-zinc-500 mb-1">{log}</div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-32">
          <div className="grid md:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.1 }}
                className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6 hover:border-blue-500/30 transition-colors"
              >
                <feature.icon className="w-8 h-8 text-blue-400 mb-3" />
                <h3 className="font-semibold text-white mb-1">{feature.title}</h3>
                <p className="text-sm text-zinc-500">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
