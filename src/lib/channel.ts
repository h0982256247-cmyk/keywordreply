import { supabase } from "./supabase";

export interface LineChannel {
    id: string;
    name: string;
    channel_id?: string | null;
    channel_secret_masked?: string | null;
}

export async function getChannel(): Promise<LineChannel | null> {
    const { data, error } = await supabase.rpc("get_channel_status");
    if (error || !data) return null;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.has_channel) return null;
    return {
        id: "",
        name: result.name,
        channel_id: result.channel_id ?? null,
        channel_secret_masked: result.channel_secret_masked ?? null,
    };
}

export async function hasChannel(): Promise<boolean> {
    const channel = await getChannel();
    return channel !== null;
}

export async function upsertChannel(name: string, accessToken: string, channelId?: string, channelSecret?: string, botUserId?: string): Promise<string | null> {
    const { data, error } = await supabase.rpc("rm_channel_upsert", {
        p_name: name,
        p_access_token: accessToken,
        p_channel_id: channelId || null,
        p_channel_secret: channelSecret || null,
        p_bot_user_id: botUserId || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
}

export async function validateAccessToken(accessToken: string): Promise<{
    valid: boolean;
    botName?: string;
    botUserId?: string;
    error?: string;
}> {
    const { data, error } = await supabase.rpc('rm_validate_line_token', {
        p_access_token: accessToken
    });
    if (error) return { valid: false, error: error.message || "驗證失敗" };
    if (!data?.success) return { valid: false, error: data?.error?.message || '驗證失敗' };
    return { valid: true, botName: data.data.botName, botUserId: data.data.botUserId };
}
