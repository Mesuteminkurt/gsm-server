const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// RAM’de son veri
let lastTelemetry = null;

// CSV yolu
const csvFile = path.join(__dirname, "telemetry.csv");

// CSV başlık oluştur (ilk çalışmada)
if (!fs.existsSync(csvFile)) {
  fs.writeFileSync(
    csvFile,
    "timestamp;speed(km/h);temp(C);voltage(V);energy(Wh);soc(%)\n"
  );
}

// === TELEMETRİ POST ===
app.post("/telemetry", (req, res) => {
  const { speed, temp, voltage, energy, soc } = req.body;

  // veri kontrolü
  if (
    speed === undefined ||
    temp === undefined ||
    voltage === undefined ||
    energy === undefined ||
    soc === undefined
  ) {
    return res.status(400).json({
      status: "error",
      message: "Eksik veri alanı",
    });
  }

  const timestamp = new Date().toISOString();

  lastTelemetry = {
    timestamp,
    speed,
    temp,
    voltage,
    energy,
    soc,
  };

  const line = `${timestamp};${speed};${temp};${voltage};${energy};${soc}\n`;

  try {
    fs.appendFileSync(csvFile, line);
  } catch (err) {
    console.error("CSV yazma hatası:", err);
  }

  res.json({ status: "ok" });
});

// === SON VERİ ===
app.get("/last", (req, res) => {
  if (!lastTelemetry)
    return res.json({ status: "no_data" });

  res.json(lastTelemetry);
});

// === CSV İNDİR ===
app.get("/download-csv", (req, res) => {
  if (!fs.existsSync(csvFile))
    return res.status(404).send("CSV bulunamadı");

  res.download(csvFile, "telemetry.csv");
});

// === SERVER ===
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
