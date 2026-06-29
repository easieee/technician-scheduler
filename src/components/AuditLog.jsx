import React from 'react';
import { useApp } from '../context/AppContext.jsx';
import { format } from 'date-fns';

const DOT = {
  system:  'bg-slate-400',
  tech:    'bg-blue-500',
  job:     'bg-emerald-500',
  backjob: 'bg-orange-400',
};

export default function AuditLog() {
  const { auditLogs } = useApp();

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
          System Audit Logs
        </span>
      </div>

      <div className="max-h-56 overflow-y-auto divide-y divide-slate-50">
        {auditLogs.length === 0 ? (
          <p className="px-5 py-6 text-slate-400 text-sm text-center">No events yet.</p>
        ) : (
          auditLogs.map(log => (
            <div key={log.id} className="flex gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
              <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${DOT[log.type] || 'bg-slate-300'}`} />
              <div className="min-w-0">
                <p className="text-slate-700 text-xs font-semibold">{log.title}</p>
                <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">{log.description}</p>
                <p className="text-slate-300 text-[10px] mt-1 flex items-center gap-1.5">
                  {format(new Date(log.timestamp), 'MMM d · hh:mm aa')}
                  {log.user && <><span className="opacity-50">·</span><span className="text-slate-400 font-medium">{log.user}</span></>}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
