const GRAPH_API_VERSION = 'v25.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '680420725151873';
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WABA_ID = process.env.WHATSAPP_WABA_ID || '1225694708548053';
const BUSINESS_ID = process.env.WHATSAPP_BUSINESS_ID || '882253946411031';

interface SendTextPayload {
  to: string;
  text: string;
  previewUrl?: boolean;
  contextMessageId?: string;
}

interface SendTemplatePayload {
  to: string;
  templateName: string;
  language?: string;
  components?: object[];
}

interface SendMediaPayload {
  to: string;
  type: 'image' | 'document' | 'audio' | 'video';
  mediaId?: string;
  mediaUrl?: string;
  caption?: string;
  filename?: string;
}

interface SendInteractivePayload {
  to: string;
  bodyText: string;
  buttons: { id: string; title: string }[];
}

async function graphRequest(method: string, endpoint: string, body?: object) {
  const url = `${BASE_URL}/${endpoint}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000), // fail fast if Meta API stalls
  });
  const data = await res.json();
  if (!res.ok) {
    const e = data.error || {};
    // error_data.details carries the specific reason (e.g. why an order_details
    // / payment message was rejected) — surface it so failures are debuggable.
    const detail = e.error_data?.details ? ` — ${e.error_data.details}` : '';
    const code   = e.code ? ` (code ${e.code})` : '';
    throw new Error(`${e.message || `WhatsApp API error: ${res.status}`}${detail}${code}`);
  }
  return data;
}

export async function sendTextMessage({ to, text, previewUrl = false, contextMessageId }: SendTextPayload) {
  const body: Record<string, any> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text, preview_url: previewUrl },
  };
  if (contextMessageId) body.context = { message_id: contextMessageId };
  return graphRequest('POST', `${PHONE_NUMBER_ID}/messages`, body);
}

export async function sendTemplateMessage({ to, templateName, language = 'en', components = [] }: SendTemplatePayload) {
  return graphRequest('POST', `${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components,
    },
  });
}

// ─── Rich template send (used by broadcast) ──────────────────────────────────

export interface RichTemplatePayload {
  to: string;
  templateName: string;
  language?: string;
  bodyParams?: string[];          // values for {{1}}, {{2}} … in BODY
  headerParam?: string;           // text value for HEADER {{1}}
  headerMediaUrl?: string;        // image/video URL for media HEADER
  headerMediaType?: 'image' | 'video' | 'document';
  buttonParams?: string[];        // URL suffix for dynamic URL buttons
  isCatalogTemplate?: boolean;    // adds required CATALOG button component
}

export async function sendRichTemplateMessage({
  to,
  templateName,
  language = 'en',
  bodyParams = [],
  headerParam,
  headerMediaUrl,
  headerMediaType = 'image',
  buttonParams = [],
  isCatalogTemplate = false,
}: RichTemplatePayload) {
  const components: object[] = [];

  // HEADER component
  if (headerMediaUrl) {
    components.push({
      type: 'header',
      parameters: [{ type: headerMediaType, [headerMediaType]: { link: headerMediaUrl } }],
    });
  } else if (headerParam) {
    components.push({
      type: 'header',
      parameters: [{ type: 'text', text: headerParam }],
    });
  }

  // BODY component
  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((text) => ({ type: 'text', text })),
    });
  }

  // BUTTON components (dynamic URL suffix)
  buttonParams.forEach((suffix, idx) => {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(idx),
      parameters: [{ type: 'text', text: suffix }],
    });
  });

  // Catalog templates require an explicit CATALOG button component
  if (isCatalogTemplate) {
    components.push({
      type: 'button',
      sub_type: 'CATALOG',
      index: '0',
      parameters: [{ type: 'action', action: { thumbnail_product_retailer_id: '' } }],
    });
  }

  return graphRequest('POST', `${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      // Omit components entirely when empty — WhatsApp rejects [] for catalog/utility templates
      ...(components.length > 0 ? { components } : {}),
    },
  });
}

// ─── MPM (Multi-Product Message) template ────────────────────────────────────

export interface MPMSection {
  title: string;
  product_items: { product_retailer_id: string }[];
}

export interface MPMTemplatePayload {
  to: string;
  templateName: string;
  language?: string;
  headerParam?: string;           // custom heading text (header component {{1}})
  bodyParams?: string[];
  thumbnailProductRetailerId: string;
  sections: MPMSection[];
}

export async function sendMPMTemplateMessage({
  to,
  templateName,
  language = 'en',
  headerParam,
  bodyParams = [],
  thumbnailProductRetailerId,
  sections,
}: MPMTemplatePayload) {
  const components: object[] = [];

  if (headerParam) {
    components.push({
      type: 'header',
      parameters: [{ type: 'text', text: headerParam }],
    });
  }

  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((text) => ({ type: 'text', text })),
    });
  }

  const mpmAction: Record<string, any> = {
    thumbnail_product_retailer_id: thumbnailProductRetailerId,
    sections,
  };

  components.push({
    type: 'button',
    sub_type: 'mpm',
    index: '0',
    parameters: [{ type: 'action', action: mpmAction }],
  });

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components,
    },
  };
  console.log('[mpm_template] payload:', JSON.stringify(payload, null, 2));
  return graphRequest('POST', `${PHONE_NUMBER_ID}/messages`, payload);
}

export interface CheckoutTemplatePayload {
  to: string;
  referenceId: string;
  currency: string;
  totalAmountInPaise: number;
  headerImageUrl?: string;
  items: {
    retailerId: string;
    name: string;
    priceInPaise: number;
    quantity: number;
  }[];
}

export async function sendCheckoutTemplate({
  to,
  referenceId,
  currency,
  totalAmountInPaise,
  headerImageUrl,
  items,
}: CheckoutTemplatePayload) {
  // Managed Payment configuration name (WhatsApp Manager → Payment configurations).
  // Guard against the env being set to the literal var name (a common copy-paste slip)
  // or left blank — both fall back to the actual config "textpayment".
  const rawCfg = process.env.RAZORPAY_WHATSAPP_CONFIG;
  const paymentConfig = rawCfg && rawCfg !== 'RAZORPAY_WHATSAPP_CONFIG' ? rawCfg : 'newconfig';
  // Payment method/rail per the WhatsApp IN Payments "Send Order Details" sample
  // (e.g. "upi"). Overridable in case the gateway expects a different value.
  const paymentType = process.env.WHATSAPP_PAYMENT_TYPE || 'upi';

  // Self-described (ad-hoc) line items — matches the IN Payments sample: no
  // catalog_id, no importer block. amount is the per-unit price in paise.
  const orderItems = items.map((item) => ({
    retailer_id: item.retailerId,
    name:        item.name,
    amount:      { value: item.priceInPaise, offset: 100 },
    quantity:    item.quantity,
  }));

  // India Payments order_details: payment_type + payment_configuration reference
  // the managed Razorpay config. (The older payment_settings/payment_gateway block
  // is NOT used here and was the source of the earlier #131009.)
  const parameters: Record<string, any> = {
    reference_id:          referenceId,
    type:                  'physical-goods',
    payment_type:          paymentType,
    payment_configuration: paymentConfig,
    currency,
    total_amount: { value: totalAmountInPaise, offset: 100 },
    order: {
      status:   'pending',
      items:    orderItems,
      subtotal: { value: totalAmountInPaise, offset: 100 },
      tax:      { value: 0, offset: 100 },
    },
  };

  const interactive: Record<string, any> = {
    type: 'order_details',
    body: { text: 'You are just one step away' },
    action: { name: 'review_and_pay', parameters },
  };

  if (headerImageUrl) {
    interactive.header = { type: 'image', image: { link: headerImageUrl } };
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to,
    type:              'interactive',
    interactive,
  };

  console.log('[checkout_template] payload:', JSON.stringify(payload, null, 2));
  return graphRequest('POST', `${PHONE_NUMBER_ID}/messages`, payload);
}

export async function sendMediaMessage({ to, type, mediaId, mediaUrl, caption, filename }: SendMediaPayload) {
  const mediaObj: Record<string, string | undefined> = {};
  if (mediaId) mediaObj.id = mediaId;
  else if (mediaUrl) mediaObj.link = mediaUrl;
  if (caption) mediaObj.caption = caption;
  if (filename && type === 'document') mediaObj.filename = filename;

  return graphRequest('POST', `${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type,
    [type]: mediaObj,
  });
}

export async function sendInteractiveMessage({ to, bodyText, buttons }: SendInteractivePayload) {
  return graphRequest('POST', `${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  });
}

export interface ListRow { id: string; title: string; description?: string }
export interface ListSection { title?: string; rows: ListRow[] }
export interface SendListPayload {
  to: string;
  body: string;
  button: string;          // the list-opener button label (≤20 chars)
  sections: ListSection[]; // ≤10 rows total
  header?: string;
  footer?: string;
}

export async function sendListMessage({ to, body, button, sections, header, footer }: SendListPayload) {
  const interactive: Record<string, any> = {
    type: 'list',
    body: { text: body },
    action: {
      button: button.slice(0, 20),
      sections: sections.map((s) => ({
        ...(s.title ? { title: s.title.slice(0, 24) } : {}),
        rows: s.rows.slice(0, 10).map((r) => ({
          id: r.id.slice(0, 200),
          title: r.title.slice(0, 24),
          ...(r.description ? { description: r.description.slice(0, 72) } : {}),
        })),
      })),
    },
  };
  if (header) interactive.header = { type: 'text', text: header.slice(0, 60) };
  if (footer) interactive.footer = { text: footer.slice(0, 60) };

  return graphRequest('POST', `${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive,
  });
}

export async function sendFlowMessage({
  to,
  flowId,
  flowToken,
}: {
  to: string
  flowId: string
  flowToken: string
}) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: { type: 'text', text: '🛍️ Complete Your Order' },
      body: { text: 'Fill in your details and we\'ll ship it right away!' },
      footer: { text: 'Nibirapon by Fem Fashion' },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: flowToken,
          flow_id: flowId,
          flow_cta: 'Complete My Order →',
          // NO flow_action or flow_action_payload for static flows
        },
      },
    },
  }

  console.log('[flow] payload:', JSON.stringify(payload, null, 2))
  return graphRequest('POST', `${PHONE_NUMBER_ID}/messages`, payload)
}

export async function markMessageRead(messageId: string) {
  return graphRequest('POST', `${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  });
}

export async function getMessageTemplates() {
  return graphRequest('GET', `${WABA_ID}/message_templates?fields=name,status,category,language,components`);
}

export interface CreateTemplatePayload {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components: object[];
}

export async function createMessageTemplate(payload: CreateTemplatePayload) {
  return graphRequest('POST', `${WABA_ID}/message_templates`, payload);
}

export async function updateMessageTemplate(templateId: string, components: object[]) {
  // PATCH uses POST to /{template_id} per Meta's Business Management API
  return graphRequest('POST', templateId, { components });
}

export async function uploadMedia(file: ArrayBuffer, mimeType: string) {
  const formData = new FormData();
  const blob = new Blob([file], { type: mimeType });
  formData.append('file', blob);
  formData.append('type', mimeType);
  formData.append('messaging_product', 'whatsapp');

  const url = `${BASE_URL}/${PHONE_NUMBER_ID}/media`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: formData,
  });
  return res.json();
}

export async function getMediaUrl(mediaId: string) {
  return graphRequest('GET', mediaId);
}

export async function getProductFromCatalog(catalogId: string, retailerId: string) {
  const filter = encodeURIComponent(JSON.stringify({ retailer_id: { eq: retailerId } }));
  return graphRequest('GET', `${catalogId}/products?fields=retailer_id,name,image_url,price,currency&filter=${filter}`);
}

export async function getBusinessProfile() {
  return graphRequest('GET', `${PHONE_NUMBER_ID}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`);
}

export async function updateBusinessProfile(data: {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
}) {
  return graphRequest('POST', `${PHONE_NUMBER_ID}/whatsapp_business_profile`, {
    messaging_product: 'whatsapp',
    ...data,
  });
}

export function verifyWebhook(mode: string, token: string, challenge: string): string | null {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'nibirapon_webhook_token';
  if (mode === 'subscribe' && token === verifyToken) {
    return challenge;
  }
  return null;
}

export { PHONE_NUMBER_ID, WABA_ID, BUSINESS_ID };
