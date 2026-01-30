/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPairingRequest, IChannelPluginConfig, IChannelSession, IChannelUser, PluginStatus } from '@/channels/types';
import { getDataPath } from '@process/utils';
import { JsonFileBuilder } from '@process/utils/jsonBuilder';
import fs from 'fs';
import path from 'path';
import type { IDatabase } from './interfaces';
import type { IPaginatedResult, IQueryResult, IUser, TChatConversation, TMessage } from './types';

export class FileDatabase implements IDatabase {
  private usersFile;
  private conversationsFile;
  private pluginsFile;
  private assistantUsersFile;
  private assistantSessionsFile;
  private pairingCodesFile;

  private messagesDir: string;
  private readonly defaultUserId = 'system_default_user';

  constructor() {
    console.log('[FileDatabase] Initializing file-based storage...');
    const dataPath = getDataPath();

    // Initialize file builders
    this.usersFile = JsonFileBuilder<Record<string, IUser>>(path.join(dataPath, 'users.json'));
    this.conversationsFile = JsonFileBuilder<Record<string, TChatConversation>>(path.join(dataPath, 'conversations.json'));
    this.pluginsFile = JsonFileBuilder<Record<string, IChannelPluginConfig>>(path.join(dataPath, 'plugins.json'));

    this.assistantUsersFile = JsonFileBuilder<Record<string, IChannelUser>>(path.join(dataPath, 'assistant_users.json'));
    this.assistantSessionsFile = JsonFileBuilder<Record<string, IChannelSession>>(path.join(dataPath, 'assistant_sessions.json'));
    this.pairingCodesFile = JsonFileBuilder<Record<string, IChannelPairingRequest>>(path.join(dataPath, 'assistant_pairing_codes.json'));

    // Messages stored in subdirectory
    this.messagesDir = path.join(dataPath, 'messages');
    if (!fs.existsSync(this.messagesDir)) {
      fs.mkdirSync(this.messagesDir, { recursive: true });
    }

    // Initialize defaults if needed
    void this.initialize();
  }

  private async initialize() {
    // Ensure system user exists
    const users = this.usersFile.toJsonSync(); // Sync check for init
    if (!users[this.defaultUserId]) {
      this.ensureSystemUser();
    }
  }

  private getMessagesFile(conversationId: string) {
    return JsonFileBuilder<Record<string, TMessage>>(path.join(this.messagesDir, `${conversationId}.json`));
  }

  close(): void {
    // No specific close logic needed for file system
  }

  vacuum(): void {
    // No-op for file system
  }

  /**
   * ==================
   * User operations
   * ==================
   */

  getSystemUser(): IUser | null {
    const users = this.usersFile.toJsonSync();
    return users[this.defaultUserId] || null;
  }

  private ensureSystemUser(): void {
    const now = Date.now();
    const systemUser: IUser = {
      id: this.defaultUserId,
      username: this.defaultUserId,
      password_hash: '',
      created_at: now,
      updated_at: now,
    };
    // Initialize with sync write
    const users = this.usersFile.toJsonSync();
    users[this.defaultUserId] = systemUser;
    this.writeSync(this.usersFile.path, users);
  }

  setSystemUserCredentials(username: string, passwordHash: string): void {
    const now = Date.now();
    const users = this.usersFile.toJsonSync();
    const user = users[this.defaultUserId];

    if (!user) {
      users[this.defaultUserId] = {
        id: this.defaultUserId,
        username,
        password_hash: passwordHash,
        created_at: now,
        updated_at: now,
      };
    } else {
      users[this.defaultUserId] = {
        ...user,
        username,
        password_hash: passwordHash,
        updated_at: now,
      };
    }
    this.writeSync(this.usersFile.path, users);
  }

  createUser(username: string, email: string | undefined, passwordHash: string): IQueryResult<IUser> {
    try {
      const now = Date.now();
      const userId = `user_${now}`;
      const newUser: IUser = {
        id: userId,
        username,
        email,
        password_hash: passwordHash,
        created_at: now,
        updated_at: now,
        last_login: null,
      };

      const users = this.usersFile.toJsonSync();
      users[userId] = newUser;

      this.writeSync(this.usersFile.path, users);

      return { success: true, data: newUser };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  getUser(userId: string): IQueryResult<IUser> {
    try {
      const users = this.usersFile.toJsonSync();
      const user = users[userId];
      if (!user) return { success: false, error: 'User not found' };
      return { success: true, data: user };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  getUserByUsername(username: string): IQueryResult<IUser | null> {
    try {
      const users = this.usersFile.toJsonSync();
      const user = Object.values(users).find((u) => u.username === username);
      return { success: true, data: user || null };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  getAllUsers(): IQueryResult<IUser[]> {
    try {
      const users = this.usersFile.toJsonSync();
      const result = Object.values(users)
        .filter((u) => u.id !== this.defaultUserId)
        .sort((a, b) => a.created_at - b.created_at);
      return { success: true, data: result };
    } catch (e: any) {
      return { success: false, error: e.message, data: [] };
    }
  }

  getUserCount(): IQueryResult<number> {
    try {
      const users = this.usersFile.toJsonSync();
      const count = Object.values(users).filter((u) => u.id !== this.defaultUserId).length;
      return { success: true, data: count };
    } catch (e: any) {
      return { success: false, error: e.message, data: 0 };
    }
  }

  hasUsers(): IQueryResult<boolean> {
    try {
      const users = this.usersFile.toJsonSync();
      const exists = Object.values(users).some((u) => u.id !== this.defaultUserId && u.password_hash && u.password_hash.trim() !== '');
      return { success: true, data: exists };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  updateUserLastLogin(userId: string): IQueryResult<boolean> {
    try {
      const users = this.usersFile.toJsonSync();
      if (!users[userId]) return { success: false, data: false };

      const now = Date.now();
      users[userId].last_login = now;
      users[userId].updated_at = now;

      this.writeSync(this.usersFile.path, users);
      return { success: true, data: true };
    } catch (e: any) {
      return { success: false, error: e.message, data: false };
    }
  }

  updateUserPassword(userId: string, newPasswordHash: string): IQueryResult<boolean> {
    try {
      const users = this.usersFile.toJsonSync();
      if (!users[userId]) return { success: false, data: false };

      const now = Date.now();
      users[userId].password_hash = newPasswordHash;
      users[userId].updated_at = now;

      this.writeSync(this.usersFile.path, users);
      return { success: true, data: true };
    } catch (e: any) {
      return { success: false, error: e.message, data: false };
    }
  }

  updateUserJwtSecret(userId: string, jwtSecret: string): IQueryResult<boolean> {
    try {
      const users = this.usersFile.toJsonSync();
      if (!users[userId]) return { success: false, data: false };

      const now = Date.now();
      users[userId].jwt_secret = jwtSecret;
      users[userId].updated_at = now;

      this.writeSync(this.usersFile.path, users);
      return { success: true, data: true };
    } catch (e: any) {
      return { success: false, error: e.message, data: false };
    }
  }

  /**
   * ==================
   * Conversation operations
   * ==================
   */

  createConversation(conversation: TChatConversation, userId?: string): IQueryResult<TChatConversation> {
    try {
      const conversations = this.conversationsFile.toJsonSync();
      const finalUserId = userId || this.defaultUserId;

      // Store with userId (extending the type internally)
      const storedConv = {
        ...conversation,
        userId: finalUserId,
      };

      conversations[conversation.id] = storedConv as TChatConversation;
      this.writeSync(this.conversationsFile.path, conversations);

      return { success: true, data: conversation };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  getConversation(conversationId: string): IQueryResult<TChatConversation> {
    try {
      const conversations = this.conversationsFile.toJsonSync();
      const conv = conversations[conversationId];
      if (!conv) return { success: false, error: 'Conversation not found' };
      return { success: true, data: conv };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  getLatestConversationBySource(source: 'aionui' | 'telegram', userId?: string): IQueryResult<TChatConversation | null> {
    try {
      const finalUserId = userId || this.defaultUserId;
      const conversations = this.conversationsFile.toJsonSync();

      const matches = Object.values(conversations)
        .filter((c: any) => c.userId === finalUserId && c.source === source)
        .sort((a, b) => b.modifyTime - a.modifyTime);

      return { success: true, data: matches[0] || null };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  getUserConversations(userId?: string, page = 0, pageSize = 50): IPaginatedResult<TChatConversation> {
    try {
      const finalUserId = userId || this.defaultUserId;
      const conversations = this.conversationsFile.toJsonSync();

      const matches = Object.values(conversations)
        .filter((c: any) => c.userId === finalUserId)
        .sort((a, b) => b.modifyTime - a.modifyTime);

      const total = matches.length;
      const start = page * pageSize;
      const data = matches.slice(start, start + pageSize);

      return {
        data,
        total,
        page,
        pageSize,
        hasMore: start + pageSize < total,
      };
    } catch (e: any) {
      return { data: [], total: 0, page, pageSize, hasMore: false };
    }
  }

  updateConversation(conversationId: string, updates: Partial<TChatConversation>): IQueryResult<boolean> {
    try {
      const conversations = this.conversationsFile.toJsonSync();
      const existing = conversations[conversationId];
      if (!existing) return { success: false, error: 'Conversation not found' };

      const updated = {
        ...existing,
        ...updates,
        modifyTime: Date.now(),
      };

      conversations[conversationId] = updated;
      this.writeSync(this.conversationsFile.path, conversations);

      return { success: true, data: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  deleteConversation(conversationId: string): IQueryResult<boolean> {
    try {
      const conversations = this.conversationsFile.toJsonSync();
      if (conversations[conversationId]) {
        delete conversations[conversationId];
        this.writeSync(this.conversationsFile.path, conversations);

        // Also delete messages
        this.deleteConversationMessages(conversationId);

        return { success: true, data: true };
      }
      return { success: true, data: false };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * ==================
   * Message operations
   * ==================
   */

  insertMessage(message: TMessage): IQueryResult<TMessage> {
    try {
      const msgFile = this.getMessagesFile(message.conversation_id);
      const messages = this.toJsonSync<TMessage>(msgFile.path); // Use typed helper

      messages[message.id] = message;
      this.writeSync(msgFile.path, messages);

      return { success: true, data: message };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  getConversationMessages(conversationId: string, page = 0, pageSize = 100, order = 'ASC'): IPaginatedResult<TMessage> {
    try {
      const msgFile = this.getMessagesFile(conversationId);
      const messages = this.toJsonSync<TMessage>(msgFile.path);

      const allMsgs = Object.values(messages).sort((a, b) => {
        return order === 'DESC' ? (b.createTime || 0) - (a.createTime || 0) : (a.createTime || 0) - (b.createTime || 0);
      });

      const total = allMsgs.length;
      const start = page * pageSize;
      const data = allMsgs.slice(start, start + pageSize);

      return {
        data,
        total,
        page,
        pageSize,
        hasMore: start + pageSize < total,
      };
    } catch (e: any) {
      return { data: [], total: 0, page, pageSize, hasMore: false };
    }
  }

  updateMessage(messageId: string, message: TMessage): IQueryResult<boolean> {
    try {
      const msgFile = this.getMessagesFile(message.conversation_id);
      const messages = this.toJsonSync<TMessage>(msgFile.path);

      if (!messages[messageId]) return { success: false, error: 'Message not found' };

      messages[messageId] = message;
      this.writeSync(msgFile.path, messages);

      return { success: true, data: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  deleteMessage(messageId: string): IQueryResult<boolean> {
    try {
      const files = fs.readdirSync(this.messagesDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(this.messagesDir, file);
        const messages = this.toJsonSync(filePath);
        if (messages[messageId]) {
          delete messages[messageId];
          this.writeSync(filePath, messages);
          return { success: true, data: true };
        }
      }
      return { success: true, data: false };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  deleteConversationMessages(conversationId: string): IQueryResult<number> {
    try {
      const msgFile = this.getMessagesFile(conversationId);
      if (fs.existsSync(msgFile.path)) {
        const messages = this.toJsonSync(msgFile.path);
        const count = Object.keys(messages).length;
        fs.unlinkSync(msgFile.path);
        return { success: true, data: count };
      }
      return { success: true, data: 0 };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  getMessageByMsgId(conversationId: string, msgId: string, type: TMessage['type']): IQueryResult<TMessage | null> {
    try {
      const msgFile = this.getMessagesFile(conversationId);
      const messages = this.toJsonSync<TMessage>(msgFile.path);

      // Use msgId from unknown? TMessage has msg_id or id?
      // Check Types. TMessage usually has 'id' (uuid) and maybe 'msg_id' (platform id?)
      // AionUIDatabase impl uses `msg_id` column.
      const found = Object.values(messages).find((m) => (m as any).msg_id === msgId && m.type === type);
      return { success: true, data: found || null };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * ==================
   * Channel Plugin operations
   * ==================
   */

  getChannelPlugins(): IQueryResult<IChannelPluginConfig[]> {
    try {
      const plugins = this.pluginsFile.toJsonSync();
      const list = Object.values(plugins).sort((a, b) => a.createdAt - b.createdAt);
      return { success: true, data: list };
    } catch (e: any) {
      return { success: false, error: e.message, data: [] };
    }
  }

  getChannelPlugin(pluginId: string): IQueryResult<IChannelPluginConfig | null> {
    try {
      const plugins = this.pluginsFile.toJsonSync();
      return { success: true, data: plugins[pluginId] || null };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  upsertChannelPlugin(plugin: IChannelPluginConfig): IQueryResult<boolean> {
    try {
      const plugins = this.pluginsFile.toJsonSync();
      plugins[plugin.id] = plugin;
      this.writeSync(this.pluginsFile.path, plugins);
      return { success: true, data: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  updateChannelPluginStatus(pluginId: string, status: PluginStatus, lastConnected?: number): IQueryResult<boolean> {
    try {
      const plugins = this.pluginsFile.toJsonSync();
      if (!plugins[pluginId]) return { success: false, error: 'Plugin not found' };

      plugins[pluginId].status = status;
      if (lastConnected !== undefined) {
        plugins[pluginId].lastConnected = lastConnected;
      }
      plugins[pluginId].updatedAt = Date.now();

      this.writeSync(this.pluginsFile.path, plugins);
      return { success: true, data: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  deleteChannelPlugin(pluginId: string): IQueryResult<boolean> {
    try {
      const plugins = this.pluginsFile.toJsonSync();
      if (plugins[pluginId]) {
        delete plugins[pluginId];
        this.writeSync(this.pluginsFile.path, plugins);
        return { success: true, data: true };
      }
      return { success: true, data: false };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * ==================
   * Channel User operations
   * ==================
   */

  getChannelUsers(): IQueryResult<IChannelUser[]> {
    try {
      const users = this.assistantUsersFile.toJsonSync();
      const list = Object.values(users).sort((a, b) => b.authorizedAt - a.authorizedAt);
      return { success: true, data: list };
    } catch (e: any) {
      return { success: false, error: e.message, data: [] };
    }
  }

  getChannelUserByPlatform(platformUserId: string, platformType: string): IQueryResult<IChannelUser | null> {
    try {
      const users = this.assistantUsersFile.toJsonSync();
      const found = Object.values(users).find((u) => u.platformUserId === platformUserId && u.platformType === platformType);
      return { success: true, data: found || null };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  createChannelUser(user: IChannelUser): IQueryResult<IChannelUser> {
    try {
      const users = this.assistantUsersFile.toJsonSync();
      users[user.id] = user;
      this.writeSync(this.assistantUsersFile.path, users);
      return { success: true, data: user };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  updateChannelUserActivity(userId: string): IQueryResult<boolean> {
    try {
      const users = this.assistantUsersFile.toJsonSync();
      if (!users[userId]) return { success: false, error: 'User not found' };

      users[userId].lastActive = Date.now();
      this.writeSync(this.assistantUsersFile.path, users);

      return { success: true, data: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  deleteChannelUser(userId: string): IQueryResult<boolean> {
    try {
      const users = this.assistantUsersFile.toJsonSync();
      if (users[userId]) {
        delete users[userId];
        this.writeSync(this.assistantUsersFile.path, users);
        return { success: true, data: true };
      }
      return { success: true, data: false };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * ==================
   * Channel Session operations
   * ==================
   */

  getChannelSessions(): IQueryResult<IChannelSession[]> {
    try {
      const sessions = this.assistantSessionsFile.toJsonSync();
      const list = Object.values(sessions).sort((a, b) => b.lastActivity - a.lastActivity);
      return { success: true, data: list };
    } catch (e: any) {
      return { success: false, error: e.message, data: [] };
    }
  }

  getChannelSessionByUser(userId: string): IQueryResult<IChannelSession | null> {
    try {
      const sessions = this.assistantSessionsFile.toJsonSync();
      // Assuming userId here refers to the user_id field in session which links to assistant_users
      // NOT the main app user id.
      const found = Object.values(sessions).find((s) => s.userId === userId);
      return { success: true, data: found || null };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  upsertChannelSession(session: IChannelSession): IQueryResult<boolean> {
    try {
      const sessions = this.assistantSessionsFile.toJsonSync();
      sessions[session.id] = session;
      this.writeSync(this.assistantSessionsFile.path, sessions);
      return { success: true, data: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  deleteChannelSession(sessionId: string): IQueryResult<boolean> {
    try {
      const sessions = this.assistantSessionsFile.toJsonSync();
      if (sessions[sessionId]) {
        delete sessions[sessionId];
        this.writeSync(this.assistantSessionsFile.path, sessions);
        return { success: true, data: true };
      }
      return { success: true, data: false };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * ==================
   * Channel Pairing Code operations
   * ==================
   */

  getPendingPairingRequests(): IQueryResult<IChannelPairingRequest[]> {
    try {
      const now = Date.now();
      const codes = this.pairingCodesFile.toJsonSync();
      const list = Object.values(codes)
        .filter((c) => c.status === 'pending' && c.expiresAt > now)
        .sort((a, b) => b.requestedAt - a.requestedAt);
      return { success: true, data: list };
    } catch (e: any) {
      return { success: false, error: e.message, data: [] };
    }
  }

  getPairingRequestByCode(code: string): IQueryResult<IChannelPairingRequest | null> {
    try {
      const codes = this.pairingCodesFile.toJsonSync();
      // Code is key? Store implies using ID as key better, but code is unique enough?
      // let's assume we store them by 'code' as key.
      // If we stored by ID, we'd need to search.
      // createPairingRequest below uses code as key.
      const found = codes[code];
      return { success: true, data: found || null };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  createPairingRequest(request: IChannelPairingRequest): IQueryResult<IChannelPairingRequest> {
    try {
      const codes = this.pairingCodesFile.toJsonSync();
      codes[request.code] = request;
      this.writeSync(this.pairingCodesFile.path, codes);
      return { success: true, data: request };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  updatePairingRequestStatus(code: string, status: IChannelPairingRequest['status']): IQueryResult<boolean> {
    try {
      const codes = this.pairingCodesFile.toJsonSync();
      if (!codes[code]) return { success: false, error: 'Pairing code not found' };

      codes[code].status = status;
      this.writeSync(this.pairingCodesFile.path, codes);
      return { success: true, data: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  cleanupExpiredPairingRequests(): IQueryResult<number> {
    try {
      const now = Date.now();
      const codes = this.pairingCodesFile.toJsonSync();
      let count = 0;

      // Delete keys where expired OR !pending
      for (const key in codes) {
        if (codes[key].expiresAt < now || codes[key].status !== 'pending') {
          delete codes[key];
          count++;
        }
      }

      if (count > 0) {
        this.writeSync(this.pairingCodesFile.path, codes);
      }

      return { success: true, data: count };
    } catch (e: any) {
      return { success: false, error: e.message, data: 0 };
    }
  }

  // Helper for synchronous JSON file reading
  private toJsonSync<T>(filePath: string): Record<string, T> {
    try {
      if (!fs.existsSync(filePath)) return {};
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.trim()) return {};

      try {
        const decoded = decodeURIComponent(atob(content));
        return JSON.parse(decoded);
      } catch {
        return JSON.parse(content);
      }
    } catch {
      return {};
    }
  }

  // Helper for synchronous JSON file writing
  private writeSync(filePath: string, data: any) {
    if (!filePath) return; // robustness
    const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
    fs.writeFileSync(filePath, encoded);
  }
}
