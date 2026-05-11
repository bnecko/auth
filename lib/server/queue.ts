import { Queue } from "bullmq";
import redis from "./redis";

let telegramQueue: Queue | null = null;

export function getTelegramQueue() {
  telegramQueue ??= new Queue("telegram-notifications", {
    connection: redis,
  });
  return telegramQueue;
}
