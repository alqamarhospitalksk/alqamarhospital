-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NULL,
    `username` VARCHAR(80) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('OPERATOR', 'MANAGEMENT', 'LAB', 'MEDICAL_STORE') NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `must_change_password` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `patients` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mr_number` VARCHAR(30) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `father_name` VARCHAR(150) NOT NULL,
    `cnic` VARCHAR(20) NULL,
    `mobile` VARCHAR(30) NOT NULL,
    `date_of_birth` DATE NULL,
    `gender` VARCHAR(30) NOT NULL,
    `address` VARCHAR(500) NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `patients_mr_number_key`(`mr_number`),
    INDEX `patients_cnic_idx`(`cnic`),
    INDEX `patients_mobile_idx`(`mobile`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `doctors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `specialization` VARCHAR(150) NOT NULL,
    `name_urdu` VARCHAR(150) NULL,
    `specialization_urdu` VARCHAR(150) NULL,
    `qualifications` VARCHAR(500) NULL,
    `qualifications_urdu` VARCHAR(500) NULL,
    `availability` VARCHAR(500) NULL,
    `availability_days` VARCHAR(80) NOT NULL DEFAULT '[]',
    `availability_from` VARCHAR(5) NULL,
    `availability_to` VARCHAR(5) NULL,
    `consultation_fee` DECIMAL(12, 2) NOT NULL,
    `hospital_split_type` VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE',
    `hospital_split_value` DECIMAL(12, 2) NOT NULL,
    `lab_share_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `xray_share_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `ultrasound_share_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `ecg_share_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `eco_share_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `opd_visits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `opd_number` VARCHAR(40) NOT NULL,
    `visit_date` DATE NOT NULL,
    `daily_token` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `doctor_id` INTEGER NOT NULL,
    `consultation_fee` DECIMAL(12, 2) NOT NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `opd_visits_opd_number_key`(`opd_number`),
    INDEX `opd_visits_patient_id_visit_date_idx`(`patient_id`, `visit_date`),
    UNIQUE INDEX `opd_visits_doctor_id_visit_date_daily_token_key`(`doctor_id`, `visit_date`, `daily_token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `emergency_visits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `visit_number` VARCHAR(40) NOT NULL,
    `visit_date` DATE NOT NULL,
    `daily_token` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `emergency_visits_visit_number_key`(`visit_number`),
    INDEX `emergency_visits_patient_id_visit_date_idx`(`patient_id`, `visit_date`),
    UNIQUE INDEX `emergency_visits_visit_date_daily_token_key`(`visit_date`, `daily_token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `diagnostic_catalog_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `module` VARCHAR(30) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `price` DECIMAL(12, 2) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `diagnostic_catalog_items_module_name_key`(`module`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `diagnostic_receipts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receipt_number` VARCHAR(40) NOT NULL,
    `module` VARCHAR(30) NOT NULL,
    `module_token` INTEGER NOT NULL,
    `opd_visit_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `doctor_id` INTEGER NOT NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discount_reason` VARCHAR(500) NULL,
    `total` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED') NOT NULL DEFAULT 'PAID',
    `result` TEXT NULL,
    `printed_at` DATETIME(3) NULL,
    `printed_by_id` INTEGER NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `diagnostic_receipts_receipt_number_key`(`receipt_number`),
    INDEX `diagnostic_receipts_opd_visit_id_idx`(`opd_visit_id`),
    UNIQUE INDEX `diagnostic_receipts_module_created_at_module_token_key`(`module`, `created_at`, `module_token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `diagnostic_receipt_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receipt_id` INTEGER NOT NULL,
    `catalog_item_id` INTEGER NOT NULL,
    `name_at_sale` VARCHAR(150) NOT NULL,
    `price_at_sale` DECIMAL(12, 2) NOT NULL,
    `result` TEXT NULL,
    `result_file_name` VARCHAR(255) NULL,
    `result_file_data_url` LONGTEXT NULL,
    `result_uploaded_at` DATETIME(3) NULL,
    `result_uploaded_by_id` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `amount` DECIMAL(12, 2) NOT NULL,
    `method` ENUM('CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'FREE') NOT NULL DEFAULT 'CASH',
    `status` ENUM('PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED') NOT NULL DEFAULT 'PAID',
    `reference` VARCHAR(100) NULL,
    `note` VARCHAR(500) NULL,
    `opd_visit_id` INTEGER NULL,
    `receipt_id` INTEGER NULL,
    `ot_case_id` INTEGER NULL,
    `emergency_visit_id` INTEGER NULL,
    `medicine_sale_id` INTEGER NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `payments_created_at_status_idx`(`created_at`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `designation` VARCHAR(120) NOT NULL,
    `contact` VARCHAR(40) NULL,
    `joining_date` DATE NULL,
    `monthly_salary` DECIMAL(12, 2) NOT NULL,
    `payment_cycle_day` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expenses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `category` VARCHAR(40) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `method` ENUM('CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'FREE') NOT NULL DEFAULT 'CASH',
    `expense_date` DATE NOT NULL,
    `note` VARCHAR(500) NULL,
    `doctor_id` INTEGER NULL,
    `employee_id` INTEGER NULL,
    `base_amount` DECIMAL(12, 2) NULL,
    `incentive_amount` DECIMAL(12, 2) NULL,
    `incentive_note` VARCHAR(255) NULL,
    `deduction_amount` DECIMAL(12, 2) NULL,
    `deduction_note` VARCHAR(255) NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `expenses_expense_date_category_idx`(`expense_date`, `category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_beds` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `room_type` VARCHAR(80) NOT NULL,
    `daily_rate` DECIMAL(12, 2) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `room_beds_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ot_cases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `case_number` VARCHAR(40) NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `doctor_id` INTEGER NOT NULL,
    `room_bed_id` INTEGER NULL,
    `room_label` VARCHAR(150) NULL,
    `admission_date` DATETIME(3) NOT NULL,
    `procedure_at` DATETIME(3) NULL,
    `discharge_date` DATETIME(3) NULL,
    `doctor_fee` DECIMAL(12, 2) NOT NULL,
    `theater_fee` DECIMAL(12, 2) NOT NULL,
    `anesthesia_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `room_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `hospital_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `ot_medicine_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `ot_medicine_note` VARCHAR(500) NULL,
    `home_medicine_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `home_medicine_note` VARCHAR(500) NULL,
    `recommendations` VARCHAR(1000) NULL,
    `total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `last_invoiced_at` DATETIME(3) NULL,
    `status` ENUM('BOOKED', 'IN_PROGRESS', 'READY_FOR_DISCHARGE', 'DISCHARGED', 'CANCELLED') NOT NULL DEFAULT 'BOOKED',
    `diagnosis` VARCHAR(500) NULL,
    `procedure_name` VARCHAR(200) NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ot_cases_case_number_key`(`case_number`),
    INDEX `ot_cases_patient_id_status_idx`(`patient_id`, `status`),
    INDEX `ot_cases_room_bed_id_status_idx`(`room_bed_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ot_line_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ot_case_id` INTEGER NOT NULL,
    `inventory_item_id` INTEGER NULL,
    `description` VARCHAR(200) NOT NULL,
    `category` VARCHAR(30) NOT NULL,
    `quantity` DECIMAL(12, 2) NOT NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `total` DECIMAL(12, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `category` VARCHAR(30) NOT NULL,
    `unit` VARCHAR(30) NOT NULL,
    `quantity` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `low_stock_at` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `unit_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inventory_items_name_category_key`(`name`, `category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inventory_item_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `quantity` DECIMAL(12, 2) NOT NULL,
    `reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inventory_transactions_inventory_item_id_created_at_idx`(`inventory_item_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `action` ENUM('CREATE', 'UPDATE', 'CANCEL', 'DISCOUNT', 'REFUND', 'LOGIN', 'LOGOUT') NOT NULL,
    `entity` VARCHAR(80) NOT NULL,
    `entity_id` VARCHAR(80) NOT NULL,
    `reason` VARCHAR(500) NULL,
    `before_json` TEXT NULL,
    `after_json` TEXT NULL,
    `user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_entity_entity_id_idx`(`entity`, `entity_id`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token_hash` VARCHAR(64) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sessions_token_hash_key`(`token_hash`),
    INDEX `sessions_user_id_idx`(`user_id`),
    INDEX `sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hospital_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL DEFAULT 'CareLedger Clinic',
    `name_urdu` VARCHAR(150) NULL,
    `address` VARCHAR(500) NULL,
    `address_urdu` VARCHAR(500) NULL,
    `phone` VARCHAR(100) NULL,
    `email` VARCHAR(150) NULL,
    `logo_data_url` LONGTEXT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_sequences` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sequence_key` VARCHAR(100) NOT NULL,
    `next_value` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `daily_sequences_sequence_key_key`(`sequence_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppliers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `contact_person` VARCHAR(150) NULL,
    `phone` VARCHAR(40) NULL,
    `address` VARCHAR(500) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- CreateTable
CREATE TABLE `medicine_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `generic_name` VARCHAR(150) NULL,
    `category` VARCHAR(30) NOT NULL,
    `unit` VARCHAR(30) NOT NULL,
    `sale_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `reorder_level` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `medicine_items_name_category_key`(`name`, `category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medicine_packaging_levels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `medicine_item_id` INTEGER NOT NULL,
    `level` INTEGER NOT NULL,
    `name` VARCHAR(30) NOT NULL,
    `units_in_level` DECIMAL(12, 2) NOT NULL,

    UNIQUE INDEX `medicine_packaging_levels_medicine_item_id_level_key`(`medicine_item_id`, `level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medicine_purchases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchase_number` VARCHAR(40) NOT NULL,
    `supplier_id` INTEGER NOT NULL,
    `total_cost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `medicine_purchases_purchase_number_key`(`purchase_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medicine_batches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `medicine_item_id` INTEGER NOT NULL,
    `purchase_id` INTEGER NOT NULL,
    `batch_number` VARCHAR(60) NULL,
    `packs_received` DECIMAL(12, 2) NULL,
    `units_per_pack` DECIMAL(12, 2) NOT NULL DEFAULT 1,
    `quantity_received` DECIMAL(12, 2) NOT NULL,
    `quantity_remaining` DECIMAL(12, 2) NOT NULL,
    `purchase_price` DECIMAL(14, 4) NOT NULL,
    `sale_price_override` DECIMAL(12, 2) NULL,
    `expiry_date` DATE NOT NULL,
    `received_level_name` VARCHAR(30) NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `medicine_batches_medicine_item_id_expiry_date_idx`(`medicine_item_id`, `expiry_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medicine_sales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sale_number` VARCHAR(40) NOT NULL,
    `daily_token` INTEGER NOT NULL,
    `sale_date` DATE NOT NULL,
    `patient_id` INTEGER NULL,
    `customer_name` VARCHAR(150) NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discount_reason` VARCHAR(500) NULL,
    `total` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED') NOT NULL DEFAULT 'PAID',
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `medicine_sales_sale_number_key`(`sale_number`),
    UNIQUE INDEX `medicine_sales_sale_date_daily_token_key`(`sale_date`, `daily_token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medicine_sale_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sale_id` INTEGER NOT NULL,
    `medicine_item_id` INTEGER NOT NULL,
    `batch_id` INTEGER NOT NULL,
    `quantity` DECIMAL(12, 2) NOT NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `total` DECIMAL(12, 2) NOT NULL,
    `cost_price_at_sale` DECIMAL(14, 4) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medicine_stock_adjustments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `medicine_item_id` INTEGER NOT NULL,
    `batch_id` INTEGER NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `quantity` DECIMAL(12, 2) NOT NULL,
    `reason` VARCHAR(500) NULL,
    `adjusted_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medicine_stock_transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `medicine_item_id` INTEGER NOT NULL,
    `batch_id` INTEGER NOT NULL,
    `type` ENUM('OPENING_STOCK', 'PURCHASE', 'SALE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'SALE_RETURN', 'PURCHASE_RETURN') NOT NULL,
    `quantity` DECIMAL(12, 2) NOT NULL,
    `before_quantity` DECIMAL(12, 2) NOT NULL,
    `after_quantity` DECIMAL(12, 2) NOT NULL,
    `reference_type` VARCHAR(30) NULL,
    `reference_id` INTEGER NULL,
    `notes` VARCHAR(500) NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `medicine_stock_transactions_medicine_item_id_created_at_idx`(`medicine_item_id`, `created_at`),
    INDEX `medicine_stock_transactions_batch_id_idx`(`batch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medicine_sale_returns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `return_number` VARCHAR(40) NOT NULL,
    `sale_id` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `restock` BOOLEAN NOT NULL DEFAULT false,
    `total_refund` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `medicine_sale_returns_return_number_key`(`return_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medicine_sale_return_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `return_id` INTEGER NOT NULL,
    `sale_item_id` INTEGER NOT NULL,
    `batch_id` INTEGER NOT NULL,
    `quantity` DECIMAL(12, 2) NOT NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `total` DECIMAL(12, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medicine_purchase_returns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `return_number` VARCHAR(40) NOT NULL,
    `supplier_id` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `total_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `refund_mode` VARCHAR(10) NOT NULL DEFAULT 'CASH',
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `medicine_purchase_returns_return_number_key`(`return_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medicine_purchase_return_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `return_id` INTEGER NOT NULL,
    `batch_id` INTEGER NOT NULL,
    `quantity` DECIMAL(12, 2) NOT NULL,
    `unit_cost` DECIMAL(14, 4) NOT NULL,
    `total` DECIMAL(12, 2) NOT NULL,

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

