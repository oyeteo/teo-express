import { supabaseAdmin } from './supabase'

export type TransferEventKind = 'opened' | 'downloaded'

export type TransferEvent = {
  id: string
  portal_id: string
  kind: TransferEventKind
  file_id: string | null
  file_name: string | null
  user_agent: string | null
  created_at: string
}

export async function recordTransferEvent(input: {
  portalId: string
  kind: TransferEventKind
  fileId?: string | null
  fileName?: string | null
  userAgent?: string | null
}): Promise<void> {
  const { error } = await supabaseAdmin.from('express_download_events').insert({
    portal_id: input.portalId,
    kind: input.kind,
    file_id: input.fileId ?? null,
    file_name: input.fileName ?? null,
    user_agent: input.userAgent ? input.userAgent.slice(0, 400) : null,
  })
  if (error) {
    console.error('transfer event not recorded', error.message)
  }
}

export async function listTransferEvents(portalId: string): Promise<TransferEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('express_download_events')
    .select('*')
    .eq('portal_id', portalId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error || !data) return []
  return data as TransferEvent[]
}
