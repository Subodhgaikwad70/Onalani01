export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export async function apiJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: { message?: string } }).error?.message === "string"
        ? (data as { error: { message: string } }).error.message
        : res.statusText;
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiJson<T>(path, { method: "GET", credentials: "include" });
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: "POST",
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: "PATCH",
    credentials: "include",
    body: JSON.stringify(body),
  });
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: "PUT",
    credentials: "include",
    body: JSON.stringify(body),
  });
}

export async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: "DELETE",
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
