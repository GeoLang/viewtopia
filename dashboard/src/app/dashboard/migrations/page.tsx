"use client";

import { useState } from "react";
import { Database, Play, FileText } from "lucide-react";

export default function MigrationsPage() {
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  async function runMigration(action: "status" | "run") {
    setLoading(true);
    setOutput("");
    try {
      const res = await fetch("/api/migrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setOutput(data.output || "No output");
    } catch {
      setOutput("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Database Migrations</h1>
        <p className="text-muted-foreground mt-1">
          Check status and run Ptolemy database migrations
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => runMigration("status")}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
        >
          <FileText className="h-4 w-4" />
          Check Status
        </button>
        <button
          onClick={() => runMigration("run")}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          Run Migrations
        </button>
      </div>

      {output && (
        <div className="rounded-lg border border-border bg-black/50 p-4 font-mono text-xs leading-relaxed overflow-auto max-h-[60vh] whitespace-pre-wrap">
          {output}
        </div>
      )}

      {!output && !loading && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Database className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            Click &quot;Check Status&quot; to see pending migrations, or
            &quot;Run Migrations&quot; to apply them.
          </p>
        </div>
      )}
    </div>
  );
}
