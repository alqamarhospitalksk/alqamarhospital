-- Additive only: nothing existing is altered or dropped.

-- AlterTable
ALTER TABLE `diagnostic_catalog_items` ADD COLUMN `default_remarks` VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE `diagnostic_receipt_items` ADD COLUMN `remarks` VARCHAR(500) NULL;

-- CreateTable
CREATE TABLE `diagnostic_test_parameters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `catalog_item_id` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `kind` VARCHAR(15) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `unit` VARCHAR(30) NULL,
    `alt_unit` VARCHAR(30) NULL,
    `alt_factor` DECIMAL(14, 6) NULL,
    `ref_low` DECIMAL(14, 4) NULL,
    `ref_high` DECIMAL(14, 4) NULL,
    `ref_text` VARCHAR(200) NULL,

    INDEX `diagnostic_test_parameters_catalog_item_id_sort_order_idx`(`catalog_item_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `diagnostic_result_values` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receipt_item_id` INTEGER NOT NULL,
    `parameter_id` INTEGER NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `kind` VARCHAR(15) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `unit` VARCHAR(30) NULL,
    `alt_unit` VARCHAR(30) NULL,
    `alt_value` VARCHAR(40) NULL,
    `reference_text` VARCHAR(200) NULL,
    `value` VARCHAR(300) NOT NULL,
    `flag` VARCHAR(10) NULL,

    INDEX `diagnostic_result_values_receipt_item_id_sort_order_idx`(`receipt_item_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `diagnostic_test_parameters` ADD CONSTRAINT `diagnostic_test_parameters_catalog_item_id_fkey` FOREIGN KEY (`catalog_item_id`) REFERENCES `diagnostic_catalog_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diagnostic_result_values` ADD CONSTRAINT `diagnostic_result_values_receipt_item_id_fkey` FOREIGN KEY (`receipt_item_id`) REFERENCES `diagnostic_receipt_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diagnostic_result_values` ADD CONSTRAINT `diagnostic_result_values_parameter_id_fkey` FOREIGN KEY (`parameter_id`) REFERENCES `diagnostic_test_parameters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
