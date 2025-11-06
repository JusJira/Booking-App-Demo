import { Pool } from "pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config(); // load .env when present

const CONNECTION_STRING = process.env.DATABASE_URL || "";

const pool = new Pool({ connectionString: CONNECTION_STRING });

// initialize schema
(async () => {
  const client = await pool.connect();
  try {
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        "userId" UUID REFERENCES users(id),
        name TEXT NOT NULL,
        trainer TEXT NOT NULL,
        "class" TEXT NOT NULL,
        price INTEGER NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "bookedTime" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  } finally {
    client.release();
  }
})().catch((err) => {
  console.error("DB init error:", err);
  process.exit(1);
});

// types
export interface User {
  id: string;
  name: string;
  phone: string;
}

export interface BookingInput {
  userId?: string | null;
  name: string;
  trainer: string;
  klass: string;
  price: number;
  createdAt?: string;
  bookedTime?: string;
}

// helpers
export async function addUser(
  name: string,
  password: string,
  phone?: string
): Promise<{ id: string }> {
  const hashed = await bcrypt.hash(String(password), 10);
  const res = await pool.query(
    `INSERT INTO users (name, password, phone) VALUES ($1, $2, $3) RETURNING id`,
    [name, hashed, phone]
  );
  return { id: res.rows[0].id };
}

export async function findUser(
  name: string,
  password: string
): Promise<User | null> {
  const res = await pool.query(`SELECT * FROM users WHERE name=$1`, [name]);
  const userRow = res.rows[0];
  if (!userRow) return null;
  const ok = await bcrypt.compare(String(password), userRow.password || "");
  if (!ok) return null;
  return { id: userRow.id, name: userRow.name, phone: userRow.phone };
}

export async function addBooking(input: BookingInput): Promise<{ id: string }> {
  const { userId, name, trainer, klass, price, createdAt, bookedTime } = input;
  const res = await pool.query(
    `INSERT INTO bookings ("userId", name, trainer, "class", price, "createdAt", "bookedTime")
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      userId || null,
      name,
      trainer,
      klass,
      price,
      createdAt || new Date().toISOString(),
      bookedTime || new Date().toISOString(),
    ]
  );
  return { id: String(res.rows[0].id) };
}

export async function listBookings(): Promise<any[]> {
  const res = await pool.query(
    `SELECT * FROM bookings ORDER BY "createdAt" DESC`
  );
  return res.rows;
}

export async function listUserBookings(userId: string): Promise<any[]> {
  const res = await pool.query(
    `SELECT * FROM bookings WHERE "userId"=$1 ORDER BY "createdAt" DESC`,
    [userId]
  );
  return res.rows;
}

export async function deleteBooking(id: string, userId: string): Promise<void> {
  await pool.query(`DELETE FROM bookings WHERE id = $1 AND "userId" = $2`, [
    id,
    userId,
  ]);
}
