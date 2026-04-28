/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import { Readable } from 'stream';

import { AttachmentFile } from '@hexabot-ai/api';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

import {
  FacebookChannelSettings,
  parseFacebookUserFields,
} from '../settings.schema';
import { Facebook } from '../types';

const GRAPH_API_BASE_URL = 'https://graph.facebook.com';

@Injectable()
export class FacebookGraphApiService {
  constructor(private readonly httpService: HttpService) {}

  private buildUrl(settings: FacebookChannelSettings, path: string): string {
    const version = settings.graph_api_version.replace(/^\/+|\/+$/g, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    return `${GRAPH_API_BASE_URL}/${version}${normalizedPath}`;
  }

  private async request<T>(
    settings: FacebookChannelSettings,
    config: AxiosRequestConfig,
  ): Promise<T> {
    const response = await firstValueFrom(
      this.httpService.request<T>({
        ...config,
        params: {
          access_token: settings.page_access_token,
          ...(config.params ?? {}),
        },
      }),
    );

    return response.data;
  }

  async sendMessage(
    settings: FacebookChannelSettings,
    payload: Facebook.SendApiPayload,
  ): Promise<Facebook.SendApiResponse> {
    return await this.request<Facebook.SendApiResponse>(settings, {
      method: 'POST',
      url: this.buildUrl(settings, '/me/messages'),
      data: payload,
    });
  }

  async sendSenderAction(
    settings: FacebookChannelSettings,
    recipientId: string,
    senderAction: 'typing_on' | 'typing_off',
  ): Promise<void> {
    await this.sendMessage(settings, {
      recipient: {
        id: recipientId,
      },
      sender_action: senderAction,
    });
  }

  async getUserProfile(
    settings: FacebookChannelSettings,
    psid: string,
  ): Promise<Facebook.UserProfile> {
    return await this.request<Facebook.UserProfile>(settings, {
      method: 'GET',
      url: this.buildUrl(settings, `/${psid}`),
      params: {
        fields: parseFacebookUserFields(settings).join(','),
      },
    });
  }

  async setMessengerProfile(
    settings: FacebookChannelSettings,
    profile: Facebook.MessengerProfile,
  ): Promise<void> {
    await this.request(settings, {
      method: 'POST',
      url: this.buildUrl(settings, '/me/messenger_profile'),
      data: profile,
    });
  }

  async deleteMessengerProfile(
    settings: FacebookChannelSettings,
    fields: Array<keyof Facebook.MessengerProfile>,
  ): Promise<void> {
    await this.request(settings, {
      method: 'DELETE',
      url: this.buildUrl(settings, '/me/messenger_profile'),
      data: {
        fields,
      },
    });
  }

  async addPsidToCustomLabel(
    settings: FacebookChannelSettings,
    labelId: string,
    psid: string,
  ): Promise<void> {
    await this.request(settings, {
      method: 'POST',
      url: this.buildUrl(settings, `/${labelId}/label`),
      data: {
        user: psid,
      },
    });
  }

  async removePsidFromCustomLabel(
    settings: FacebookChannelSettings,
    labelId: string,
    psid: string,
  ): Promise<void> {
    await this.request(settings, {
      method: 'DELETE',
      url: this.buildUrl(settings, `/${labelId}/label`),
      data: {
        user: psid,
      },
    });
  }

  async downloadUrl(url: string, name?: string): Promise<AttachmentFile> {
    const response = await firstValueFrom(
      this.httpService.get<Readable>(url, {
        responseType: 'stream',
      }),
    );

    return this.toAttachmentFile(response, name);
  }

  private toAttachmentFile(
    response: AxiosResponse<Readable>,
    name?: string,
  ): AttachmentFile {
    const contentType = String(
      response.headers['content-type'] ?? 'application/octet-stream',
    ).split(';')[0];
    const contentLength = Number(response.headers['content-length'] ?? 0);

    return {
      file: response.data,
      name,
      size: Number.isFinite(contentLength) ? contentLength : 0,
      type: contentType,
    };
  }
}

export default FacebookGraphApiService;
