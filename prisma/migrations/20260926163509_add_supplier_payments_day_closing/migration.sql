-- DropIndex
DROP INDEX `audit_logs_user_id_fkey` ON `audit_logs`;

-- DropIndex
DROP INDEX `diagnostic_receipt_items_catalog_item_id_fkey` ON `diagnostic_receipt_items`;

-- DropIndex
DROP INDEX `diagnostic_receipt_items_receipt_id_fkey` ON `diagnostic_receipt_items`;

-- DropIndex
DROP INDEX `diagnostic_receipt_items_result_uploaded_by_id_fkey` ON `diagnostic_receipt_items`;

-- DropIndex
DROP INDEX `diagnostic_receipts_created_by_id_fkey` ON `diagnostic_receipts`;

-- DropIndex
DROP INDEX `diagnostic_receipts_doctor_id_fkey` ON `diagnostic_receipts`;

-- DropIndex
DROP INDEX `diagnostic_receipts_patient_id_fkey` ON `diagnostic_receipts`;

-- DropIndex
DROP INDEX `diagnostic_receipts_printed_by_id_fkey` ON `diagnostic_receipts`;

-- DropIndex
DROP INDEX `emergency_visits_created_by_id_fkey` ON `emergency_visits`;

-- DropIndex
DROP INDEX `expenses_created_by_id_fkey` ON `expenses`;

-- DropIndex
DROP INDEX `expenses_doctor_id_fkey` ON `expenses`;

-- DropIndex
DROP INDEX `expenses_employee_id_fkey` ON `expenses`;

-- DropIndex
DROP INDEX `inventory_transactions_user_id_fkey` ON `inventory_transactions`;

-- DropIndex
DROP INDEX `medicine_batches_purchase_id_fkey` ON `medicine_batches`;

-- DropIndex
DROP INDEX `medicine_purchase_return_items_batch_id_fkey` ON `medicine_purchase_return_items`;

-- DropIndex
DROP INDEX `medicine_purchase_return_items_return_id_fkey` ON `medicine_purchase_return_items`;

-- DropIndex
DROP INDEX `medicine_purchase_returns_created_by_id_fkey` ON `medicine_purchase_returns`;

-- DropIndex
DROP INDEX `medicine_purchase_returns_supplier_id_fkey` ON `medicine_purchase_returns`;

-- DropIndex
DROP INDEX `medicine_purchases_created_by_id_fkey` ON `medicine_purchases`;

-- DropIndex
DROP INDEX `medicine_purchases_supplier_id_fkey` ON `medicine_purchases`;

-- DropIndex
DROP INDEX `medicine_sale_items_batch_id_fkey` ON `medicine_sale_items`;

-- DropIndex
DROP INDEX `medicine_sale_items_medicine_item_id_fkey` ON `medicine_sale_items`;

-- DropIndex
DROP INDEX `medicine_sale_items_sale_id_fkey` ON `medicine_sale_items`;

-- DropIndex
DROP INDEX `medicine_sale_return_items_batch_id_fkey` ON `medicine_sale_return_items`;

-- DropIndex
DROP INDEX `medicine_sale_return_items_return_id_fkey` ON `medicine_sale_return_items`;

-- DropIndex
DROP INDEX `medicine_sale_return_items_sale_item_id_fkey` ON `medicine_sale_return_items`;

-- DropIndex
DROP INDEX `medicine_sale_returns_created_by_id_fkey` ON `medicine_sale_returns`;

-- DropIndex
DROP INDEX `medicine_sale_returns_sale_id_fkey` ON `medicine_sale_returns`;

-- DropIndex
DROP INDEX `medicine_sales_created_by_id_fkey` ON `medicine_sales`;

-- DropIndex
DROP INDEX `medicine_sales_patient_id_fkey` ON `medicine_sales`;

-- DropIndex
DROP INDEX `medicine_stock_adjustments_adjusted_by_id_fkey` ON `medicine_stock_adjustments`;

-- DropIndex
DROP INDEX `medicine_stock_adjustments_batch_id_fkey` ON `medicine_stock_adjustments`;

-- DropIndex
DROP INDEX `medicine_stock_adjustments_medicine_item_id_fkey` ON `medicine_stock_adjustments`;

-- DropIndex
DROP INDEX `medicine_stock_transactions_created_by_id_fkey` ON `medicine_stock_transactions`;

-- DropIndex
DROP INDEX `opd_visits_created_by_id_fkey` ON `opd_visits`;

-- DropIndex
DROP INDEX `ot_cases_created_by_id_fkey` ON `ot_cases`;

-- DropIndex
DROP INDEX `ot_cases_doctor_id_fkey` ON `ot_cases`;

-- DropIndex
DROP INDEX `ot_line_items_inventory_item_id_fkey` ON `ot_line_items`;

-- DropIndex
DROP INDEX `ot_line_items_ot_case_id_fkey` ON `ot_line_items`;

-- DropIndex
DROP INDEX `patients_created_by_id_fkey` ON `patients`;

-- DropIndex
DROP INDEX `payments_created_by_id_fkey` ON `payments`;

-- DropIndex
DROP INDEX `payments_emergency_visit_id_fkey` ON `payments`;

-- DropIndex
DROP INDEX `payments_medicine_sale_id_fkey` ON `payments`;

-- DropIndex
DROP INDEX `payments_opd_visit_id_fkey` ON `payments`;

-- DropIndex
DROP INDEX `payments_ot_case_id_fkey` ON `payments`;

-- DropIndex
DROP INDEX `payments_receipt_id_fkey` ON `payments`;

-- AlterTable
ALTER TABLE `medicine_purchase_returns` ADD COLUMN `refund_mode` VARCHAR(10) NOT NULL DEFAULT 'CASH';

-- CreateTable
CREATE TABLE `supplier_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `supplier_id` INTEGER NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `method` ENUM('CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'FREE') NOT NULL DEFAULT 'CASH',
    `paid_on` DATE NOT NULL,
    `note` VARCHAR(500) NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `supplier_payments_supplier_id_idx`(`supplier_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medicine_day_closings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `closing_date` DATE NOT NULL,
    `cash_sales` DECIMAL(12, 2) NOT NULL,
    `cash_refunds` DECIMAL(12, 2) NOT NULL,
    `expected_cash` DECIMAL(12, 2) NOT NULL,
    `counted_cash` DECIMAL(12, 2) NOT NULL,
    `difference` DECIMAL(12, 2) NOT NULL,
    `note` VARCHAR(500) NULL,
    `closed_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `medicine_day_closings_closing_date_key`(`closing_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `patients` ADD CONSTRAINT `patients_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opd_visits` ADD CONSTRAINT `opd_visits_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opd_visits` ADD CONSTRAINT `opd_visits_doctor_id_fkey` FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opd_visits` ADD CONSTRAINT `opd_visits_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `emergency_visits` ADD CONSTRAINT `emergency_visits_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `emergency_visits` ADD CONSTRAINT `emergency_visits_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diagnostic_receipts` ADD CONSTRAINT `diagnostic_receipts_opd_visit_id_fkey` FOREIGN KEY (`opd_visit_id`) REFERENCES `opd_visits`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diagnostic_receipts` ADD CONSTRAINT `diagnostic_receipts_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diagnostic_receipts` ADD CONSTRAINT `diagnostic_receipts_doctor_id_fkey` FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diagnostic_receipts` ADD CONSTRAINT `diagnostic_receipts_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diagnostic_receipts` ADD CONSTRAINT `diagnostic_receipts_printed_by_id_fkey` FOREIGN KEY (`printed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diagnostic_receipt_items` ADD CONSTRAINT `diagnostic_receipt_items_receipt_id_fkey` FOREIGN KEY (`receipt_id`) REFERENCES `diagnostic_receipts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diagnostic_receipt_items` ADD CONSTRAINT `diagnostic_receipt_items_catalog_item_id_fkey` FOREIGN KEY (`catalog_item_id`) REFERENCES `diagnostic_catalog_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diagnostic_receipt_items` ADD CONSTRAINT `diagnostic_receipt_items_result_uploaded_by_id_fkey` FOREIGN KEY (`result_uploaded_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_opd_visit_id_fkey` FOREIGN KEY (`opd_visit_id`) REFERENCES `opd_visits`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_receipt_id_fkey` FOREIGN KEY (`receipt_id`) REFERENCES `diagnostic_receipts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_ot_case_id_fkey` FOREIGN KEY (`ot_case_id`) REFERENCES `ot_cases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_emergency_visit_id_fkey` FOREIGN KEY (`emergency_visit_id`) REFERENCES `emergency_visits`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_medicine_sale_id_fkey` FOREIGN KEY (`medicine_sale_id`) REFERENCES `medicine_sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_doctor_id_fkey` FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ot_cases` ADD CONSTRAINT `ot_cases_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ot_cases` ADD CONSTRAINT `ot_cases_doctor_id_fkey` FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ot_cases` ADD CONSTRAINT `ot_cases_room_bed_id_fkey` FOREIGN KEY (`room_bed_id`) REFERENCES `room_beds`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ot_cases` ADD CONSTRAINT `ot_cases_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ot_line_items` ADD CONSTRAINT `ot_line_items_ot_case_id_fkey` FOREIGN KEY (`ot_case_id`) REFERENCES `ot_cases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ot_line_items` ADD CONSTRAINT `ot_line_items_inventory_item_id_fkey` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_inventory_item_id_fkey` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_day_closings` ADD CONSTRAINT `medicine_day_closings_closed_by_id_fkey` FOREIGN KEY (`closed_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_packaging_levels` ADD CONSTRAINT `medicine_packaging_levels_medicine_item_id_fkey` FOREIGN KEY (`medicine_item_id`) REFERENCES `medicine_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_purchases` ADD CONSTRAINT `medicine_purchases_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_purchases` ADD CONSTRAINT `medicine_purchases_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_batches` ADD CONSTRAINT `medicine_batches_medicine_item_id_fkey` FOREIGN KEY (`medicine_item_id`) REFERENCES `medicine_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_batches` ADD CONSTRAINT `medicine_batches_purchase_id_fkey` FOREIGN KEY (`purchase_id`) REFERENCES `medicine_purchases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_sales` ADD CONSTRAINT `medicine_sales_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_sales` ADD CONSTRAINT `medicine_sales_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_sale_items` ADD CONSTRAINT `medicine_sale_items_sale_id_fkey` FOREIGN KEY (`sale_id`) REFERENCES `medicine_sales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_sale_items` ADD CONSTRAINT `medicine_sale_items_medicine_item_id_fkey` FOREIGN KEY (`medicine_item_id`) REFERENCES `medicine_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_sale_items` ADD CONSTRAINT `medicine_sale_items_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `medicine_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_stock_adjustments` ADD CONSTRAINT `medicine_stock_adjustments_medicine_item_id_fkey` FOREIGN KEY (`medicine_item_id`) REFERENCES `medicine_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_stock_adjustments` ADD CONSTRAINT `medicine_stock_adjustments_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `medicine_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_stock_adjustments` ADD CONSTRAINT `medicine_stock_adjustments_adjusted_by_id_fkey` FOREIGN KEY (`adjusted_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_stock_transactions` ADD CONSTRAINT `medicine_stock_transactions_medicine_item_id_fkey` FOREIGN KEY (`medicine_item_id`) REFERENCES `medicine_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_stock_transactions` ADD CONSTRAINT `medicine_stock_transactions_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `medicine_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_stock_transactions` ADD CONSTRAINT `medicine_stock_transactions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_sale_returns` ADD CONSTRAINT `medicine_sale_returns_sale_id_fkey` FOREIGN KEY (`sale_id`) REFERENCES `medicine_sales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_sale_returns` ADD CONSTRAINT `medicine_sale_returns_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_sale_return_items` ADD CONSTRAINT `medicine_sale_return_items_return_id_fkey` FOREIGN KEY (`return_id`) REFERENCES `medicine_sale_returns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_sale_return_items` ADD CONSTRAINT `medicine_sale_return_items_sale_item_id_fkey` FOREIGN KEY (`sale_item_id`) REFERENCES `medicine_sale_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_sale_return_items` ADD CONSTRAINT `medicine_sale_return_items_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `medicine_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_purchase_returns` ADD CONSTRAINT `medicine_purchase_returns_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_purchase_returns` ADD CONSTRAINT `medicine_purchase_returns_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_purchase_return_items` ADD CONSTRAINT `medicine_purchase_return_items_return_id_fkey` FOREIGN KEY (`return_id`) REFERENCES `medicine_purchase_returns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_purchase_return_items` ADD CONSTRAINT `medicine_purchase_return_items_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `medicine_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
