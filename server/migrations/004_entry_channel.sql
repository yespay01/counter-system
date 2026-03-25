-- 004_entry_channel.sql
-- entry_channel CHECK 제약에 kiosk / kiosk_sms 추가

ALTER TABLE queue_items
    DROP CONSTRAINT queue_items_entry_channel_check,
    ADD CONSTRAINT queue_items_entry_channel_check
        CHECK (entry_channel IN ('solo_tablet', 'qr_self', 'kiosk', 'kiosk_sms'));
