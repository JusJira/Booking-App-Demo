import express, { Request, Response, NextFunction } from "express";
// ❌ ลบ express-session ออก
// import session from "express-session";
import cookieSession from "cookie-session";
import path from "path";
import {
  addUser,
  findUser,
  addBooking,
  listBookings,
  User,
  listUserBookings,
  deleteBooking,
  updateBookingStatus,
  listTrainers,
  getUserById,
  getPowerBIEmbedLinks,
  checkExistingBooking,
} from "./db";

const app = express();
const publicDir = path.join(process.cwd(), "public");

app.set("trust proxy", 1);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ----- Session (cookie-session) -----
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret";
app.use(
  cookieSession({
    name: "sess",
    keys: [SESSION_SECRET],
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 วัน
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  })
);

app.use(express.static(publicDir));

// ----- เพิ่ม type ให้กับ cookie-session -----
declare module "cookie-session" {
  interface CookieSessionObject {
    user?: {
      id: string;
      name: string;
      phone?: string;
    };
  }
}

// ----- Middleware -----
function requireLogin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.user) {
    if (req.path.startsWith("/api/")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.redirect("/login.html");
    return;
  }
  next();
}

// ----- Routes -----
app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "login.html")));
app.get("/trainers.html", requireLogin, (_req, res) =>
  res.sendFile(path.join(publicDir, "trainers.html"))
);
app.get("/booking.html", requireLogin, (_req, res) =>
  res.sendFile(path.join(publicDir, "booking.html"))
);
app.get("/me.html", requireLogin, (_req, res) =>
  res.sendFile(path.join(publicDir, "me.html"))
);

app.get("/probe.txt", (_req, res) =>
  res.sendFile(path.join(publicDir, "probe.txt"))
);

// ----- Auth -----
app.post("/login", async (req: Request, res: Response) => {
  const { name, password } = req.body as { name: string; password: string };
  const user = await findUser(String(name).trim(), String(password).trim());
  if (user) {
    req.session!.user = { id: user.id, name: user.name, phone: user.phone };
    res.redirect("/trainers.html");
  } else {
    res
      .status(401)
      .send("Invalid name or password. <a href='/login.html'>Back</a>");
  }
});

app.post("/logout", (req: Request, res: Response) => {
  // cookie-session ลบ session แบบนี้
  req.session = null;
  res.redirect("/login.html");
});

app.post("/signup", async (req: Request, res: Response) => {
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

// ----- User info -----
app.get("/api/me", requireLogin, async (req: Request, res: Response) => {
  const user = req.session!.user!;
  const userDb = await getUserById(user.id);
  res.json(userDb);
});

// ----- Booking -----
app.post(
  "/book",
  requireLogin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log("Booking request body:", req.body);
      const user = req.session!.user!;
      const trainerId = String(req.body.trainerId || "").trim();
      const classId = String(req.body.classId || "").trim();
      const price = Number(req.body.price || 0);

      const trainerName = String(req.body.trainer || "").trim();
      const className = String(req.body.class || "").trim();
      const finalPrice = price || 0;

      const bookingDate = String(req.body.date || req.query.date || "").trim();
      const timeSlotRaw = String(
        req.body.timeSlot || req.query.timeSlot || ""
      ).trim();

      const startMatch = timeSlotRaw.match(/\d{1,2}:\d{2}/);
      let bookedTimeIso = new Date().toISOString();
      if (bookingDate && startMatch) {
        const startTime = startMatch[0];
        const dt = new Date(`${bookingDate}T${startTime}:00`);
        if (!isNaN(dt.getTime())) bookedTimeIso = dt.toISOString();
      }

      // Duplicate check
      const existingBooking = await checkExistingBooking(
        user.id,
        trainerId,
        bookedTimeIso
      );
      if (existingBooking) {
        const bookedDateTime = new Date(existingBooking.bookedTime);
        const formattedDate = bookedDateTime.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const formattedTime = bookedDateTime.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        });

        return res.status(409).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Already Booked</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-neutral-800 min-h-screen flex items-center justify-center px-4">
  <div class="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
    <div class="mb-6">
      <svg class="mx-auto h-16 w-16 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
      </svg>
    </div>
    <h1 class="text-2xl font-bold text-gray-800 mb-4">Already Booked!</h1>
    <p class="text-gray-600 mb-6">
      You already have a booking for <strong>${existingBooking.class}</strong> with <strong>${existingBooking.trainer}</strong>
    </p>
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <p class="text-sm text-gray-600 mb-2">Your existing booking:</p>
      <p class="font-semibold text-gray-800">${formattedDate}</p>
      <p class="font-semibold text-blue-600">${formattedTime}</p>
    </div>
    <p class="text-gray-500 text-sm mb-6">
      You cannot book the same class at the same time twice. Please choose a different time slot or cancel your existing booking first.
    </p>
    <a href="/trainers.html" class="inline-block bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 font-semibold transition">
      Back to Trainer Selection
    </a>
  </div>
</body>
</html>`);
      }

      // Insert booking
      const record = {
        userId: user.id,
        name: user.name,
        trainerId,
        classId,
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

// ----- Admin -----
app.get("/admin", requireLogin, async (req: Request, res: Response) => {
  const user = req.session!.user!;
  const userDb = await getUserById(user.id);
  if (userDb?.role !== "admin") {
    return res.status(403).send("Forbidden");
  }

  const powerBILink = await getPowerBIEmbedLinks();
  const rows = await listBookings();

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      booked: "bg-blue-100 text-blue-800",
      cancelled: "bg-red-100 text-red-800",
      finished: "bg-green-100 text-green-800",
    };
    return `<span class="px-2 py-1 rounded-full text-xs font-semibold ${
      colors[status] || "bg-gray-100 text-gray-800"
    }">${status}</span>`;
  };

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
      <td class="border px-4 py-2">${getStatusBadge(b.status || "booked")}</td>
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
    <button onclick="window.open('${powerBILink?.link || "#"}', '_blank')" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mb-6">
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
            <th class="border px-4 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || "<tr><td colspan='7' class='border px-4 py-2 text-center'>No bookings yet</td></tr>"}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`);
});

// ----- APIs -----
app.get("/api/bookings", requireLogin, async (_req: Request, res: Response) => {
  const rows = await listBookings();
  res.json(rows);
});

app.get(
  "/api/bookings/me",
  requireLogin,
  async (req: Request, res: Response) => {
    const user = req.session!.user!;
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
      const userId = req.session!.user!.id;
      if (!bookingId) {
        return res.status(400).json({ error: "Booking ID is required" });
      }
      const rowCount = await deleteBooking(bookingId, userId);
      if (rowCount === 0) {
        return res.status(404).json({ error: "Booking not found" });
      }
      res.json({ message: "Booking cancelled" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to cancel booking" });
    }
  }
);

app.patch(
  "/api/bookings/:id/status",
  requireLogin,
  async (req: Request, res: Response) => {
    try {
      const bookingId = req.params.id;
      const userId = req.session!.user!.id;
      const { status } = req.body;
      if (!bookingId || !status) {
        return res.status(400).json({ error: "Booking ID and status required" });
      }
      if (!["booked", "cancelled", "finished"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const rowCount = await updateBookingStatus(bookingId, userId, status);
      if (rowCount === 0) {
        return res.status(404).json({ error: "Booking not found" });
      }
      res.json({ message: "Booking status updated" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update booking status" });
    }
  }
);

app.get("/api/trainers", async (_req: Request, res: Response) => {
  const trainers = await listTrainers();
  res.json(trainers);
});

// ----- Error handler -----
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).send("Server error");
});

// ----- Export for Vercel (อย่าฟังบน Vercel) -----
export default app;

// ----- Run local (เฉพาะ dev) -----
if (!process.env.VERCEL && process.env.NODE_ENV !== "production") {
  const port = parseInt(process.env.PORT || "5000", 10);
  app.listen(port, "0.0.0.0", () => {
    console.log(`✅ Server running on http://localhost:${port}`);
  });
}
