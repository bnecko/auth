"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentSession } from "@/lib/server/session";
import { requestContextFromHeaders } from "@/lib/server/http";
import { retryWebhookDelivery } from "@/lib/server/repositories/webhooks";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";

export async function retryWebhookDeliveryAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") {
    throw new Error("Not authorized");
  }

  const publicId = String(formData.get("public_id") || "");
  if (!publicId) {
    throw new Error("public_id is required");
  }

  const delivery = await retryWebhookDelivery(publicId);
  if (!delivery) {
    throw new Error("Delivery not found or not retryable");
  }

  await recordSecurityEvent({
    userId: current.user.id,
    eventType: "admin_webhook_retry",
    result: "ok",
    context: requestContextFromHeaders(await headers()),
    metadata: { publicId },
  });

  revalidatePath("/admin/webhooks");
}
