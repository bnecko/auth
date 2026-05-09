"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/server/session";
import { decideBearerRequest } from "@/lib/server/services/bearer";
import { bearerAdminTelegramId } from "@/lib/server/config";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";

export async function decideBearerAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") {
    throw new Error("Not authorized");
  }

  const requestIdStr = formData.get("requestId");
  const decision = formData.get("decision");

  if (typeof requestIdStr !== "string" || typeof decision !== "string") {
    throw new Error("Invalid form data");
  }

  if (decision !== "approve" && decision !== "reject") {
    throw new Error("Invalid decision");
  }

  const adminId = bearerAdminTelegramId() || `admin_ui_${current.user.id}`;
  
  const result = await decideBearerRequest({
    publicId: requestIdStr,
    decision: decision as "approve" | "reject",
    adminTelegramId: adminId
  });
  
  await recordSecurityEvent({
    userId: current.user.id,
    eventType: "admin_bearer_decision",
    result: decision,
    context: { ip: "", userAgent: "admin_ui", country: "" },
    metadata: { requestId: requestIdStr, outcome: result },
  });
  
  revalidatePath("/admin");
}
