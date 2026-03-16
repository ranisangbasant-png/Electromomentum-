import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import Stripe from 'stripe';

const db = new Database("electro.db");
let stripe: Stripe | null = null;

const getStripe = () => {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
};

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    area TEXT NOT NULL,
    weather TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    isTransformerBurnt INTEGER DEFAULT 0,
    imageUrl TEXT,
    status TEXT DEFAULT 'active',
    votes INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consumer_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    stripe_session_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    subscription_status TEXT DEFAULT 'unpaid',
    is_blocked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_name TEXT NOT NULL,
    area TEXT NOT NULL,
    reason TEXT NOT NULL,
    estimated_restoration TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Insert some default boards if they don't exist
  INSERT OR IGNORE INTO boards (name, subscription_status) VALUES ('London Power Grid', 'paid');
  INSERT OR IGNORE INTO boards (name, subscription_status) VALUES ('Tokyo Electric', 'paid');
  INSERT OR IGNORE INTO boards (name, subscription_status) VALUES ('New York Energy', 'unpaid');
  INSERT OR IGNORE INTO boards (name, subscription_status) VALUES ('Mumbai Power', 'unpaid');
`);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/reports", (req, res) => {
    const reports = db.prepare("SELECT * FROM reports WHERE status = 'active' ORDER BY created_at DESC").all();
    res.json(reports);
  });

  app.post("/api/report", (req, res) => {
    const { area, weather, latitude, longitude, isTransformerBurnt, imageUrl } = req.body;
    const existing = db.prepare("SELECT id FROM reports WHERE area = ? AND status = 'active'").get();
    
    if (existing) {
      db.prepare("UPDATE reports SET votes = votes + 1 WHERE id = ?").run(existing.id);
      // If the new report has an image or transformer burnt flag, we might want to update the existing record
      if (isTransformerBurnt || imageUrl) {
        db.prepare("UPDATE reports SET isTransformerBurnt = MAX(isTransformerBurnt, ?), imageUrl = COALESCE(imageUrl, ?) WHERE id = ?")
          .run(isTransformerBurnt ? 1 : 0, imageUrl, existing.id);
      }
    } else {
      db.prepare("INSERT INTO reports (area, weather, latitude, longitude, isTransformerBurnt, imageUrl) VALUES (?, ?, ?, ?, ?, ?)")
        .run(area, weather, latitude, longitude, isTransformerBurnt ? 1 : 0, imageUrl);
    }
    
    const allReports = db.prepare("SELECT * FROM reports WHERE status = 'active' ORDER BY created_at DESC").all();
    io.emit("reports_updated", allReports);
    res.json({ success: true });
  });

  app.post("/api/restore", (req, res) => {
    const { id } = req.body;
    db.prepare("UPDATE reports SET status = 'restored' WHERE id = ?").run(id);
    const allReports = db.prepare("SELECT * FROM reports WHERE status = 'active' ORDER BY created_at DESC").all();
    io.emit("reports_updated", allReports);
    res.json({ success: true });
  });

  app.post("/api/create-checkout-session", async (req, res) => {
    const s = getStripe();
    if (!s) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

    try {
      const session = await s.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'ElectroMomentum Board Subscription',
                description: 'Monthly access for Electricity Boards worldwide',
              },
              unit_amount: 1000000, // $10,000.00
              recurring: {
                interval: 'month',
              },
            },
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${req.headers.origin}/?payment=success`,
        cancel_url: `${req.headers.origin}/?payment=cancel`,
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/pay-bill", async (req, res) => {
    const { consumerName, accountNumber, amount } = req.body;
    const s = getStripe();
    
    if (!s) {
      // Mock success if Stripe is not configured for demo purposes
      db.prepare("INSERT INTO payments (consumer_name, account_number, amount, status) VALUES (?, ?, ?, ?)").run(consumerName, accountNumber, amount, 'completed');
      return res.json({ success: true, message: "Demo mode: Payment recorded without Stripe" });
    }

    try {
      const session = await s.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Electricity Bill - ${accountNumber}`,
                description: `Bill payment for ${consumerName}`,
              },
              unit_amount: Math.round(amount * 100), // Amount in cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${req.headers.origin}/?bill_payment=success`,
        cancel_url: `${req.headers.origin}/?bill_payment=cancel`,
      });

      db.prepare("INSERT INTO payments (consumer_name, account_number, amount, stripe_session_id) VALUES (?, ?, ?, ?)")
        .run(consumerName, accountNumber, amount, session.id);

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/payments", (req, res) => {
    const payments = db.prepare("SELECT * FROM payments ORDER BY created_at DESC").all();
    res.json(payments);
  });

  // Board Management Routes
  app.get("/api/boards", (req, res) => {
    const boards = db.prepare("SELECT * FROM boards ORDER BY name ASC").all();
    res.json(boards);
  });

  app.post("/api/admin/boards/toggle-block", (req, res) => {
    const { id, is_blocked } = req.body;
    db.prepare("UPDATE boards SET is_blocked = ? WHERE id = ?").run(is_blocked ? 1 : 0, id);
    res.json({ success: true });
  });

  app.post("/api/admin/boards/update-subscription", (req, res) => {
    const { id, status } = req.body;
    db.prepare("UPDATE boards SET subscription_status = ? WHERE id = ?").run(status, id);
    res.json({ success: true });
  });

  app.post("/api/admin/boards/add", (req, res) => {
    const { name } = req.body;
    try {
      db.prepare("INSERT INTO boards (name) VALUES (?)").run(name);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: "Board already exists" });
    }
  });

  app.get("/api/boards/check/:name", (req, res) => {
    const { name } = req.params;
    const board = db.prepare("SELECT * FROM boards WHERE name = ?").get();
    if (!board) {
      return res.status(404).json({ error: "Board not found" });
    }
    if (board.is_blocked) {
      return res.status(403).json({ error: "Access denied: This board has been blocked by the administrator." });
    }
    res.json(board);
  });

  // Messaging Routes
  app.post("/api/board/broadcast", (req, res) => {
    const { boardName, area, reason, estimatedRestoration } = req.body;
    db.prepare("INSERT INTO messages (board_name, area, reason, estimated_restoration) VALUES (?, ?, ?, ?)")
      .run(boardName, area, reason, estimatedRestoration);
    
    const allMessages = db.prepare("SELECT * FROM messages ORDER BY created_at DESC LIMIT 50").all();
    io.emit("messages_updated", allMessages);
    res.json({ success: true });
  });

  app.get("/api/messages", (req, res) => {
    const messages = db.prepare("SELECT * FROM messages ORDER BY created_at DESC LIMIT 50").all();
    res.json(messages);
  });

  // Socket.io
  io.on("connection", (socket) => {
    console.log("A user connected");
    socket.emit("reports_updated", db.prepare("SELECT * FROM reports WHERE status = 'active' ORDER BY created_at DESC").all());
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
