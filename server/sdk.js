// Server-side stand-in for `@base44/sdk` and `base44:runtime`, so the backend
// functions in server/functions run with their original code.
import { userFromHeader } from './auth.js';
import { entityService, HttpError } from './entities.js';
import { saveFile, signedUrl } from './files.js';
import { callConnectorApi, invokeLLM } from './integrations.js';

export const secrets = { get: (name) => process.env[name] };

// Arrays that also expose `.items`, matching both shapes the functions use.
function asList(items) {
  Object.defineProperty(items, 'items', { value: items, enumerable: false });
  return items;
}

function entitiesFor(getUser, service) {
  return new Proxy(
    {},
    {
      get: (_, name) => {
        if (typeof name !== 'string') return undefined;
        const svc = async () => entityService(name, await getUser(), { service });
        return {
          filter: async (q, opts) => asList(await (await svc()).filter(q, typeof opts === 'string' ? { sort: opts } : opts)),
          list: async (sort, limit) => asList(await (await svc()).filter({}, { sort, limit })),
          get: async (id) => (await svc()).get(id),
          create: async (data) => (await svc()).create(data),
          bulkCreate: async (rows) => (await svc()).bulkCreate(rows),
          update: async (id, data) => (await svc()).update(id, data),
          updateMany: async (q, u) => (await svc()).updateMany(q, u),
          delete: async (id) => (await svc()).delete(id),
          deleteMany: async (q) => (await svc()).deleteMany(q),
        };
      },
    }
  );
}

const Core = {
  InvokeLLM: (params) => invokeLLM(params),
  async UploadPrivateFile({ file }) {
    const buffer = Buffer.from(await file.arrayBuffer());
    return saveFile(buffer, { name: file.name, mime: file.type || 'application/octet-stream' });
  },
  async UploadFile({ file }) {
    const buffer = Buffer.from(await file.arrayBuffer());
    return saveFile(buffer, { name: file.name, mime: file.type || 'application/octet-stream', isPublic: true });
  },
  CreateFileSignedUrl: async ({ file_uri, expires_in }) => ({ signed_url: signedUrl(file_uri, expires_in) }),
};

export function createClientFromRequest(req) {
  let cached;
  const getUser = () => (cached ??= userFromHeader(req.headers.get('authorization')));
  return {
    auth: {
      async me() {
        const user = await getUser();
        if (!user) throw new HttpError(401, 'Authentication required');
        return user;
      },
      isAuthenticated: async () => !!(await getUser()),
    },
    entities: entitiesFor(getUser, false),
    integrations: { Core },
    asServiceRole: {
      entities: entitiesFor(getUser, true),
      integrations: { Core },
      connectors: { callApi: callConnectorApi },
    },
  };
}
