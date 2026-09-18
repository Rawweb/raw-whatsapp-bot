import {
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
} from '@whiskeysockets/baileys';
import { AuthState } from '../models/AuthState.js';

async function readData(id: string): Promise<any> {
  const doc = await AuthState.findById(id).lean();
  if (!doc) return null;
  return JSON.parse(JSON.stringify(doc.value), BufferJSON.reviver);
}

async function writeData(id: string, value: unknown): Promise<void> {
  const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
  await AuthState.findByIdAndUpdate(
    id,
    { value: serialized },
    { upsert: true },
  );
}

async function removeData(id: string): Promise<void> {
  await AuthState.findByIdAndDelete(id);
}

export async function useMongoDBAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const creds = (await readData('creds')) ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: any } = {};
          await Promise.all(
            ids.map(async (id) => {
              const value = await readData(`${type}-${id}`);
              if (value) {
                data[id] = value;
              }
            }),
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const type in data) {
            const typedKey = type as keyof typeof data;
            const entries = data[typedKey];
            if (!entries) continue;
            for (const id in entries) {
              const value = entries[id];
              const key = `${type}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData('creds', creds),
  };
}
