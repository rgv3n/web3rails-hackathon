Email templates that link to `/auth/callback?token_hash=…` (work from any device). Not active yet: the hosted project is on
the Free plan with Supabase's default mailer, which rejects template changes. When a custom SMTP provider (e.g. Resend) is
configured, declare them in `supabase/config.toml`:

```toml
[auth.email.template.recovery]
subject = "Reset your Web3Rails password"
content_path = "./supabase/templates/recovery.html"

[auth.email.template.confirmation]
subject = "Confirm your Web3Rails email"
content_path = "./supabase/templates/confirmation.html"
```
