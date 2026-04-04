import { supabase } from './supabase';

export interface EdgeFunctionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class EdgeFunctionError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'EdgeFunctionError';
  }
}

export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  body?: unknown
): Promise<T> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw new EdgeFunctionError('SESSION_ERROR', '無法取得登入狀態，請重新登入', { originalError: sessionError });
  }

  if (!session?.access_token) {
    throw new EdgeFunctionError('NO_SESSION', '請先登入才能執行此操作');
  }

  const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse<T>>(
    functionName,
    body ? { body: body as Record<string, any> } : undefined
  );

  if (error) {
    throw new EdgeFunctionError(
      'INVOCATION_ERROR',
      `Edge Function 調用失敗: ${error.message}`,
      { originalError: error, status: (error as any).status }
    );
  }

  if (data && !data.success) {
    throw new EdgeFunctionError(
      data.error?.code || 'UNKNOWN_ERROR',
      data.error?.message || '未知錯誤',
      data.error?.details
    );
  }

  return data?.data as T;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof EdgeFunctionError || error instanceof Error) return error.message;
  return '發生未知錯誤';
}

export function getErrorCode(error: unknown): string {
  if (error instanceof EdgeFunctionError) return error.code;
  return 'UNKNOWN_ERROR';
}
