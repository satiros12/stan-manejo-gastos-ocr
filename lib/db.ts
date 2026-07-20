import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "invoices.db");

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── EXTENSION: Auth & Finance tables ─────────────────────────────────
// Only adds tables if they don't exist, so existing OCR data survives.
db.exec(`
  -- Users (extends NextAuth)
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    color TEXT DEFAULT '#0f8a5f',
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Categories (shared = visible to both, private = belongs to user_id)
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('shared', 'private')),
    icon TEXT DEFAULT '📦',
    color TEXT DEFAULT '#6b7280',
    user_id INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Transactions (shared expenses split, private 100% to user)
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER REFERENCES groups(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    category_id INTEGER REFERENCES categories(id),
    type TEXT NOT NULL CHECK(type IN ('shared', 'private')),
    amount REAL NOT NULL,
    split_ratio REAL DEFAULT 0.5,
    description TEXT DEFAULT '',
    date TEXT NOT NULL,
    invoice_id INTEGER REFERENCES invoices(id),
    image_path TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Transfers (money between users within a group)
  CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER REFERENCES groups(id),
    from_user_id INTEGER NOT NULL REFERENCES users(id),
    to_user_id INTEGER NOT NULL REFERENCES users(id),
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    description TEXT DEFAULT '',
    type TEXT DEFAULT 'reimbursement',
    transaction_id INTEGER REFERENCES transactions(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Groups
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    invite_code TEXT UNIQUE,
    created_by INTEGER REFERENCES users(id),
    max_members INTEGER DEFAULT 10,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Group members
  CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    role TEXT DEFAULT 'member',
    joined_at TEXT DEFAULT (datetime('now')),
    UNIQUE(group_id, user_id)
  );

  -- Add user_id and shared columns to invoices if not exist
  -- (SQLite doesn't support IF NOT EXISTS for columns, so we catch)
`);

// ─── Helper to add columns safely ──────────────────────────────────────
function addColumn(table: string, column: string, def: string) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  } catch { /* already exists */ }
}

addColumn("invoices", "user_id", "INTEGER REFERENCES users(id)");
addColumn("invoices", "category_id", "INTEGER REFERENCES categories(id)");
addColumn("invoices", "transaction_id", "INTEGER REFERENCES transactions(id)");
addColumn("transactions", "group_id", "INTEGER REFERENCES groups(id)");
addColumn("transactions", "image_path", "TEXT");
addColumn("transfers", "group_id", "INTEGER REFERENCES groups(id)");

// ─── In-Memory caches ──────────────────────────────────────────────────
// (Auth tokens, etc., stored in memory — no extra table needed)

// ─── User helpers ──────────────────────────────────────────────────────
export interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  color: string;
  created_at: string;
}

export function getUserByEmail(email: string): User | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as User | undefined;
}

export function getUserById(id: number): User | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function createUser(name: string, email: string, password: string): User {
  const stmt = db.prepare(
    "INSERT INTO users (name, email, password) VALUES (?, ?, ?)"
  );
  const result = stmt.run(name, email, password);
  return getUserById(Number(result.lastInsertRowid))!;
}

export function getAllUsers(): User[] {
  return db.prepare("SELECT * FROM users ORDER BY id").all() as User[];
}

export function updateUser(id: number, data: { name?: string; password?: string }): void {
  const fields: string[] = [];
  const values: any = { id };
  if (data.name !== undefined) {
    fields.push("name = @name");
    values.name = data.name;
  }
  if (data.password !== undefined) {
    fields.push("password = @password");
    values.password = data.password;
  }
  if (fields.length > 0) {
    db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = @id`).run(values);
  }
}

// ─── Category helpers ──────────────────────────────────────────────────
export interface Category {
  id: number;
  name: string;
  type: "shared" | "private";
  icon: string;
  color: string;
  user_id: number | null;
}

export function getCategories(userId: number): Category[] {
  return db.prepare(
    "SELECT * FROM categories WHERE type = 'shared' OR user_id = ? ORDER BY name"
  ).all(userId) as Category[];
}

export function createCategory(
  name: string, type: "shared" | "private", icon = "📦", color = "#6b7280", userId?: number
): Category {
  const stmt = db.prepare(
    "INSERT INTO categories (name, type, icon, color, user_id) VALUES (?, ?, ?, ?, ?)"
  );
  const result = stmt.run(name, type, icon, color, userId ?? null);
  return db.prepare("SELECT * FROM categories WHERE id = ?").get(Number(result.lastInsertRowid)) as Category;
}

export function deleteCategory(id: number): void {
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
}

// ─── Transaction helpers ───────────────────────────────────────────────
export interface Transaction {
  id: number;
  group_id: number | null;
  user_id: number;
  category_id: number | null;
  type: "shared" | "private";
  amount: number;
  split_ratio: number;
  description: string;
  date: string;
  invoice_id: number | null;
  image_path: string | null;
  created_at: string;
  // joined fields
  user_name?: string;
  category_name?: string;
  category_icon?: string;
}

export function createTransaction(data: {
  user_id: number;
  group_id?: number;
  category_id?: number;
  type: "shared" | "private";
  amount: number;
  split_ratio?: number;
  description?: string;
  date: string;
  invoice_id?: number;
  image_path?: string;
}): number {
  const stmt = db.prepare(`
    INSERT INTO transactions (group_id, user_id, category_id, type, amount, split_ratio, description, date, invoice_id, image_path)
    VALUES (@group_id, @user_id, @category_id, @type, @amount, @split_ratio, @description, @date, @invoice_id, @image_path)
  `);
  const result = stmt.run({
    group_id: data.group_id ?? null,
    user_id: data.user_id,
    category_id: data.category_id ?? null,
    type: data.type,
    amount: data.amount,
    split_ratio: data.type === "private" ? 1 : (data.split_ratio ?? 0.5),
    description: data.description || "",
    date: data.date,
    invoice_id: data.invoice_id ?? null,
    image_path: data.image_path ?? null,
  });
  return Number(result.lastInsertRowid);
}

export function getTransactions(options: {
  userId?: number;
  type?: "shared" | "private";
  month?: string; // YYYY-MM
  categoryId?: number;
  limit?: number;
  offset?: number;
} = {}): Transaction[] {
  let sql = `
    SELECT t.*, u.name as user_name, c.name as category_name, c.icon as category_icon
    FROM transactions t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (options.userId) {
    sql += " AND (t.type = 'shared' OR t.user_id = ?)";
    params.push(options.userId);
  }
  if (options.type) {
    sql += " AND t.type = ?";
    params.push(options.type);
  }
  if (options.month) {
    sql += " AND t.date LIKE ?";
    params.push(options.month + "%");
  }
  if (options.categoryId) {
    sql += " AND t.category_id = ?";
    params.push(options.categoryId);
  }

  sql += " ORDER BY t.date DESC, t.id DESC";

  if (options.limit) {
    sql += " LIMIT ?";
    params.push(options.limit);
  }
  if (options.offset) {
    sql += " OFFSET ?";
    params.push(options.offset);
  }

  return db.prepare(sql).all(...params) as Transaction[];
}

export function getTransaction(id: number): Transaction | null {
  const row = db.prepare(`
    SELECT t.*, u.name as user_name, c.name as category_name, c.icon as category_icon
    FROM transactions t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.id = ?
  `).get(id) as Transaction | null;
  return row || null;
}

export function updateTransaction(id: number, data: Partial<Transaction>): void {
  const fields: string[] = [];
  const values: any = { id };
  for (const key of ["group_id", "category_id", "type", "amount", "split_ratio", "description", "date", "image_path"]) {
    if ((data as any)[key] !== undefined) {
      fields.push(`${key} = @${key}`);
      values[key] = (data as any)[key];
    }
  }
  if (fields.length > 0) {
    db.prepare(`UPDATE transactions SET ${fields.join(", ")} WHERE id = @id`).run(values);
  }
}

export function deleteTransaction(id: number): void {
  db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
}

// ─── Transfer helpers ──────────────────────────────────────────────────
export interface Transfer {
  id: number;
  from_user_id: number;
  to_user_id: number;
  amount: number;
  date: string;
  description: string;
  type: string;
  transaction_id: number | null;
  created_at: string;
  from_name?: string;
  to_name?: string;
}

export function createTransfer(data: {
  from_user_id: number;
  to_user_id: number;
  amount: number;
  date: string;
  description?: string;
  type?: string;
  transaction_id?: number;
}): number {
  const stmt = db.prepare(`
    INSERT INTO transfers (from_user_id, to_user_id, amount, date, description, type, transaction_id)
    VALUES (@from_user_id, @to_user_id, @amount, @date, @description, @type, @transaction_id)
  `);
  const result = stmt.run({
    from_user_id: data.from_user_id,
    to_user_id: data.to_user_id,
    amount: data.amount,
    date: data.date,
    description: data.description || "",
    type: data.type || "reimbursement",
    transaction_id: data.transaction_id ?? null,
  });
  return Number(result.lastInsertRowid);
}

export function getTransfers(userId: number): Transfer[] {
  return db.prepare(`
    SELECT t.*, u1.name as from_name, u2.name as to_name
    FROM transfers t
    LEFT JOIN users u1 ON t.from_user_id = u1.id
    LEFT JOIN users u2 ON t.to_user_id = u2.id
    WHERE t.from_user_id = ? OR t.to_user_id = ?
    ORDER BY t.date DESC, t.id DESC
  `).all(userId, userId) as Transfer[];
}

export function getBalance(userId: number, otherUserId: number): number {
  // Returns positive = otherUser owes userId, negative = userId owes otherUser
  const result = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN t.from_user_id = ? THEN -t.amount ELSE t.amount END), 0) as net
    FROM transfers t
    WHERE (t.from_user_id = ? AND t.to_user_id = ?)
       OR (t.from_user_id = ? AND t.to_user_id = ?)
  `).get(userId, userId, otherUserId, otherUserId, userId) as any;
  return result?.net || 0;
}

// ─── Group helpers ──────────────────────────────────────────────────────
export interface Group {
  id: number;
  name: string;
  invite_code: string | null;
  created_by: number;
  max_members: number;
  created_at: string;
}

export interface GroupMember {
  id: number;
  group_id: number;
  user_id: number;
  role: string;
  joined_at: string;
  user_name?: string;
  user_email?: string;
  user_color?: string;
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
    if (i === 3) code += "-";
  }
  // Ensure uniqueness
  const existing = db.prepare("SELECT id FROM groups WHERE invite_code = ?").get(code);
  if (existing) return generateInviteCode();
  return code;
}

export function createGroup(name: string, createdBy: number): Group {
  const inviteCode = generateInviteCode();
  const stmt = db.prepare(
    "INSERT INTO groups (name, invite_code, created_by) VALUES (?, ?, ?)"
  );
  const result = stmt.run(name, inviteCode, createdBy);
  const groupId = Number(result.lastInsertRowid);

  // Add creator as admin
  db.prepare(
    "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'admin')"
  ).run(groupId, createdBy);

  return db.prepare("SELECT * FROM groups WHERE id = ?").get(groupId) as Group;
}

export function getUserGroups(userId: number): (Group & { member_count: number })[] {
  return db.prepare(`
    SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
    FROM groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ?
    ORDER BY g.created_at
  `).all(userId) as any[];
}

export function getGroupMembers(groupId: number): GroupMember[] {
  return db.prepare(`
    SELECT gm.*, u.name as user_name, u.email as user_email, u.color as user_color
    FROM group_members gm
    JOIN users u ON gm.user_id = u.id
    WHERE gm.group_id = ?
    ORDER BY gm.joined_at
  `).all(groupId) as GroupMember[];
}

export function getGroupByInviteCode(code: string): Group | null {
  return db.prepare("SELECT * FROM groups WHERE invite_code = ?").get(code) as Group | null;
}

export function getGroupById(id: number): Group | null {
  return db.prepare("SELECT * FROM groups WHERE id = ?").get(id) as Group | null;
}

export function joinGroup(code: string, userId: number): Group | null {
  const group = getGroupByInviteCode(code);
  if (!group) return null;

  // Check max members
  const count = db.prepare(
    "SELECT COUNT(*) as c FROM group_members WHERE group_id = ?"
  ).get(group.id) as any;
  if (count.c >= group.max_members) return null;

  // Check if already member
  const existing = db.prepare(
    "SELECT id FROM group_members WHERE group_id = ? AND user_id = ?"
  ).get(group.id, userId);
  if (existing) return group;

  db.prepare(
    "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')"
  ).run(group.id, userId);

  return group;
}

export function regenerateInviteCode(groupId: number): string {
  const code = generateInviteCode();
  db.prepare("UPDATE groups SET invite_code = ? WHERE id = ?").run(code, groupId);
  return code;
}

export function getUserDefaultGroup(userId: number): Group | null {
  const groups = getUserGroups(userId);
  return groups[0] || null;
}

// ─── Dashboard helpers ─────────────────────────────────────────────────
export interface DashboardData {
  month: string;
  total_shared: number;
  total_private_me: number;
  total_private_other: number;
  my_shared_paid: number;
  my_share_owed: number;
  other_share_owed: number;
  balance: number;
  by_category: { name: string; icon: string; amount: number; type: string }[];
  recent: Transaction[];
}

export function getDashboard(userId: number, month: string): DashboardData {
  const otherUsers = getAllUsers().filter(u => u.id !== userId);
  const otherId = otherUsers[0]?.id || userId;

  // Shared total for the month
  const sharedRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM transactions
    WHERE type = 'shared' AND date LIKE ?
  `).get(month + "%") as any;

  // My private expenses
  const myPrivate = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM transactions
    WHERE type = 'private' AND user_id = ? AND date LIKE ?
  `).get(userId, month + "%") as any;

  // Other's private expenses
  const otherPrivate = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM transactions
    WHERE type = 'private' AND user_id = ? AND date LIKE ?
  `).get(otherId, month + "%") as any;

  // What I paid in shared
  const myPaid = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM transactions
    WHERE type = 'shared' AND user_id = ? AND date LIKE ?
  `).get(userId, month + "%") as any;

  // What I should owe (my share of shared expenses paid by other)
  const otherPaid = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM transactions
    WHERE type = 'shared' AND user_id = ? AND date LIKE ?
  `).get(otherId, month + "%") as any;

  const totalShared = sharedRow.total;
  const myShareOwed = otherPaid.total * 0.5; // 50% of what other paid, I owe
  const otherShareOwed = myPaid.total * 0.5; // 50% of what I paid, other owes me

  // Historical balance from transfers
  const transfersBalance = getBalance(userId, otherId);

  // Global balance = (what other owes me from shared) + (transfers balance)
  const balance = otherShareOwed - myShareOwed + transfersBalance;

  // By category
  const byCategory = db.prepare(`
    SELECT c.name, c.icon, COALESCE(SUM(t.amount), 0) as amount, t.type
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.date LIKE ? AND (t.user_id = ? OR t.type = 'shared')
    GROUP BY c.id, t.type
    ORDER BY amount DESC
    LIMIT 8
  `).all(month + "%", userId) as any[];

  // Recent transactions
  const recent = getTransactions({ userId, limit: 10 });

  return {
    month,
    total_shared: totalShared,
    total_private_me: myPrivate.total,
    total_private_other: otherPrivate.total,
    my_shared_paid: myPaid.total,
    my_share_owed: myShareOwed,
    other_share_owed: otherShareOwed,
    balance,
    by_category: byCategory,
    recent,
  };
}

// ─── Legacy invoice helpers (used by OCR module) ───────────────────────
export interface Invoice {
  id: number;
  filename: string;
  image_path: string | null;
  ocr_text: string | null;
  proveedor: string | null;
  cif_nif: string | null;
  fecha: string | null;
  numero_factura: string | null;
  base_imponible: number | null;
  iva: number | null;
  iva_porcentaje: number | null;
  total: number | null;
  moneda: string | null;
  lineas: { descripcion: string; importe: number | null }[];
  raw_response: string | null;
  error: string | null;
  created_at: string;
}

export function insertInvoice(data: {
  filename: string;
  image_path?: string;
  ocr_text?: string;
  proveedor?: string | null;
  cif_nif?: string | null;
  fecha?: string | null;
  numero_factura?: string | null;
  base_imponible?: number | null;
  iva?: number | null;
  iva_porcentaje?: number | null;
  total?: number | null;
  moneda?: string;
  lineas?: { descripcion: string; importe: number | null }[];
  raw_response?: string;
  error?: string | null;
}): number {
  const stmt = db.prepare(`
    INSERT INTO invoices (filename, image_path, ocr_text, proveedor, cif_nif, fecha, numero_factura, base_imponible, iva, iva_porcentaje, total, moneda, lineas_json, raw_response, error)
    VALUES (@filename, @image_path, @ocr_text, @proveedor, @cif_nif, @fecha, @numero_factura, @base_imponible, @iva, @iva_porcentaje, @total, @moneda, @lineas_json, @raw_response, @error)
  `);
  const result = stmt.run({
    filename: data.filename,
    image_path: data.image_path || null,
    ocr_text: data.ocr_text || null,
    proveedor: data.proveedor ?? null,
    cif_nif: data.cif_nif ?? null,
    fecha: data.fecha ?? null,
    numero_factura: data.numero_factura ?? null,
    base_imponible: data.base_imponible ?? null,
    iva: data.iva ?? null,
    iva_porcentaje: data.iva_porcentaje ?? null,
    total: data.total ?? null,
    moneda: data.moneda || "EUR",
    lineas_json: data.lineas ? JSON.stringify(data.lineas) : null,
    raw_response: data.raw_response || null,
    error: data.error || null,
  });
  return Number(result.lastInsertRowid);
}

export function getAllInvoices(): Invoice[] {
  const rows = db.prepare("SELECT * FROM invoices ORDER BY created_at DESC").all() as any[];
  return rows.map(row => ({
    ...row,
    lineas: row.lineas_json ? JSON.parse(row.lineas_json) : [],
  }));
}

export function getInvoice(id: number): Invoice | null {
  const row = db.prepare("SELECT * FROM invoices WHERE id = ?").get(id) as any;
  if (!row) return null;
  return { ...row, lineas: row.lineas_json ? JSON.parse(row.lineas_json) : [] };
}

export function updateInvoice(id: number, data: Partial<Invoice>): void {
  const fields: string[] = [];
  const values: any = { id };
  for (const key of ["proveedor", "cif_nif", "fecha", "numero_factura", "base_imponible", "iva", "iva_porcentaje", "total", "moneda"]) {
    if ((data as any)[key] !== undefined) {
      fields.push(`${key} = @${key}`);
      values[key] = (data as any)[key];
    }
  }
  if (data.lineas) {
    fields.push("lineas_json = @lineas_json");
    values.lineas_json = JSON.stringify(data.lineas);
  }
  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    db.prepare(`UPDATE invoices SET ${fields.join(", ")} WHERE id = @id`).run(values);
  }
}

export function deleteInvoice(id: number): void {
  db.prepare("DELETE FROM invoices WHERE id = ?").run(id);
}

export default db;
