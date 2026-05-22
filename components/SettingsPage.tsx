'use client';
import { useState } from 'react';
import { Phone, Link, Key, Webhook, ChevronRight, Copy, CheckCircle } from 'lucide-react';

export default function SettingsPage() {
  const [copied, setCopied] = useState('');

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const envVars = [
    { key: 'WHATSAPP_PHONE_NUMBER_ID', label: 'Phone Number ID', placeholder: '680420725151873', hint: 'Found in Meta Business Suite → WhatsApp → API Setup' },
    { key: 'WHATSAPP_ACCESS_TOKEN', label: 'Access Token', placeholder: 'EAABsbCS...', hint: 'Permanent system user token from Meta Developer Console → Access Tokens' },
    { key: 'WHATSAPP_WABA_ID', label: 'WhatsApp Business Account ID (WABA ID)', placeholder: '1225694708548053', hint: 'Found in Meta Business Suite → Business Settings → WhatsApp Accounts' },
    { key: 'WHATSAPP_BUSINESS_ID', label: 'Meta Business ID', placeholder: '882253946411031', hint: 'Your Meta Business Suite top-level business ID' },
    { key: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN', label: 'Webhook Verify Token', placeholder: 'nibirapon_webhook_token_2024', hint: 'Set this same string in Meta Developer Console → Webhooks → Verify Token' },
  ];

  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/webhook` : '/api/webhook';

  return (
    <div className="flex-1 overflow-y-auto bg-[#f0f2f5] dark:bg-[#0b141a]">
      <div className="sticky top-0 z-10 bg-white dark:bg-[#111b21] border-b border-gray-200 dark:border-[#2a3942] px-6 py-4 shadow-sm">
        <h1 className="text-xl font-bold text-[#111b21] dark:text-[#e9edef]">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-[#8696a0]">Configure your WhatsApp Business integration</p>
      </div>

      <div className="p-6 space-y-5 max-w-3xl">
        {/* API Setup */}
        <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-gray-100 dark:border-[#2a3942] overflow-hidden">
          <div className="px-6 py-4 bg-linear-to-r from-wp-dark to-wp-teal flex items-center gap-3">
            <Key size={20} className="text-white" />
            <div>
              <h2 className="font-semibold text-white">WhatsApp Cloud API v25.0</h2>
              <p className="text-xs text-white/70">Add credentials to your .env.local file</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {envVars.map(({ key, label, placeholder, hint }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-[#111b21] dark:text-[#e9edef] mb-1">{label}</label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-gray-50 dark:bg-[#1f2c34] rounded-xl border border-gray-200 dark:border-[#2a3942] px-3 py-2.5 flex items-center gap-2">
                    <code className="text-xs text-wp-dark font-mono font-semibold">{key}=</code>
                    <input
                      type={key.includes('TOKEN') ? 'password' : 'text'}
                      placeholder={placeholder}
                      className="flex-1 bg-transparent text-sm text-gray-700 dark:text-[#e9edef] outline-none placeholder-gray-400 dark:placeholder-[#667781]"
                    />
                  </div>
                  <button
                    onClick={() => copyToClipboard(`${key}=${placeholder}`, key)}
                    className="p-2.5 rounded-xl border border-gray-200 dark:border-[#2a3942] hover:bg-gray-50 dark:hover:bg-[#1f2c34] transition-colors"
                    title="Copy env var"
                  >
                    {copied === key ? (
                      <CheckCircle size={16} className="text-green-500" />
                    ) : (
                      <Copy size={16} className="text-gray-400 dark:text-[#667781]" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-[#667781] mt-1 ml-1">{hint}</p>
              </div>
            ))}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-4">
              <p className="text-xs text-amber-700 font-medium mb-1">⚠️ Setup Instructions</p>
              <ol className="text-xs text-amber-600 space-y-0.5 list-decimal list-inside">
                <li>Create <code className="font-mono">.env.local</code> in your project root</li>
                <li>Add the variables above with your actual values</li>
                <li>Restart the development server</li>
                <li>Configure the webhook URL below in Meta Business Suite</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Webhook Config */}
        <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-gray-100 dark:border-[#2a3942] overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-[#2a3942] flex items-center gap-3">
            <Webhook size={18} className="text-wp-dark" />
            <div>
              <h2 className="font-semibold text-[#111b21] dark:text-[#e9edef]">Webhook Configuration</h2>
              <p className="text-xs text-gray-400 dark:text-[#667781]">Configure in Meta Developer Console → WhatsApp → Configuration</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#111b21] dark:text-[#e9edef] mb-1">Callback URL</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-gray-50 dark:bg-[#1f2c34] rounded-xl border border-gray-200 dark:border-[#2a3942] px-3 py-2.5 flex items-center">
                  <code className="text-xs font-mono text-gray-600 dark:text-[#8696a0] break-all">{webhookUrl}</code>
                </div>
                <button
                  onClick={() => copyToClipboard(webhookUrl, 'webhook_url')}
                  className="p-2.5 rounded-xl border border-gray-200 dark:border-[#2a3942] hover:bg-gray-50 dark:hover:bg-[#1f2c34] transition-colors"
                >
                  {copied === 'webhook_url' ? (
                    <CheckCircle size={16} className="text-green-500" />
                  ) : (
                    <Copy size={16} className="text-gray-400 dark:text-[#667781]" />
                  )}
                </button>
              </div>
            </div>

            <div className="bg-[#e8f5e9] border border-wp-green/30 rounded-xl p-3">
              <p className="text-xs text-wp-dark font-medium mb-1.5">Webhook Subscriptions to Enable:</p>
              <div className="flex flex-wrap gap-1.5">
                {['messages', 'message_deliveries', 'message_reads', 'messaging_postbacks'].map((s) => (
                  <span key={s} className="text-[10px] bg-wp-green/20 text-wp-dark px-2 py-0.5 rounded-full font-mono">{s}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Business Profile */}
        <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-gray-100 dark:border-[#2a3942] overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-[#2a3942] flex items-center gap-3">
            <Phone size={18} className="text-wp-dark" />
            <h2 className="font-semibold text-[#111b21] dark:text-[#e9edef]">Business Profile</h2>
          </div>
          <div className="p-6 space-y-3">
            {[
              { label: 'Business Name', placeholder: 'Nibirapon Fashion' },
              { label: 'Business Description', placeholder: 'Premium ethnic & fusion wear' },
              { label: 'Business Email', placeholder: 'hello@nibirapon.com' },
              { label: 'Website', placeholder: 'https://nibirapon.com' },
            ].map(({ label, placeholder }) => (
              <div key={label}>
                <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">{label}</label>
                <input
                  type="text"
                  placeholder={placeholder}
                  className="w-full border border-gray-200 dark:border-[#2a3942] bg-white dark:bg-[#1f2c34] rounded-xl px-3 py-2 text-sm text-[#111b21] dark:text-[#e9edef] outline-none focus:border-wp-green transition-colors placeholder-gray-400 dark:placeholder-[#667781]"
                />
              </div>
            ))}
            <button className="w-full bg-wp-green hover:bg-[#22c55e] text-white font-medium py-2.5 rounded-xl text-sm transition-colors mt-2">
              Update Profile
            </button>
          </div>
        </div>

        {/* API Reference */}
        <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-gray-100 dark:border-[#2a3942] p-6">
          <div className="flex items-center gap-2 mb-3">
            <Link size={16} className="text-wp-dark" />
            <h3 className="font-semibold text-[#111b21] dark:text-[#e9edef]">API Reference</h3>
          </div>
          <div className="space-y-2">
            {[
              { label: 'WhatsApp Cloud API Docs', url: 'https://developers.facebook.com/docs/whatsapp/cloud-api' },
              { label: 'Message Templates Guide', url: 'https://developers.facebook.com/docs/whatsapp/message-templates' },
              { label: 'Webhooks Reference', url: 'https://developers.facebook.com/docs/whatsapp/webhooks' },
              { label: 'Meta Business Suite', url: 'https://business.facebook.com' },
            ].map(({ label, url }) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-[#2a3942] hover:bg-gray-50 dark:hover:bg-[#1f2c34] transition-colors group"
              >
                <span className="text-sm text-[#111b21] dark:text-[#e9edef]">{label}</span>
                <ChevronRight size={14} className="text-gray-400 dark:text-[#667781] group-hover:text-wp-green transition-colors" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
