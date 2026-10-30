import { Badge } from "@/components/ui/badge";
import { RequestStatus } from "@/types/database";
import { statusLabels } from "@/lib/utils";

export function StatusBadge({ status }: { status: RequestStatus }) {
  const tone = status === "approved" ? "success"
    : status === "rejected" || status === "cancelled" ? "danger"
      : status === "observed" ? "warning"
        : status === "in_review" ? "default" : "muted";
  return <Badge tone={tone}>{statusLabels[status]}</Badge>;
}
