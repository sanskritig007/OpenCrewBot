// Ambient global definitions for Node.js and Fetch built-ins

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
}

declare var process: {
  env: NodeJS.ProcessEnv;
  cwd(): string;
  argv: string[];
  pid: number;
  exit(code?: number): never;
};

declare var fetch: (
  input: string | URL | Request,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | FormData | Blob;
    signal?: any;
  }
) => Promise<any>;

declare var AbortSignal: {
  timeout(ms: number): any;
};
