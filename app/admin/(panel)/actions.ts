"use server";

import { revalidatePath } from "next/cache";
import { requireAdminStepUpSession } from "@/lib/server/apiAuth";
import { decideBearerRequest } from "@/lib/server/services/bearer";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";

export async function decideBearerAction(formData: FormData) {
  const current = await requireAdminStepUpSession();

  const requestIdStr = formData.get("requestId");
  const decision = formData.get("decision");

  if (typeof requestIdStr !== "string" || typeof decision !== "string") {
    throw new Error("Invalid form data");
  }

  if (decision !== "approve" && decision !== "reject") {
    throw new Error("Invalid decision");
  }

  // The admin is already authenticated + step-up-verified above, so this path
  // is pre-authorized. The id is a human-readable audit label, not a credential.
  const result = await decideBearerRequest({
    publicId: requestIdStr,
    decision: decision as "approve" | "reject",
    adminTelegramId: `admin_ui_${current.user.id}`,
    viaAdminUi: true,
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
