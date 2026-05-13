import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors()); // Allows your GitHub Pages site to communicate with this server

app.use(express.json());

// Database Connection Pool
const dbUrl = process.env.DATABASE_URL || "mysql://root:password@localhost:3306/sparkey_db";
const parsedUrl = new URL(dbUrl);

const isTiDB = parsedUrl.hostname.includes('tidbcloud.com');
console.log(`\n🚀 [DB SETUP] Connecting to: ${parsedUrl.hostname}`);
console.log(`🔒 [DB SETUP] SSL Enabled: ${isTiDB ? 'YES' : 'NO'}\n`);

// TiDB Serverless requires a secure connection (TLS/SSL) via structured configuration
const pool = mysql.createPool({
  host: parsedUrl.hostname,
  port: Number(parsedUrl.port) || 3306,
  user: decodeURIComponent(parsedUrl.username),
  password: decodeURIComponent(parsedUrl.password),
  database: parsedUrl.pathname.replace('/', ''),
  ssl: isTiDB ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
});

// Auto-initialize database tables on startup
async function initializeDatabase() {
  try {
    console.log("[DB SETUP] Checking and creating missing tables...");
    
    // Create form_submissions table which holds ALL forms using a JSON payload
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS form_submissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(100) NOT NULL,
        payload JSON NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS credentials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        key_name VARCHAR(100) NOT NULL UNIQUE,
        key_value VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.execute(`
      INSERT INTO credentials (key_name, key_value) 
      VALUES ('provisioning_key', 'sparkey2026')
      ON DUPLICATE KEY UPDATE key_value = 'sparkey2026'
    `);
    
    console.log("[DB SETUP] All database tables are ready! ✅");
  } catch (error) {
    console.error("[DB SETUP Error] Failed to create tables:", error);
  }
}

initializeDatabase();

// API Routes
app.post("/api/verify-password", async (req, res) => {
  const { password } = req.body;
  
  try {
    const [rows]: any = await pool.execute("SELECT * FROM credentials WHERE key_name = 'provisioning_key' AND key_value = ?", [password]);
    if (rows.length > 0) {
      res.json({ success: true });
    } else {
      // Fallback for demo if no DB matches or if DB is empty
      if (password === "sparkey2026") return res.json({ success: true });
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.error("Auth DB Error:", error);
    // Hardcoded fallback for environment without DB
    if (password === "sparkey2026") return res.json({ success: true });
    res.status(500).json({ success: false, message: "Database authentication failed" });
  }
});

app.post("/api/save-form", async (req, res) => {
  const { type, data } = req.body;
  
  try {
    console.log(`\n[DB] Attempting secure SSL connection to TiDB...`);
    const query = "INSERT INTO form_submissions (type, payload, created_at) VALUES (?, ?, NOW())";
    await pool.execute(query, [type, JSON.stringify(data)]);
    console.log(`[DB] Saved ${type} submission.`);
    res.json({ success: true, db: true });
  } catch (error) {
    console.error("Save Form DB Error:", error);
    res.status(500).json({ success: false, db: false, message: "Database connection unavailable" });
  }
});

// Vite Middleware for Dev
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Pure API Backend Mode - No longer serving frontend files
    app.get("/", (req, res) => {
      res.json({ status: "sparkey API Backend is running securely! 🚀" });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
