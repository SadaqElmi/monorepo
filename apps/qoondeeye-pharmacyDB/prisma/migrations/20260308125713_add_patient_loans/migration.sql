-- CreateTable
CREATE TABLE "tenant_template"."PatientLoan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "branch_id" UUID,
    "sale_id" UUID,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ongoing',
    "due_date" DATE,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."PatientLoanPayment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "loan_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" VARCHAR(50),
    "payment_date" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientLoanPayment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tenant_template"."PatientLoan" ADD CONSTRAINT "PatientLoan_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tenant_template"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."PatientLoan" ADD CONSTRAINT "PatientLoan_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."PatientLoan" ADD CONSTRAINT "PatientLoan_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "tenant_template"."Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."PatientLoanPayment" ADD CONSTRAINT "PatientLoanPayment_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "tenant_template"."PatientLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
