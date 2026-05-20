import "server-only";

import { PATIENT_LOANS_PREFIX } from "@/lib/services/endpoints";
import { serverJsonFetch } from "@/lib/services/server-http";
import type { PatientLoan } from "@/lib/services/patient-loans";

export async function getPatientLoansServer(
  tenantSlug: string,
  status?: string,
): Promise<PatientLoan[]> {
  const url = status
    ? `${PATIENT_LOANS_PREFIX}?status=${encodeURIComponent(status)}`
    : PATIENT_LOANS_PREFIX;
  return serverJsonFetch<PatientLoan[]>(url, { tenantSlug });
}
