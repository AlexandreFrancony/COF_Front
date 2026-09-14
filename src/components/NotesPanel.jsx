import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { getCampaignNotes, updateCampaignNotes, getNotesStreamUrl } from '../utils/api';

const SAVE_DEBOUNCE_MS = 800;

// A single shared scratchpad per campaign — GM and every player with a character in it can
// write to the same document, live, during a session (NPC names, clues, decisions...).
// Last-write-wins: simple on purpose, this isn't a real-time collaborative editor. The one
// concession to not clobbering someone mid-sentence: an incoming SSE update never overwrites
// the textarea while it's focused — it's held and applied on blur instead (unless the user
// made their own edit meanwhile, which wins and gets saved instead of the held update).
export default function NotesPanel({ campaignId }) {
  const [content, setContent] = useState('');
  const [meta, setMeta] = useState({ updated_at: null, updated_by: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const focusedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const pendingContentRef = useRef(null);
  // A remote save that arrived while focused isn't dropped — it's held here and applied on
  // blur (unless the user made their own edit meanwhile, which wins instead).
  const heldRemoteContentRef = useRef(null);

  const flushSave = async (value) => {
    clearTimeout(saveTimerRef.current);
    pendingContentRef.current = null;
    setSaving(true);
    try {
      const result = await updateCampaignNotes(campaignId, value);
      setMeta({ updated_at: result.updated_at, updated_by: result.updated_by });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const value = e.target.value;
    setContent(value);
    pendingContentRef.current = value;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => flushSave(value), SAVE_DEBOUNCE_MS);
  };

  const handleBlur = () => {
    focusedRef.current = false;
    if (pendingContentRef.current !== null) {
      flushSave(pendingContentRef.current);
    } else if (heldRemoteContentRef.current !== null) {
      setContent(heldRemoteContentRef.current);
      heldRemoteContentRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    getCampaignNotes(campaignId)
      .then((data) => {
        if (cancelled) return;
        setContent(data.content);
        setMeta({ updated_at: data.updated_at, updated_by: data.updated_by });
      })
      .catch((error) => toast.error(error.message))
      .finally(() => !cancelled && setLoading(false));

    const source = new EventSource(getNotesStreamUrl(campaignId));
    source.addEventListener('notes', (e) => {
      const data = JSON.parse(e.data);
      setMeta({ updated_at: data.updated_at, updated_by: data.updated_by });
      // Someone else's save — never overwrite the local draft while it's mid-edit; hold it
      // for handleBlur to apply instead of dropping it silently.
      if (focusedRef.current) {
        heldRemoteContentRef.current = data.content;
      } else {
        setContent(data.content);
      }
    });

    return () => {
      cancelled = true;
      source.close();
      clearTimeout(saveTimerRef.current);
    };
  }, [campaignId]);

  if (loading) return null;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 mb-2">
        <h2 className="font-semibold">Notes partagées</h2>
        <span className="text-xs text-[var(--text-secondary)]">
          {saving
            ? 'Enregistrement...'
            : meta.updated_by && meta.updated_at
              ? `Modifié par ${meta.updated_by} à ${new Date(meta.updated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
              : null}
        </span>
      </div>
      <textarea
        value={content}
        onChange={handleChange}
        onFocus={() => { focusedRef.current = true; }}
        onBlur={handleBlur}
        rows={8}
        placeholder="Notes de session partagées entre le MJ et les joueurs — noms de PNJ, indices, décisions..."
        className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm resize-y"
      />
    </section>
  );
}
