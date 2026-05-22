'use client';
import { Lead } from '@/types';
import Avatar from '@/components/ui/Avatar';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, TrendingUp } from 'lucide-react';

interface LeadsTableProps {
  leads: Lead[];
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'bg-blue-100 text-blue-700' },
  contacted: { label: 'Contacted', cls: 'bg-yellow-100 text-yellow-700' },
  qualified: { label: 'Qualified', cls: 'bg-purple-100 text-purple-700' },
  converted: { label: 'Converted', cls: 'bg-green-100 text-green-700' },
  lost: { label: 'Lost', cls: 'bg-red-100 text-red-700' },
};

export default function LeadsTable({ leads }: LeadsTableProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-[#111b21]">Leads Pipeline</h3>
          <p className="text-xs text-gray-400 mt-0.5">{leads.length} total leads tracked</p>
        </div>
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-[#25D366]" />
          <span className="text-sm font-semibold text-[#25D366]">
            ₹{leads.filter((l) => l.status === 'converted').reduce((sum, l) => sum + l.value, 0).toLocaleString()} won
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[#f8fafb]">
            <tr>
              {['Contact', 'Phone', 'Source', 'Status', 'Value', 'Last Contact', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50 transition-colors group">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={lead.contact.name} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-[#111b21]">{lead.contact.name}</p>
                      {lead.contact.company && (
                        <p className="text-xs text-gray-400">{lead.contact.company}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{lead.contact.phone}</td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{lead.source}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusConfig[lead.status].cls}`}>
                    {statusConfig[lead.status].label}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-[#111b21]">
                  {lead.value > 0 ? `₹${lead.value.toLocaleString()}` : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {formatDistanceToNow(new Date(lead.lastContact), { addSuffix: true })}
                </td>
                <td className="px-4 py-3">
                  <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100 transition-all">
                    <ExternalLink size={14} className="text-gray-400" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
