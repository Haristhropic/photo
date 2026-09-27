export type AdminRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Send as multipart instead of JSON. */
  form?: FormData;
};

export async function adminRequest<T>(
  path: string,
  options: AdminRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, form } = options;

  const response = await fetch(path, {
    method,
    ...(form
      ? { body: form }
      : body !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Permintaan gagal (${response.status})`;
    throw new Error(message);
  }

  return data as T;
}
