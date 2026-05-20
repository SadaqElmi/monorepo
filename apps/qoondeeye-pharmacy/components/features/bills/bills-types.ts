export type FormMode = "create" | "edit";

export type EditablePurchase = {
  id: string;
  supplierId: string;
  branchId: string;
  invoiceNumber: string;
  productId: string;
  quantity: string;
  batchNumber: string;
  costPrice: string;
  sellingPrice: string;
  expiryDate: string;
  totalAmount: string; // for input
  purchaseDate: string; // YYYY-MM-DD
};
