"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Pencil, Layers, RefreshCw } from "lucide-react";

interface Layer {
  name: string;
  title: string;
  srs: string[];
  bbox: number[];
  source: string;
}

export default function LayersPage() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Layer | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    fetchLayers();
  }, []);

  async function fetchLayers() {
    setLoading(true);
    try {
      const res = await fetch("/api/layers");
      const data = await res.json();
      setLayers(data.layers || []);
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }

  async function deleteLayer(name: string) {
    if (!confirm(`Delete layer "${name}"?`)) return;
    await fetch("/api/layers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    fetchLayers();
  }

  async function saveLayer(layer: Layer, isNew: boolean) {
    await fetch("/api/layers", {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(layer),
    });
    setEditing(null);
    setShowAdd(false);
    fetchLayers();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Layer Management</h1>
          <p className="text-muted-foreground mt-1">
            Configure map layers served via WMS/WFS/WMTS (Fenestra)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLayers}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Add Layer
          </button>
        </div>
      </div>

      {/* Layer list */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading layers...</div>
      ) : layers.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            No layers configured. Add a layer to serve via WMS/WFS.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {layers.map((layer) => (
            <div
              key={layer.name}
              className="rounded-lg border border-border bg-card px-5 py-4 flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{layer.title}</div>
                <div className="text-sm text-muted-foreground">
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">
                    {layer.name}
                  </code>
                  {" · "}
                  {layer.srs.join(", ")} · Source: {layer.source}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(layer)}
                  className="p-2 rounded-md border border-border hover:bg-muted transition-colors"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => deleteLayer(layer.name)}
                  className="p-2 rounded-md border border-border hover:bg-red-500/10 hover:border-red-500/30 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {(showAdd || editing) && (
        <LayerForm
          layer={editing}
          onSave={(layer) => saveLayer(layer, !editing)}
          onCancel={() => {
            setEditing(null);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function LayerForm({
  layer,
  onSave,
  onCancel,
}: {
  layer: Layer | null;
  onSave: (layer: Layer) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(layer?.name || "");
  const [title, setTitle] = useState(layer?.title || "");
  const [srs, setSrs] = useState(layer?.srs.join(", ") || "EPSG:4326, EPSG:3857");
  const [bbox, setBbox] = useState(layer?.bbox.join(", ") || "-180, -90, 180, 90");
  const [source, setSource] = useState(layer?.source || "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name,
      title,
      srs: srs.split(",").map((s) => s.trim()),
      bbox: bbox.split(",").map((s) => parseFloat(s.trim())),
      source,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-card border border-border rounded-lg p-6 w-full max-w-md space-y-4"
      >
        <h2 className="text-xl font-bold">
          {layer ? "Edit Layer" : "Add Layer"}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground">Name (identifier)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
              placeholder="buildings"
              required
              disabled={!!layer}
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Title (display name)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
              placeholder="Building Footprints"
              required
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">CRS (comma-separated)</label>
            <input
              value={srs}
              onChange={(e) => setSrs(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
              placeholder="EPSG:4326, EPSG:3857"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Bounding Box (minx, miny, maxx, maxy)</label>
            <input
              value={bbox}
              onChange={(e) => setBbox(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
              placeholder="-180, -90, 180, 90"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Data Source (path or connection string)</label>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
              placeholder="postgres://ptolemy:ptolemy@db/ptolemy"
              required
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
