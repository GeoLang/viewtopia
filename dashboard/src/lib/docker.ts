import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Execute a docker compose command in the platform directory.
 */
export async function dockerCompose(
  args: string,
  composeDir: string,
  composeFile: string
): Promise<{ stdout: string; stderr: string }> {
  const cmd = `docker compose -f ${composeFile} ${args}`;
  return execAsync(cmd, { cwd: composeDir, timeout: 30_000 });
}

/**
 * Get container status for all services.
 */
export async function getContainerStatuses(
  composeDir: string,
  composeFile: string
): Promise<
  Array<{
    name: string;
    state: string;
    status: string;
    health: string;
  }>
> {
  try {
    const { stdout } = await dockerCompose(
      `ps --format json`,
      composeDir,
      composeFile
    );
    // docker compose ps --format json returns one JSON object per line
    const lines = stdout.trim().split("\n").filter(Boolean);
    return lines.map((line) => {
      const obj = JSON.parse(line);
      return {
        name: obj.Service || obj.Name,
        state: obj.State || "unknown",
        status: obj.Status || "",
        health: obj.Health || "",
      };
    });
  } catch {
    return [];
  }
}

/**
 * Get logs for a specific service.
 */
export async function getServiceLogs(
  service: string,
  composeDir: string,
  composeFile: string,
  tail: number = 100
): Promise<string> {
  try {
    const { stdout, stderr } = await dockerCompose(
      `logs --no-color --tail ${tail} ${service}`,
      composeDir,
      composeFile
    );
    return stdout || stderr;
  } catch (e: unknown) {
    return (e as Error).message || "Failed to retrieve logs";
  }
}

/**
 * Start/stop/restart a service.
 */
export async function controlService(
  service: string,
  action: "start" | "stop" | "restart",
  composeDir: string,
  composeFile: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const { stdout, stderr } = await dockerCompose(
      `${action} ${service}`,
      composeDir,
      composeFile
    );
    return { ok: true, message: stdout || stderr || `${action} successful` };
  } catch (e: unknown) {
    return { ok: false, message: (e as Error).message };
  }
}

/**
 * Get resource usage stats via docker stats.
 */
export async function getResourceStats(
  composeDir: string,
  composeFile: string
): Promise<
  Array<{
    name: string;
    cpu: string;
    memory: string;
    memLimit: string;
    netIO: string;
  }>
> {
  try {
    // Get container names from compose
    const { stdout: psOut } = await dockerCompose(
      `ps -q`,
      composeDir,
      composeFile
    );
    const ids = psOut.trim().split("\n").filter(Boolean);
    if (ids.length === 0) return [];

    const { stdout } = await execAsync(
      `docker stats --no-stream --format '{"name":"{{.Name}}","cpu":"{{.CPUPerc}}","memory":"{{.MemUsage}}","netIO":"{{.NetIO}}"}' ${ids.join(" ")}`,
      { timeout: 15_000 }
    );
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const obj = JSON.parse(line);
        const [mem, memLimit] = (obj.memory || "").split(" / ");
        return {
          name: obj.name,
          cpu: obj.cpu,
          memory: mem || "0",
          memLimit: memLimit || "0",
          netIO: obj.netIO,
        };
      });
  } catch {
    return [];
  }
}
