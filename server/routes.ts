import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { loginSchema, registerSchema } from "@shared/schema";
import { createHash, randomBytes } from "crypto";

const sessions = new Map<string, string>();
const wsClients = new Map<string, WebSocket>();

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function getUserIdFromToken(token: string): string | undefined {
  return sessions.get(token);
}

function authMiddleware(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "") || req.headers.cookie?.split("token=")[1]?.split(";")[0];
  
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return res.status(401).json({ error: "Invalid token" });
  }
  
  (req as any).userId = userId;
  (req as any).token = token;
  next();
}

function broadcastToChat(chatId: string, message: any, excludeUserId?: string) {
  wsClients.forEach((ws, odUserId) => {
    if (excludeUserId && odUserId === excludeUserId) return;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "message", chatId, data: message }));
    }
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validation = registerSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors[0].message });
      }

      const { username, password, displayName } = validation.data;
      
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const hashedPassword = hashPassword(password);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        displayName,
      });

      const token = generateToken();
      sessions.set(token, user.id);

      res.cookie("token", token, { httpOnly: true, sameSite: "lax" });
      res.json({ 
        user: { id: user.id, username: user.username, displayName: user.displayName },
        token 
      });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors[0].message });
      }

      const { username, password } = validation.data;
      const user = await storage.getUserByUsername(username);
      
      if (!user || user.password !== hashPassword(password)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = generateToken();
      sessions.set(token, user.id);
      await storage.updateUserOnlineStatus(user.id, true);

      res.cookie("token", token, { httpOnly: true, sameSite: "lax" });
      res.json({ 
        user: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl },
        token 
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", authMiddleware, async (req, res) => {
    const token = (req as any).token;
    const userId = (req as any).userId;
    
    sessions.delete(token);
    await storage.updateUserOnlineStatus(userId, false);
    
    res.clearCookie("token");
    res.json({ success: true });
  });

  app.get("/api/auth/me", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ 
        id: user.id, 
        username: user.username, 
        displayName: user.displayName, 
        avatarUrl: user.avatarUrl,
        isOnline: user.isOnline
      });
    } catch (error) {
      console.error("Get me error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/chats", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const chats = await storage.getUserChats(userId);
      res.json(chats);
    } catch (error) {
      console.error("Get chats error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/chats", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { name, participantIds, isGroup } = req.body;

      if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
        return res.status(400).json({ error: "At least one participant is required" });
      }

      const allParticipantIds = [...new Set([userId, ...participantIds])];
      
      const chat = await storage.createChat(
        { name: name || null, isGroup: isGroup || false },
        allParticipantIds
      );

      const chatWithDetails = await storage.getUserChats(userId);
      const createdChat = chatWithDetails.find(c => c.id === chat.id);
      
      res.json(createdChat || chat);
    } catch (error) {
      console.error("Create chat error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/chats/:chatId", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { chatId } = req.params;

      await storage.deleteChat(chatId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete chat error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/chats/:chatId/messages", authMiddleware, async (req, res) => {
    try {
      const { chatId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      const messages = await storage.getChatMessages(chatId, limit);
      res.json(messages);
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/chats/:chatId/messages", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { chatId } = req.params;
      const { content, encryptedContent } = req.body;

      if (!content || content.trim() === "") {
        return res.status(400).json({ error: "Message content is required" });
      }

      const message = await storage.createMessage({
        chatId,
        senderId: userId,
        content: content.trim(),
        encryptedContent,
      });

      const sender = await storage.getUser(userId);
      const messageWithSender = { ...message, sender };

      broadcastToChat(chatId, messageWithSender, userId);
      
      res.json(messageWithSender);
    } catch (error) {
      console.error("Create message error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/chats/:chatId/read", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { chatId } = req.params;

      await storage.markMessagesAsRead(chatId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark read error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/users/search", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const query = req.query.q as string || "";

      const users = await storage.searchUsers(query, userId);
      res.json(users.map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        isOnline: u.isOnline,
      })));
    } catch (error) {
      console.error("Search users error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    
    if (!token) {
      ws.close(1008, "Unauthorized");
      return;
    }
    
    const odUserId = getUserIdFromToken(token);
    if (!odUserId) {
      ws.close(1008, "Invalid token");
      return;
    }
    
    wsClients.set(odUserId, ws);
    storage.updateUserOnlineStatus(odUserId, true);
    
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === "typing") {
          broadcastToChat(message.chatId, { type: "typing", odUserId }, odUserId);
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });
    
    ws.on("close", () => {
      wsClients.delete(odUserId);
      storage.updateUserOnlineStatus(odUserId, false);
    });
  });

  return httpServer;
}
