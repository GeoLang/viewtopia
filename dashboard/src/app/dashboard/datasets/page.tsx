"use client";

import { useState, useEffect } from "react";
import { Database, Search, Tag, Upload, Download, RefreshCw } from "lucide-react";

interface Dataset {
  id: string;
  name: string;
  description: string;
  tags: string[];
  srid?: number;
  geometry_type?: string;
  feature_count?: number;
}

const PTOLEMY_URL = process.env.NEXT_PUBLIC_PTOLEMY_URL || "http://localhost:3000";

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  useEffect(() => {
    fetchDatasets();
  }, [search, tagFilter]);

  async function fetchDatasets() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (tagFilter) params.set("tag", tagFilter);
      const res = await fetch(`${PTOLEMY_URL}/catalog/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDatasets(data);
      }
    } catch {
      // Ptolemy not available
    } finally {
      setLoading(false);
    }
  }

  async function addTag(datasetId: string) {
    const tag = prompt("Enter tag name:");
    if (!tag) return;
    await fetch(`${PTOLEMY_URL}/datasets/${datasetId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    fetchDatasets();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 text-purple-400" />
          <h1 className="text-2xl font-bold text-white">Datasets</h1>
        </div>
        <button
          onClick={() => fetchDatasets()}
          className="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Search & filter bar */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search datasets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
          />
        </div>
        <div className="relative">
          <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Filter by tag..."
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="w-48 rounded-lg border border-gray-700 bg-gray-900 py-2 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Datasets grid */}
      {loading ? (
        <div className="py-12 text-center text-gray-400">Loading datasets...</div>
      ) : datasets.length === 0 ? (
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-12 text-center">
          <Database className="mx-auto h-12 w-12 text-gray-600" />
          <h3 className="mt-4 text-lg font-medium text-gray-300">No datasets found</h3>
          <p className="mt-2 text-sm text-gray-500">
            Import data with: <code className="text-purple-400">ptolemy import --branch &lt;id&gt; data.geojson</code>
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Supports GeoJSON, Shapefile (.shp), and GeoPackage (.gpkg)
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {datasets.map((ds) => (
            <div
              key={ds.id}
              className="rounded-lg border border-gray-700 bg-gray-900 p-5 transition-colors hover:border-purple-600"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-white">{ds.name}</h3>
                <span className="rounded bg-purple-900/50 px-2 py-0.5 text-xs text-purple-300">
                  {ds.geometry_type || "unknown"}
                </span>
              </div>
              {ds.description && (
                <p className="mt-2 text-sm text-gray-400 line-clamp-2">{ds.description}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-1">
                {ds.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-300"
                  >
                    {tag}
                  </span>
                ))}
                <button
                  onClick={() => addTag(ds.id)}
                  className="rounded-full border border-dashed border-gray-600 px-2 py-0.5 text-xs text-gray-500 hover:border-purple-500 hover:text-purple-400"
                >
                  + tag
                </button>
              </div>
              <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                <span>SRID: {ds.srid || 4326}</span>
                {ds.feature_count !== undefined && (
                  <span>{ds.feature_count.toLocaleString()} features</span>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <a
                  href={`${PTOLEMY_URL}/branches/${ds.id}/export/geojson`}
                  className="flex items-center gap-1 rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
                >
                  <Download className="h-3 w-3" />
                  GeoJSON
                </a>
                <a
                  href={`${PTOLEMY_URL}/branches/${ds.id}/tiles/{z}/{x}/{y}`}
                  className="flex items-center gap-1 rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
                >
                  MVT
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
