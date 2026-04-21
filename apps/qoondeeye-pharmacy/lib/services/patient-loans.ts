import { PATIENT_LOANS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type PatientLoan = {
  id: string;
  customer_id: string | null;
  branch_id: string | null;
  sale_id: string | null;
  total_amount: number | string | null;
  amount_paid: number | string | null;
  status: string | null;
  due_date: string | null;
  created_at?: string | null;

  // Included by the backend query join
  customer_name?: string | null;
};

export type CreatePatientLoanInput = {
  customerId: string;
  branchId?: string;
  saleId?: string;
  totalAmount: number;
  amountPaid?: number;
  status?: string;
  dueDate?: string;
};

export type UpdatePatientLoanInput = {
  branchId?: string;
  saleId?: string;
  totalAmount?: number;
  status?: string;
  dueDate?: string;
};

export type PatientLoanPayment = {
  id: string;
  loan_id: string;
  amount: number | string | null;
  payment_method: string | null;
  payment_date?: string | null;
  created_at?: string | null;
};

export async function getPatientLoans(
  tenantSlug: string,
  status?: string,
): Promise<PatientLoan[]> {
  const url = status ? `${PATIENT_LOANS_PREFIX}?status=${encodeURIComponent(status)}` : PATIENT_LOANS_PREFIX;
  return jsonFetch<PatientLoan[]>(url, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getPatientLoanPayments(
  tenantSlug: string,
  loanId: string,
): Promise<PatientLoanPayment[]> {
  return jsonFetch<PatientLoanPayment[]>(`${PATIENT_LOANS_PREFIX}/${loanId}/payments`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function createPatientLoan(
  tenantSlug: string,
  input: CreatePatientLoanInput,
): Promise<PatientLoan> {
  return jsonFetch<PatientLoan>(PATIENT_LOANS_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function updatePatientLoan(
  tenantSlug: string,
  loanId: string,
  input: UpdatePatientLoanInput,
): Promise<PatientLoan | null> {
  return jsonFetch<PatientLoan | null>(`${PATIENT_LOANS_PREFIX}/${loanId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deletePatientLoan(
  tenantSlug: string,
  loanId: string,
): Promise<{ deleted: boolean }> {
  return jsonFetch<{ deleted: boolean }>(`${PATIENT_LOANS_PREFIX}/${loanId}`, {
    method: "DELETE",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function addPatientLoanPayment(
  tenantSlug: string,
  loanId: string,
  input: { amount: number; paymentMethod?: string },
): Promise<{ loan: PatientLoan; payment: PatientLoanPayment } | null> {
  return jsonFetch<{ loan: PatientLoan; payment: PatientLoanPayment } | null>(
    `${PATIENT_LOANS_PREFIX}/${loanId}/payments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant": tenantSlug,
      } as JsonHeaders,
      body: JSON.stringify(input),
    },
  );
}

