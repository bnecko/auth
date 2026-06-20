import { Section, Empty } from "@/components/Section";
import { Button } from "@/components/Button";
import { listSupporters } from "@/lib/server/services/support";
import { addSupporterAction, removeSupporterAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSupportersPage() {
  const supporters = await listSupporters();

  return (
    <>
      <header className="mb-10">
        <p className="text-[13px] text-muted mb-2">Admin / Support</p>
        <h1 className="text-[32px] tracking-tight text-fg leading-none">
          Supporters
        </h1>
      </header>

      <Section title="Add supporter" hint="grants supporter access">
        <form action={addSupporterAction} className="flex items-center gap-2 px-4 py-3">
          <input
            name="username"
            required
            placeholder="username or email"
            className="flex-1 h-9 rounded-md bg-card border border-rule px-3 text-[13px] text-fg placeholder:text-faint focus:outline-none focus:border-accent transition-colors"
          />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      </Section>

      <Section title="Roster" hint={`${supporters.length}`}>
        {supporters.length === 0 ? (
          <Empty>No supporters yet</Empty>
        ) : (
          supporters.map(s => (
            <div
              key={s.userId}
              className="flex items-center justify-between gap-3 px-4 py-3 border-t border-rule first:border-t-0 text-[13px]"
            >
              <div className="min-w-0">
                <div className="text-fg truncate">
                  {s.firstName} <span className="text-muted">@{s.username}</span>
                </div>
                <div className="text-[12px] text-muted">
                  added {s.createdAt.slice(0, 10)}
                </div>
              </div>
              <form action={removeSupporterAction}>
                <input type="hidden" name="userId" value={s.userId} />
                <Button type="submit" size="sm" variant="danger">
                  Remove
                </Button>
              </form>
            </div>
          ))
        )}
      </Section>
    </>
  );
}
