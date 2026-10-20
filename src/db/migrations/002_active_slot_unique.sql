ALTER TABLE consultations DROP CONSTRAINT consultations_slot_id_key;
CREATE UNIQUE INDEX uniq_active_consultation_per_slot
  ON consultations(slot_id) WHERE status <> 'cancelled';