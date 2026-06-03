"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Server, LogOut, Bot, AlertCircle } from "lucide-react";
import { DiscordGuild } from "@/types";

export default function DashboardPage() {
  const router = useRouter();
  const [guilds, setGuilds] = useState<DiscordGuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) setUsername(data.user.username);
      })
      .catch(() => {});

    fetch("/api/guilds")
      .then((r) => r.json())
      .then((data) => {
        setGuilds(data.guilds || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    router.push("/");
  };

  return (
    <div className="min-h-dvh bg-black">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <Server className="w-8 h-8 text-blue-400" />
            <div>
              <h1 className="text-xl font-bold text-white">Discord Architect</h1>
              {username && (
                <p className="text-sm text-zinc-500">Logged in as {username}</p>
              )}
            </div>
          </div>
          <Button variant="ghost" onClick={handleLogout} className="text-zinc-400 hover:text-white">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-2xl font-bold text-white mb-2">Select a Server</h2>
          <p className="text-zinc-500 mb-8">
            Choose a server you manage to design and deploy its structure.
          </p>

          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="bg-zinc-900/50 border-zinc-800 p-6 animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-zinc-800" />
                    <div className="flex-1">
                      <div className="h-4 bg-zinc-800 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-zinc-800 rounded w-1/2" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : guilds.length === 0 ? (
            <Card className="bg-zinc-900/50 border-zinc-800 p-12 text-center">
              <AlertCircle className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">No Accessible Servers</h3>
              <p className="text-zinc-500 mb-6">
                You don&apos;t own or have permission to manage any Discord servers.
              </p>
              <Button
                variant="outline"
                onClick={() => window.open("https://discord.com/app", "_blank")}
              >
                Open Discord
              </Button>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {guilds.map((guild, index) => (
                <motion.div
                  key={guild.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card
                    className="bg-zinc-900/50 border-zinc-800 p-6 hover:border-blue-500/30 transition-all cursor-pointer group relative overflow-hidden"
                    onClick={() => {
                      if (!guild.bot_installed) {
                        const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands&guild_id=${guild.id}`;
                        window.open(inviteUrl, "_blank");
                      }
                      router.push(`/dashboard/${guild.id}`);
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg font-bold text-zinc-400 overflow-hidden">
                        {guild.icon ? (
                          <img
                            src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                            alt={guild.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          guild.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white truncate">{guild.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          {guild.bot_installed ? (
                            <span className="flex items-center gap-1 text-xs text-green-400">
                              <Bot className="w-3 h-3" />
                              Bot active
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-amber-400">
                              <AlertCircle className="w-3 h-3" />
                              Invite bot
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/0 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
