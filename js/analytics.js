// js/analytics.js
// Tracking de vistas por confesión (tabla confession_views)

import { sb } from './api.js';
import { getCurrentUser } from './auth.js';

/**
 * Registra una vista de confesión. Fire-and-forget, fallo silencioso.
 * Deduplica por (user_id, confession_id) vía clave única en la tabla.
 * @param {string} confessionId
 */
export async function trackView(confessionId) {
  if (!confessionId) return;
  try {
    const user = await getCurrentUser();
    await sb.from('confession_views').upsert(
      { confession_id: confessionId, user_id: user?.id ?? null },
      { onConflict: 'confession_id,user_id', ignoreDuplicates: true }
    );
  } catch { /* silencioso */ }
}

/**
 * Obtiene el conteo de vistas únicas de una confesión.
 * @param {string} confessionId
 * @returns {Promise<number>}
 */
export async function getViewCount(confessionId) {
  try {
    const { count } = await sb
      .from('confession_views')
      .select('id', { count: 'exact', head: true })
      .eq('confession_id', confessionId);
    return count ?? 0;
  } catch { return 0; }
}

/**
 * Obtiene el conteo de vistas para varios IDs de una vez.
 * @param {string[]} confessionIds
 * @returns {Promise<Record<string,number>>}
 */
export async function getViewCounts(confessionIds) {
  if (!confessionIds?.length) return {};
  try {
    const { data } = await sb
      .from('confession_views')
      .select('confession_id')
      .in('confession_id', confessionIds);
    const map = {};
    data?.forEach(r => {
      map[r.confession_id] = (map[r.confession_id] || 0) + 1;
    });
    return map;
  } catch { return {}; }
}
