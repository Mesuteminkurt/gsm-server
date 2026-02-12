const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// ================= RAM SON VERİ =================
let lastTelemetry = null;

// ================= CSV DOSYA =================
const csvFile = path.join(__dirname, "telemetry.csv");

// ilk çalıştırmada CSV oluştur (Excel uyumlu UTF-8 BOM)
if (!fs.existsSync(csvFile)) {
  fs.writeFileSync(
    csvFile,
    "\uFEFFtimestamp;speed;temp;voltage;energy;soc\n",
    "utf8"
  );
}

// ================= TELEMETRY POST =================
app.post("/telemetry", (req, res) => {
  try {
    let { speed, temp, voltage, energy, soc } = req.body;

    // veri doğrulama
    if (
      speed == null ||
      temp == null ||
      voltage == null ||
      energy == null ||
      soc == null
    ) {
      return res.status(400).json({
        status: "error",
        message: "Eksik veri alanı"
      });
    }

    // number'a çevir (STM bazen string gönderir)
    speed = Number(speed);
    temp = Number(temp);
    voltage = Number(voltage);
    energy = Number(energy);
    soc = Number(soc);

    const timestamp = new Date().toLocaleString("sv-SE", {
      timeZone: "Europe/Istanbul"
    }).replace(" ", "T");

    lastTelemetry = {
      timestamp,
      speed,
      temp,
      voltage,
      energy,
      soc
    };

    // Excel uyumlu sayı formatı
    const row =
      `${timestamp};` +
      `${speed.toFixed(2)};` +
      `${temp.toFixed(2)};` +
      `${voltage.toFixed(2)};` +
      `${energy.toFixed(2)};` +
      `${soc.toFixed(2)}\n`;

    fs.appendFileSync(csvFile, row);

    res.json({ status: "ok" });

  } catch (err) {
    console.error("POST ERROR:", err);
    res.status(500).json({ status: "server_error" });
  }
});

// ================= SON VERİ =================
app.get("/last", (req, res) => {
  if (!lastTelemetry)
    return res.json({ status: "no_data" });

  res.json(lastTelemetry);
});

// ================= LOG LİSTESİ =================
app.get("/logs", (req, res) => {
  try {
    const data = fs.readFileSync(csvFile, "utf8")
      .split("\n")
      .slice(1)
      .filter(l => l.trim() !== "");

    const json = data.map(line => {
      const [timestamp, speed, temp, voltage, energy, soc] =
        line.trim().split(";");

      return {
        timestamp,
        speed: Number(speed),
        temp: Number(temp),
        voltage: Number(voltage),
        energy: Number(energy),
        soc: Number(soc)
      };
    });

    res.json(json.reverse());

  } catch (err) {
    res.status(500).send("Log okunamadı");
  }
});

// ================= CSV DOWNLOAD =================
app.get("/download-csv", (req, res) => {
  if (!fs.existsSync(csvFile))
    return res.status(404).send("CSV bulunamadı");

  res.download(csvFile, "telemetry.csv");
});

// ================= HEALTH CHECK =================
app.get("/ping", (req, res) => {
  res.send("OK");
});

// ================= SERVER =================
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
