-- Add "reordered" to the queue_event_action enum so the move-down endpoint
-- can record position swaps in the queue_events audit log.

ALTER TYPE "public"."queue_event_action" ADD VALUE IF NOT EXISTS 'reordered';
