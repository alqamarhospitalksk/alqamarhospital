-- AlterTable
ALTER TABLE `doctors` ADD COLUMN `admission_daily_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `admission_split_type` VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE',
    ADD COLUMN `admission_split_value` DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `payments` ADD COLUMN `admission_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `room_beds` ADD COLUMN `category` VARCHAR(20) NOT NULL DEFAULT 'WARD',
    ADD COLUMN `unit_type` VARCHAR(10) NOT NULL DEFAULT 'BED';

-- AlterTable
ALTER TABLE `ot_cases` ADD COLUMN `admission_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `medicine_sales` ADD COLUMN `admission_id` INTEGER NULL,
    ADD COLUMN `credit_status` VARCHAR(12) NULL,
    ADD COLUMN `purpose` VARCHAR(10) NULL,
    ADD COLUMN `settled_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `medicine_sale_returns` ADD COLUMN `refund_mode` VARCHAR(10) NOT NULL DEFAULT 'CASH';

-- CreateTable
CREATE TABLE `admissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `admission_number` VARCHAR(40) NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `doctor_id` INTEGER NOT NULL,
    `category` VARCHAR(20) NOT NULL,
    `room_bed_id` INTEGER NULL,
    `room_label` VARCHAR(150) NOT NULL,
    `daily_room_rate` DECIMAL(12, 2) NOT NULL,
    `daily_doctor_fee` DECIMAL(12, 2) NOT NULL,
    `daily_technician_fee` DECIMAL(12, 2) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'ADMITTED',
    `admitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `invoiced_at` DATETIME(3) NULL,
    `discharged_at` DATETIME(3) NULL,
    `diagnosis` VARCHAR(500) NULL,
    `notes` VARCHAR(1000) NULL,
    `attendant_name` VARCHAR(150) NULL,
    `attendant_mobile` VARCHAR(30) NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admissions_admission_number_key`(`admission_number`),
    INDEX `admissions_status_idx`(`status`),
    INDEX `admissions_patient_id_idx`(`patient_id`),
    INDEX `admissions_room_bed_id_status_idx`(`room_bed_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admission_days` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `admission_id` INTEGER NOT NULL,
    `charge_date` DATE NOT NULL,
    `room_label` VARCHAR(150) NOT NULL,
    `room_rate` DECIMAL(12, 2) NOT NULL,
    `doctor_id` INTEGER NOT NULL,
    `doctor_fee` DECIMAL(12, 2) NOT NULL,
    `doctor_visited` BOOLEAN NOT NULL DEFAULT true,
    `technician_fee` DECIMAL(12, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `admission_days_admission_id_charge_date_key`(`admission_id`, `charge_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admission_charges` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `admission_id` INTEGER NOT NULL,
    `description` VARCHAR(200) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admission_charges_admission_id_idx`(`admission_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admission_category_fees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `category` VARCHAR(20) NOT NULL,
    `technician_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admission_category_fees_category_key`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `payments_admission_id_idx` ON `payments`(`admission_id`);

-- CreateIndex
CREATE INDEX `ot_cases_admission_id_idx` ON `ot_cases`(`admission_id`);

-- CreateIndex
CREATE INDEX `medicine_sales_admission_id_idx` ON `medicine_sales`(`admission_id`);

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_admission_id_fkey` FOREIGN KEY (`admission_id`) REFERENCES `admissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ot_cases` ADD CONSTRAINT `ot_cases_admission_id_fkey` FOREIGN KEY (`admission_id`) REFERENCES `admissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admissions` ADD CONSTRAINT `admissions_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admissions` ADD CONSTRAINT `admissions_doctor_id_fkey` FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admissions` ADD CONSTRAINT `admissions_room_bed_id_fkey` FOREIGN KEY (`room_bed_id`) REFERENCES `room_beds`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admissions` ADD CONSTRAINT `admissions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admission_days` ADD CONSTRAINT `admission_days_admission_id_fkey` FOREIGN KEY (`admission_id`) REFERENCES `admissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admission_days` ADD CONSTRAINT `admission_days_doctor_id_fkey` FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admission_charges` ADD CONSTRAINT `admission_charges_admission_id_fkey` FOREIGN KEY (`admission_id`) REFERENCES `admissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admission_charges` ADD CONSTRAINT `admission_charges_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medicine_sales` ADD CONSTRAINT `medicine_sales_admission_id_fkey` FOREIGN KEY (`admission_id`) REFERENCES `admissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `medicine_sales` ADD COLUMN `ot_case_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `medicine_sales_ot_case_id_idx` ON `medicine_sales`(`ot_case_id`);

-- AddForeignKey
ALTER TABLE `medicine_sales` ADD CONSTRAINT `medicine_sales_ot_case_id_fkey` FOREIGN KEY (`ot_case_id`) REFERENCES `ot_cases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
