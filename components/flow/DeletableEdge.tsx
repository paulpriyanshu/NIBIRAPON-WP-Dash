'use client';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import { X } from 'lucide-react';

export default function DeletableEdge({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  style,
  markerEnd,
  selected,
}: EdgeProps) {
  const { deleteElements } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: '#25D366',
          strokeWidth: selected ? 2.5 : 2,
          strokeDasharray: '6 3',
          animation: 'dashdraw 0.5s linear infinite',
          ...style,
        }}
      />

      {/* Delete button — only when edge is selected */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            opacity: selected ? 1 : 0,
            transition: 'opacity 0.15s',
          }}
          className="nodrag nopan"
        >
          <button
            onClick={() => deleteElements({ edges: [{ id }] })}
            className="
              w-5 h-5 rounded-full flex items-center justify-center
              bg-[#1f2c34] border border-red-500/40
              text-red-400 hover:bg-red-500/20 hover:border-red-500
              shadow-lg transition-all
            "
          >
            <X size={9} strokeWidth={2.5} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
