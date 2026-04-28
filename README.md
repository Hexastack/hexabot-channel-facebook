# Hexabot Facebook Channel

`hexabot-channel-facebook` adds Facebook Messenger support to Hexabot v3. The channel is installed as a standard npm package and is discovered by the API through the `hexabot-channel-*` dynamic provider pattern.

## Installation

Install the package in the same workspace or deployment that runs `@hexabot-ai/api`:

```sh
pnpm add hexabot-channel-facebook --filter @hexabot-ai/api
```

Restart the API after installation. The channel appears with the name `facebook`.

## Webhook

Create a Facebook source in Hexabot, then use its webhook endpoint in Meta:

```txt
https://<your-domain>/api/webhook/<sourceRef>
```

Use the source `verify_token` during Meta webhook verification. Subscribe the app to:

- `messages`
- `messaging_postbacks`
- `message_deliveries`
- `message_reads`
- `message_echoes`

## Source Settings

Required settings:

- `app_secret`: Facebook app secret used to verify webhook signatures.
- `page_access_token`: Page token used for Send API, profile, attachment, and label calls.
- `verify_token`: Token used for webhook verification.

Optional settings:

- `page_id`: restricts a Hexabot source to one Facebook Page.
- `graph_api_version`: defaults to `v25.0`.
- `user_fields`: comma-separated Messenger profile fields.
- `greeting_text`, `get_started_button`, `persistent_menu`, `composer_input_disabled`: Messenger profile controls.
- `sync_messenger_profile`: syncs Messenger profile settings when the source or Hexabot menu changes.
- `thread_inactivity_hours`: controls v3 thread rollover behavior.

Use one Hexabot source per Facebook Page. Each source owns its own token and settings.

## Supported Messages

Inbound support includes text, quick replies, postbacks, Get Started, locations, attachments, stickers/fallback attachments, deliveries, reads, and echoes.

Outbound support includes text, quick replies, buttons, attachments, lists, carousels, and typing indicators. Lists and carousels use Messenger generic templates; oversized lists include a `View More` postback element.

## Migration From v2

The v2 package was named `hexabot-channel-messenger` and used the channel name `messenger-channel`. This v3 package uses:

- npm package: `hexabot-channel-facebook`
- channel name: `facebook`
- webhook URL: `/api/webhook/:sourceRef`
- per-source settings instead of global runtime settings

Existing Messenger labels can be reused by keeping their Meta custom label IDs under `label_id.facebook`.
