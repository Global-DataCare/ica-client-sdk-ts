export class DidCommMessage {
  id = 'mock';
  type = '';
  body: any = {};
  attachments?: any[];
  thid?: string;
}

export type DidCommAttachment = {
  id: string;
  media_type: string;
  data: any;
};

export function prepareDidCommRequest(type: string, body: any = {}, attachments: any[] = []): DidCommMessage {
  const message = new DidCommMessage();
  message.type = type;
  message.body = body;
  message.attachments = attachments;
  message.thid = message.id;
  return message;
}

export function includeVpTokenInMessage(message: DidCommMessage, vpToken: string): void {
  message.body.vp_token = vpToken;
}

export function includeFileInMessage(message: DidCommMessage, fileBytes: Uint8Array, mediaType: string, id: string): void {
  if (!message.attachments) message.attachments = [];
  message.attachments.push({ id, media_type: mediaType, data: { base64: Buffer.from(fileBytes).toString('base64') } });
}

export function getThidFromMessage(message: DidCommMessage): string {
  return message.thid || message.id;
}

export function getDataResults(response: DidCommMessage): any[] {
  return response.body?.data || [];
}
