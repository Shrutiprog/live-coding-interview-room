async function request(method, url, body, headers = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

export const api = {
  createRoom: (payload) => request('POST', '/api/rooms', payload),
  getRoom: (id) => request('GET', `/api/rooms/${id}`),
  getLanguages: () => request('GET', '/api/languages'),
  execute: (payload) => request('POST', '/api/execute', payload),
  submitFeedback: (payload, hostToken) => request('POST', '/api/feedback', payload, { 'x-host-token': hostToken }),
};

// The interviewer's secret token is kept in this browser only.
export const hostKey = (roomId) => `ilr_host_${roomId}`;
