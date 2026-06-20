import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/Button";
import { Section, Row, RowLabel, RowValue, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { getCurrentSession } from "@/lib/server/session";
import { listSubscriptionsForUser } from "@/lib/server/repositories/subscriptions";
import { cancelSubscriptionAction } from "@/app/dashboard-actions";

export const dynamic = "force-dynamic";

function shortDate(value: string | null) {
  return value ? value.slice(0, 10) : "never";
}

export default async function SubscriptionsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const u = current.user;
  const subscriptions = await listSubscriptionsForUser(u.id);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Subscriptions</h1>
        <p className="text-[13px] text-muted">Products tied to your account</p>
      </header>

      <Section title="Subscriptions" icon={CreditCard} hint="Products you pay for">
        {subscriptions.length === 0 ? (
          <Empty>No active subscriptions</Empty>
        ) : (
          subscriptions.map(subscription => (
            <Row key={`${subscription.product}-${subscription.expiresAt || "open"}`}>
              <RowLabel>{subscription.product}</RowLabel>
              <RowValue>
                <Tag tone={subscription.status === "revoked" ? "danger" : "success"}>
                  {subscription.status}
                </Tag>
                <span className="text-muted">·</span>
                <span className="text-secondary">
                  Expires {shortDate(subscription.expiresAt)}
                </span>
              </RowValue>
              <form action={cancelSubscriptionAction}>
                <input type="hidden" name="product" value={subscription.product} />
                <Button type="submit" variant="danger" size="sm">
                  Cancel
                </Button>
              </form>
            </Row>
          ))
        )}
      </Section>
    </>
  );
}
