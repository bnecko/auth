const { Worker } = require("bullmq");
const Redis = require("ioredis");

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error("TELEGRAM_BOT_TOKEN is required for the worker");
  process.exit(1);
}

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker("telegram-notifications", async (job) => {
  if (job.name === "send") {
    console.log(`Sending telegram message for job ${job.id}...`);
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(job.data),
    });
    
    if (!res.ok) {
      const errText = await res.text();
      console.error(`Telegram API error: ${errText}`);
      throw new Error(`Telegram API error: ${res.status}`);
    }
  }
}, { connection });

worker.on("completed", job => console.log(`Job ${job.id} completed!`));
worker.on("failed", (job, err) => console.error(`Job ${job?.id} failed: ${err.message}`));

console.log("Telegram BullMQ Worker started.");
