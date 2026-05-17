-- Property Info: add photo_url, linked_listing_ids, property_info columns
alter table properties
  add column if not exists photo_url           text,
  add column if not exists linked_listing_ids  text[],
  add column if not exists property_info       jsonb;
