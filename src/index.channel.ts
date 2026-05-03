/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import { createHmac, timingSafeEqual } from 'crypto';

import {
  ChannelCapabilities,
  ChannelHealthContext,
  CredentialService,
  DEFAULT_CHANNEL_CAPABILITIES,
  ExtensionInject,
  HttpChannelHandler,
  LabelService,
  LanguageService,
  MenuService,
  MenuTree,
  MenuType,
  MessageInboundEvent,
  SourceService,
  SubscriberCreateDto,
} from '@hexabot-ai/api';
import type {
  ActionOptions,
  IntegrationHealthItem,
  Source,
  StdOutgoingMessageEnvelope,
} from '@hexabot-ai/types';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { OnEvent } from '@nestjs/event-emitter';
import { Request, Response } from 'express';

import {
  FacebookInboundEventDecoder,
  createFacebookInboundEventDecoder,
} from './inbound';
import { FacebookAttachmentMessageInboundEvent } from './inbound/events';
import {
  FacebookOutboundMessageEncoder,
  createFacebookOutboundMessageEncoder,
} from './outbound';
import { FacebookGraphApiService } from './services';
import {
  FACEBOOK_CREDENTIAL_SETTING_KEYS,
  FACEBOOK_CHANNEL_NAME,
  FACEBOOK_CHANNEL_SOURCE_SETTINGS_SCHEMA,
  FacebookCredentialSettingKey,
  FacebookChannelSettings,
  FacebookResolvedChannelSettings,
} from './settings.schema';
import { Facebook } from './types';

type RawBodyRequest = Request & {
  rawBody?: string | Buffer;
};

type EntityHookPayload<T> = {
  entity?: T;
  databaseEntity?: T;
  payload?: Record<string, unknown>;
};

const MAX_TYPING_DELAY_MS = 20000;

@Injectable()
export default class FacebookChannelHandler extends HttpChannelHandler<
  typeof FACEBOOK_CHANNEL_NAME
> {
  @Inject(SourceService)
  private readonly sourceService!: SourceService;

  @Inject(MenuService)
  private readonly menuService!: MenuService;

  @Inject(LabelService)
  private readonly labelService!: LabelService;

  @Inject(LanguageService)
  private readonly languageService!: LanguageService;

  @Inject(ModuleRef)
  private readonly credentialsModuleRef!: ModuleRef;

  @ExtensionInject((name) => createFacebookInboundEventDecoder(name))
  private inboundEventDecoder!: FacebookInboundEventDecoder<
    typeof FACEBOOK_CHANNEL_NAME
  >;

  @ExtensionInject((name) => createFacebookOutboundMessageEncoder(name))
  private outboundMessageEncoder!: FacebookOutboundMessageEncoder;

  @ExtensionInject(FacebookGraphApiService)
  private graphApi!: FacebookGraphApiService;

  private credentialService?: CredentialService;

  constructor() {
    super(FACEBOOK_CHANNEL_NAME, FACEBOOK_CHANNEL_SOURCE_SETTINGS_SCHEMA);
  }

  getCapabilities(): ChannelCapabilities {
    return {
      ...DEFAULT_CHANNEL_CAPABILITIES,
      typingIndicator: true,
      maxTextLength: 2000,
    };
  }

  protected async verifyWebhook(
    req: Request,
    res: Response,
    source: Source,
  ): Promise<void> {
    const settings = await this.parseSettingsWithCredentials(source.settings, [
      'verify_token',
    ]);
    const mode = this.getQueryParam(req, 'hub.mode');
    const token = this.getQueryParam(req, 'hub.verify_token');
    const challenge = this.getQueryParam(req, 'hub.challenge');

    if (
      mode === 'subscribe' &&
      challenge !== null &&
      token === settings.verify_token &&
      settings.verify_token.length > 0
    ) {
      res.status(200).send(challenge);

      return;
    }

    res.sendStatus(403);
  }

  protected async verifySignature(
    req: Request,
    _res: Response,
    source: Source,
  ): Promise<void> {
    const settings = await this.parseSettingsWithCredentials(source.settings, [
      'app_secret',
    ]);

    if (!settings.app_secret) {
      throw new Error('Facebook app secret is required');
    }

    const sha256Signature = this.getHeader(req, 'x-hub-signature-256');
    const sha1Signature = this.getHeader(req, 'x-hub-signature');
    const signature = sha256Signature ?? sha1Signature;

    if (!signature) {
      throw new Error('Missing Facebook webhook signature');
    }

    const [algorithm, digest] = signature.split('=');
    const normalizedAlgorithm =
      algorithm === 'sha256' ? 'sha256' : algorithm === 'sha1' ? 'sha1' : null;

    if (!normalizedAlgorithm || !digest) {
      throw new Error('Unsupported Facebook webhook signature');
    }

    const rawBody = (req as RawBodyRequest).rawBody;

    if (rawBody === undefined) {
      throw new Error('Missing raw request body');
    }

    const expected = createHmac(normalizedAlgorithm, settings.app_secret)
      .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
      .digest('hex');

    if (!this.safeCompareHex(digest, expected)) {
      throw new Error('Invalid Facebook webhook signature');
    }
  }

  protected async decode(req: Request, source: Source) {
    const settings = this.parseSettings(source.settings);
    const payload = Facebook.webhookSchema.parse(req.body);

    if (payload.object !== 'page') {
      throw new Error('Unsupported Facebook webhook object');
    }

    const events = payload.entry.flatMap((entry) => {
      const pageId = entry.id ?? '';

      if (settings.page_id && pageId && settings.page_id !== pageId) {
        this.logger.warn(
          `Ignoring Facebook webhook entry for unexpected page ${pageId}`,
        );

        return [];
      }

      return (entry.messaging ?? []).flatMap((messaging) => {
        const recipientId = messaging.recipient.id;

        if (
          settings.page_id &&
          recipientId &&
          settings.page_id !== recipientId
        ) {
          this.logger.warn(
            `Ignoring Facebook webhook event for unexpected recipient ${recipientId}`,
          );

          return [];
        }

        const rawEvent: Facebook.DecodedMessaging = {
          ...messaging,
          entryId: pageId,
        };
        const channelAttrs = {
          pageId: pageId || recipientId,
          recipientId,
        } satisfies Facebook.ChannelAttrs;

        return this.inboundEventDecoder.createEvents(rawEvent, channelAttrs);
      });
    });

    return events;
  }

  protected async doSendMessage(
    event: MessageInboundEvent<typeof FACEBOOK_CHANNEL_NAME>,
    envelope: StdOutgoingMessageEnvelope,
    options: ActionOptions,
  ): Promise<{ mid: string }> {
    const settings = await this.parseSettingsWithCredentials(
      event.getSourceSettings(),
      ['page_access_token'],
    );
    const sourceId = event.getSourceId();

    if (!sourceId) {
      throw new Error('Cannot send Facebook message without source id');
    }

    const recipientId = event.getSenderForeignId();
    const message = await this.outboundMessageEncoder.encode(envelope, {
      ...(options ?? {}),
      sourceId,
    });
    const send = async () => {
      const response = await this.graphApi.sendMessage(settings, {
        recipient: {
          id: recipientId,
        },
        message,
      });

      return { mid: response.message_id ?? '' };
    };

    if (options?.typing) {
      const timeout = this.resolveTypingTimeout(envelope, options.typing);

      try {
        await this.graphApi.sendSenderAction(
          settings,
          recipientId,
          'typing_on',
        );
        await this.sleep(timeout);
        await this.graphApi.sendSenderAction(
          settings,
          recipientId,
          'typing_off',
        );
      } catch (err) {
        this.logger.error('Failed to send Facebook typing indicator', err);
      }
    }

    return await send();
  }

  async getSubscriberData(
    event: MessageInboundEvent<typeof FACEBOOK_CHANNEL_NAME>,
  ): Promise<SubscriberCreateDto> {
    const settings = await this.parseSettingsWithCredentials(
      event.getSourceSettings(),
      ['page_access_token'],
    );
    const sourceId = event.getSourceId();
    const foreignId = event.getSenderForeignId();
    const profile = await this.getProfileSafe(settings, foreignId);
    const defaultLanguage = await this.getDefaultLanguageSafe();
    const locale = profile.locale ?? '';

    return {
      foreignId,
      firstName: profile.first_name ?? 'Facebook',
      lastName: profile.last_name ?? 'User',
      assignedTo: null,
      assignedAt: null,
      lastvisit: new Date(),
      retainedFrom: new Date(),
      avatar: null,
      channel: event.getChannelData(),
      language: locale.slice(0, 2) || defaultLanguage,
      locale,
      timezone:
        typeof profile.timezone === 'number' &&
        Number.isFinite(profile.timezone)
          ? profile.timezone
          : 0,
      gender: profile.gender ?? null,
      country: null,
      labels: [],
      source: sourceId ?? '',
    };
  }

  async getSubscriberAvatar(
    event: MessageInboundEvent<typeof FACEBOOK_CHANNEL_NAME>,
  ) {
    const settings = await this.parseSettingsWithCredentials(
      event.getSourceSettings(),
      ['page_access_token'],
    );
    const profile = await this.getProfileSafe(
      settings,
      event.getSenderForeignId(),
    );

    if (!profile.profile_pic) {
      return undefined;
    }

    return await this.graphApi.downloadUrl(
      profile.profile_pic,
      'facebook-avatar',
    );
  }

  async getMessageAttachments(
    event: MessageInboundEvent<typeof FACEBOOK_CHANNEL_NAME>,
  ) {
    if (!(event instanceof FacebookAttachmentMessageInboundEvent)) {
      return [];
    }

    const attachments = await Promise.all(
      event
        .getRemoteAttachments()
        .filter((attachment) => !!attachment.payload.url)
        .map((attachment) =>
          this.graphApi.downloadUrl(
            attachment.payload.url!,
            this.resolveAttachmentName(attachment),
          ),
        ),
    );

    return attachments;
  }

  async getIntegrationHealth(context: ChannelHealthContext) {
    const activeSources = context.sources.filter((source) => source.state);
    const missingSecrets = (
      await Promise.all(
        activeSources.map(async (source) => {
          const settings = this.parseSettings(source.settings);

          if (!this.hasCredentialRefs(settings)) {
            return source;
          }

          const resolvedSettings = await this.resolveSettingsCredentials(
            settings,
            FACEBOOK_CREDENTIAL_SETTING_KEYS,
          );

          return this.hasCredentialValues(resolvedSettings) ? null : source;
        }),
      )
    ).filter((source): source is Source => source !== null);

    if (activeSources.length === 0 || missingSecrets.length === 0) {
      return {
        ...context.defaultHealth,
        details: {
          ...(context.defaultHealth.details ?? {}),
          requiredSettings: [...FACEBOOK_CREDENTIAL_SETTING_KEYS],
        },
      } satisfies Partial<IntegrationHealthItem>;
    }

    return {
      status: 'unhealthy',
      reason: 'facebook.missing_required_settings',
      message: `${missingSecrets.length} active Facebook source${
        missingSecrets.length === 1 ? '' : 's'
      } missing required settings.`,
      details: {
        activeSources: activeSources.length,
        missingRequiredSettings: missingSecrets.length,
        requiredSettings: [...FACEBOOK_CREDENTIAL_SETTING_KEYS],
      },
    } satisfies Partial<IntegrationHealthItem>;
  }

  @OnEvent('hook:source:postCreate', { async: true })
  @OnEvent('hook:source:postUpdate', { async: true })
  async handleSourceMutated(event: EntityHookPayload<Source>): Promise<void> {
    const source = event.entity;

    if (!source || source.channel !== FACEBOOK_CHANNEL_NAME) {
      return;
    }

    await this.syncSourceMessengerProfile(source);
  }

  @OnEvent('hook:menu:*', { async: true })
  async handleMenuMutated(): Promise<void> {
    const sources = await this.sourceService.find({
      where: {
        channel: FACEBOOK_CHANNEL_NAME,
        state: true,
      },
    });

    await Promise.all(
      sources.map((source) => this.syncSourceMessengerProfile(source)),
    );
  }

  @OnEvent('hook:subscriber:postUpdate', { async: true })
  async handleSubscriberUpdated(event: EntityHookPayload<Record<string, any>>) {
    const subscriber = event.entity;
    const previous = event.databaseEntity;

    if (!subscriber?.foreignId || !previous) {
      return;
    }

    const sourceId = this.resolveEntityId(subscriber.source);

    if (!sourceId) {
      return;
    }

    const source = await this.sourceService.findOne(sourceId);

    if (!source || source.channel !== FACEBOOK_CHANNEL_NAME) {
      return;
    }

    const settings = await this.parseSettingsWithCredentials(source.settings, [
      'page_access_token',
    ]);

    if (!settings.page_access_token) {
      return;
    }

    const before = new Set(this.extractEntityIds(previous.labels));
    const after = new Set(
      this.extractEntityIds(subscriber.labels ?? event.payload?.labels),
    );
    const added = [...after].filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !after.has(id));

    if (added.length === 0 && removed.length === 0) {
      return;
    }

    const labels = await this.labelService.findAll();
    const labelMap = new Map(labels.map((label) => [label.id, label]));

    await Promise.all([
      ...added.map(async (labelId) => {
        const messengerLabelId = labelMap.get(labelId)?.label_id?.facebook;

        if (messengerLabelId) {
          await this.graphApi.addPsidToCustomLabel(
            settings,
            String(messengerLabelId),
            subscriber.foreignId,
          );
        }
      }),
      ...removed.map(async (labelId) => {
        const messengerLabelId = labelMap.get(labelId)?.label_id?.facebook;

        if (messengerLabelId) {
          await this.graphApi.removePsidFromCustomLabel(
            settings,
            String(messengerLabelId),
            subscriber.foreignId,
          );
        }
      }),
    ]);
  }

  private async syncSourceMessengerProfile(source: Source): Promise<void> {
    const settings = await this.parseSettingsWithCredentials(source.settings, [
      'page_access_token',
    ]);

    if (!source.state || !settings.sync_messenger_profile) {
      return;
    }

    if (!settings.page_access_token) {
      this.logger.warn(
        `Skipping Facebook Messenger profile sync for source ${source.id}: missing page access token`,
      );

      return;
    }

    const fieldsToDelete: Array<keyof Facebook.MessengerProfile> = [];
    const profile: Facebook.MessengerProfile = {};

    if (settings.greeting_text.trim()) {
      profile.greeting = [
        {
          locale: 'default',
          text: settings.greeting_text.trim(),
        },
      ];
    } else {
      fieldsToDelete.push('greeting');
    }

    if (settings.get_started_button.trim()) {
      profile.get_started = {
        payload: settings.get_started_button.trim(),
      };
    } else {
      fieldsToDelete.push('get_started');
    }

    if (settings.persistent_menu) {
      const menu = await this.menuService.getTree();
      const callToActions = this.toMessengerMenu(menu);

      if (callToActions.length > 0) {
        profile.persistent_menu = [
          {
            locale: 'default',
            composer_input_disabled: settings.composer_input_disabled,
            call_to_actions: callToActions,
          },
        ];
      } else {
        fieldsToDelete.push('persistent_menu');
      }
    } else {
      fieldsToDelete.push('persistent_menu');
    }

    if (Object.keys(profile).length > 0) {
      await this.graphApi.setMessengerProfile(settings, profile);
    }

    if (fieldsToDelete.length > 0) {
      await this.graphApi.deleteMessengerProfile(settings, fieldsToDelete);
    }
  }

  private toMessengerMenu(menu: MenuTree): Facebook.MessengerProfileMenuItem[] {
    const result: Facebook.MessengerProfileMenuItem[] = [];

    for (const item of menu.slice(0, 3)) {
      if (item.type === MenuType.nested) {
        const callToActions = this.toMessengerMenu(item.call_to_actions ?? []);

        if (callToActions.length === 0) {
          continue;
        }

        result.push({
          type: 'nested',
          title: item.title,
          call_to_actions: callToActions.slice(0, 5),
        });

        continue;
      }

      if (item.type === MenuType.web_url) {
        result.push({
          type: 'web_url',
          title: item.title,
          url: this.ensureHttpUrl(item.url),
        });

        continue;
      }

      result.push({
        type: 'postback',
        title: item.title,
        payload: item.payload,
      });
    }

    return result;
  }

  private async getProfileSafe(
    settings: FacebookResolvedChannelSettings,
    psid: string,
  ): Promise<Facebook.UserProfile> {
    if (!settings.page_access_token) {
      return {};
    }

    try {
      return await this.graphApi.getUserProfile(settings, psid);
    } catch (err) {
      this.logger.warn(`Unable to fetch Facebook user profile ${psid}`, err);

      return {};
    }
  }

  private async getDefaultLanguageSafe(): Promise<string> {
    try {
      return (await this.languageService.getDefaultLanguage()).code;
    } catch {
      return '';
    }
  }

  private resolveTypingTimeout(
    envelope: StdOutgoingMessageEnvelope,
    typing: boolean | number,
  ): number {
    const autoTimeout =
      envelope.data && 'text' in envelope.data
        ? String(envelope.data.text).length * 10
        : 1000;
    const timeout = typeof typing === 'number' ? typing : autoTimeout;

    return Math.min(timeout, MAX_TYPING_DELAY_MS);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseSettings(settings: unknown): FacebookChannelSettings {
    return FACEBOOK_CHANNEL_SOURCE_SETTINGS_SCHEMA.parse(settings ?? {});
  }

  private async parseSettingsWithCredentials(
    settings: unknown,
    credentialKeys: readonly FacebookCredentialSettingKey[],
  ): Promise<FacebookResolvedChannelSettings> {
    return await this.resolveSettingsCredentials(
      this.parseSettings(settings),
      credentialKeys,
    );
  }

  private async resolveSettingsCredentials(
    settings: FacebookChannelSettings,
    credentialKeys: readonly FacebookCredentialSettingKey[],
  ): Promise<FacebookResolvedChannelSettings> {
    const resolvedSettings = { ...settings };

    await Promise.all(
      credentialKeys.map(async (key) => {
        resolvedSettings[key] = await this.resolveCredentialValue(settings[key]);
      }),
    );

    return resolvedSettings;
  }

  private async resolveCredentialValue(credentialId: string): Promise<string> {
    const id = credentialId.trim();

    if (!id) {
      return '';
    }

    const value = await this.getCredentialService().findOneValue(id);

    return value.trim();
  }

  private getCredentialService(): CredentialService {
    if (!this.credentialService) {
      this.credentialService = this.credentialsModuleRef.get(
        CredentialService,
        { strict: false },
      );
    }

    return this.credentialService;
  }

  private hasCredentialRefs(settings: FacebookChannelSettings): boolean {
    return FACEBOOK_CREDENTIAL_SETTING_KEYS.every((key) =>
      Boolean(settings[key].trim()),
    );
  }

  private hasCredentialValues(
    settings: FacebookResolvedChannelSettings,
  ): boolean {
    return FACEBOOK_CREDENTIAL_SETTING_KEYS.every((key) =>
      Boolean(settings[key].trim()),
    );
  }

  private getQueryParam(req: Request, key: string): string | null {
    const value = req.query[key];

    if (Array.isArray(value)) {
      return typeof value[0] === 'string' ? value[0] : null;
    }

    return typeof value === 'string' ? value : null;
  }

  private getHeader(req: Request, key: string): string | null {
    const value = req.headers[key.toLowerCase()];

    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return typeof value === 'string' ? value : null;
  }

  private safeCompareHex(actual: string, expected: string): boolean {
    const actualBuffer = Uint8Array.from(Buffer.from(actual, 'hex'));
    const expectedBuffer = Uint8Array.from(Buffer.from(expected, 'hex'));

    if (actualBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(actualBuffer, expectedBuffer);
  }

  private resolveAttachmentName(attachment: Facebook.Attachment): string {
    const title = attachment.payload.title;

    if (title) {
      return title;
    }

    if (attachment.payload.sticker_id) {
      return `sticker-${attachment.payload.sticker_id}`;
    }

    return `${attachment.type}-attachment`;
  }

  private resolveEntityId(value: unknown): string | null {
    if (typeof value === 'string') {
      return value;
    }

    if (value && typeof value === 'object' && 'id' in value) {
      const id = (value as { id?: unknown }).id;

      return typeof id === 'string' ? id : null;
    }

    return null;
  }

  private extractEntityIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.resolveEntityId(item))
      .filter((id): id is string => !!id);
  }

  private ensureHttpUrl(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }
}
