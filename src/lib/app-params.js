import { getAccessToken } from '@/api/base44Client';

// Async: the Clerk session token is fetched on demand.
export const appParams = {
	getToken: getAccessToken,
}
