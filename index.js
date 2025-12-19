const express = require("express");
const app = express();

app.use(express.json());
app.use(express.static("public"));

let lastData = {
  temp: null,
  hum: null,
  time: null
};

app.post("/data", (req, res) => {
  const { temp, hum } = req.body;

  lastData = {
    temp,
    hum,
    time: new Date().toLocaleString()
  };

  res.json({ status: "ok" });
});

app.get("/api/data", (req, res) => {
  res.json(lastData);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server çalışıyor:", PORT);
});