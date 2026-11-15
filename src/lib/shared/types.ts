// Types shared by the server and the browser. Everything here is plain JSON.

export type ApprovalMode = "ask" | "controlled" | "full";

export interface BotTools {
  /** Tavily search, extract and crawl. */
  webSearch: boolean;
  /** Read and update the bot's MEMORY.md. */
  memory: boolean;
  /** Let the model write one TypeScript function that calls several tools at once. */
  codeMode: boolean;
  /** A real browser (Playwright) the bot can drive. */
  browser: boolean;
  /** The bot may stop and ask you a question with a card in chat. */
  askUser: boolean;
}

export interface Bot {
  id: string;
  name: string;
  /** Lowercase handle used for @mentions in rooms. */
  handle: string;
  title: string;
  description: string;
  instructions: string;
  emoji: string;
  color: string;
  model: string;
  tools: BotTools;
  /** Connection ids this bot may use: `composio:<toolkit>` or `mcp:<serverId>`. */
  connections: string[];
  approval: ApprovalMode;
  pinned: boolean;
  createdAt: string;
}

export type BotInput = Omit<Bot, "id" | "createdAt" | "handle" | "connections"> & { handle?: string; connections?: string[] };

export type RoomResponder = "auto" | "lead" | "everyone";

export interface Room {
  id: string;
  name: string;
  topic: string;
  emoji: string;
  memberIds: string[];
  leadId: string | null;
  responder: RoomResponder;
  pinned: boolean;
  createdAt: string;
}

export type RoomInput = Omit<Room, "id" | "createdAt">;

/** `dm:<botId>` or `room:<roomId>`. */
export type ConversationId = string;

export interface Source {
  title: string;
  url: string;
}

export type ToolStatus = "running" | "awaiting-approval" | "done" | "error" | "denied";

export type Part =
  | { kind: "text"; text: string }
  | { kind: "reasoning"; text: string }
  | {
      kind: "tool";
      toolCallId: string;
      name: string;
      label: string;
      detail?: string;
      status: ToolStatus;
      preview?: string;
      sources?: Source[];
    }
  | {
      kind: "question";
      toolCallId: string;
      question: string;
      options: { label: string; description?: string }[];
      answer?: string;
    };

export type MessageStatus = "streaming" | "done" | "error" | "stopped";

export interface RouteNote {
  by: "mention" | "jev" | "lead" | "everyone" | "handoff";
  confidence?: number;
}

export interface ChatMessage {
  id: string;
  conversationId: ConversationId;
  role: "user" | "bot" | "notice";
  botId?: string;
  createdAt: string;
  status: MessageStatus;
  parts: Part[];
  model?: string;
  usage?: { input: number; output: number; costUsd: number | null };
  route?: RouteNote;
  error?: string;
}

export interface ConversationSummary {
  id: ConversationId;
  lastMessage?: { text: string; createdAt: string; author: string };
  running: string[];
  unread: number;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  context: number;
  tools: boolean;
  reasoning: boolean;
  vision: boolean;
  inputPerM: number | null;
  outputPerM: number | null;
  live: boolean;
}

export interface AppStatus {
  mock: boolean;
  keys: { nebius: boolean; tavily: boolean; jev: boolean; browserbase: boolean; composio: boolean };
  dataDir: string;
}

/** Events the server pushes to the browser over one SSE stream. */
export type ServerEvent =
  | { type: "message"; message: ChatMessage }
  | { type: "delta"; conversationId: ConversationId; messageId: string; partIndex: number; kind: "text" | "reasoning"; delta: string }
  | { type: "running"; conversationId: ConversationId; botIds: string[] }
  | { type: "bots-changed" }
  | { type: "rooms-changed" }
  | { type: "memory-changed"; botId: string }
  /** A bot's Browserbase live view opened (url) or closed (null). */
  | { type: "browser-session"; botId: string; liveUrl: string | null }
  | { type: "connections-changed" };

/** An app from Composio's catalog, with this install's connection state. */
export interface ComposioApp {
  slug: string;
  name: string;
  logo?: string;
  connected: boolean;
}

/** A remote MCP server you added. The token never leaves the server. */
export interface McpServer {
  id: string;
  name: string;
  url: string;
  hasToken: boolean;
  headerNames: string[];
}

export interface ConnectionsState {
  composio: { enabled: boolean; apps: ComposioApp[]; error?: string };
  mcpServers: McpServer[];
}

/** Something a bot can be given access to. */
export interface ConnectionOption {
  id: string;
  name: string;
  kind: "composio" | "mcp";
  logo?: string;
}

// ==========================================
// OpenCrewBot 2.0 Autonomous Workforce Types
// ==========================================

export type TaskStatus =
  | "pending"
  | "running"
  | "awaiting-approval"
  | "completed"
  | "failed"
  | "cancelled";

export interface TaskNode {
  id: string;
  title: string;
  description: string;
  assignedBotId: string;
  assignedRole: string;
  preferredModel?: string;
  dependencies: string[]; // IDs of tasks that must finish before this task starts
  status: TaskStatus;
  approvalRequired: boolean;
  approvalStatus?: "pending" | "approved" | "rejected";
  approvalPrompt?: string; // Multilingual prompt explaining the sensitive action
  inputs?: Record<string, unknown>;
  output?: string;
  error?: string;
  retryCount: number;
  maxRetries: number;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskPlan {
  id: string;
  conversationId: ConversationId;
  goal: string;
  detectedLanguage: "hinglish" | "hindi" | "english" | "multilingual";
  status: "planning" | "executing" | "paused" | "completed" | "failed";
  nodes: TaskNode[];
  finalDeliverable?: string;
  createdAt: string;
  completedAt?: string;
}

export interface MemoryProvenance {
  id: string;
  scope: "individual" | "room" | "project";
  targetId: string; // botId, roomId, or projectId
  key?: string;
  content: string;
  reason: string; // "Why" was it remembered
  source: "user_direct" | "agent_inference" | "manual_file_edit";
  timestamp: string; // "When"
}

export interface SkillDefinition {
  id: string;
  name: string;
  category: "research" | "analysis" | "engineering" | "creative" | "marketing";
  description: string;
  systemPromptAddon: string;
  requiredTools: string[];
}

