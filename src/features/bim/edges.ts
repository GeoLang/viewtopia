import { EdgeDisplayMode } from 'cesium';
import type { Cesium3DTile, Cesium3DTileset } from 'cesium';
import { requireBimSession, useBimModeStore } from './store';

const EDGE_EXTENSION = 'EXT_mesh_primitive_edge_visibility';
// the ascii bytes of "glTF" and "JSON" read as little-endian integers, from the glb layout in the glTF 2.0 spec
const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_JSON_LENGTH_OFFSET = 12;
const GLB_JSON_TYPE_OFFSET = 16;
const GLB_JSON_OFFSET = 20;

export type EdgeData = 'present' | 'absent' | 'not loaded';

interface GltfMeshes {
  meshes?: { primitives?: { extensions?: Record<string, unknown> }[] }[];
}

function firstMeshContentUrl(tile: Cesium3DTile): string | null {
  const { content } = tile;
  // cesium's placeholder content for an unloaded tile answers zero triangles and no url
  if (content.trianglesLength > 0 && content.url) return content.url;
  for (const child of tile.children) {
    const url = firstMeshContentUrl(child);
    if (url !== null) return url;
  }
  return null;
}

async function readGlbJson(url: string): Promise<GltfMeshes> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`the tile at ${url} answered HTTP ${response.status}`);
  const view = new DataView(await response.arrayBuffer());
  const isGlb =
    view.byteLength >= GLB_JSON_OFFSET &&
    view.getUint32(0, true) === GLB_MAGIC &&
    view.getUint32(GLB_JSON_TYPE_OFFSET, true) === GLB_JSON_CHUNK_TYPE;
  if (!isGlb) throw new Error(`the tile at ${url} is not a binary glTF`);
  const jsonBytes = new Uint8Array(view.buffer, GLB_JSON_OFFSET, view.getUint32(GLB_JSON_LENGTH_OFFSET, true));
  return JSON.parse(new TextDecoder().decode(jsonBytes)) as GltfMeshes;
}

export async function readEdgeData(tileset: Cesium3DTileset): Promise<EdgeData> {
  const url = firstMeshContentUrl(tileset.root);
  if (url === null) return 'not loaded';
  // cesium records edge data on Model, and Cesium3DTileContent exposes no public way to it
  const { meshes = [] } = await readGlbJson(url);
  const hasEdges = meshes.some(({ primitives = [] }) =>
    primitives.some(({ extensions }) => extensions?.[EDGE_EXTENSION] !== undefined),
  );
  return hasEdges ? 'present' : 'absent';
}

export function setEdgesShown({ shown }: { shown: boolean }): void {
  const { tileset } = requireBimSession();
  tileset.edgeDisplayMode = shown ? EdgeDisplayMode.SURFACES_AND_EDGES : EdgeDisplayMode.SURFACES_ONLY;
  useBimModeStore.setState({ edgesShown: shown });
}
