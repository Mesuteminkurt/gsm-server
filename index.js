const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// ================= RAM CACHE =================
let lastTelemetry = null;
let ramLogs = [];
const MAX_RAM = 500;

// ================= CSV DOSYA =================
const csvFile = path.join(__dirname, "telemetry.csv");

// CSV oluştur (Excel uyumlu)
if (!fs.existsSync(csvFile)) {
  fs.writeFileSync(
    csvFile,
    "\uFEFFsep=;\ntimestamp;speed;temp;voltage;energy;soc\n",
    "utf8"
  );
}

// ================= ZAMAN =================
function getTimestamp(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,"0");

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
app.post("/telemetry",(req,res)=>{
  try{

    let { speed,temp,voltage,energy,soc } = req.body;

    if([speed,temp,voltage,energy,soc].some(v=>v==null))
      return res.status(400).json({error:"Eksik veri"});

    // number convert
    speed=Number(speed);
    temp=Number(temp);
    voltage=Number(voltage);
    energy=Number(energy);
    soc=Number(soc);

    const timestamp=getTimestamp();

    const data={timestamp,speed,temp,voltage,energy,soc};

    lastTelemetry=data;

    // RAM cache
    ramLogs.push(data);
    if(ramLogs.length>MAX_RAM)
      ramLogs.shift();

    // CSV satır (Excel uyumlu saf sayı)
const row =
`${timestamp};="${speed}";="${temp}";="${voltage}";="${energy}";="${soc}"\n`;

    // async yaz → site donmaz
    fs.appendFile(csvFile,row,err=>{
      if(err) console.error("CSV write error:",err);
    });

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
app.get("/logs",(req,res)=>{
  res.json(ramLogs.slice().reverse());
});

// ================= CSV DOWNLOAD =================
app.get("/download-csv",(req,res)=>{
  if(!fs.existsSync(csvFile))
    return res.status(404).send("CSV bulunamadı");

  res.download(csvFile,"telemetry.csv");
});

// ================= HEALTH =================
app.get("/ping",(req,res)=>{
  res.send("OK");
});

// ================= SERVER =================
app.listen(PORT,()=>{
  console.log("Server running →",PORT);
});
