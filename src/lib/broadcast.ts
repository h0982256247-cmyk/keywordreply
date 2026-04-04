import { invokeEdgeFunction, EdgeFunctionError } from "./edgeFunction";

export async function broadcastFlexMessage(
  flexMessages: object[],
  altText: string = "您收到新訊息"
): Promise<{ success: boolean; error?: string }> {
  if (flexMessages.length > 5) {
    return { success: false, error: "LINE 官方限制：一次最多只能廣播 5 則訊息" };
  }

  try {
    await invokeEdgeFunction('broadcast', { flexMessages, altText });
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof EdgeFunctionError) {
      const friendlyMessage =
        error.code === 'TOKEN_NOT_FOUND' ? 'LINE Token 未設定，請先綁定 LINE Channel' :
        error.code === 'LINE_API_ERROR' ? 'LINE API 調用失敗，請檢查 Token 是否有效' :
        error.code === 'NO_SESSION' ? '請先登入才能發送廣播' :
        error.message;
      return { success: false, error: friendlyMessage };
    }
    return { success: false, error: error instanceof Error ? error.message : '未知錯誤' };
  }
}
