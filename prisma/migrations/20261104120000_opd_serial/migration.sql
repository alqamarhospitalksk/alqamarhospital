-- AlterTable
ALTER TABLE `opd_visits` ADD COLUMN `opd_serial` INTEGER NULL;

-- CreateIndex
CREATE UNIQUE INDEX `opd_visits_doctor_id_opd_serial_key` ON `opd_visits`(`doctor_id`, `opd_serial`);
