"use client";

import { AlertTriangle, X, RotateCcw } from "lucide-react";

export interface SaveErrorDetail {
  message: string;
  sheetName?: string;
  appsScript?: {
    url: string;
    action: string;
    method: string;
    requestBody?: string;
    httpStatus?: number;
    responseBody?: string;
    errorMessage?: string;
  };
}

export default function SaveErrorPanel({
  error, onClose, onRetry, retrying,
}: {
  error: SaveErrorDetail | null;
  onClose?: () => void;
  onRetry?: () => unknown | Promise<unknown>;
  retrying?: boolean;
}) {
  if (!error) return null;
  const a = error.appsScript;
  return (
    <div className="mb-3 panel panel-pad border border-red-300 bg-red-50">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-red-900">저장 실패</div>
            {onRetry && (
              <button onClick={() => onRetry()} disabled={retrying}
                className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-red-300 bg-white hover:bg-red-100 text-red-800 disabled:opacity-50"
              ><RotateCcw size={12} className={retrying ? "animate-spin" : ""} />
                재시도
              </button>
            )}
          </div>
          <div className="text-sm text-red-800 mt-0.5">{error.message}</div>
          {(error.sheetName || a) && (
            <div className="mt-3 space-y-1 text-[11px] font-mono text-ink-700">
              {error.sheetName && <div><b>Sheet:</b> {error.sheetName}</div>}
              {a && (
                <>
                  <div><b>Action:</b> {a.action} <b>· Method:</b> {a.method}</div>
                  <div className="break-all"><b>URL:</b> {a.url}</div>
                  {a.httpStatus !== undefined && <div><b>HTTP:</b> {a.httpStatus}</div>}
                  {a.requestBody && (
                    <div>
                      <b>Request body:</b>
                      <pre className="mt-0.5 p-1.5 bg-bg-panel border border-border rounded overflow-x-auto whitespace-pre-wrap break-all">{a.requestBody}</pre>
                    </div>
                  )}
                  {a.responseBody && (
                    <div>
                      <b>Apps Script response:</b>
                      <pre className="mt-0.5 p-1.5 bg-bg-panel border border-border rounded overflow-x-auto whitespace-pre-wrap break-all">{a.responseBody}</pre>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <div className="mt-2 text-[11px] text-red-700">
            로컬 상태는 변경되지 않았습니다. Google Sheets 실데이터 모드에서는 위 오류가 해소되어야 저장됩니다.
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-red-700 hover:text-red-900 shrink-0" title="닫기">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
