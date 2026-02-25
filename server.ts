import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("stocks.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS predictions (
    id TEXT PRIMARY KEY,
    ticker TEXT NOT NULL,
    chart_image TEXT,
    user_prediction TEXT,
    user_reasoning TEXT,
    target_price REAL,
    gemini_prediction TEXT,
    gemini_reasoning TEXT,
    gemini_alignment_score INTEGER,
    gemini_alignment_reason TEXT,
    initial_price REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active',
    weekly_data TEXT DEFAULT '[]',
    final_retrospective TEXT
  );

  CREATE TABLE IF NOT EXISTS api_usage (
    date TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0
  );
`);

// Add missing columns for existing databases that might have been created with an older schema
const columns = db.prepare("PRAGMA table_info(predictions)").all() as any[];
const columnNames = columns.map(c => c.name);

const missingColumns = [
  { name: 'target_price', type: 'REAL' },
  { name: 'gemini_alignment_score', type: 'INTEGER' },
  { name: 'gemini_alignment_reason', type: 'TEXT' }
];

for (const col of missingColumns) {
  if (!columnNames.includes(col.name)) {
    try {
      db.exec(`ALTER TABLE predictions ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      console.error(`Error adding column ${col.name}:`, e);
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get("/api/usage", (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    let usage = db.prepare("SELECT count FROM api_usage WHERE date = ?").get(today) as { count: number } | undefined;
    if (!usage) {
      db.prepare("INSERT INTO api_usage (date, count) VALUES (?, 0)").run(today);
      usage = { count: 0 };
    }
    res.json(usage);
  });

  app.post("/api/usage/increment", (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    db.prepare(`
      INSERT INTO api_usage (date, count) 
      VALUES (?, 1) 
      ON CONFLICT(date) DO UPDATE SET count = count + 1
    `).run(today);
    res.json({ success: true });
  });

  app.get("/api/backup", (req, res) => {
    const predictions = db.prepare("SELECT * FROM predictions").all();
    const usage = db.prepare("SELECT * FROM api_usage").all();
    res.json({
      predictions: predictions.map((p: any) => ({
        ...p,
        weekly_data: JSON.parse(p.weekly_data)
      })),
      usage
    });
  });

  app.post("/api/restore", (req, res) => {
    const { predictions, usage } = req.body;
    try {
      db.transaction(() => {
        db.prepare("DELETE FROM predictions").run();
        db.prepare("DELETE FROM api_usage").run();

        const insertPred = db.prepare(`
          INSERT INTO predictions (id, ticker, chart_image, user_prediction, user_reasoning, target_price, gemini_prediction, gemini_reasoning, gemini_alignment_score, gemini_alignment_reason, initial_price, created_at, status, weekly_data, final_retrospective)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const p of predictions) {
          insertPred.run(
            p.id, p.ticker, p.chart_image, p.user_prediction, p.user_reasoning, 
            p.target_price, p.gemini_prediction, p.gemini_reasoning, 
            p.gemini_alignment_score, p.gemini_alignment_reason, 
            p.initial_price, p.created_at, p.status, 
            JSON.stringify(p.weekly_data), p.final_retrospective
          );
        }

        const insertUsage = db.prepare("INSERT INTO api_usage (date, count) VALUES (?, ?)");
        for (const u of usage) {
          insertUsage.run(u.date, u.count);
        }
      })();
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Restore failed" });
    }
  });

  app.get("/api/predictions", (req, res) => {
    const rows = db.prepare("SELECT * FROM predictions ORDER BY created_at DESC").all();
    res.json(rows.map(row => ({
      ...row,
      weekly_data: JSON.parse(row.weekly_data as string)
    })));
  });

  app.post("/api/predictions", (req, res) => {
    const { id, ticker, chart_image, user_prediction, user_reasoning, target_price, gemini_prediction, gemini_reasoning, gemini_alignment_score, gemini_alignment_reason, initial_price } = req.body;
    const stmt = db.prepare(`
      INSERT INTO predictions (id, ticker, chart_image, user_prediction, user_reasoning, target_price, gemini_prediction, gemini_reasoning, gemini_alignment_score, gemini_alignment_reason, initial_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, ticker, chart_image, user_prediction, user_reasoning, target_price, gemini_prediction, gemini_reasoning, gemini_alignment_score, gemini_alignment_reason, initial_price);
    res.json({ success: true });
  });

  app.patch("/api/predictions/:id", (req, res) => {
    const { id } = req.params;
    const { weekly_data, status, final_retrospective } = req.body;
    
    if (status) {
      db.prepare("UPDATE predictions SET status = ? WHERE id = ?").run(status, id);
    }
    if (weekly_data) {
      db.prepare("UPDATE predictions SET weekly_data = ? WHERE id = ?").run(JSON.stringify(weekly_data), id);
    }
    if (final_retrospective) {
      db.prepare("UPDATE predictions SET final_retrospective = ? WHERE id = ?").run(final_retrospective, id);
    }
    
    res.json({ success: true });
  });

  app.delete("/api/predictions/:id", (req, res) => {
    const { id } = req.params;
    console.log(`Attempting to delete prediction with id: ${id}`);
    const result = db.prepare("DELETE FROM predictions WHERE id = ?").run(id);
    console.log(`Delete result: ${result.changes} row(s) affected`);
    res.json({ success: true, changes: result.changes });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
