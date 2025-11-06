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
        phone TEXT,
        role TEXT DEFAULT 'user'
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        price INTEGER NOT NULL,
        about TEXT NOT NULL,
        syllabus JSONB NOT NULL,
        level TEXT NOT NULL,
        length TEXT NOT NULL,
        group_size TEXT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS trainers (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        class_id INTEGER REFERENCES classes(id),
        schedule JSONB NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        "userId" UUID REFERENCES users(id) ON DELETE CASCADE,
        "trainerId" INTEGER REFERENCES trainers(id) ON DELETE CASCADE,
        "classId" INTEGER REFERENCES classes(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "bookedTime" TIMESTAMP NOT NULL DEFAULT NOW()
      );
`);

    // Insert classes
    const classData = [
      {
        name: "Strength",
        price: 1100,
        about:
          "Certified strength coach focusing on safe barbell technique, progressive overload and core stability.",
        syllabus: [
          "Foundations: bracing & breathing",
          "Squat, bench, deadlift fundamentals",
          "Accessory work for shoulders & hips",
          "Progressive overload & deloads",
          "Recovery, mobility, & injury prevention",
        ],
        level: "Beginner–Intermediate",
        length: "60–75 minutes",
        group_size: "Up to 8",
      },
      {
        name: "Yoga & Flexibility",
        price: 1300,
        about:
          "Yoga instructor emphasizing posture alignment, breathwork, and mobility for daily life and stress relief.",
        syllabus: [
          "Breathwork & warm-up flows",
          "Alignment in standing poses",
          "Hip & hamstring mobility",
          "Core engagement & balance",
          "Guided relaxation & mindfulness",
        ],
        level: "All levels",
        length: "60 minutes",
        group_size: "Up to 12",
      },
      {
        name: "Cardio Fitness",
        price: 1800,
        about:
          "Cardio & conditioning coach. Mix of Zone-2 endurance with interval work for fat-burn and stamina.",
        syllabus: [
          "Heart-rate zones & tracking",
          "Interval & tempo sessions",
          "Low-impact conditioning circuits",
          "Plyometrics (optional, scalable)",
          "Cool-downs & mobility",
        ],
        level: "Beginner–Advanced (scaled)",
        length: "60–75 minutes",
        group_size: "Up to 10",
      },
      {
        name: "CrossFit",
        price: 2000,
        about:
          "CrossFit Level 2 coach. Functional strength & conditioning with safe scaling for all athletes.",
        syllabus: [
          "Skill focus (kettlebell, gymnastics, O-lifting)",
          "Strength segment (e.g., 5×5, EMOM)",
          "WOD: mixed modal conditioning",
          "Movement quality & scaling",
          "Mobility & recovery tips",
        ],
        level: "Intermediate–Advanced (scaled for beginners)",
        length: "75 minutes",
        group_size: "Up to 12",
      },
      {
        name: "Zumba & Dance",
        price: 1500,
        about:
          "High-energy Zumba instructor. Calorie-burning choreography with easy moves and great music.",
        syllabus: [
          "Warm-up & rhythm basics",
          "Latin & pop combos",
          "Cardio peaks & recovery tracks",
          "Light toning & core finishers",
          "Stretch & cooldown",
        ],
        level: "All levels (no dance experience needed)",
        length: "60 minutes",
        group_size: "Up to 20",
      },
    ];

    for (const c of classData) {
      await client.query(
        `INSERT INTO classes (name, price, about, syllabus, level, length, group_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (name) DO NOTHING`,
        [
          c.name,
          c.price,
          c.about,
          JSON.stringify(c.syllabus),
          c.level,
          c.length,
          c.group_size,
        ]
      );
    }

    const trainerData = [
      {
        name: "John Carter",
        class_name: "Strength",
        schedule: ["Mon 09:00–11:00", "Thu 09:00–11:00"],
      },
      {
        name: "Sophia Miller",
        class_name: "Yoga & Flexibility",
        schedule: ["Tue 11:30–13:00", "Fri 11:30–13:00"],
      },
      {
        name: "Michael Brown",
        class_name: "Cardio Fitness",
        schedule: ["Wed 13:30–15:00", "Sat 13:30–15:00"],
      },
      {
        name: "Emma Wilson",
        class_name: "CrossFit",
        schedule: ["Thu 15:30–17:00", "Sun 15:30–17:00"],
      },
      {
        name: "Daniel Smith",
        class_name: "Zumba & Dance",
        schedule: ["Fri 17:30–19:00", "Sun 17:30–19:00"],
      },
    ];

    for (const t of trainerData) {
      // Get class_id
      const classRes = await client.query(
        `SELECT id FROM classes WHERE name = $1`,
        [t.class_name]
      );
      const classId = classRes.rows[0]?.id;
      if (classId) {
        await client.query(
          `INSERT INTO trainers (name, class_id, schedule)
           VALUES ($1, $2, $3)
           ON CONFLICT (name) DO NOTHING`,
          [t.name, classId, JSON.stringify(t.schedule)]
        );
      }
    }
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
  role: string;
}

export interface BookingInput {
  userId?: string | null;
  name: string;
  trainerId: string;
  classId: string;
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
  return {
    id: userRow.id,
    name: userRow.name,
    phone: userRow.phone,
    role: userRow.role,
  };
}

export async function getUserById(id: string): Promise<User | null> {
  const res = await pool.query(`SELECT * FROM users WHERE id=$1`, [id]);
  const userRow = res.rows[0];
  if (!userRow) return null;
  return {
    id: userRow.id,
    name: userRow.name,
    phone: userRow.phone,
    role: userRow.role,
  };
}

export async function addBooking(input: BookingInput): Promise<{ id: string }> {
  const { userId, name, trainerId, classId, price, createdAt, bookedTime } =
    input;
  const res = await pool.query(
    `INSERT INTO bookings ("userId", name, "trainerId", "classId", price, "createdAt", "bookedTime")
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      userId || null,
      name,
      trainerId,
      classId,
      price,
      createdAt || new Date().toISOString(),
      bookedTime || new Date().toISOString(),
    ]
  );
  return { id: String(res.rows[0].id) };
}

export async function listBookings(): Promise<any[]> {
  const res = await pool.query(
    `SELECT b.id, b.name, b."createdAt", b."bookedTime", b.price, t.name as trainer, c.name as class
    FROM bookings b
    JOIN trainers t ON b."trainerId" = t.id
    JOIN classes c ON b."classId" = c.id
    ORDER BY b."createdAt" DESC`
  );
  return res.rows;
}

export async function listUserBookings(userId: string): Promise<any[]> {
  const res = await pool.query(
    `SELECT b.id, b.name, b."createdAt", b."bookedTime", b.price, t.name as trainer, c.name as class
    FROM bookings b
    JOIN trainers t ON b."trainerId" = t.id
    JOIN classes c ON b."classId" = c.id
    WHERE b."userId" = $1
    ORDER BY b."createdAt" DESC`,
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

export async function getClassById(id: string): Promise<any | null> {
  const res = await pool.query(`SELECT * FROM classes WHERE id = $1`, [id]);
  if (res.rows.length === 0) return null;
  return res.rows[0];
}

export async function listTrainers(): Promise<any[]> {
  const res = await pool.query(`
    SELECT t.id, t.name, t.schedule, c.name as class, c.id as classId, c.price, c.about, c.syllabus, c.level, c.length, c.group_size
    FROM trainers t
    JOIN classes c ON t.class_id = c.id
    ORDER BY t.name
    `);
  return res.rows.map((row) => ({
    id: row.id,
    name: row.name,
    class: row.class,
    classId: row.classid,
    price: row.price,
    about: row.about,
    syllabus: row.syllabus, // already parsed
    schedule: row.schedule, // already parsed
    level: row.level,
    length: row.length,
    group_size: row.group_size,
  }));
}

interface PowerBILinks {
  id: number;
  link: string;
}

export async function getPowerBIEmbedLinks(): Promise<PowerBILinks | null> {
  const res = await pool.query(`SELECT * FROM links WHERE id = 1`);
  return res.rows[0] || null;
}
