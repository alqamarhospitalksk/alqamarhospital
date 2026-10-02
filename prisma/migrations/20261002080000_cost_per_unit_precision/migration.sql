-- Cost per single tablet/strip is often a fraction of a rupee (PKR 1,000 for 3,000 tablets = 0.3333),
-- so keep 4 decimals instead of 2. Widening a DECIMAL never changes existing values.
ALTER TABLE `medicine_batches` MODIFY `purchase_price` DECIMAL(14, 4) NOT NULL;
ALTER TABLE `medicine_sale_items` MODIFY `cost_price_at_sale` DECIMAL(14, 4) NULL;
ALTER TABLE `medicine_purchase_return_items` MODIFY `unit_cost` DECIMAL(14, 4) NOT NULL;
