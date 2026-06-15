import { redirect } from "next/navigation";

import { getPosAppUrl } from "@/lib/pos-app-url";

/** Embedded ERP POS is retired — send users to the standalone POS app. */
export default function PosRedirectPage() {
  redirect(getPosAppUrl());
}
