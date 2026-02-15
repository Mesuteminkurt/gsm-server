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

// ilk çalıştırmada CSV oluştur (Excel garanti format)
if (!fs.existsSync(csvFile)) {
  fs.writeFileSync(
    csvFile,
    "\uFEFFsep=;\ntimestamp;speed;temp;voltage;energy;soc\n",
    "utf8"
  );
}

// ================= ZAMAN FORMAT =================
function getTimestamp() {
  const d = new Date();

  const pad = n => String(n).padStart(2,"0");

  return (
    d.getFullYear()+"-"+
    pad(d.getMonth()+1)+"-"+
    pad(d.getDate())+" "+
    pad(d.getHours())+":"+
    pad(d.getMinutes())+":"+
    pad(d.getSeconds())
  );
}

// ================= TELEMETRY POST =================
app.post("/telemetry", (req, res) => {
  try {
    let { speed, temp, voltage, energy, soc } = req.body;

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

    // number'a çevir
    speed = Number(speed);
    temp = Number(temp);
    voltage = Number(voltage);
    energy = Number(energy);
    soc = Number(soc);

    const timestamp = getTimestamp();

    lastTelemetry = {
      timestamp,
      speed,
      temp,
      voltage,
      energy,
      soc
    };

    // CSV satır
    const row =
`${timestamp};${speed};${temp};${voltage};${energy};${soc}\n`;

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
      .slice(2) // sep + header atla
      .filter(l => l.trim() !== "");

    const json = data.map(line => {
      const [timestamp, speed, temp, voltage, energy, soc] =
        line.split(";");

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
