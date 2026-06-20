import type {
  SupportThreadKind,
  SupportThreadStatus,
} from "@/lib/server/repositories/support";

type Tone = "neutral" | "success" | "danger" | "warning" | "info";

export function kindTone(kind: SupportThreadKind): Tone {
  return kind === "ticket" ? "info" : "neutral";
}

export function statusTone(status: SupportThreadStatus): Tone {
  switch (status) {
    case "open":
      return "warning";
    case "in_progress":
      return "info";
    case "resolved":
      return "success";
    case "closed":
      return "neutral";
  }
}

export function statusLabel(status: SupportThreadStatus) {
  return status === "in_progress" ? "in progress" : status;
}
