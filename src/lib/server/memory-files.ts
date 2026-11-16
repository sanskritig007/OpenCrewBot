// Module E: Persistent Markdown Memory Architecture
// Multi-tier persistent memory: Individual Bot Memory, Shared Room Memory,
// Shared Project Memory, User Preferences, and Full Provenance Audit Log.

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, rmSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, WORKSPACES_DIR } from "./config.ts";
import type { MemoryProvenance } from "../shared/types.ts";

export const ROOMS_DIR = join(DATA_DIR, "rooms");
export const PROJECTS_DIR = join(DATA_DIR, "projects");
export const PROVENANCE_DIR = join(DATA_DIR, "provenance");
export const USER_PREFERENCES_PATH = join(DATA_DIR, "USER_PREFERENCES.md");
export const PROVENANCE_LOG_PATH = join(PROVENANCE_DIR, "PROVENANCE.jsonl");

// Ensure directories exist
mkdirSync(ROOMS_DIR, { recursive: true });
mkdirSync(PROJECTS_DIR, { recursive: true });
mkdirSync(PROVENANCE_DIR, { recursive: true });

/** How much of memory goes into the prompt. */
export const MEMORY_PROMPT_LIMIT = { lines: 200, bytes: 16 * 1024 };

const SECRET_PATTERNS: RegExp[] = [
  /\b(sk|pk|rk|tvly|ak|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{12,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S+/gi,
];

/** Redact sensitive credentials before storing to disk. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (m) => `«redacted ${m.length} chars»`);
  }
  return out;
}

/** Atomic file write using temporary file rename. */
function atomicWrite(filePath: string, content: string): string {
  const clean = redactSecrets(content);
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, clean, { mode: 0o600, encoding: "utf8" });
  renameSync(tmp, filePath);
  return clean;
}

// ==========================================
// 1. INDIVIDUAL AGENT MEMORY
// ==========================================

export function workspaceDir(botId: string): string {
  const dir = join(WORKSPACES_DIR, botId.replace(/[^a-zA-Z0-9_-]/g, ""));
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function deleteWorkspace(botId: string): void {
  const dir = workspaceDir(botId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function memoryPath(botId: string): string {
  return join(workspaceDir(botId), "MEMORY.md");
}

export function readMemory(botId: string): string {
  const path = memoryPath(botId);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function writeMemory(botId: string, content: string, reason?: string): string {
  const path = memoryPath(botId);
  const clean = atomicWrite(path, content);
  
  // Record provenance
  recordProvenance({
    id: `prov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    scope: "individual",
    targetId: botId,
    content: clean.slice(0, 300),
    reason: reason || "Direct memory update",
    source: "user_direct",
    timestamp: new Date().toISOString(),
  });

  return clean;
}

export function appendMemory(botId: string, note: string, section?: string, reason?: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const line = `- ${note.trim().replace(/\n+/g, " ")} _(${today})_`;
  let content = readMemory(botId).trimEnd();

  if (section) {
    const heading = `## ${section.trim()}`;
    const idx = content.split("\n").findIndex((l) => l.trim().toLowerCase() === heading.toLowerCase());
    if (idx >= 0) {
      const lines = content.split("\n");
      let end = idx + 1;
      while (end < lines.length && !lines[end].startsWith("## ")) end++;
      while (end > idx + 1 && lines[end - 1].trim() === "") end--;
      lines.splice(end, 0, line);
      content = lines.join("\n");
    } else {
      content = `${content}${content ? "\n\n" : ""}${heading}\n${line}`;
    }
  } else {
    const afterHeading = /(^|\n)#[^\n]*$/.test(content);
    content = `${content}${content ? (afterHeading ? "\n\n" : "\n") : ""}${line}`;
  }

  recordProvenance({
    id: `prov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    scope: "individual",
    targetId: botId,
    content: note,
    reason: reason || `Appended to section: ${section || "General"}`,
    source: "agent_inference",
    timestamp: new Date().toISOString(),
  });

  return atomicWrite(memoryPath(botId), `${content}\n`);
}

export function editMemory(botId: string, find: string, replace: string, reason?: string): { ok: boolean; reason?: string } {
  const content = readMemory(botId);
  const count = content.split(find).length - 1;
  if (!find || count === 0) return { ok: false, reason: "That exact text isn't in MEMORY.md." };
  if (count > 1) return { ok: false, reason: `That text appears ${count} times. Include more context.` };

  const updated = content.replace(find, replace);
  atomicWrite(memoryPath(botId), updated);

  recordProvenance({
    id: `prov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    scope: "individual",
    targetId: botId,
    content: `Replaced "${find}" with "${replace}"`,
    reason: reason || "Manual memory correction/adaptation",
    source: "manual_file_edit",
    timestamp: new Date().toISOString(),
  });

  return { ok: true };
}

// ==========================================
// 2. SHARED ROOM MEMORY
// ==========================================

export function roomMemoryPath(roomId: string): string {
  const dir = join(ROOMS_DIR, roomId.replace(/[^a-zA-Z0-9_-]/g, ""));
  mkdirSync(dir, { recursive: true });
  return join(dir, "ROOM_MEMORY.md");
}

export function readRoomMemory(roomId: string): string {
  const path = roomMemoryPath(roomId);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function writeRoomMemory(roomId: string, content: string, reason?: string): string {
  const path = roomMemoryPath(roomId);
  const clean = atomicWrite(path, content);
  
  recordProvenance({
    id: `prov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    scope: "room",
    targetId: roomId,
    content: clean.slice(0, 300),
    reason: reason || "Room shared memory update",
    source: "agent_inference",
    timestamp: new Date().toISOString(),
  });

  return clean;
}

// ==========================================
// 3. SHARED PROJECT MEMORY
// ==========================================

export function projectMemoryPath(projectId: string = "default"): string {
  const dir = join(PROJECTS_DIR, projectId.replace(/[^a-zA-Z0-9_-]/g, ""));
  mkdirSync(dir, { recursive: true });
  return join(dir, "PROJECT_MEMORY.md");
}

export function readProjectMemory(projectId: string = "default"): string {
  const path = projectMemoryPath(projectId);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function writeProjectMemory(projectId: string = "default", content: string, reason?: string): string {
  const path = projectMemoryPath(projectId);
  const clean = atomicWrite(path, content);

  recordProvenance({
    id: `prov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    scope: "project",
    targetId: projectId,
    content: clean.slice(0, 300),
    reason: reason || "Project context update",
    source: "user_direct",
    timestamp: new Date().toISOString(),
  });

  return clean;
}

// ==========================================
// 4. USER PREFERENCES
// ==========================================

export function readUserPreferences(): string {
  return existsSync(USER_PREFERENCES_PATH) ? readFileSync(USER_PREFERENCES_PATH, "utf8") : "";
}

export function writeUserPreferences(content: string, reason?: string): string {
  const clean = atomicWrite(USER_PREFERENCES_PATH, content);

  recordProvenance({
    id: `prov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    scope: "individual",
    targetId: "user_preferences",
    content: clean.slice(0, 300),
    reason: reason || "User preference updated",
    source: "user_direct",
    timestamp: new Date().toISOString(),
  });

  return clean;
}

// ==========================================
// 5. MEMORY PROVENANCE AUDIT LOG
// ==========================================

export function recordProvenance(entry: MemoryProvenance): void {
  try {
    const line = JSON.stringify(entry) + "\n";
    appendFileSync(PROVENANCE_LOG_PATH, line, { encoding: "utf8" });
  } catch {
    // Fail-safe: provenance logging should not crash memory operations
  }
}

export function listProvenance(filter?: { scope?: string; targetId?: string }): MemoryProvenance[] {
  if (!existsSync(PROVENANCE_LOG_PATH)) return [];
  try {
    const lines = readFileSync(PROVENANCE_LOG_PATH, "utf8").split("\n").filter(Boolean);
    const records: MemoryProvenance[] = lines.map(l => JSON.parse(l));
    return records.filter(r => {
      if (filter?.scope && r.scope !== filter.scope) return false;
      if (filter?.targetId && r.targetId !== filter.targetId) return false;
      return true;
    });
  } catch {
    return [];
  }
}

// ==========================================
// 6. ASSEMBLE FULL CONTEXT FOR PROMPT
// ==========================================

export function assembleMemoryContext(botId: string, roomId?: string, projectId: string = "default"): string {
  const sections: string[] = [];

  const userPrefs = readUserPreferences().trim();
  if (userPrefs) {
    sections.push(`[User Preferences & Communication Rules]\n${userPrefs}`);
  }

  const projMem = readProjectMemory(projectId).trim();
  if (projMem) {
    sections.push(`[Project Context]\n${projMem}`);
  }

  if (roomId) {
    const roomMem = readRoomMemory(roomId).trim();
    if (roomMem) {
      sections.push(`[Shared Room Memory]\n${roomMem}`);
    }
  }

  const botMem = readMemory(botId).trim();
  if (botMem) {
    sections.push(`[Individual Agent Memory]\n${botMem}`);
  }

  return sections.join("\n\n---\n\n");
}
