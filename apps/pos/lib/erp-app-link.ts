/**
 * Cross-app links from the POS frontend to the ERP (qoondeeye-pharmacy) web app.
 * Set `NEXT_PUBLIC_ERP_APP_URL` in production (no trailing slash), e.g. https://app.example.com
 */
export function accountingPosStatementHref(): string {
  const configured =
    process.env.NEXT_PUBLIC_ERP_APP_URL?.trim().replace(/\/$/, "") ?? "";
  const base =
    configured ||
    (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "");
  if (!base) return "#";
  return `${base}/accounting/pos-statement`;
}
