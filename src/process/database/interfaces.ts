/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPluginConfig } from '@/channels/types';
import type { IPaginatedResult, IQueryResult, IUser, TChatConversation, TMessage } from './types';

/**
 * Interface defining the contract for database implementations.
 * Allows switching between SQLite (better-sqlite3) and File-based storage.
 */
export interface IDatabase {
  /**
   * Close the database connection or release resources
   */
  close(): void;

  /**
   * ==================
   * User operations
   * ==================
   */

  getSystemUser(): IUser | null;
  setSystemUserCredentials(username: string, passwordHash: string): void;
  createUser(username: string, email: string | undefined, passwordHash: string): IQueryResult<IUser>;
  getUser(userId: string): IQueryResult<IUser>;
  getUserByUsername(username: string): IQueryResult<IUser | null>;
  getAllUsers(): IQueryResult<IUser[]>;
  getUserCount(): IQueryResult<number>;
  hasUsers(): IQueryResult<boolean>;
  updateUserLastLogin(userId: string): IQueryResult<boolean>;
  updateUserPassword(userId: string, newPasswordHash: string): IQueryResult<boolean>;
  updateUserJwtSecret(userId: string, jwtSecret: string): IQueryResult<boolean>;

  /**
   * ==================
   * Conversation operations
   * ==================
   */

  createConversation(conversation: TChatConversation, userId?: string): IQueryResult<TChatConversation>;
  getConversation(conversationId: string): IQueryResult<TChatConversation>;
  getLatestConversationBySource(source: 'aionui' | 'telegram', userId?: string): IQueryResult<TChatConversation | null>;
  getUserConversations(userId?: string, page?: number, pageSize?: number): IPaginatedResult<TChatConversation>;
  updateConversation(conversationId: string, updates: Partial<TChatConversation>): IQueryResult<boolean>;
  deleteConversation(conversationId: string): IQueryResult<boolean>;

  /**
   * ==================
   * Message operations
   * ==================
   */

  insertMessage(message: TMessage): IQueryResult<TMessage>;
  getConversationMessages(conversationId: string, page?: number, pageSize?: number, order?: string): IPaginatedResult<TMessage>;
  updateMessage(messageId: string, message: TMessage): IQueryResult<boolean>;
  deleteMessage(messageId: string): IQueryResult<boolean>;
  deleteConversationMessages(conversationId: string): IQueryResult<number>;
  getMessageByMsgId(conversationId: string, msgId: string, type: TMessage['type']): IQueryResult<TMessage | null>;

  /**
   * ==================
   * Channel Plugin operations
   * ==================
   */

  getChannelPlugins(): IQueryResult<IChannelPluginConfig[]>;
  getChannelPlugin(pluginId: string): IQueryResult<IChannelPluginConfig | null>;
  upsertChannelPlugin(plugin: IChannelPluginConfig): IQueryResult<boolean>;
  updateChannelPluginStatus(pluginId: string, status: IChannelPluginConfig['status'], lastConnected?: number): IQueryResult<boolean>;
  deleteChannelPlugin(pluginId: string): IQueryResult<boolean>;

  /**
   * ==================
   * Channel User operations
   * ==================
   */

  getChannelUsers(): IQueryResult<any[]>; // dependent on IChannelUser import
  getChannelUserByPlatform(platformUserId: string, platformType: string): IQueryResult<any | null>;
  createChannelUser(user: any): IQueryResult<any>;
  updateChannelUserActivity(userId: string): IQueryResult<boolean>;
  deleteChannelUser(userId: string): IQueryResult<boolean>;

  /**
   * ==================
   * Channel Session operations
   * ==================
   */

  getChannelSessions(): IQueryResult<any[]>;
  getChannelSessionByUser(userId: string): IQueryResult<any | null>;
  upsertChannelSession(session: any): IQueryResult<boolean>;
  deleteChannelSession(sessionId: string): IQueryResult<boolean>;

  /**
   * ==================
   * Channel Pairing Code operations
   * ==================
   */

  getPendingPairingRequests(): IQueryResult<any[]>;
  getPairingRequestByCode(code: string): IQueryResult<any | null>;
  createPairingRequest(request: any): IQueryResult<any>;
  updatePairingRequestStatus(code: string, status: any): IQueryResult<boolean>;
  cleanupExpiredPairingRequests(): IQueryResult<number>;

  /**
   * Maintenance
   */
  vacuum(): void;
}
