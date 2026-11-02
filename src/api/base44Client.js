// Drop-in replacement for the Base44 SDK client. It exposes the same surface the
// app already uses (auth, entities, functions, integrations, app) but talks to
// this project's own API server in server/index.js instead of Base44.

// Clerk session token for the signed-in user (null when signed out or Clerk
// has not loaded yet). Clerk sets window.Clerk once it has loaded.
export async function getAccessToken() {
  try {
    return (await window.Clerk?.session?.getToken()) || null;
  } catch {
    return null;
  }
}

// One id per browser tab, sent as X-Session-Id so the server can tell what
// each session cost in paid API calls.
export function sessionId() {
  try {
    let id = window.sessionStorage.getItem('ecoestate_session_id');
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem('ecoestate_session_id', id);
    }
    return id;
  } catch {
    return null;
  }
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
    this.response = { status, data };
  }
}

async function request(method, path, body, { raw = false } = {}) {
  const headers = {};
  const sid = sessionId();
  if (sid) headers['X-Session-Id'] = sid;
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const message = (data && (data.error || data.message)) || res.statusText || 'Request failed';
    throw new ApiError(message, res.status, data);
  }
  return raw ? { data, status: res.status } : data;
}

// Lists come back as arrays that also expose `.items`, so both
// `const { items } = await X.filter()` and `(await X.filter())[0]` work.
function asList(items) {
  const list = Array.isArray(items) ? items : [];
  Object.defineProperty(list, 'items', { value: list, enumerable: false });
  return list;
}

function entityApi(name) {
  const base = `/entities/${encodeURIComponent(name)}`;
  const query = async (q = {}, opts = {}) => {
    const { sort, limit, skip } = typeof opts === 'string' ? { sort: opts } : opts || {};
    return asList(await request('POST', `${base}/query`, { query: q, sort, limit, skip }));
  };
  return {
    filter: (q, sortOrOpts, limit, skip) =>
      typeof sortOrOpts === 'string' ? query(q, { sort: sortOrOpts, limit, skip }) : query(q, sortOrOpts),
    list: (sort, limit, skip) => query({}, { sort, limit, skip }),
    get: (id) => request('GET', `${base}/${encodeURIComponent(id)}`),
    create: (data) => request('POST', base, data),
    bulkCreate: (rows) => request('POST', `${base}/bulk`, rows),
    update: (id, data) => request('PATCH', `${base}/${encodeURIComponent(id)}`, data),
    updateMany: (q, update) => request('POST', `${base}/update-many`, { query: q, update }),
    delete: (id) => request('DELETE', `${base}/${encodeURIComponent(id)}`),
    deleteMany: (q) => request('POST', `${base}/delete-many`, { query: q }),
  };
}

const entities = new Proxy({}, { get: (_, name) => (typeof name === 'string' ? entityApi(name) : undefined) });

const auth = {
  me: () => request('GET', '/auth/me'),
  updateMe: (data) => request('PATCH', '/auth/me', data),
  // Permanently deletes the signed-in account (body must confirm with 'DELETE').
  deleteMe: () => request('DELETE', '/auth/me', { confirm: 'DELETE' }),
  async isAuthenticated() {
    if (!(await getAccessToken())) return false;
    try {
      await auth.me();
      return true;
    } catch {
      return false;
    }
  },
  // Sign out of Clerk, then go to redirectUrl (default "/").
  async logout(redirectUrl = '/') {
    try {
      await window.Clerk?.signOut();
    } catch {
      /* ignore */
    }
    window.location.href = redirectUrl;
  },
  redirectToLogin(returnTo = window.location.href) {
    const url = new URL(returnTo, window.location.origin);
    window.location.href = `/login?redirect_url=${encodeURIComponent(url.pathname + url.search)}`;
  },
};

const functions = {
  invoke: (name, payload = {}) => request('POST', `/functions/${encodeURIComponent(name)}`, payload, { raw: true }),
};

function upload(path, file) {
  const form = new FormData();
  form.append('file', file);
  return request('POST', path, form);
}

const integrations = {
  Core: {
    UploadFile: ({ file }) => upload('/files/public', file),
    UploadPrivateFile: ({ file }) => upload('/files/private', file),
    CreateFileSignedUrl: ({ file_uri, expires_in }) => request('POST', '/files/signed-url', { file_uri, expires_in }),
  },
};

const app = {
  getPublicSettings: () => request('GET', '/app/public-settings'),
};

export const base44 = { auth, entities, functions, integrations, app };
export default base44;
