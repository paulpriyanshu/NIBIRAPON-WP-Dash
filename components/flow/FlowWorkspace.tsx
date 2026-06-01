'use client';
import { useState } from 'react';
import { GitBranch, Radio } from 'lucide-react';
import FlowBuilderPage from './FlowBuilderPage';
import ActiveFlowsPanel from './ActiveFlowsPanel';

type Tab = 'builder' | 'active';

function TabBtn({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: React.ElementType; label: string;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
        active ? 'bg-[#25D366]/20 text-[#25D366]' : 'text-white/45 hover:text-white/80 hover:bg-white/5'
      }`}>
      <Icon size={13} />
      {label}
    </button>
  );
}

export default function FlowWorkspace() {
  const [tab, setTab] = useState<Tab>('builder');

  return (
    <div className="flex flex-col h-full bg-[#0b141a]">
      <div className="flex items-center gap-1 px-3 h-11 border-b border-white/8 bg-[#111b21] shrink-0">
        <TabBtn active={tab === 'builder'} onClick={() => setTab('builder')} icon={GitBranch} label="Builder" />
        <TabBtn active={tab === 'active'}  onClick={() => setTab('active')}  icon={Radio}     label="Active Flows" />
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'builder' ? <FlowBuilderPage /> : <ActiveFlowsPanel />}
      </div>
    </div>
  );
}
