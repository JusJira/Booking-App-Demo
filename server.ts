import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import path from "path";
import {
  addUser,
  findUser,
  addBooking,
  listBookings,
  User,
  listUserBookings,
  deleteBooking,
  listTrainers,
  getUserById,
  getPowerBIEmbedLinks,
} from "./db";

const app = express();
const publicDir = path.join(process.cwd(), "public"); //เพิ่ม

// Prices (THB)
const TRAINERS: Record<string, { class: string; price: number }> = {
  "John Carter": { class: "Strength", price: 1100 },
  "Sophia Miller": { class: "Yoga & Flexibility", price: 1300 },
  "Michael Brown": { class: "Cardio Fitness", price: 1800 },
  "Emma Wilson": { class: "CrossFit", price: 2000 },
  "Daniel Smith": { class: "Zumba & Dance", price: 1500 },
};

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: "fitness-secret-key",
    resave: false,
    saveUninitialized: true,
  })
);
app.use(express.static(publicDir)); //เพิ่ม1
//app.use(express.static(path.join(process.cwd(), "public"))); //แก้ใหม่

declare module "express-session" {
  interface SessionData {
    user?: {
      id: string;
      name: string;
      phone?: string;
    };
  }
}

function requireLogin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.user) {
    if (req.path.startsWith("/api/")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.redirect("/login.html");
    return;
  }
  next();
}
app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
}); //เพิ่มใหม่
app.get("/trainers.html", requireLogin, (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "trainers.html"));
});
app.get("/booking.html", requireLogin, (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "booking.html"));
});
app.get("/me.html", requireLogin, (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "me.html"));
});
app.get("/probe.txt", (_req, res) => {
  res.sendFile(path.join(publicDir, "probe.txt"));
}); //เพิ่มใหม่

/*app.get("/", (_req: Request, res: Response) => res.redirect("/login.html"));
app.get("/trainers.html", requireLogin, (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "trainers.html"));
});
app.get("/booking.html", requireLogin, (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "booking.html"));
});
app.get("/me.html", requireLogin, (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "me.html"));
});*/


app.post("/login", async (req: Request, res: Response) => {
  const { name, password } = req.body as { name: string; password: string };
  const user = await findUser(String(name).trim(), String(password).trim());
  if (user) {
    req.session.user = { id: user.id, name: user.name, phone: user.phone };
    res.redirect("/trainers.html");
  } else {
    res
      .status(401)
      .send("Invalid name or password. <a href='/login.html'>Back</a>");
  }
});
app.post("/logout", (req: Request, res: Response) => {
  req.session.destroy(() => res.redirect("/login.html"));
});

app.get("/api/me", requireLogin, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const userDb = await getUserById(user.id);
  res.json(userDb);
});

app.post(
  "/book",
  requireLogin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log("Booking request body:", req.body);
      const user = req.session.user!;
      const trainerId = String(req.body.trainerId || "").trim();
      const classId = String(req.body.classId || "").trim();
      const price = Number(req.body.price || 0);

      const trainerName = String(req.body.trainer || "").trim();
      const className = String(req.body.class || "").trim();

      const finalPrice = price || 0;

      const bookingDate = String(req.body.date || req.query.date || "").trim(); // e.g. "2025-11-05"
      const timeSlotRaw = String(
        req.body.timeSlot || req.query.timeSlot || ""
      ).trim(); // e.g. "13:30–15:00"
      const startMatch = timeSlotRaw.match(/\d{1,2}:\d{2}/); // finds first "HH:MM"
      let bookedTimeIso = new Date().toISOString(); // fallback
      if (bookingDate && startMatch) {
        const startTime = startMatch[0]; // "13:30"
        const dt = new Date(`${bookingDate}T${startTime}:00`);
        if (!isNaN(dt.getTime())) bookedTimeIso = dt.toISOString();
      }

      const record = {
        userId: user.id,
        name: user.name,
        trainerId: trainerId,
        classId: classId,
        price: finalPrice,
        createdAt: new Date().toISOString(),
        bookedTime: bookedTimeIso,
      };
      const { id } = await addBooking(record);

      const q = new URLSearchParams({
        id: String(id),
        name: user.name,
        trainer: trainerName,
        class: className,
        price: String(finalPrice),
      }).toString();
      res.redirect(`/success.html?${q}`);
    } catch (err) {
      next(err);
    }
  }
);

app.get("/admin", requireLogin, async (_req: Request, res: Response) => {
  const user = _req.session.user!;
  const userDb = await getUserById(user.id);
  if (userDb?.role !== "admin") {
    return res.status(403).send("Forbidden");
  }
  const powerBILink = await getPowerBIEmbedLinks();
  const rows = await listBookings();
  const rowsHtml = rows
    .map(
      (b: any) => `
    <tr>
      <td class="border px-4 py-2">${b.id}</td>
      <td class="border px-4 py-2">${b.createdAt}</td>
      <td class="border px-4 py-2">${b.name}</td>
      <td class="border px-4 py-2">${b.trainer}</td>
      <td class="border px-4 py-2">${b.class}</td>
      <td class="border px-4 py-2">฿${Number(b.price).toLocaleString()}</td>
    </tr>`
    )
    .join("");
  res.send(`<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin — Bookings</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-gray-100 min-h-screen p-6">
    <div class="container mx-auto max-w-6xl">
      <h1 class="text-3xl font-bold text-gray-800 mb-4">Bookings (Admin)</h1>
      <p class="mb-4">
        <a href="/trainers.html" class="text-blue-500 hover:underline">← Back to Trainers</a>
      </p>
      <button onclick="window.open('${
        powerBILink?.link
      }', '_blank')" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mb-6">
        Open Power BI
      </button>
      <div class="overflow-x-auto">
        <table class="min-w-full bg-white border border-gray-300">
          <thead class="bg-gray-50">
            <tr>
              <th class="border px-4 py-2 text-left">ID</th>
              <th class="border px-4 py-2 text-left">Date</th>
              <th class="border px-4 py-2 text-left">User</th>
              <th class="border px-4 py-2 text-left">Trainer</th>
              <th class="border px-4 py-2 text-left">Class</th>
              <th class="border px-4 py-2 text-left">Price (THB)</th>
            </tr>
          </thead>
          <tbody>
            ${
              rowsHtml ||
              "<tr><td colspan='6' class='border px-4 py-2 text-center'>No bookings yet</td></tr>"
            }
          </tbody>
        </table>
      </div>
    </div>
  </body>
  </html>`);
});

app.get("/api/bookings", requireLogin, async (_req: Request, res: Response) => {
  const rows = await listBookings();
  res.json(rows);
});

app.get(
  "/api/bookings/me",
  requireLogin,
  async (req: Request, res: Response) => {
    const user = req.session.user!;
    const rows = await listUserBookings(user.id);
    res.json(rows);
  }
);

app.delete(
  "/api/bookings/:id",
  requireLogin,
  async (req: Request, res: Response) => {
    try {
      const bookingId = req.params.id;
      const userId = req.session.user!.id;
      if (!bookingId) {
        return res.status(400).json({ error: "Booking ID is required" });
      }
      // Assume db has a deleteBooking function
      await deleteBooking(bookingId, userId);
      res.json({ message: "Booking cancelled" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to cancel booking" });
    }
  }
);

app.get("/api/trainers", async (_req: Request, res: Response) => {
  const trainers = await listTrainers();
  res.json(trainers);
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).send("Server error");
});

app.post("/signup", async (req: Request, res: Response) => {
  console.log("Signup request body:", req.body);
  try {
    const name = String(req.body.name || "").trim();
    const password = String(req.body.password || "").trim();
    const phone = String(req.body.phone || "").trim();

    if (!name || !password || !phone) {
      return res
        .status(400)
        .send(
          "Name, password, and phone are required. <a href='/signup.html'>Back</a>"
        );
    }

    await addUser(name, password, phone);
    res.redirect("/login.html");
  } catch (e) {
    console.error(e);
    res
      .status(400)
      .send(
        "Sign-up failed (user may already exist). <a href='/signup.html'>Back</a>"
      );
  }
});

const port = parseInt(process.env.PORT || "3000", 10);
app.listen(port, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${port}`);
});
