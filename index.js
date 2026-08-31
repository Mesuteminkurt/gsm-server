const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// ================= RAM CACHE =================
let lastTelemetry = null;
let ramLogs = [];
let logVersion = 0;          // her POST'ta artar, client değişim takibi yapabilir
const MAX_RAM = 500;

// ================= CSV DOSYA =================
let currentCsvFile = "";
let last_zaman_ms = -1;

function createNewCsvFile() {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, "0");
  const timeStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`;
  
  currentCsvFile = path.join(__dirname, `SUBUTETRA-EMT_telemetry_${timeStr}.csv`);
  fs.writeFileSync(
    currentCsvFile,
    "\uFEFFsep=;\nzaman_ms;hız;batarya max sıcaklık;batarya voltajı;kalan enerji\n",
    "utf8"
  );
}

// İlk başlangıçta bir dosya oluştur
createNewCsvFile();

// ================= EKSTRA CSV KAYIT =================
let extraCsvFile = "";
let extraCsvActive = false;
let extraCsvRowCount = 0;

function createExtraCsvFile() {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, "0");
  const timeStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`;
  
  // Sütun başlıkları: sistem/uyarı durumları (st1-st4), hücreler ve sıcaklık sensörleri HARİÇ
  const header = `\uFEFFsep=;\nzaman_ms;timestamp;hız;batarya max sıcaklık;batarya voltajı;kalan enerji;SOC;batarya akımı;izolasyon_n;izolasyon_p\n`;
  
  extraCsvFile = path.join(__dirname, `SUBUTETRA-EMT_EKSTRA_${timeStr}.csv`);
  fs.writeFileSync(extraCsvFile, header, "utf8");
  extraCsvRowCount = 0;
}

// ================= ZAMAN (GMT+3) =================
function getTimestamp(){
  const d=new Date(Date.now() + 3 * 60 * 60 * 1000);
  const pad=n=>String(n).padStart(2,"0");

  return (
    d.getUTCFullYear()+"-"+
    pad(d.getUTCMonth()+1)+"-"+
    pad(d.getUTCDate())+" "+
    pad(d.getUTCHours())+":"+
    pad(d.getUTCMinutes())+":"+
    pad(d.getUTCSeconds())
  );
}

// ================= TELEMETRY POST =================
app.post("/telemetry",(req,res)=>{
  try{

    let dataBody = req.body;
    let zaman_ms=Number(dataBody.zaman_ms ?? 0);

    // Araç yeniden başlatıldıysa (yeni zaman_ms < eski zaman_ms)
    // tolerans bırakmak için 0'dan büyükse şartı da eklenebilir, ancak genelde araç açıldığında millis düşük başlar.
    if (last_zaman_ms !== -1 && zaman_ms < last_zaman_ms) {
      createNewCsvFile();
      ramLogs = []; // UI'daki geçmiş veriyi temizle
      logVersion++;
    }
    last_zaman_ms = zaman_ms;

    let speed=Number(dataBody.sp ?? dataBody.speed ?? 0);
    let temp=Number(dataBody.t ?? dataBody.temp ?? 0);
    let voltage=Number(dataBody.v ?? dataBody.voltage ?? 0);
    let energy=Number(dataBody.e ?? dataBody.energy ?? 0);
    energy = energy / 28 * 21;  // ham değer düzeltmesi
    let soc=Number(dataBody.s ?? dataBody.soc ?? 0) / 100;

    const timestamp=getTimestamp();

    const data={ timestamp, zaman_ms, speed, temp, voltage, energy, soc, ...dataBody };

    lastTelemetry=data;
    logVersion++;

    if (global.dataTimeout) clearTimeout(global.dataTimeout);
    global.dataTimeout = setTimeout(() => {
      lastTelemetry = null;
    }, 5000);

    // RAM cache (sadece istenen veriler)
    ramLogs.push({ zaman_ms, speed, temp, voltage, energy });
    if(ramLogs.length>MAX_RAM)
      ramLogs.shift();

    // CSV satır (Excel uyumlu saf sayı)
const row =
`="${zaman_ms}";="${speed}";="${temp}";="${voltage}";="${energy}"\n`;

    // async yaz → site donmaz
    fs.appendFile(currentCsvFile,row,err=>{
      if(err) console.error("CSV write error:",err);
    });

    // ===== EKSTRA CSV KAYIT =====
    if(extraCsvActive && extraCsvFile) {
      const ba = dataBody.ba !== undefined ? dataBody.ba : "";
      const iso_n = dataBody.in !== undefined ? dataBody.in : "";
      const iso_p = dataBody.ip !== undefined ? dataBody.ip : "";
      const ts = getTimestamp();

      const extraRow = `="${zaman_ms}";"${ts}";="${speed}";="${temp}";="${voltage}";="${energy}";="${soc}";="${ba}";="${iso_n}";="${iso_p}"\n`;

      fs.appendFile(extraCsvFile, extraRow, err => {
        if(err) console.error("Extra CSV write error:", err);
      });
      extraCsvRowCount++;
    }

    res.json({status:"ok"});

  }catch(e){
    console.error(e);
    res.status(500).json({error:"server"});
  }
});

// ================= BULK (ÇEVRİMDIŞI) TELEMETRY POST =================
app.post("/telemetry-bulk",(req,res)=>{
  try{
    let bulkData = req.body;
    if(!Array.isArray(bulkData)) return res.status(400).json({error:"Array expected"});

    // Bulk verileri RAM'e ekle
    bulkData.forEach(item => {
      let zaman_ms = Number(item.zaman_ms ?? 0);
      let speed = Number(item.sp ?? 0);
      let temp = Number(item.t ?? 0);
      let voltage = Number(item.v ?? 0);
      let energy = Number(item.e ?? 0);
      energy = energy / 28 * 21;  // ham değer düzeltmesi

      ramLogs.push({ zaman_ms, speed, temp, voltage, energy });
    });

    // RAM'i zaman_ms'e göre sırala (kronolojik düzen)
    ramLogs.sort((a, b) => a.zaman_ms - b.zaman_ms);
    if(ramLogs.length > MAX_RAM) ramLogs = ramLogs.slice(-MAX_RAM);

    // CSV dosyasını sıralı haliyle baştan yaz
    const header = "\uFEFFsep=;\nzaman_ms;hız;batarya max sıcaklık;batarya voltajı;kalan enerji\n";
    let csvContent = header;
    ramLogs.forEach(r => {
      csvContent += `="${r.zaman_ms}";="${r.speed}";="${r.temp}";="${r.voltage}";="${r.energy}"\n`;
    });
    fs.writeFile(currentCsvFile, csvContent, "utf8", err => {
      if(err) console.error("CSV bulk rewrite error:", err);
    });

    logVersion++;

    res.json({status:"ok"});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"server"});
  }
});

// ================= SON VERİ =================
app.get("/last",(req,res)=>{
  res.json(lastTelemetry || {status:"no_data"});
});

// ================= LOG LİSTESİ =================
let cachedReversed = [];
let cachedVersion = -1;

app.get("/logs",(req,res)=>{
  // Client version parametresi varsa ve değişmemişse 204 döndür
  const clientVer = parseInt(req.query.v);
  if(!isNaN(clientVer) && clientVer === logVersion){
    return res.status(204).end();
  }

  // Sadece değiştiyse yeniden ters çevir
  if(cachedVersion !== logVersion){
    cachedReversed = ramLogs.slice().reverse();
    cachedVersion = logVersion;
  }
  res.json({ version: logVersion, data: cachedReversed });
});

// ================= CSV DOWNLOAD & LIST =================
app.get("/list-csv",(req,res)=>{
  fs.readdir(__dirname, (err, files) => {
    if (err) return res.status(500).send("Dosya okuma hatası");
    const csvFiles = files.filter(f => f.startsWith("SUBUTETRA-EMT_telemetry_") && f.endsWith(".csv"));
    // En yeni en üstte veya altta olabilir, isimler tarihe göre sıralı.
    res.json(csvFiles.sort());
  });
});

app.get("/download-csv/:filename",(req,res)=>{
  const file = req.params.filename;
  if (!file.startsWith("SUBUTETRA-EMT_telemetry_") || !file.endsWith(".csv")) {
    return res.status(400).send("Geçersiz dosya");
  }
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("CSV bulunamadı");
  }
  res.download(filePath, file);
});

// ================= EKSTRA CSV ENDPOINT'LERİ =================
app.post("/extra-csv/start",(req,res)=>{
  if(extraCsvActive) return res.json({status:"already_recording", file: path.basename(extraCsvFile), rows: extraCsvRowCount});
  createExtraCsvFile();
  extraCsvActive = true;
  console.log("Ekstra CSV kaydı başlatıldı:", extraCsvFile);
  res.json({status:"started", file: path.basename(extraCsvFile)});
});

app.post("/extra-csv/stop",(req,res)=>{
  if(!extraCsvActive) return res.json({status:"not_recording"});
  extraCsvActive = false;
  console.log("Ekstra CSV kaydı durduruldu:", extraCsvFile, "Toplam satır:", extraCsvRowCount);
  res.json({status:"stopped", file: path.basename(extraCsvFile), rows: extraCsvRowCount});
});

app.get("/extra-csv/status",(req,res)=>{
  res.json({
    active: extraCsvActive,
    file: extraCsvFile ? path.basename(extraCsvFile) : "",
    rows: extraCsvRowCount
  });
});

app.get("/extra-csv/download",(req,res)=>{
  if(!extraCsvFile || !fs.existsSync(extraCsvFile)) {
    return res.status(404).send("Ekstra CSV bulunamadı");
  }
  res.download(extraCsvFile, path.basename(extraCsvFile));
});

// ================= HEALTH =================
app.get("/ping",(req,res)=>{
  res.send("OK");
});

// ================= SERVER =================
app.listen(PORT,()=>{
  console.log("Server running →",PORT);
});
