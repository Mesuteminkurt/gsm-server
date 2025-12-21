const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// Son gelen telemetri RAM'de tutulur
let lastTelemetry = null;

// CSV dosya adı
const csvFile = path.join(__dirname, "telemetry.csv");

// CSV başlık satırı (ilk çalışmada)
if (!fs.existsSync(csvFile)) {
  fs.writeFileSync(
    csvFile,
    "timestamp;speed(km/h);temp(C);voltage(V);energy(Wh)\n"
  );
}

// 🔹 Telemetri alma endpoint
app.post("/telemetry", (req, res) => {
  const { speed, temp, voltage, energy } = req.body;

  if (
    speed === undefined ||
    temp === undefined ||
    voltage === undefined ||
    energy === undefined
  ) {
    return res.status(400).send("Eksik veri");
  }

  const timestamp = new Date().toISOString();

  lastTelemetry = {
    timestamp,
    speed,
    temp,
    voltage,
    energy,
  };

  const line = `${timestamp};${speed};${temp};${voltage};${energy}\n`;
  fs.appendFileSync(csvFile, line);

  res.send("OK");
});

// 🔹 Arayüzün veri çektiği endpoint
app.get("/last", (req, res) => {
  res.json(lastTelemetry);
});

// 🔹 CSV DOSYASINI İNDİRME ENDPOINT (ÖNEMLİ)
app.get("/download-csv", (req, res) => {
  res.download(csvFile, "telemetry.csv");
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
