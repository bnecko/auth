-- Record why an activation was denied so a polling integrator can message the
-- user instead of showing a bare "denied". The only producer today is the
-- consent screen's deny action ("user_declined"); the column is nullable so
-- existing rows and future reasons (policy, admin) coexist.
alter table activation_requests
  add column if not exists denied_reason text;
