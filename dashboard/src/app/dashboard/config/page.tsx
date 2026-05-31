"use client";

import { useState, useEffect } from "react";
import { Save, RefreshCw } from "lucide-react";
import { COMPOSE_FILE } from "@/lib/services";

export default function ConfigPage() {
  const [config, setConfig] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    setLoading(true);
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      setConfig(data.content || "");
    } catch {
      setConfig("# Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: config }),
      });
      const data = await res.json();
      setFeedback({ message: data.message || "Saved", ok: res.ok });
    } catch {
      setFeedback({ message: "Failed to save", ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configuration</h1>
          <p className="text-muted-foreground mt-1">
            Edit <code className="bg-muted px-1 py-0.5 rounded text-xs">{COMPOSE_FILE}</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchConfig}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Reload
          </button>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            feedback.ok
              ? "border-green-500/30 bg-green-500/5 text-green-300"
              : "border-red-500/30 bg-red-500/5 text-red-300"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <textarea
        value={config}
        onChange={(e) => setConfig(e.target.value)}
        className="w-full h-[70vh] rounded-lg border border-border bg-black/50 p-4 font-mono text-xs leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
        spellCheck={false}
      />
    </div>
  );
}
