# Hexabot Facebook Channel

`hexabot-channel-facebook` adds Facebook Messenger channel support to Hexabot v3. The channel is installed as a standard npm package and is discovered by the API automatically.

## Installation

Install the package in the same workspace or deployment that runs `@hexabot-ai/api`:

```sh
npm add hexabot-channel-facebook
```

Restart the API after installation. The channel appears with the name `facebook`.

## Prerequisites

Before configuring the channel, make sure you have:

- a Facebook account with access to [Meta for Developers](https://developers.facebook.com/);
- a Facebook Page that the bot will use to talk to Messenger users;
- a public HTTPS URL for your Hexabot API. For local testing, expose the API with a tunnel such as ngrok;
- a Hexabot source created with the `facebook` channel.

## Facebook App Setup

### 1. Create or Select a Meta App

1. Open [Meta for Developers](https://developers.facebook.com/), sign in, and complete developer registration if required.
2. From **My Apps**, create a new app or open an existing one.
3. In **Settings > Basic**, copy the **App ID** and **App Secret**. Store the app secret securely; it is used by Hexabot to verify webhook signatures.

### 2. Add Messenger

1. In the Meta app dashboard, add the **Messenger** product if it is not already enabled.
2. Connect the Facebook Page that should receive and send messages.
3. Generate a **Page Access Token** for that Page. The app must have the required Messenger permission, usually `pages_messaging`.

### 3. Configure the Hexabot Source

In Hexabot, open the `facebook` source and set:

- `app_secret`: the Meta app secret from **Settings > Basic**.
- `page_access_token`: the Page access token generated from the Messenger settings or Access Token Tool.
- `verify_token`: any secure random string you choose. You will enter the same value in Meta during webhook setup.
- `page_id`: optional, but recommended when one app is connected to several Pages.
- `app_id`: optional operator reference for the Meta app ID.

Save the source before verifying the webhook in Meta.

### 4. Configure the Webhook in Meta

Use the Facebook source webhook endpoint in Meta:

```txt
https://<your-domain>/api/webhook/<sourceRef>
```

In the Messenger webhook setup:

1. Use the URL above as the **Callback URL**.
2. Use the source `verify_token` as the **Verify Token**.
3. Verify and save the webhook.

Subscribe the app/Page to these fields:

- `messages`
- `messaging_postbacks`
- `message_deliveries`
- `message_reads`
- `message_echoes`

After saving, send a message to the connected Facebook Page and confirm that a new subscriber/message appears in Hexabot.

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
