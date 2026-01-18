import { 
  users, chats, chatParticipants, messages,
  type User, type InsertUser, type Chat, type InsertChat, 
  type Message, type InsertMessage, type ChatParticipant 
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, inArray } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserOnlineStatus(userId: string, isOnline: boolean): Promise<void>;
  
  getChat(id: string): Promise<Chat | undefined>;
  getUserChats(userId: string): Promise<ChatWithDetails[]>;
  createChat(chat: InsertChat, participantIds: string[]): Promise<Chat>;
  deleteChat(chatId: string, userId: string): Promise<void>;
  
  getChatMessages(chatId: string, limit?: number): Promise<MessageWithSender[]>;
  createMessage(message: InsertMessage & { senderId: string }): Promise<Message>;
  markMessagesAsRead(chatId: string, userId: string): Promise<void>;
  getUnreadCount(chatId: string, userId: string): Promise<number>;
  
  getChatParticipants(chatId: string): Promise<(ChatParticipant & { user: User })[]>;
  searchUsers(query: string, excludeUserId: string): Promise<User[]>;
}

export interface ChatWithDetails extends Chat {
  participants: { user: User }[];
  lastMessage?: Message & { sender: User };
  unreadCount: number;
}

export interface MessageWithSender extends Message {
  sender: User;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    await db.update(users)
      .set({ isOnline, lastSeen: new Date() })
      .where(eq(users.id, userId));
  }

  async getChat(id: string): Promise<Chat | undefined> {
    const [chat] = await db.select().from(chats).where(eq(chats.id, id));
    return chat || undefined;
  }

  async getUserChats(userId: string): Promise<ChatWithDetails[]> {
    const userParticipations = await db.select()
      .from(chatParticipants)
      .where(eq(chatParticipants.userId, userId));
    
    if (userParticipations.length === 0) return [];

    const chatIds = userParticipations.map(p => p.chatId);
    
    const chatsList = await db.select()
      .from(chats)
      .where(inArray(chats.id, chatIds))
      .orderBy(desc(chats.updatedAt));

    const result: ChatWithDetails[] = [];

    for (const chat of chatsList) {
      const participants = await db.select({
        chatParticipant: chatParticipants,
        user: users,
      })
        .from(chatParticipants)
        .innerJoin(users, eq(chatParticipants.userId, users.id))
        .where(eq(chatParticipants.chatId, chat.id));

      const [lastMessageResult] = await db.select({
        message: messages,
        sender: users,
      })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.chatId, chat.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      const unreadMessages = await db.select()
        .from(messages)
        .where(
          and(
            eq(messages.chatId, chat.id),
            eq(messages.isRead, false),
            eq(messages.senderId, userId) === false ? undefined : undefined
          )
        );

      const unreadCount = unreadMessages.filter(m => m.senderId !== userId && !m.isRead).length;

      result.push({
        ...chat,
        participants: participants.map(p => ({ user: p.user })),
        lastMessage: lastMessageResult ? { ...lastMessageResult.message, sender: lastMessageResult.sender } : undefined,
        unreadCount,
      });
    }

    return result;
  }

  async createChat(chat: InsertChat, participantIds: string[]): Promise<Chat> {
    const [newChat] = await db.insert(chats).values(chat).returning();
    
    for (const participantId of participantIds) {
      await db.insert(chatParticipants).values({
        chatId: newChat.id,
        userId: participantId,
      });
    }
    
    return newChat;
  }

  async deleteChat(chatId: string, userId: string): Promise<void> {
    const participation = await db.select()
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.userId, userId)
        )
      );

    if (participation.length > 0) {
      await db.delete(chats).where(eq(chats.id, chatId));
    }
  }

  async getChatMessages(chatId: string, limit = 50): Promise<MessageWithSender[]> {
    const result = await db.select({
      message: messages,
      sender: users,
    })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return result.map(r => ({ ...r.message, sender: r.sender })).reverse();
  }

  async createMessage(message: InsertMessage & { senderId: string }): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    
    await db.update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, message.chatId));
    
    return newMessage;
  }

  async markMessagesAsRead(chatId: string, userId: string): Promise<void> {
    await db.update(messages)
      .set({ isRead: true })
      .where(
        and(
          eq(messages.chatId, chatId),
          eq(messages.isRead, false)
        )
      );
  }

  async getUnreadCount(chatId: string, userId: string): Promise<number> {
    const result = await db.select()
      .from(messages)
      .where(
        and(
          eq(messages.chatId, chatId),
          eq(messages.isRead, false)
        )
      );
    return result.filter(m => m.senderId !== userId).length;
  }

  async getChatParticipants(chatId: string): Promise<(ChatParticipant & { user: User })[]> {
    const result = await db.select({
      participant: chatParticipants,
      user: users,
    })
      .from(chatParticipants)
      .innerJoin(users, eq(chatParticipants.userId, users.id))
      .where(eq(chatParticipants.chatId, chatId));

    return result.map(r => ({ ...r.participant, user: r.user }));
  }

  async searchUsers(query: string, excludeUserId: string): Promise<User[]> {
    const allUsers = await db.select().from(users);
    return allUsers.filter(u => 
      u.id !== excludeUserId && 
      (u.username.toLowerCase().includes(query.toLowerCase()) ||
       u.displayName.toLowerCase().includes(query.toLowerCase()))
    );
  }
}

export const storage = new DatabaseStorage();
