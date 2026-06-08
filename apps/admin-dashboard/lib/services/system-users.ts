import { SYSTEM_USERS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type SystemUser = {
  id: string;
  email: string;
  name: string | null;
  role?: string | null;
  createdAt?: string;
};

export async function getSystemUsers(): Promise<SystemUser[]> {
  return jsonFetch<SystemUser[]>(SYSTEM_USERS_PREFIX, {
    method: "GET",
  });
}

export async function createSystemUser(input: {
  email: string;
  password: string;
  name?: string;
  role?: string;
}) {
  return jsonFetch<SystemUser>(SYSTEM_USERS_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function updateSystemUser(
  id: string,
  input: { email?: string; password?: string; name?: string; role?: string },
) {
  return jsonFetch<SystemUser>(`${SYSTEM_USERS_PREFIX}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deleteSystemUser(id: string) {
  return jsonFetch<{ deleted: boolean }>(`${SYSTEM_USERS_PREFIX}/${id}`, {
    method: "DELETE",
  });
}
