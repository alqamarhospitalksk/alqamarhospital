ALTER TABLE `doctors`
    ADD COLUMN `availability_days` VARCHAR(80) NOT NULL DEFAULT '[]',
    ADD COLUMN `availability_from` VARCHAR(5) NULL,
    ADD COLUMN `availability_to` VARCHAR(5) NULL;