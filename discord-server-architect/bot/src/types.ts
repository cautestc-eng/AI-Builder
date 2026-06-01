export interface ServerPlan {
  roles: { name: string; permissions: string[]; color?: string }[];
  channels: { text: string[]; voice: string[] };
  category_structure: { name: string; channels: string[] }[];
}

export interface LogEntry {
  type: "ok" | "error" | "sync" | "done";
  message: string;
  timestamp: string;
}
