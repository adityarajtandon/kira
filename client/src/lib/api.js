const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
export class ApiError extends Error { constructor(message, code, status) { super(message); this.code = code; this.status = status; } }
export async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, { credentials: 'include', headers: { 'Content-Type':'application/json', ...options.headers }, ...options, body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error?.message || 'Something went wrong.', payload.error?.code, response.status);
  return payload;
}
export const socketUrl = API_URL.replace(/\/api\/?$/, '');

