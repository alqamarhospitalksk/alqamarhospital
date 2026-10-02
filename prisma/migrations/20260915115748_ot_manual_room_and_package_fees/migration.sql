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
DROP INDEX `expenses_created_by_id_fkey` ON `expenses`;

-- DropIndex
DROP INDEX `expenses_doctor_id_fkey` ON `expenses`;

-- DropIndex
DROP INDEX `expenses_employee_id_fkey` ON `expenses`;

-- DropIndex
DROP INDEX `inventory_transactions_user_id_fkey` ON `inventory_transactions`;

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
DROP INDEX `payments_opd_visit_id_fkey` ON `payments`;

-- DropIndex
DROP INDEX `payments_ot_case_id_fkey` ON `payments`;

-- DropIndex
DROP INDEX `payments_receipt_id_fkey` ON `payments`;

-- AlterTable
ALTER TABLE `ot_cases` ADD COLUMN `anesthesia_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `home_medicine_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `home_medicine_note` VARCHAR(500) NULL,
    ADD COLUMN `hospital_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `ot_medicine_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `ot_medicine_note` VARCHAR(500) NULL,
    ADD COLUMN `recommendations` VARCHAR(1000) NULL,
    ADD COLUMN `room_label` VARCHAR(150) NULL,
    MODIFY `room_bed_id` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `patients` ADD CONSTRAINT `patients_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opd_visits` ADD CONSTRAINT `opd_visits_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opd_visits` ADD CONSTRAINT `opd_visits_doctor_id_fkey` FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opd_visits` ADD CONSTRAINT `opd_visits_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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
