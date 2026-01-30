/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readFileSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';

const WriteFile = (path: string, data: string) => {
  return fs.writeFile(path, data);
};

const ReadFile = (path: string) => {
  return fs.readFile(path);
};

const RmFile = (path: string) => {
  return fs.rm(path, { recursive: true });
};

const CopyFile = (src: string, dest: string) => {
  return fs.copyFile(src, dest);
};

export const FileBuilder = (file: string) => {
  const stack: (() => Promise<unknown>)[] = [];
  let isRunning = false;
  const run = () => {
    if (isRunning || !stack.length) return;
    isRunning = true;
    void stack
      .shift()?.()
      .finally(() => {
        isRunning = false;
        run();
      });
  };
  const pushStack = <R>(fn: () => Promise<R>) => {
    return new Promise<R>((resolve, reject) => {
      stack.push(() => fn().then(resolve).catch(reject));
      run();
    });
  };
  return {
    path: file,
    write(data: string) {
      return pushStack(() => WriteFile(file, data));
    },
    read() {
      return pushStack(() =>
        ReadFile(file).then((data) => {
          return data.toString();
        })
      );
    },
    copy(dist: string) {
      return pushStack(() => CopyFile(file, dist));
    },
    rm() {
      return pushStack(() => RmFile(file));
    },
    exists() {
      return existsSync(file);
    },
  };
};

export const JsonFileBuilder = <S extends object = Record<string, unknown>>(path: string) => {
  const file = FileBuilder(path);
  const encode = (data: unknown) => {
    return btoa(encodeURIComponent(String(data)));
  };

  const decode = (base64: string) => {
    return decodeURIComponent(atob(base64));
  };

  const toJson = async (): Promise<S> => {
    try {
      if (!file.exists()) return {} as S;

      const result = await file.read();
      if (!result) return {} as S;

      // 验证文件内容不为空且不是损坏的base64
      if (result.trim() === '') {
        console.warn(`[Storage] Empty file detected: ${path}`);
        return {} as S;
      }

      const decoded = decode(result);
      if (!decoded || decoded.trim() === '') {
        console.warn(`[Storage] Empty or corrupted content after decode: ${path}`);
        return {} as S;
      }

      const parsed = JSON.parse(decoded) as S;

      // 额外验证：如果是聊天历史文件且解析结果为空对象，警告用户
      if (path.includes('chat.txt') && Object.keys(parsed).length === 0) {
        console.warn(`[Storage] Chat history file appears to be empty: ${path}`);
      }

      return parsed;
    } catch (e) {
      // console.error(`[Storage] Error reading/parsing file ${path}:`, e);
      return {} as S;
    }
  };

  const setJson = async (data: S): Promise<S> => {
    try {
      await file.write(encode(JSON.stringify(data)));
      return data;
    } catch (e) {
      return Promise.reject(e);
    }
  };

  const toJsonSync = (): S => {
    try {
      if (!file.exists()) return {} as S;
      return JSON.parse(decode(readFileSync(path).toString())) as S;
    } catch (e) {
      return {} as S;
    }
  };

  return {
    path,
    toJson,
    setJson,
    toJsonSync,
    async set<K extends keyof S>(key: K, value: Awaited<S>[K]): Promise<Awaited<S>[K]> {
      const data = await toJson();
      data[key] = value;
      await setJson(data);
      return value;
    },
    async get<K extends keyof S>(key: K): Promise<Awaited<S>[K]> {
      const data = await toJson();
      return data[key] as Awaited<S>[K];
    },
    async remove<K extends keyof S>(key: K) {
      const data = await toJson();
      delete data[key];
      return setJson(data);
    },
    clear() {
      return setJson({} as S);
    },
    getSync<K extends keyof S>(key: K): S[K] {
      const data = toJsonSync();
      return data[key];
    },
    update<K extends keyof S>(key: K, updateFn: (value: S[K], data: S) => Promise<S[K]>) {
      return toJson().then((data) => {
        return updateFn(data[key], data).then((value) => {
          data[key] = value;
          return setJson(data);
        });
      });
    },
    backup(fullName: string) {
      const dir = nodePath.dirname(fullName);
      if (!existsSync(dir)) {
        // We can't use mkdirSync here as it's not imported.
        // Assuming caller ensures dir exists or we rely on fs/promises mkdir
        return fs.mkdir(dir, { recursive: true }).then(() => file.copy(fullName).then(() => file.rm()));
      }
      return file.copy(fullName).then(() => file.rm());
    },
  };
};

const nodePath = path;
