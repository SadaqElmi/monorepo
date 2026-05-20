import PharmacyPosPage from "@/components/pharmacy-pos/pharmacy-pos-page";
import { requireServerSession } from "@/lib/auth-server";

export default async function Page() {
  await requireServerSession();
  return <PharmacyPosPage />;
}
