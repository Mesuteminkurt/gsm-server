const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// CSV dosya yolu
const csvFile = path.join(__dirname, "telemetry.csv");

// Dosya yoksa oluştur + başlık ekle
if (!fs.existsSync(csvFile)) {
    const header =
        "Zaman Damgasi;Arac Hizi (km/h);Batarya Sicakligi (°C);Batarya Gerilimi (V);Kalan Enerji (Wh)\n";
    fs.writeFileSync(csvFile, header);
}

// 📡 TELEMETRİ VERİ ALMA ENDPOINT
app.post("/telemetry", (req, res) => {
    const { speed, temp, voltage, energy } = req.body;

    const timestamp = new Date().toISOString().replace("T", " ").split(".")[0];

    const line = `${timestamp};${speed};${temp};${voltage};${energy}\n`;

    fs.appendFile(csvFile, line, (err) => {
        if (err) {
            console.error("CSV yazma hatası:", err);
            return res.status(500).send("Dosyaya yazılamadı");
        }
        res.send("Veri kaydedildi");
    });
});

app.listen(PORT, () => {
    console.log(`Server çalışıyor: http://localhost:${PORT}`);
});
