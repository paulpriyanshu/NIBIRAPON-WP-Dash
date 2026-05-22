'use client';
import { Contact, Conversation } from '@/types';
import Avatar from '@/components/ui/Avatar';
import { X, Phone, Mail, Building, Tag, Edit, Star, Bell, Ban, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface ContactPanelProps {
  conversation: Conversation;
  onClose: () => void;
}

const leadStatusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  qualified: 'bg-purple-100 text-purple-700',
  converted: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
};

export default function ContactPanel({ conversation, onClose }: ContactPanelProps) {
  const { contact, status, tags, createdAt } = conversation;
  const [mediaExpanded, setMediaExpanded] = useState(true);
  const [docsExpanded, setDocsExpanded] = useState(false);

  const infoRows = [
    { icon: Phone, label: 'Phone', value: contact.phone },
    { icon: Mail, label: 'Email', value: contact.email || 'Not provided' },
    { icon: Building, label: 'Company', value: contact.company || 'Not provided' },
  ];

  return (
    <div className="w-80 bg-[#f0f2f5] dark:bg-[#0b141a] border-l border-gray-200 dark:border-[#2a3942] flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 bg-[#f0f2f5] dark:bg-[#1f2c34] border-b border-gray-200 dark:border-[#2a3942]">
        <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-[#2a3942] transition-colors">
          <X size={18} className="text-[#54656f] dark:text-[#8696a0]" />
        </button>
        <span className="font-semibold text-[#111b21] dark:text-[#e9edef]">Contact Info</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Avatar + name */}
        <div className="bg-white dark:bg-[#111b21] px-4 py-6 flex flex-col items-center gap-3 border-b border-gray-100 dark:border-[#2a3942]">
          <Avatar name={contact.name} size="xl" isOnline={contact.isOnline} />
          <div className="text-center">
            <h3 className="font-semibold text-[#111b21] dark:text-[#e9edef] text-lg">{contact.name}</h3>
            <p className="text-sm text-gray-500 dark:text-[#8696a0]">{contact.phone}</p>
            {contact.leadStatus && (
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 font-medium ${leadStatusColors[contact.leadStatus]}`}>
                {contact.leadStatus} lead
                {contact.leadValue ? ` • ₹${contact.leadValue.toLocaleString()}` : ''}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-1 px-3 py-1.5 bg-[#25D366] text-white text-xs rounded-full font-medium hover:bg-[#22c55e] transition-colors">
              <Phone size={12} /> Call
            </button>
            <button className="flex items-center gap-1 px-3 py-1.5 bg-[#34B7F1] text-white text-xs rounded-full font-medium hover:bg-blue-500 transition-colors">
              <Edit size={12} /> Edit
            </button>
          </div>
        </div>

        {/* Contact Details */}
        <div className="bg-white dark:bg-[#111b21] mt-2 px-4 py-3 border-b border-gray-100 dark:border-[#2a3942]">
          <h4 className="text-xs font-semibold text-gray-400 dark:text-[#667781] uppercase mb-3 tracking-wide">Contact Details</h4>
          <div className="space-y-3">
            {infoRows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon size={16} className="text-[#54656f] dark:text-[#8696a0] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-[#667781]">{label}</p>
                  <p className="text-sm text-[#111b21] dark:text-[#e9edef]">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <div className="bg-white dark:bg-[#111b21] mt-2 px-4 py-3 border-b border-gray-100 dark:border-[#2a3942]">
            <h4 className="text-xs font-semibold text-gray-400 dark:text-[#667781] uppercase mb-2 tracking-wide flex items-center gap-1">
              <Tag size={11} /> Labels
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map((tag) => (
                <span key={tag} className="text-xs bg-blue-50 border border-blue-200 text-blue-600 px-2 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="bg-white dark:bg-[#111b21] mt-2 px-4 py-3 border-b border-gray-100 dark:border-[#2a3942]">
          <h4 className="text-xs font-semibold text-gray-400 dark:text-[#667781] uppercase mb-2 tracking-wide">Notes</h4>
          <textarea
            defaultValue={contact.notes || ''}
            placeholder="Add notes about this contact..."
            className="w-full text-sm text-[#111b21] dark:text-[#e9edef] bg-[#f0f2f5] dark:bg-[#2a3942] rounded-lg p-2 outline-none resize-none placeholder-gray-400 dark:placeholder-[#667781] border border-transparent focus:border-[#25D366] transition-colors"
            rows={3}
          />
        </div>

        {/* Shared Media */}
        <div className="bg-white dark:bg-[#111b21] mt-2 border-b border-gray-100 dark:border-[#2a3942]">
          <button
            onClick={() => setMediaExpanded(!mediaExpanded)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <span className="text-sm font-medium text-[#111b21] dark:text-[#e9edef]">Shared Media</span>
            {mediaExpanded ? <ChevronDown size={16} className="text-gray-400 dark:text-[#667781]" /> : <ChevronRight size={16} className="text-gray-400 dark:text-[#667781]" />}
          </button>
          {mediaExpanded && (
            <div className="px-4 pb-3">
              <div className="grid grid-cols-3 gap-1">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="aspect-square bg-gray-100 dark:bg-[#2a3942] rounded-lg flex items-center justify-center">
                    <span className="text-gray-300 dark:text-[#667781] text-xs">📷</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Conversation Status */}
        <div className="bg-white dark:bg-[#111b21] mt-2 px-4 py-3 border-b border-gray-100 dark:border-[#2a3942]">
          <h4 className="text-xs font-semibold text-gray-400 dark:text-[#667781] uppercase mb-2 tracking-wide">Conversation</h4>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-[#8696a0]">Status</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              status === 'open' ? 'bg-green-100 text-green-700' :
              status === 'resolved' ? 'bg-gray-100 text-gray-600' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {status}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-gray-500 dark:text-[#8696a0]">Started</span>
            <span className="text-[#111b21] dark:text-[#e9edef]">{new Date(createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white dark:bg-[#111b21] mt-2 divide-y divide-gray-50 dark:divide-[#2a3942]">
          {[
            { icon: Star, label: 'Starred Messages', color: 'text-yellow-500' },
            { icon: Bell, label: 'Mute Notifications', color: 'text-[#54656f] dark:text-[#8696a0]' },
            { icon: Ban, label: 'Block Contact', color: 'text-red-500' },
            { icon: Trash2, label: 'Delete Conversation', color: 'text-red-500' },
          ].map(({ icon: Icon, label, color }) => (
            <button key={label} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#1f2c34] transition-colors">
              <Icon size={16} className={color} />
              <span className={`text-sm ${color}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
