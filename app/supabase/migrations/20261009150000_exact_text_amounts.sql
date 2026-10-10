-- JSON transports (PostgREST → JS) turn numeric into IEEE floats and lose digits past 2^53.
-- Expose exact text twins of every monetary column; the numeric stays for SQL arithmetic.
alter table public.movements add column amount_raw_text text generated always as (amount_raw::text) stored;
alter table public.valuations add column fiat_amount_text text generated always as (fiat_amount::text) stored;
