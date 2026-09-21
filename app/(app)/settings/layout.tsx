import { cryptoEnabled } from "@/lib/server/config";
import { SettingsNav } from "./SettingsNav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsNav cryptoEnabled={cryptoEnabled()} />
      {children}
    </>
  );
}
