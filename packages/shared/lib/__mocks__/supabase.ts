// Manual mock for lib/supabase.ts — the real module reads process.env at
// import time (EXPO_PUBLIC_SUPABASE_URL etc.) and throws if unset, which it
// is under Jest. Any test file that imports lib/api.ts (even transitively)
// needs `jest.mock('../supabase')` so this is used instead of the real client.
const chain: any = {
  from: jest.fn(() => chain),
  select: jest.fn(() => chain),
  eq: jest.fn(() => chain),
  order: jest.fn(() => chain),
  upsert: jest.fn(() => chain),
  maybeSingle: jest.fn(),
  single: jest.fn(),
  rpc: jest.fn(),
}

export const supabase = chain
export const publicDb = chain
