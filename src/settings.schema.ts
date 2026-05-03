/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import z from 'zod';

export const FACEBOOK_CHANNEL_NAME = 'facebook' as const;

const commaSeparatedValues = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const FACEBOOK_DEFAULT_USER_FIELDS =
  'first_name,last_name,profile_pic,locale,timezone,gender';

const credentialSetting = (title: string, description: string) =>
  z.string().default('').meta({
    title,
    description,
    'ui:widget': 'AutoCompleteWidget',
    'ui:options': {
      entity: 'Credential',
      valueKey: 'id',
      labelKey: 'name',
      enableEntityAddButton: true,
    },
  });

export const FACEBOOK_CHANNEL_SOURCE_SETTINGS_SCHEMA = z
  .strictObject({
    app_secret: credentialSetting(
      'App secret credential',
      'Credential containing the Facebook app secret used to verify webhook signatures.',
    ),
    page_access_token: credentialSetting(
      'Page access token credential',
      'Credential containing the page-scoped access token used for Graph API calls.',
    ),
    verify_token: credentialSetting(
      'Verify token credential',
      'Credential containing the token that Facebook sends during webhook verification.',
    ),
    page_id: z.string().default('').meta({
      title: 'Page ID',
      description:
        'Optional Facebook Page ID. When set, webhook events for other pages are ignored.',
    }),
    app_id: z.string().default('').meta({
      title: 'App ID',
      description: 'Optional Facebook application ID for operator reference.',
    }),
    graph_api_version: z.string().default('v25.0').meta({
      title: 'Graph API version',
      description: 'Graph API version used by this source.',
    }),
    user_fields: z.string().default(FACEBOOK_DEFAULT_USER_FIELDS).meta({
      title: 'User fields',
      description:
        'Comma-separated profile fields fetched for Messenger subscribers.',
      'ui:widget': 'textarea',
    }),
    greeting_text: z
      .string()
      .default('Welcome! Ready to start chatting with our chatbot?')
      .meta({
        title: 'Greeting text',
        description: 'Messenger greeting text configured on the Page profile.',
        'ui:widget': 'textarea',
      }),
    get_started_button: z.string().default('GET_STARTED').meta({
      title: 'Get Started payload',
      description:
        'Payload sent to Hexabot when a user taps the Messenger Get Started button. Leave empty to disable.',
    }),
    persistent_menu: z.boolean().default(true).meta({
      title: 'Persistent menu',
      description: 'Synchronize Hexabot menu entries to Messenger.',
    }),
    composer_input_disabled: z.boolean().default(false).meta({
      title: 'Disable composer input',
      description:
        'Disable free-form user input from Messenger persistent menu.',
    }),
    sync_messenger_profile: z.boolean().default(true).meta({
      title: 'Sync Messenger profile',
      description:
        'Update greeting, Get Started button, and persistent menu when source or menu settings change.',
    }),
    thread_inactivity_hours: z.int().nonnegative().default(24).meta({
      title: 'Thread inactivity (hours)',
      description:
        'Automatically start a new thread when the last message is older than this threshold.',
    }),
  })
  .meta({
    title: 'Facebook Channel',
  });

export type FacebookChannelSettings = z.infer<
  typeof FACEBOOK_CHANNEL_SOURCE_SETTINGS_SCHEMA
>;

export const FACEBOOK_CREDENTIAL_SETTING_KEYS = [
  'app_secret',
  'page_access_token',
  'verify_token',
] as const;

export type FacebookCredentialSettingKey =
  (typeof FACEBOOK_CREDENTIAL_SETTING_KEYS)[number];

export type FacebookResolvedChannelSettings = FacebookChannelSettings;

export const parseFacebookUserFields = (
  settings: Pick<FacebookChannelSettings, 'user_fields'>,
) => commaSeparatedValues(settings.user_fields);
